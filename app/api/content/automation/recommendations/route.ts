/**
 * Content automation — POST /api/content/automation/recommendations
 *
 * Generate topic-idea suggestions for a project from one source
 * ('keyword' | 'project_data' | 'keyword_research_url'). Read-only: nothing is
 * persisted here — the caller approves selected ideas via the bulk route.
 *
 * Gated by ENABLE_CONTENT_AUTOMATION + project ownership.
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { generateRecommendations } from '@/lib/content/recommendations/engine'
import type { RecommendationSource } from '@/lib/content/recommendations/types'
import { insertPendingIdeas, loadPendingIdeas, ideaToSuggestion, normalizeText, markIdeasDuplicate } from '@/lib/content/recommendations/topic-idea-store'
import { buildKeywordGuard, partitionPending, keywordSourcesOf, keywordOriginsOf, coveredByExistingContent, type KeywordOriginEntry } from '@/lib/content/recommendations/keyword-guard'
import { domainFlags } from '@/lib/content/recommendations/domain-flags'
import { BillingExhaustedError } from '@/lib/content/recommendations/model'
import { randomUUID } from 'crypto'

/** In-flight run keys (project+source) for best-effort duplicate-click protection.
 *  Per server instance; released in a finally. Holds only opaque keys, no data. */
const INFLIGHT = new Set<string>()
/** Recently-completed idempotency keys (owner+project+source+clientRequestId) with
 *  a short TTL, so an immediate duplicate replay of the SAME click doesn't run a
 *  second time. Process-local (best-effort); a cross-instance guard needs a runs
 *  table — see the report's production blocker. */
const RECENT = new Map<string, number>()
const RECENT_TTL_MS = 30_000
function seenRecently(key: string): boolean {
  const now = Date.now()
  for (const [k, t] of RECENT) if (now - t > RECENT_TTL_MS) RECENT.delete(k)
  return RECENT.has(key)
}

/** Domain flags for a set of suggestions (titles + keywords) — Preview diagnostic. */
function suggestionsDomainFlags(items: { title: string; primaryKeyword: string }[]) {
  return domainFlags(items.map((s) => `${s.title} ${s.primaryKeyword}`).join(' \n '))
}

const SOURCES: RecommendationSource[] = ['keyword', 'project_data', 'keyword_research_url', 'site_scan', 'hybrid']

export async function POST(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const source = typeof body.source === 'string' ? (body.source as RecommendationSource) : null
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : ''
  // Isolation diagnostics — a server-generated immutable run id + the client's
  // request id (echoed back so the UI can reject a stale response for another
  // project). Preview-only debug is gated behind RECO_ISOLATION_DIAGNOSTICS.
  const generationRunId = randomUUID()
  const clientRequestId = typeof body.clientRequestId === 'string' ? body.clientRequestId : null
  const diagnostics = process.env.RECO_ISOLATION_DIAGNOSTICS === '1'
  const excludePendingContext = diagnostics && body.excludePendingContext === true
  // Premium (Pro curator) is NOT implemented yet — a premium request is explicitly
  // rejected (never silently downgraded to standard). Standard = Flash only.
  if (body.qualityMode === 'premium') {
    return Response.json({ suggestions: [], error: 'premium_not_available', meta: { source, reason: 'premium_not_available', qualityMode: 'premium', persisted: false, newlyAddedCount: 0 } }, { status: 400 })
  }
  const qualityMode: 'standard' = 'standard'

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Duplicate-click protection: reject a concurrent identical run for the same
  // project+source (idempotency) so one accidental double-click can't pay twice.
  // Idempotency: owner + project + source + clientRequestId. Two identical
  // requests (concurrent OR an immediate replay of the same click) must not both
  // call Gemini. A distinct clientRequestId is a new intentional run and is allowed.
  const idemKey = `${auth.user.id}:${auth.project.id}:${source}:${clientRequestId ?? 'none'}`
  const inflightKey = clientRequestId ? idemKey : `${auth.project.id}:${source}`
  if (INFLIGHT.has(inflightKey) || (clientRequestId && seenRecently(idemKey))) {
    return Response.json({ error: 'run_in_progress', reason: 'run_in_progress' }, { status: 409 })
  }
  INFLIGHT.add(inflightKey)

  if (!source || !SOURCES.includes(source)) {
    return Response.json({ error: 'invalid_source', allowed: SOURCES }, { status: 400 })
  }
  if (source === 'keyword' && !keyword) {
    return Response.json({ error: 'keyword_required' }, { status: 400 })
  }

  try {
    // Build the exact-keyword guard FIRST so keyword-research can also skip
    // already-known clusters (avoidKeywords) — repeat runs surface fresh ones.
    const guard = await buildKeywordGuard(auth.admin, auth.project.id)

    const result = await generateRecommendations(auth.admin, {
      userId: auth.user.id,
      projectId: auth.project.id,
      source,
      keyword,
      avoidKeywords: Array.from(guard.keywords),
      generationRunId,
      collectTrace: diagnostics,
      excludePendingContext,
      qualityMode,
    })

    // Phase 3F.3.1b — gentle EXACT primary-keyword + exact-title guard. Blocks a
    // suggestion whose normalized primary keyword already exists (project keyword,
    // topic keyword, generated-article topic keyword, persisted-idea keyword, or a
    // RELIABLE WordPress/site-scan focus keyword) OR whose exact normalized title
    // already exists. No fuzzy / contains / token-overlap — long-tail stays allowed.
    let filteredPrimaryKeywordExists = 0
    let filteredTitleExists = 0
    let filteredCoveredByContent = 0
    const filteredExamples: { title: string; primaryKeyword: string; reason: string; sources: string[] }[] = []
    // Phase 3I.6 — PRODUCTION evidence for primary_keyword_exists rejections:
    // for each blocked idea, the exact originating row(s) of the blocking
    // keyword (source table, original keyword, row status, row title/URL) and
    // the exact rule. Owner-only response data; capped; returned only on runs
    // that added nothing new. This exists because zero-result runs were
    // undiagnosable in production (debug is dev-only).
    const primaryKeywordMatches: {
      ideaTitle: string
      ideaPrimaryKeyword: string
      normalizedPrimaryKeyword: string
      /** Site-scan ideas: the model's source context is embedded in the reason. */
      ideaSourceContext: string
      ideaSuggestedUrl: string | null
      rule: 'exact_normalized_primary_keyword'
      matches: KeywordOriginEntry[]
    }[] = []
    const fresh = result.suggestions.filter((s) => {
      const nt = normalizeText(s.title)
      const nk = normalizeText(s.primaryKeyword)
      const pushEx = (reason: string) => { if (filteredExamples.length < 10) filteredExamples.push({ title: s.title, primaryKeyword: s.primaryKeyword, reason, sources: keywordSourcesOf(guard, s.primaryKeyword) }) }
      if (nk && guard.keywords.has(nk)) {
        filteredPrimaryKeywordExists++
        pushEx('primary_keyword_exists')
        if (primaryKeywordMatches.length < 20) {
          const origins = keywordOriginsOf(guard, s.primaryKeyword)
          primaryKeywordMatches.push({
            ideaTitle: s.title,
            ideaPrimaryKeyword: s.primaryKeyword,
            normalizedPrimaryKeyword: nk,
            ideaSourceContext: s.suggestionReason || '',
            ideaSuggestedUrl: s.suggestedInternalLinks[0]?.url ?? null,
            rule: 'exact_normalized_primary_keyword',
            // No recorded origin ⇒ the keyword was added by THIS run's intra-batch
            // dedupe below (an earlier idea in the same batch used the same keyword).
            matches: origins.length ? origins : [{ source: 'idea_keyword', original: s.primaryKeyword, status: 'intra_batch_earlier_idea', detail: '' }],
          })
        }
        return false
      }
      if (nt && guard.titles.has(nt)) { filteredTitleExists++; pushEx('title_exists'); return false }
      // Phase 3G.7 — re-angled duplicate of an EXISTING SITE ARTICLE (same main
      // phrase, different suffix — e.g. "מנורות לילה לשבת: …" vs the site's
      // "מנורות לילה לשבת – …"): already covered, never suggested again.
      if (coveredByExistingContent(guard, s.title, s.primaryKeyword)) { filteredCoveredByContent++; pushEx('covered_by_existing_content'); return false }
      if (nk) guard.keywords.add(nk) // avoid intra-batch primary-keyword dupes
      if (nt) guard.titles.add(nt)
      // Phase 3H.1 — NO intra-batch PHRASE dedupe: many legitimate ideas for one
      // seed share the "<core phrase>: <angle>" title pattern; adding the first
      // idea's main phrase to contentPhrases killed every sibling in the batch
      // (part of the systemic zero-results bug). Exact keyword/title dedupe above
      // still prevents true intra-batch duplicates.
      return true
    })

    await insertPendingIdeas(auth.admin, { projectId: auth.project.id, userId: auth.user.id, batchId: randomUUID(), source, suggestions: fresh })

    const filteredExisting = result.suggestions.length - fresh.length
    // Phase 3I.6 — in PRODUCTION, a run that added nothing new returns the
    // primary-keyword match evidence (and only it) so the exact blockers are
    // visible in the UI/API without a dev build. Dev keeps the full debug.
    const buildDebug = (extra: Record<string, unknown>) => process.env.NODE_ENV !== 'production'
      ? { ...guard.counts, scanKeywordSamples: guard.scanSamples, modelSuggestions: result.suggestions.length, filteredPrimaryKeywordExistsCount: filteredPrimaryKeywordExists, filteredTitleExistsCount: filteredTitleExists, filteredCoveredByContentCount: filteredCoveredByContent, filteredExamples, primaryKeywordMatches, kr: (result.meta as { debug?: unknown }).debug, ...extra }
      : (fresh.length === 0 && primaryKeywordMatches.length > 0 ? { primaryKeywordMatches } : undefined)

    const pending = await loadPendingIdeas(auth.admin, auth.project.id)
    // No ideas table yet (migration not applied): still return the GUARD-FILTERED
    // list session-only, so the keyword guard works even before persistence.
    if (pending === null) {
      return Response.json({ suggestions: fresh, meta: { ...result.meta, persisted: false, source, projectId: auth.project.id, generationRunId, clientRequestId, newlyAddedCount: fresh.length, totalPendingCount: fresh.length, filteredCount: filteredExisting, newlySaved: fresh.length, filteredExisting,
        // Phase 3I.3 — PRODUCTION-safe funnel counts so a 0-result run explains
        // its exact bottleneck in the UI (counts only, no content).
        funnel: { generated: result.meta.generated, corpusDuplicates: result.meta.skippedDuplicates, qualityFiltered: result.meta.qualityFilteredCount ?? 0, keywordExists: filteredPrimaryKeywordExists, titleExists: filteredTitleExists, coveredByExisting: filteredCoveredByContent, hiddenOnLoad: 0 },
        debug: buildDebug({ persisted: false }) } })
    }

    // Phase 3F.3.1c — revalidate ALREADY-PERSISTED pending ideas against the
    // current guard. Pre-guard rows that now conflict with an existing exact
    // primary keyword/title are marked 'duplicate' (history kept) and hidden.
    const { visible, conflictIds } = partitionPending(pending, guard)
    if (conflictIds.length > 0) await markIdeasDuplicate(auth.admin, auth.project.id, conflictIds)
    // Phase 4C — re-attach hybrid provenance (lost by ideaToSuggestion, which
    // reads persisted rows). Keyed by normalized primary keyword from THIS run's
    // fresh merged set, so the "סריקה משולבת" run shows source badges + counts.
    const provByKw = new Map(result.suggestions
      .filter((s) => s.supportingSources && s.supportingSources.length)
      .map((s) => [normalizeText(s.primaryKeyword), { supportingSources: s.supportingSources, sourceEvidence: s.sourceEvidence }]))
    const suggestions = visible.map(ideaToSuggestion).map((s) => {
      const prov = provByKw.get(normalizeText(s.primaryKeyword))
      return prov ? { ...s, ...prov } : s
    })

    // Precise "nothing new this run" reason (accurate whether the model produced
    // known ideas that were filtered, or produced nothing because avoid-skip
    // already covered every cluster). Phase 3H.1 — when the dominant filter was
    // "covered by existing site content", say THAT instead of the misleading
    // "already saved/approved/rejected" message.
    const allKnownReason = source === 'keyword_research_url' ? 'kr_all_known' : 'all_known'
    const emptyBecause = filteredExisting > 0 && filteredCoveredByContent > 0 && filteredPrimaryKeywordExists === 0 && filteredTitleExists === 0
      ? 'covered_by_existing'
      : filteredExisting > 0 && filteredPrimaryKeywordExists > 0 && filteredTitleExists === 0 ? 'primary_keyword_exists' : allKnownReason
    let reason: string | undefined
    if (suggestions.length === 0) {
      reason = result.meta.reason ?? (result.suggestions.length > 0 ? emptyBecause : undefined)
    } else if (fresh.length === 0) {
      // Total pending > 0 but this run added nothing new — surface WHY.
      reason = result.meta.reason ?? (result.suggestions.length > 0 ? emptyBecause : (source === 'keyword_research_url' ? 'kr_no_new' : 'no_new'))
    }
    // Preview-only isolation diagnostics: current-run flags vs the accumulated
    // pending list (the UI shows the full pending set) + the Site Scan call trace.
    const isolationDebug = diagnostics ? {
      generationRunId,
      clientRequestId,
      freshCurrentRunCount: fresh.length,
      freshCurrentRunDomainFlags: suggestionsDomainFlags(fresh),
      accumulatedPendingCount: suggestions.length,
      accumulatedPendingDomainFlags: suggestionsDomainFlags(suggestions),
      persistedCurrentRunCount: fresh.length,
      excludePendingContext,
      siteScanTrace: (result.meta as { debug?: { siteScanCallTrace?: unknown } }).debug?.siteScanCallTrace ?? null,
    } : undefined
    return Response.json({
      suggestions,
      meta: {
        ...result.meta,
        persisted: true,
        source,
        // Scope echo — the client verifies these before applying the response.
        projectId: auth.project.id,
        generationRunId,
        clientRequestId,
        isolationDebug,
        newlyAddedCount: fresh.length,
        totalPendingCount: suggestions.length,
        filteredCount: filteredExisting,
        hiddenDuplicateCount: conflictIds.length,
        // Back-compat aliases.
        newlySaved: fresh.length,
        filteredExisting,
        revalidatedHidden: conflictIds.length,
        pendingCount: suggestions.length,
        reason,
        // Phase 3I.3 — PRODUCTION-safe funnel counts so a 0-result run explains
        // its exact bottleneck in the UI (counts only, no content).
        funnel: { generated: result.meta.generated, corpusDuplicates: result.meta.skippedDuplicates, qualityFiltered: result.meta.qualityFilteredCount ?? 0, keywordExists: filteredPrimaryKeywordExists, titleExists: filteredTitleExists, coveredByExisting: filteredCoveredByContent, hiddenOnLoad: conflictIds.length },
        debug: buildDebug({ revalidatedHidden: conflictIds.length }),
      },
    })
  } catch (e) {
    // BILLING EXHAUSTED — a typed, honest state (NOT "no ideas / broader keyword").
    // No provider details, keys or billing-account ids are exposed.
    if (e instanceof BillingExhaustedError) {
      return Response.json({ suggestions: [], error: 'billing_exhausted', meta: { source, reason: 'billing_exhausted', persisted: false, newlyAddedCount: 0 } }, { status: 402 })
    }
    if ((e as { code?: string })?.code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
    console.error('[automation-recommendations] failed', { message: (e as Error)?.message })
    return Response.json({ error: 'Failed to generate recommendations' }, { status: 500 })
  } finally {
    INFLIGHT.delete(inflightKey)
    if (clientRequestId) RECENT.set(idemKey, Date.now())
  }
}

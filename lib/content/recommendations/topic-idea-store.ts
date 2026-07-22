/**
 * Persisted topic-idea store (Phase 3F.3).
 *
 * Persists generated topic-idea suggestions so they survive a refresh, can be
 * approved into article_topics, and can be REJECTED durably (so the same idea is
 * not suggested again). All helpers are best-effort and NEVER throw: if the
 * content_topic_ideas table is not present yet (migration not applied), they
 * return a "table missing" sentinel so callers fall back to the previous
 * session-only behavior with zero regression.
 *
 * This layer only reads/writes content_topic_ideas. It does NOT generate,
 * publish, insert links, or touch article_topics content beyond linking an
 * approved idea to its created topic id.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { ContentTopicIdeaRow } from '@/lib/supabase/types'
import type { TopicSuggestion, RecommendationSource, LinkPlan } from './types'

type Admin = ReturnType<typeof createAdminClient>

const TABLE = 'content_topic_ideas'
/** Postgres "relation does not exist" — the migration has not been applied yet. */
const MISSING_TABLE = '42P01'
/** PostgREST "column not found in schema cache" / undefined column — the additive
 *  link_plan migration has not been applied yet. */
const MISSING_COLUMN = new Set(['PGRST204', '42703'])

/** Serialized shape of the additive link_plan JSONB — the canonical role-aware plan
 *  plus the metadata that must survive persistence + reload. */
interface PersistedPlan {
  linkPlan?: LinkPlan
  recommendedPageType?: TopicSuggestion['recommendedPageType']
  demandEvidence?: TopicSuggestion['demandEvidence']
  confidenceLevel?: TopicSuggestion['confidenceLevel']
  discoveryGenerated?: boolean
  businessRelevance?: TopicSuggestion['businessRelevance']
  /** The cached-index snapshot the canonical link preview was built from. */
  linkPreviewSnapshot?: TopicSuggestion['linkPreviewSnapshot']
  /** Model-selection provenance that must survive reload (surfaced in the QA/admin
   *  view; the customer card shows only the "improved" marker, never model names). */
  requestedTier?: 'standard' | 'premium'
  modelUsed?: string
  improvedWithPro?: boolean
  /** The Pro model that produced the per-item improvement (diagnostic). */
  improvedModel?: string
  /** Stage E3A provenance — this idea's brief was also supported by Search Console evidence.
   *  Presentational only (renders the "Based also on Search Console data" chip). */
  basedOnGsc?: boolean
}

/**
 * Conservative normalized form: lowercase, collapse whitespace, strip edge
 * punctuation. EXACT-normalized only — no fuzzy/stemming — so long-tail variants
 * stay distinct ("הליכון ביתי" never blocks "תחזוקת הליכון ביתי").
 */
export function normalizeText(s: string | null | undefined): string {
  const edge = /^[\s"'“”׳״.,:;!?()[\]{}\-–—/|]+|[\s"'“”׳״.,:;!?()[\]{}\-–—/|]+$/g
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(edge, '').trim()
}

/** Fingerprint (insert unique key) from primary_keyword (preferred) or title. */
export function topicIdeaFingerprint(primaryKeyword: string | null | undefined, title: string | null | undefined): string {
  return normalizeText(primaryKeyword && primaryKeyword.trim() ? primaryKeyword : (title || ''))
}

/** Map a persisted idea row to the UI/engine TopicSuggestion shape (id = row id). */
export function ideaToSuggestion(row: ContentTopicIdeaRow): TopicSuggestion & { ideaId: string; basedOnGsc?: boolean } {
  const primaryKeyword = row.primary_keyword || row.title
  const primNorm = normalizeText(primaryKeyword)
  // F — the user-visible secondary list must NEVER contain the primary keyword,
  // regardless of what was persisted upstream (belt-and-suspenders round-trip guard).
  const secondaryKeywords = (Array.isArray(row.secondary_keywords) ? row.secondary_keywords : []).filter((k) => normalizeText(k) !== primNorm)

  // E — reconstruct the CANONICAL role-aware plan from the persisted link_plan JSONB.
  // Old rows (pre-migration) have no link_plan → roles are unavailable, so we degrade
  // exactly as before (flat links, null primary) without crashing.
  const plan = (row.link_plan && typeof row.link_plan === 'object') ? (row.link_plan as PersistedPlan) : null
  const linkPlan = plan?.linkPlan
  const suggestedInternalLinks = linkPlan
    ? linkPlanToOrderedFromPlan(linkPlan)
    : (Array.isArray(row.suggested_internal_links) ? row.suggested_internal_links : [])

  return {
    id: row.id,
    ideaId: row.id,
    title: row.title,
    primaryKeyword,
    secondaryKeywords,
    searchIntent: row.search_intent || 'informational',
    recommendedWordCount: typeof row.recommended_word_count === 'number' ? row.recommended_word_count : 1000,
    angle: row.angle || '',
    suggestedInternalLinks,
    source: (row.source as RecommendationSource) || 'project_data',
    suggestionReason: row.suggestion_reason || '',
    suggestionScore: typeof row.score === 'number' ? row.score : 0,
    // Role-aware fields survive the round trip when link_plan is present.
    ...(linkPlan ? { linkPlan, moneyTargetUrl: linkPlan.primaryCommercialTarget?.url ?? null } : {}),
    ...(plan?.recommendedPageType ? { recommendedPageType: plan.recommendedPageType } : {}),
    ...(plan?.linkPreviewSnapshot ? { linkPreviewSnapshot: plan.linkPreviewSnapshot } : {}),
    ...(plan?.demandEvidence ? { demandEvidence: plan.demandEvidence } : {}),
    ...(plan?.confidenceLevel ? { confidenceLevel: plan.confidenceLevel } : {}),
    ...(plan?.discoveryGenerated ? { discoveryGenerated: true } : {}),
    ...(plan?.businessRelevance ? { businessRelevance: plan.businessRelevance } : {}),
    // Model-selection provenance (survives reload). requestedTier / modelUsed are
    // diagnostic-only; improvedWithPro drives the visible per-item "improved" marker.
    ...(plan?.requestedTier ? { requestedTier: plan.requestedTier } : {}),
    ...(plan?.modelUsed ? { modelUsed: plan.modelUsed } : {}),
    ...(plan?.improvedWithPro ? { improvedWithPro: true } : {}),
    ...(plan?.basedOnGsc ? { basedOnGsc: true } : {}),
  }
}

/** Flatten a persisted LinkPlan to the ordered {url,anchor} list (primary first). */
function linkPlanToOrderedFromPlan(plan: LinkPlan): { url: string; anchor: string }[] {
  const out: { url: string; anchor: string }[] = []
  const seen = new Set<string>()
  const push = (t: { url: string; title: string } | null) => { if (!t) return; const k = (t.url || '').trim().toLowerCase().replace(/\/+$/, ''); if (!k || seen.has(k)) return; seen.add(k); out.push({ url: t.url, anchor: t.title }) }
  push(plan.primaryCommercialTarget)
  for (const t of plan.secondaryCommercialTargets || []) push(t)
  for (const t of plan.supportingInformationalLinks || []) push(t)
  for (const t of plan.sourceReferences || []) push(t)
  return out
}

/**
 * All normalized strings already known for a project (any idea status): both the
 * title AND the primary keyword of every stored idea. A re-generation is filtered
 * if its normalized title OR keyword matches one of these — so an approved idea
 * never comes back regardless of which field the model varies. Returns null when
 * the table is missing (caller falls back to session-only).
 */
export async function loadKnownStrings(admin: Admin, projectId: string): Promise<Set<string> | null> {
  const { data, error } = await admin.from(TABLE).select('title, primary_keyword, fingerprint').eq('project_id', projectId)
  if (error) { if ((error as { code?: string }).code === MISSING_TABLE) return null; return new Set() }
  const set = new Set<string>()
  for (const r of (data ?? []) as { title: string; primary_keyword: string | null; fingerprint: string }[]) {
    for (const v of [r.fingerprint, normalizeText(r.title), normalizeText(r.primary_keyword)]) if (v) set.add(v)
  }
  return set
}

/** Pending ideas for a project, newest first. Null = table missing. */
export async function loadPendingIdeas(admin: Admin, projectId: string): Promise<ContentTopicIdeaRow[] | null> {
  const { data, error } = await admin.from(TABLE).select('*').eq('project_id', projectId).eq('status', 'pending').order('created_at', { ascending: false })
  if (error) { if ((error as { code?: string }).code === MISSING_TABLE) return null; return [] }
  return (data as ContentTopicIdeaRow[]) ?? []
}

export interface NewIdeaInput {
  projectId: string
  userId: string
  batchId: string
  source: string
  suggestions: TopicSuggestion[]
  /** The tier the customer EXPLICITLY selected for this batch, and the actual model
   *  the run used — stored per row so the QA/admin view can show them later. */
  requestedTier?: 'standard' | 'premium'
  modelUsed?: string | null
  /** Stage E3A — fingerprints of suggestions whose brief was also supported by Search Console
   *  evidence (persisted into the additive link_plan bundle → no migration). Presentational. */
  gscBackedFingerprints?: Set<string>
}

/** Persistence outcome (F) — attempted vs actually inserted (the rest were duplicate
 *  fingerprints skipped by ON CONFLICT DO NOTHING) + a typed failure when it errored. */
export interface PersistOutcome { attempted: number; inserted: number; duplicate: number; failed: number; failure?: string }

/**
 * Insert NEW pending ideas (fingerprinted). Uses upsert with ignoreDuplicates on
 * (project_id, fingerprint) so a concurrent generation never errors. Returns a typed
 * persistence outcome (attempted/inserted/duplicate/failed), or null when the table is
 * missing.
 */
export async function insertPendingIdeas(admin: Admin, input: NewIdeaInput): Promise<PersistOutcome | null> {
  if (input.suggestions.length === 0) return { attempted: 0, inserted: 0, duplicate: 0, failed: 0 }
  const nowIso = new Date().toISOString()
  const rows = input.suggestions.map((s) => {
    // The additive JSONB link_plan carries the canonical role-aware plan + metadata so
    // roles survive persistence + reload (never re-inferred in the UI).
    // The bundle is persisted whenever there is a link plan OR model-selection
    // provenance to preserve (a zero-link idea still records its tier/model).
    const modelMeta = { requestedTier: input.requestedTier, modelUsed: input.modelUsed ?? s.modelUsed ?? undefined, improvedWithPro: s.improvedWithPro }
    const fp = topicIdeaFingerprint(s.primaryKeyword, s.title)
    const basedOnGsc = input.gscBackedFingerprints?.has(fp) ?? false
    const hasModelMeta = !!(modelMeta.requestedTier || modelMeta.modelUsed || modelMeta.improvedWithPro)
    const persistedPlan: PersistedPlan | null = (s.linkPlan || hasModelMeta || basedOnGsc)
      ? { ...(s.linkPlan ? { linkPlan: s.linkPlan, recommendedPageType: s.recommendedPageType, demandEvidence: s.demandEvidence, confidenceLevel: s.confidenceLevel, discoveryGenerated: s.discoveryGenerated, businessRelevance: s.businessRelevance } : {}), ...(s.linkPreviewSnapshot ? { linkPreviewSnapshot: s.linkPreviewSnapshot } : {}), ...modelMeta, ...(basedOnGsc ? { basedOnGsc: true } : {}) }
      : null
    return {
      user_id: input.userId,
      project_id: input.projectId,
      source: input.source,
      batch_id: input.batchId,
      title: s.title,
      primary_keyword: s.primaryKeyword || null,
      secondary_keywords: s.secondaryKeywords ?? [],
      search_intent: s.searchIntent || null,
      angle: s.angle || null,
      recommended_word_count: typeof s.recommendedWordCount === 'number' ? s.recommendedWordCount : null,
      suggested_internal_links: s.suggestedInternalLinks ?? [],
      link_plan: persistedPlan,
      suggestion_reason: s.suggestionReason || null,
      source_context: null,
      source_url: s.suggestedInternalLinks?.[0]?.url ?? null,
      score: typeof s.suggestionScore === 'number' ? s.suggestionScore : null,
      fingerprint: fp,
      status: 'pending' as const,
      updated_at: nowIso,
    }
  })
  // .select('id') → ON CONFLICT DO NOTHING RETURNING returns only the ROWS ACTUALLY
  // INSERTED, so inserted = returned.length and duplicate = attempted - inserted.
  const upsert = (payload: Record<string, unknown>[]) => admin.from(TABLE).upsert(payload, { onConflict: 'project_id,fingerprint', ignoreDuplicates: true }).select('id')
  let { data, error } = await upsert(rows)
  if (error && MISSING_COLUMN.has((error as { code?: string }).code ?? '')) {
    const stripped = rows.map(({ link_plan: _omit, ...rest }) => rest)
    ;({ data, error } = await upsert(stripped))
  }
  if (error) {
    if ((error as { code?: string }).code === MISSING_TABLE) return null
    console.warn('[topic-idea-store] insert failed', { message: error.message })
    return { attempted: rows.length, inserted: 0, duplicate: 0, failed: rows.length, failure: (error as { code?: string }).code || 'insert_failed' }
  }
  const inserted = Array.isArray(data) ? data.length : 0
  return { attempted: rows.length, inserted, duplicate: Math.max(0, rows.length - inserted), failed: 0 }
}

/**
 * Mark pending ideas as 'duplicate' (Phase 3F.3.1c) — used when a previously
 * persisted pending idea now conflicts with an existing exact primary keyword or
 * title. Keeps history (not deleted); it just leaves the active pending list and
 * won't be re-loaded. Only pending rows are touched. Best-effort; never throws.
 */
export async function markIdeasDuplicate(admin: Admin, projectId: string, ideaIds: string[]): Promise<number> {
  if (ideaIds.length === 0) return 0
  const nowIso = new Date().toISOString()
  try {
    const { data } = await admin
      .from(TABLE)
      .update({ status: 'duplicate', updated_at: nowIso })
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .in('id', ideaIds)
      .select('id')
    return ((data ?? []) as { id: string }[]).length
  } catch { return 0 }
}

/** Load ONE pending idea by id (project-scoped). Null when missing/rejected/table absent. */
export async function loadPendingIdeaById(admin: Admin, projectId: string, ideaId: string): Promise<ContentTopicIdeaRow | null> {
  const { data, error } = await admin.from(TABLE).select('*').eq('project_id', projectId).eq('id', ideaId).eq('status', 'pending').maybeSingle()
  if (error || !data) return null
  return data as ContentTopicIdeaRow
}

/** Persist a per-item Pro improvement: replaces the human-facing title + reason,
 *  marks the row improvedWithPro, and records the Pro model — the primary keyword,
 *  intent, page type, links and coverage are NOT touched (the validated engine
 *  decisions are preserved; only the wording is refined). Best-effort; on a missing
 *  link_plan column it still updates the visible title/reason. Returns the reloaded
 *  suggestion, or null when the row is gone. */
export async function applyProImprovement(admin: Admin, projectId: string, ideaId: string, update: { title: string; suggestionReason: string; improvedModel: string }): Promise<(TopicSuggestion & { ideaId: string }) | null> {
  const row = await loadPendingIdeaById(admin, projectId, ideaId)
  if (!row) return null
  const prevPlan = (row.link_plan && typeof row.link_plan === 'object') ? (row.link_plan as PersistedPlan) : {}
  const mergedPlan: PersistedPlan = { ...prevPlan, improvedWithPro: true, improvedModel: update.improvedModel, modelUsed: prevPlan.modelUsed ?? update.improvedModel }
  const nowIso = new Date().toISOString()
  const base = { title: update.title, suggestion_reason: update.suggestionReason, updated_at: nowIso }
  const doUpdate = (payload: Record<string, unknown>) => admin.from(TABLE).update(payload).eq('project_id', projectId).eq('id', ideaId).eq('status', 'pending').select('*').maybeSingle()
  let { data, error } = await doUpdate({ ...base, link_plan: mergedPlan })
  if (error && MISSING_COLUMN.has((error as { code?: string }).code ?? '')) {
    ;({ data, error } = await doUpdate(base)) // link_plan column absent → still persist the visible wording
  }
  if (error || !data) return null
  return ideaToSuggestion(data as ContentTopicIdeaRow)
}

/** Durably reject pending ideas by id. Returns count rejected (0 on missing table). */
export async function rejectIdeas(admin: Admin, projectId: string, ideaIds: string[]): Promise<number> {
  if (ideaIds.length === 0) return 0
  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from(TABLE)
    .update({ status: 'rejected', rejected_at: nowIso, updated_at: nowIso })
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .in('id', ideaIds)
    .select('id')
  if (error) return 0
  return ((data ?? []) as { id: string }[]).length
}

export interface ApproveMatchTopic {
  title: string
  primaryKeyword: string
  ideaId?: string
}

/**
 * Mark the persisted ideas that were just approved into article_topics. Robust
 * matching (Phase 3F.3.1): resolves each idea by explicit ideaId when present,
 * otherwise by EXACT normalized primary_keyword or title against the project's
 * PENDING ideas — so approval works even for old payloads without an ideaId.
 * Only pending ideas are touched. Best-effort; never throws.
 */
export async function markIdeasApprovedForTopics(
  admin: Admin,
  projectId: string,
  incoming: ApproveMatchTopic[],
  createdRows: { id: string; topic: string; primary_keyword: string | null }[],
): Promise<void> {
  const { data, error } = await admin.from(TABLE).select('id, title, primary_keyword').eq('project_id', projectId).eq('status', 'pending')
  if (error) return // table missing / error → nothing to mark
  const pending = (data ?? []) as { id: string; title: string; primary_keyword: string | null }[]
  const byTitle = new Map<string, string>()
  const byKw = new Map<string, string>()
  for (const p of pending) {
    const t = normalizeText(p.title); if (t) byTitle.set(t, p.id)
    const k = normalizeText(p.primary_keyword); if (k) byKw.set(k, p.id)
  }
  const topicByKw = new Map<string, string>()
  const topicByTitle = new Map<string, string>()
  for (const r of createdRows) {
    const k = normalizeText(r.primary_keyword); if (k) topicByKw.set(k, r.id)
    const t = normalizeText(r.topic); if (t) topicByTitle.set(t, r.id)
  }
  const pairs = new Map<string, string | null>() // ideaId → topicId (null when it matched an existing topic)
  for (const it of incoming) {
    const nt = normalizeText(it.title)
    const nk = normalizeText(it.primaryKeyword)
    const ideaId = (typeof it.ideaId === 'string' && it.ideaId) ? it.ideaId : (byKw.get(nk) ?? byTitle.get(nt))
    if (!ideaId) continue
    const topicId = topicByKw.get(nk) ?? topicByTitle.get(nt) ?? null
    if (!pairs.has(ideaId) || (pairs.get(ideaId) === null && topicId)) pairs.set(ideaId, topicId)
  }
  const nowIso = new Date().toISOString()
  for (const [ideaId, topicId] of pairs) {
    try {
      await admin
        .from(TABLE)
        .update({ status: 'approved', approved_topic_id: topicId, approved_at: nowIso, updated_at: nowIso })
        .eq('project_id', projectId)
        .eq('id', ideaId)
        .eq('status', 'pending')
    } catch { /* best-effort */ }
  }
}

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
export function ideaToSuggestion(row: ContentTopicIdeaRow): TopicSuggestion & { ideaId: string } {
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
    ...(plan?.demandEvidence ? { demandEvidence: plan.demandEvidence } : {}),
    ...(plan?.confidenceLevel ? { confidenceLevel: plan.confidenceLevel } : {}),
    ...(plan?.discoveryGenerated ? { discoveryGenerated: true } : {}),
    ...(plan?.businessRelevance ? { businessRelevance: plan.businessRelevance } : {}),
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
}

/**
 * Insert NEW pending ideas (fingerprinted). Uses upsert with ignoreDuplicates on
 * (project_id, fingerprint) so a concurrent generation never errors. Returns the
 * number of rows sent, or null when the table is missing.
 */
export async function insertPendingIdeas(admin: Admin, input: NewIdeaInput): Promise<number | null> {
  if (input.suggestions.length === 0) return 0
  const nowIso = new Date().toISOString()
  const rows = input.suggestions.map((s) => {
    // The additive JSONB link_plan carries the canonical role-aware plan + metadata so
    // roles survive persistence + reload (never re-inferred in the UI).
    const persistedPlan: PersistedPlan | null = s.linkPlan
      ? { linkPlan: s.linkPlan, recommendedPageType: s.recommendedPageType, demandEvidence: s.demandEvidence, confidenceLevel: s.confidenceLevel, discoveryGenerated: s.discoveryGenerated, businessRelevance: s.businessRelevance }
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
      fingerprint: topicIdeaFingerprint(s.primaryKeyword, s.title),
      status: 'pending' as const,
      updated_at: nowIso,
    }
  })
  const upsert = (payload: Record<string, unknown>[]) => admin.from(TABLE).upsert(payload, { onConflict: 'project_id,fingerprint', ignoreDuplicates: true })
  let { error } = await upsert(rows)
  // Backward-compatible: if the additive link_plan column is not applied yet, retry
  // WITHOUT it so persistence still works (roles simply won't survive reload).
  if (error && MISSING_COLUMN.has((error as { code?: string }).code ?? '')) {
    const stripped = rows.map(({ link_plan: _omit, ...rest }) => rest)
    ;({ error } = await upsert(stripped))
  }
  if (error) { if ((error as { code?: string }).code === MISSING_TABLE) return null; console.warn('[topic-idea-store] insert failed', { message: error.message }); return 0 }
  return rows.length
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

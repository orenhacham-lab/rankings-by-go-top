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
import type { TopicSuggestion, RecommendationSource } from './types'

type Admin = ReturnType<typeof createAdminClient>

const TABLE = 'content_topic_ideas'
/** Postgres "relation does not exist" — the migration has not been applied yet. */
const MISSING_TABLE = '42P01'

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
  return {
    id: row.id,
    ideaId: row.id,
    title: row.title,
    primaryKeyword: row.primary_keyword || row.title,
    secondaryKeywords: Array.isArray(row.secondary_keywords) ? row.secondary_keywords : [],
    searchIntent: row.search_intent || 'informational',
    recommendedWordCount: typeof row.recommended_word_count === 'number' ? row.recommended_word_count : 1000,
    angle: row.angle || '',
    suggestedInternalLinks: Array.isArray(row.suggested_internal_links) ? row.suggested_internal_links : [],
    source: (row.source as RecommendationSource) || 'project_data',
    suggestionReason: row.suggestion_reason || '',
    suggestionScore: typeof row.score === 'number' ? row.score : 0,
  }
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
  const rows = input.suggestions.map((s) => ({
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
    suggestion_reason: s.suggestionReason || null,
    source_context: null,
    source_url: s.suggestedInternalLinks?.[0]?.url ?? null,
    score: typeof s.suggestionScore === 'number' ? s.suggestionScore : null,
    fingerprint: topicIdeaFingerprint(s.primaryKeyword, s.title),
    status: 'pending' as const,
    updated_at: nowIso,
  }))
  const { error } = await admin.from(TABLE).upsert(rows, { onConflict: 'project_id,fingerprint', ignoreDuplicates: true })
  if (error) { if ((error as { code?: string }).code === MISSING_TABLE) return null; console.warn('[topic-idea-store] insert failed', { message: error.message }); return 0 }
  return rows.length
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

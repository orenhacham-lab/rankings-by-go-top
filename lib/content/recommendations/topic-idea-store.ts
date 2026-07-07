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
 * Conservative normalized fingerprint from primary_keyword (preferred) or title:
 * lowercase, collapse whitespace, strip edge punctuation. NO fuzzy/stemming —
 * only near-identical ideas collide, so long-tail variants stay distinct.
 */
export function topicIdeaFingerprint(primaryKeyword: string | null | undefined, title: string | null | undefined): string {
  const base = primaryKeyword && primaryKeyword.trim() ? primaryKeyword : (title || '')
  const edge = /^[\s"'“”׳״.,:;!?()[\]{}\-–—/|]+|[\s"'“”׳״.,:;!?()[\]{}\-–—/|]+$/g
  return base.toLowerCase().replace(/\s+/g, ' ').trim().replace(edge, '').trim()
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
 * All fingerprints already known for a project (any status), so a re-generation
 * doesn't re-offer pending/approved/rejected ideas. Returns null when the table
 * is missing (caller falls back to session-only).
 */
export async function loadKnownFingerprints(admin: Admin, projectId: string): Promise<Set<string> | null> {
  const { data, error } = await admin.from(TABLE).select('fingerprint').eq('project_id', projectId)
  if (error) { if ((error as { code?: string }).code === MISSING_TABLE) return null; return new Set() }
  return new Set(((data ?? []) as { fingerprint: string }[]).map((r) => (r.fingerprint || '').toLowerCase()).filter(Boolean))
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

/** Mark ideas approved and link them to the created article_topics rows. Best-effort. */
export async function markIdeasApproved(admin: Admin, projectId: string, pairs: { ideaId: string; topicId: string }[]): Promise<void> {
  const nowIso = new Date().toISOString()
  for (const p of pairs) {
    try {
      await admin
        .from(TABLE)
        .update({ status: 'approved', approved_topic_id: p.topicId, approved_at: nowIso, updated_at: nowIso })
        .eq('project_id', projectId)
        .eq('id', p.ideaId)
    } catch { /* best-effort */ }
  }
}

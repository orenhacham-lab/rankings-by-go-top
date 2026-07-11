/**
 * Phase 3E — add a published article's primary keyword to the project's tracked
 * keywords (tracking_targets), automatically and idempotently.
 *
 * Called ONLY after a confirmed successful WordPress PUBLISH (manual publish-now
 * and automation publish). It is best-effort: it never throws and never affects
 * the publish outcome — the caller ignores failures except for logging.
 *
 * Source precedence: the topic's primary_keyword (article_topics.primary_keyword).
 * The article title is never used as a keyword. Empty / whitespace / too-weak
 * keywords are ignored. Duplicates are avoided per (project_id, normalized
 * keyword), case-insensitively, so repeat calls are no-ops.
 *
 * No schema change: tracking_targets has no source/article columns, so the
 * provenance (source, article_id, topic_id, wp_post_id) is recorded compactly in
 * the existing `notes` column.
 */

import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

export type EnsureKeywordReason =
  | 'no_article'
  | 'no_primary_keyword'
  | 'weak_keyword'
  | 'already_exists'
  | 'added'
  | 'insert_failed'
  | 'error'

export interface EnsureKeywordResult {
  /** True when the helper ran without an unexpected error (added or a benign no-op). */
  ok: boolean
  added: boolean
  reason: EnsureKeywordReason
  keyword?: string
  trackingTargetId?: string
}

/** Normalize a keyword for storage: trim + collapse internal whitespace. */
function normalizeKeyword(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/** A keyword is "weak" if it is empty or shorter than 2 word characters. */
function isWeakKeyword(kw: string): boolean {
  if (kw.length < 2) return true
  // Must contain at least one letter/digit (any script) — reject punctuation-only.
  return !/[\p{L}\p{N}]/u.test(kw)
}

/**
 * Idempotently ensure the published article's topic primary keyword exists in the
 * project's tracked keywords. Safe to call multiple times. Never throws.
 */
export async function ensureProjectKeywordFromPublishedArticle(admin: Admin, articleId: string): Promise<EnsureKeywordResult> {
  try {
    const { data: artData } = await admin
      .from('generated_articles')
      .select('id, project_id, user_id, topic_id, wp_post_id')
      .eq('id', articleId)
      .maybeSingle()
    const article = artData as { id: string; project_id: string; user_id: string; topic_id: string | null; wp_post_id: number | null } | null
    if (!article) return { ok: true, added: false, reason: 'no_article' }

    // Prefer the topic's primary keyword. The article has no primary-keyword
    // field of its own, and the title is intentionally never used as a keyword.
    let primaryKeyword: string | null = null
    if (article.topic_id) {
      const { data: topicData } = await admin
        .from('article_topics')
        .select('primary_keyword')
        .eq('id', article.topic_id)
        .maybeSingle()
      primaryKeyword = (topicData as { primary_keyword: string | null } | null)?.primary_keyword ?? null
    }
    if (!primaryKeyword || !primaryKeyword.trim()) return { ok: true, added: false, reason: 'no_primary_keyword' }

    const keyword = normalizeKeyword(primaryKeyword)
    if (isWeakKeyword(keyword)) return { ok: true, added: false, reason: 'weak_keyword' }

    // Duplicate guard: compare case-insensitively against the project's existing
    // tracked keywords (matches the add-to-project convention: trim+lowercase).
    const { data: existing } = await admin
      .from('tracking_targets')
      .select('keyword')
      .eq('project_id', article.project_id)
    const existingSet = new Set(((existing as { keyword: string }[] | null) ?? []).map((r) => (r.keyword || '').trim().toLowerCase()))
    if (existingSet.has(keyword.toLowerCase())) return { ok: true, added: false, reason: 'already_exists', keyword }

    const note = `source=generated_article article=${article.id} topic=${article.topic_id ?? '-'} wp_post=${article.wp_post_id ?? '-'}`
    const { data: inserted, error } = await admin
      .from('tracking_targets')
      .insert({
        user_id: article.user_id,
        project_id: article.project_id,
        keyword,
        engine_type: 'google_search',
        target_domain: null,
        target_business_name: null,
        preferred_landing_page: null,
        notes: note,
        location_mode: 'project',
        custom_city: null,
        grid_size: null,
        postal_code: null,
        is_active: true,
      })
      .select('id')
      .maybeSingle()

    if (error) {
      // Unique-violation (race with a concurrent publish of the same keyword) is
      // a benign duplicate, not a real failure.
      if ((error as { code?: string }).code === '23505') return { ok: true, added: false, reason: 'already_exists', keyword }
      console.warn('[keyword-from-article] insert failed', { articleId, message: error.message })
      return { ok: false, added: false, reason: 'insert_failed', keyword }
    }

    return { ok: true, added: true, reason: 'added', keyword, trackingTargetId: (inserted as { id: string } | null)?.id }
  } catch (e) {
    console.warn('[keyword-from-article] unexpected', { articleId, message: e instanceof Error ? e.message : String(e) })
    return { ok: false, added: false, reason: 'error' }
  }
}

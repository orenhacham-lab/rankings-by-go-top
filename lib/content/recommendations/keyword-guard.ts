/**
 * Exact primary-keyword guard (Phase 3F.3.1b).
 *
 * Builds two EXACT-normalized sets for filtering topic-idea suggestions:
 *   - keywords: primary keywords that already exist for the project (project
 *     tracked keywords, article-topic keywords, generated articles' topic
 *     keywords, persisted-idea keywords, and RELIABLE WordPress/site-scan focus
 *     keywords).
 *   - titles: exact titles/fingerprints already seen (idea titles + fingerprints,
 *     topic titles, generated-article titles).
 *
 * Matching is EXACT normalized only (normalizeText): trim + lowercase + collapse
 * whitespace + strip edge punctuation. No stemming, no token-overlap, no
 * contains/substring matching — so "הליכון ביתי" never blocks "תחזוקת הליכון
 * ביתי" or "הליכון ביתי מתקפל". Read-only; never rescans WordPress.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getCachedIndex, reassembleReport } from '@/lib/content/wordpress-content-index'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import { normalizeText } from './topic-idea-store'

type Admin = ReturnType<typeof createAdminClient>

export interface KeywordGuard {
  titles: Set<string>
  keywords: Set<string>
  /** Keywords from existing CONTENT only (excludes persisted ideas) — for the
   *  bulk-approve guard, so approving a pending idea isn't blocked by itself. */
  contentKeywords: Set<string>
  counts: {
    existingProjectKeywordCount: number
    existingTopicKeywordCount: number
    existingIdeaKeywordCount: number
    existingScanKeywordCount: number
  }
}

export async function buildKeywordGuard(admin: Admin, projectId: string): Promise<KeywordGuard> {
  const titles = new Set<string>()
  const keywords = new Set<string>()
  const contentKeywords = new Set<string>()
  const counts = { existingProjectKeywordCount: 0, existingTopicKeywordCount: 0, existingIdeaKeywordCount: 0, existingScanKeywordCount: 0 }

  const addKeyword = (raw: string | null | undefined, content: boolean, bump?: () => void) => {
    const v = normalizeText(raw)
    if (!v) return
    keywords.add(v)
    if (content) contentKeywords.add(v)
    bump?.()
  }
  const addTitle = (raw: string | null | undefined) => { const v = normalizeText(raw); if (v) titles.add(v) }

  // Article topics — title + primary keyword. Covers generated articles too,
  // since every generated_articles.topic_id references a project topic here.
  try {
    const { data } = await admin.from('article_topics').select('topic, primary_keyword').eq('project_id', projectId)
    for (const t of (data ?? []) as { topic: string; primary_keyword: string | null }[]) {
      addTitle(t.topic)
      addKeyword(t.primary_keyword, true, () => counts.existingTopicKeywordCount++)
    }
  } catch { /* optional */ }

  // Generated articles — exact titles (their topic keyword is already covered above).
  try {
    const { data } = await admin.from('generated_articles').select('title').eq('project_id', projectId)
    for (const a of (data ?? []) as { title: string | null }[]) addTitle(a.title)
  } catch { /* optional */ }

  // Project tracked keywords.
  try {
    const { data } = await admin.from('tracking_targets').select('keyword').eq('project_id', projectId)
    for (const r of (data ?? []) as { keyword: string }[]) addKeyword(r.keyword, true, () => counts.existingProjectKeywordCount++)
  } catch { /* optional */ }

  // Persisted ideas (any status) — title + fingerprint + primary keyword. These
  // are NOT content keywords (a pending idea must not block its own approval).
  try {
    const { data, error } = await admin.from('content_topic_ideas').select('title, primary_keyword, fingerprint').eq('project_id', projectId)
    if (!error) {
      for (const r of (data ?? []) as { title: string; primary_keyword: string | null; fingerprint: string }[]) {
        addTitle(r.title)
        if (r.fingerprint) titles.add(r.fingerprint)
        addKeyword(r.primary_keyword, false, () => counts.existingIdeaKeywordCount++)
      }
    }
  } catch { /* ideas table optional */ }

  // Reliable WordPress/site-scan focus keywords ONLY (keywordAvailable === true =
  // Yoast/RankMath/AIOSEO focus keyword or a matched generated-article keyword —
  // never a title/slug/heading-derived guess). Read-only cache; no rescan.
  try {
    const cacheRow = await getCachedIndex(admin, projectId)
    if (cacheRow) {
      const report = reassembleReport(cacheRow)
      for (const tg of (report.targets ?? []) as ScannedTarget[]) {
        if (tg.keywordAvailable && tg.primaryKeywordCandidate) addKeyword(tg.primaryKeywordCandidate, true, () => counts.existingScanKeywordCount++)
      }
    }
  } catch { /* scan cache optional */ }

  return { titles, keywords, contentKeywords, counts }
}

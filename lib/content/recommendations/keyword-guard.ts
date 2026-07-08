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
import type { ContentTopicIdeaRow } from '@/lib/supabase/types'
import { normalizeText } from './topic-idea-store'

type Admin = ReturnType<typeof createAdminClient>

export interface KeywordGuard {
  titles: Set<string>
  keywords: Set<string>
  /** Keywords from existing CONTENT only (excludes persisted ideas) — for the
   *  bulk-approve guard and pending revalidation, so an idea isn't blocked by
   *  itself. Covers project keywords, topic/generated keywords, scan keywords. */
  contentKeywords: Set<string>
  /** Titles from existing CONTENT only (topics + generated articles; no ideas). */
  contentTitles: Set<string>
  /** Per-source sets for diagnostics/classification (server-side only). */
  sources: {
    tracking: Set<string>
    topics: Set<string>
    ideas: Set<string>
    scan: Set<string>
  }
  /** Up to 10 example scan focus keywords actually included (dev diagnostics). */
  scanSamples: string[]
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
  const contentTitles = new Set<string>()
  const sources = { tracking: new Set<string>(), topics: new Set<string>(), ideas: new Set<string>(), scan: new Set<string>() }
  const scanSamples: string[] = []
  const counts = { existingProjectKeywordCount: 0, existingTopicKeywordCount: 0, existingIdeaKeywordCount: 0, existingScanKeywordCount: 0 }

  const addKeyword = (raw: string | null | undefined, opts: { content: boolean; sourceSet?: Set<string>; bump?: () => void }) => {
    const v = normalizeText(raw)
    if (!v) return
    keywords.add(v)
    if (opts.content) contentKeywords.add(v)
    opts.sourceSet?.add(v)
    opts.bump?.()
  }
  const addTitle = (raw: string | null | undefined, content: boolean) => { const v = normalizeText(raw); if (v) { titles.add(v); if (content) contentTitles.add(v) } }

  // Article topics — title + primary keyword. Covers generated articles too,
  // since every generated_articles.topic_id references a project topic here.
  try {
    const { data } = await admin.from('article_topics').select('topic, primary_keyword').eq('project_id', projectId)
    for (const t of (data ?? []) as { topic: string; primary_keyword: string | null }[]) {
      addTitle(t.topic, true)
      addKeyword(t.primary_keyword, { content: true, sourceSet: sources.topics, bump: () => counts.existingTopicKeywordCount++ })
    }
  } catch { /* optional */ }

  // Generated articles — exact titles (their topic keyword is already covered above).
  try {
    const { data } = await admin.from('generated_articles').select('title').eq('project_id', projectId)
    for (const a of (data ?? []) as { title: string | null }[]) addTitle(a.title, true)
  } catch { /* optional */ }

  // Project tracked keywords.
  try {
    const { data } = await admin.from('tracking_targets').select('keyword').eq('project_id', projectId)
    for (const r of (data ?? []) as { keyword: string }[]) addKeyword(r.keyword, { content: true, sourceSet: sources.tracking, bump: () => counts.existingProjectKeywordCount++ })
  } catch { /* optional */ }

  // Persisted ideas (any status) — title + fingerprint + primary keyword. These
  // are NOT content keywords (a pending idea must not block its own approval).
  try {
    const { data, error } = await admin.from('content_topic_ideas').select('title, primary_keyword, fingerprint').eq('project_id', projectId)
    if (!error) {
      for (const r of (data ?? []) as { title: string; primary_keyword: string | null; fingerprint: string }[]) {
        addTitle(r.title, false)
        if (r.fingerprint) titles.add(r.fingerprint)
        addKeyword(r.primary_keyword, { content: false, sourceSet: sources.ideas, bump: () => counts.existingIdeaKeywordCount++ })
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
        if (tg.keywordAvailable && tg.primaryKeywordCandidate) {
          const before = sources.scan.size
          addKeyword(tg.primaryKeywordCandidate, { content: true, sourceSet: sources.scan, bump: () => counts.existingScanKeywordCount++ })
          if (sources.scan.size > before && scanSamples.length < 10) scanSamples.push(tg.primaryKeywordCandidate.trim())
        }
      }
    }
  } catch { /* scan cache optional */ }

  return { titles, keywords, contentKeywords, contentTitles, sources, scanSamples, counts }
}

/**
 * Revalidate already-persisted PENDING ideas against the current guard (Phase
 * 3F.3.1c). A pending idea is a conflict if its exact normalized primary keyword
 * is now an existing CONTENT keyword, or its exact normalized title is an
 * existing content title. Pure — the caller marks conflicts 'duplicate'. Uses
 * contentKeywords/contentTitles (excludes ideas) so an idea never conflicts with
 * itself; and since fingerprint = normalize(primary_keyword), two ideas can't
 * share a keyword, so pending-vs-pending self-conflict is impossible.
 */
export function partitionPending(
  rows: ContentTopicIdeaRow[],
  guard: KeywordGuard,
): { visible: ContentTopicIdeaRow[]; conflictIds: string[]; conflicts: { id: string; reason: 'primary_keyword_exists' | 'title_exists' }[] } {
  const visible: ContentTopicIdeaRow[] = []
  const conflictIds: string[] = []
  const conflicts: { id: string; reason: 'primary_keyword_exists' | 'title_exists' }[] = []
  for (const r of rows) {
    const nk = normalizeText(r.primary_keyword)
    const nt = normalizeText(r.title)
    if (nk && guard.contentKeywords.has(nk)) { conflictIds.push(r.id); conflicts.push({ id: r.id, reason: 'primary_keyword_exists' }); continue }
    if (nt && guard.contentTitles.has(nt)) { conflictIds.push(r.id); conflicts.push({ id: r.id, reason: 'title_exists' }); continue }
    visible.push(r)
  }
  return { visible, conflictIds, conflicts }
}

/** Which guard source(s) contain this exact normalized primary keyword (diagnostics). */
export function keywordSourcesOf(guard: KeywordGuard, primaryKeyword: string): string[] {
  const v = normalizeText(primaryKeyword)
  if (!v) return []
  const hits: string[] = []
  if (guard.sources.tracking.has(v)) hits.push('tracking_targets')
  if (guard.sources.topics.has(v)) hits.push('article_topics')
  if (guard.sources.ideas.has(v)) hits.push('content_topic_ideas')
  if (guard.sources.scan.has(v)) hits.push('site_scan')
  return hits
}

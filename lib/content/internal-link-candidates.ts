/**
 * Content module — server-side loader for internal-link candidates.
 *
 * Shared by the article editor route and the planning route. For a project it
 * returns every PUBLISHED article with a public URL as a possible link target,
 * enriched with SEO-defined anchor data:
 *   - keyword           → the target topic's primary_keyword
 *   - secondaryKeywords → the target topic's secondary_keywords
 *   - manualAnchors     → approved anchor bank (internal_links_json) MERGED with
 *                         historical anchors backfilled by scanning every
 *                         published article's body for links to this target.
 *
 * No DOM, no AI, no writes. Historical extraction is regex-based and body-only.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { extractLinkAnchorsFromHtml, normalizeUrlKey, normalizeHref } from '@/lib/content/internal-links'

type Admin = ReturnType<typeof createAdminClient>

export interface InternalLinkCandidate {
  id: string
  title: string
  url: string
  keyword: string | null
  secondaryKeywords: string[]
  manualAnchors: string[]
}

/** Read the saved inbound anchor bank out of a row's internal_links_json. */
export function readAnchorBank(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (entry && typeof entry === 'object' && typeof (entry as { anchor?: unknown }).anchor === 'string') {
      const a = ((entry as { anchor: string }).anchor).trim()
      if (a) out.push(a)
    }
  }
  return out
}

interface PublishedRow {
  id: string
  title: string
  wp_post_url: string | null
  topic_id: string | null
  internal_links_json: unknown
  content_html: string | null
}

export async function loadInternalLinkCandidates(
  admin: Admin,
  projectId: string,
  excludeArticleId?: string,
): Promise<InternalLinkCandidate[]> {
  const { data } = await admin
    .from('generated_articles')
    .select('id, title, wp_post_url, topic_id, internal_links_json, content_html')
    .eq('project_id', projectId)
    .eq('status', 'published')
    .not('wp_post_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(50)

  const rows = (data ?? []) as PublishedRow[]
  const published = rows.filter((r) => r.wp_post_url)

  // Map every known published URL → its article id, for historical extraction.
  const urlToId = new Map<string, string>()
  for (const r of published) urlToId.set(normalizeUrlKey(r.wp_post_url as string), r.id)

  // Backfill: scan EVERY published body for links pointing at a known target.
  const historicalByTarget = new Map<string, string[]>()
  for (const r of published) {
    for (const link of extractLinkAnchorsFromHtml(r.content_html ?? '')) {
      const targetId = urlToId.get(normalizeUrlKey(link.href))
      if (!targetId) continue
      const list = historicalByTarget.get(targetId) ?? []
      list.push(link.text)
      historicalByTarget.set(targetId, list)
    }
  }

  // Keyword + secondary keywords come from the linked topic (never the title/body).
  const topicIds = Array.from(new Set(published.map((r) => r.topic_id).filter((x): x is string => !!x)))
  const topicById: Record<string, { primary: string | null; secondary: string[] }> = {}
  if (topicIds.length) {
    const { data: topics } = await admin
      .from('article_topics')
      .select('id, primary_keyword, secondary_keywords')
      .in('id', topicIds)
    for (const t of (topics ?? []) as { id: string; primary_keyword: string | null; secondary_keywords: string[] | null }[]) {
      topicById[t.id] = { primary: t.primary_keyword, secondary: Array.isArray(t.secondary_keywords) ? t.secondary_keywords : [] }
    }
  }

  return published
    .filter((r) => r.id !== excludeArticleId)
    .map((r) => {
      const topic = r.topic_id ? topicById[r.topic_id] : undefined
      const bank = readAnchorBank(r.internal_links_json)
      const historical = historicalByTarget.get(r.id) ?? []
      // Dedupe (case-insensitive) across bank + historical, preserving order.
      const seen = new Set<string>()
      const manualAnchors: string[] = []
      for (const a of [...bank, ...historical]) {
        const key = a.trim().toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        manualAnchors.push(a.trim())
      }
      return {
        id: r.id,
        title: r.title,
        url: normalizeHref(r.wp_post_url as string),
        keyword: topic?.primary ?? null,
        secondaryKeywords: topic?.secondary ?? [],
        manualAnchors,
      }
    })
}

/**
 * Content module — server-side loader for internal-link candidates.
 *
 * Returns two kinds of link targets for a project:
 *   - 'article'      → published generated articles (with keyword / secondary
 *                      keywords / historical anchors), the primary suggestions.
 *   - 'internal_url' → any OTHER same-site internal URL discovered inside article
 *                      bodies (categories, product/brand/service pages, WP posts…)
 *                      even when the URL is not a generated article.
 *
 * Historical anchors are extracted from every published article body: each
 * internal <a href> on the project's own domain(s) contributes its anchor text
 * (single-word / generic anchors are KEPT — they are real prior usage). Skips
 * empty / image-only / nav-footer-sidebar links. No DOM, no AI, no writes.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import {
  extractLinkAnchorsFromHtml,
  urlMatchKeys,
  normalizeHref,
  internalTargetKey,
  extractUrlHost,
  isInternalUrl,
  slugFromUrl,
} from '@/lib/content/internal-links'
import { loadShopifyLinkCandidates } from '@/lib/shopify/link-candidates'

type Admin = ReturnType<typeof createAdminClient>

export interface InternalLinkCandidate {
  id: string
  kind: 'article' | 'internal_url'
  title: string
  url: string
  keyword: string | null
  secondaryKeywords: string[]
  /** Previously-used anchors for this target (body-extracted + saved bank). */
  historicalAnchors: string[]
}

export interface InternalLinkCandidatesResult {
  candidates: InternalLinkCandidate[]
  /** Same-site hosts (no www) — used to validate a manually-pasted target URL. */
  hosts: string[]
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

/** Dedupe strings case-insensitively, preserving first-seen order. */
function dedupe(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of list) {
    const key = a.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(a.trim())
  }
  return out
}

export async function loadInternalLinkCandidates(
  admin: Admin,
  projectId: string,
  excludeArticleId?: string,
): Promise<InternalLinkCandidatesResult> {
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

  // Same-site hosts: the project domain + every published article's host.
  const hosts = new Set<string>()
  const { data: proj } = await admin.from('projects').select('target_domain').eq('id', projectId).maybeSingle()
  const projHost = extractUrlHost(String((proj as { target_domain?: string } | null)?.target_domain ?? ''))
  if (projHost) hosts.add(projHost)
  for (const r of published) { const h = extractUrlHost(r.wp_post_url as string); if (h) hosts.add(h) }
  const hostList = Array.from(hosts)

  // Map every known published URL (all tolerant match keys) → its article id.
  const urlToId = new Map<string, string>()
  for (const r of published) for (const k of urlMatchKeys(r.wp_post_url as string)) urlToId.set(k, r.id)

  // Scan EVERY published body for same-site internal links. Route each anchor to
  // its known article, or to a discovered internal-URL target otherwise.
  const historicalByArticle = new Map<string, string[]>()
  const internalUrlTargets = new Map<string, { url: string; anchors: string[] }>()
  for (const r of published) {
    for (const link of extractLinkAnchorsFromHtml(r.content_html ?? '')) {
      if (!isInternalUrl(link.href, hostList)) continue
      const articleId = urlMatchKeys(link.href).map((k) => urlToId.get(k)).find(Boolean)
      if (articleId) {
        const list = historicalByArticle.get(articleId) ?? []
        list.push(link.text)
        historicalByArticle.set(articleId, list)
      } else {
        const key = internalTargetKey(link.href)
        if (!key) continue
        // Prefer an absolute URL for display over a relative one.
        const abs = /^https?:\/\//i.test(link.href)
        const entry = internalUrlTargets.get(key) ?? { url: normalizeHref(link.href), anchors: [] }
        if (abs && !/^https?:\/\//i.test(entry.url)) entry.url = normalizeHref(link.href)
        entry.anchors.push(link.text)
        internalUrlTargets.set(key, entry)
      }
    }
  }

  // Keyword + secondary keywords come from the linked topic (never title/body).
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

  const articleCandidates: InternalLinkCandidate[] = published
    .filter((r) => r.id !== excludeArticleId)
    .map((r) => {
      const topic = r.topic_id ? topicById[r.topic_id] : undefined
      const historical = dedupe([...(historicalByArticle.get(r.id) ?? []), ...readAnchorBank(r.internal_links_json)])
      return {
        id: r.id,
        kind: 'article' as const,
        title: r.title,
        url: normalizeHref(r.wp_post_url as string),
        keyword: topic?.primary ?? null,
        secondaryKeywords: topic?.secondary ?? [],
        historicalAnchors: historical,
      }
    })

  const urlCandidates: InternalLinkCandidate[] = Array.from(internalUrlTargets.entries())
    .map(([key, t]) => {
      const anchors = dedupe(t.anchors)
      // Best label: a natural (multi-word) historical anchor, else the URL slug.
      const nonWeak = anchors.find((a) => a.trim().split(/\s+/).filter(Boolean).length > 1)
      return {
        id: `url:${key}`,
        kind: 'internal_url' as const,
        title: nonWeak || slugFromUrl(t.url),
        url: t.url,
        keyword: null,
        secondaryKeywords: [],
        historicalAnchors: anchors,
      }
    })

  // Phase 4F.1 — additively include synced, ACTIVE Shopify entities (products/
  // collections/pages/articles) as source-neutral internal-link candidates.
  // Best-effort + no-op for WordPress-only projects (no Shopify entities → []).
  // Their storefront hosts are added to hostList so they validate as internal.
  const shopifyCandidates = await loadShopifyLinkCandidates(admin, projectId)
  for (const c of shopifyCandidates) { const h = extractUrlHost(c.url); if (h && !hostList.includes(h)) hostList.push(h) }

  return { candidates: [...articleCandidates, ...urlCandidates, ...shopifyCandidates], hosts: hostList }
}

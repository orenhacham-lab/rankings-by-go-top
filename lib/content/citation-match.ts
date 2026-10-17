/**
 * "Cited by an AI engine": matching the citations AI checks have ALREADY
 * stored (ai_citations.url) against the live URL of a published article.
 *
 * Free by construction: it reads rows the project's own AI checks wrote. It
 * never runs a check, never calls a provider and never spends quota. A badge
 * is shown only for a citation row that exists; there is no inference, no
 * "probably cited", and no match on the domain alone.
 *
 * The same page is written many ways by engines, so both sides are normalized
 * before comparing:
 *   - scheme ignored (http / https), host lower-cased, a leading "www." dropped,
 *     a default port dropped;
 *   - query string and fragment dropped (engines append utm_source=chatgpt.com);
 *   - path percent-decoded (a Hebrew slug arrives encoded from one side and raw
 *     from the other), lower-cased, trailing slashes removed.
 * A site's home page never matches: an article that "lives" at the root would
 * turn every citation of the home page into a false badge.
 *
 * Pure: no I/O. The routes do the owner-filtered reads and call these.
 */

export interface StoredCitation {
  engine: string
  url: string
  prompt_id: string | null
  created_at: string | null
}

export interface CitationMatch {
  engine: string
  /** The question the engine was asked, when its prompt still exists. */
  question: string | null
  /** The latest time this engine cited the article for this question. */
  lastSeenAt: string | null
}

/** A comparable key for a URL, or null when it is not an http(s) URL. */
export function normalizeUrlForMatch(raw: unknown): string | null {
  let s = String(raw ?? '').trim()
  if (!s || s.length > 4096) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    // A bare "shop.com/blog/x" (some engines store it so). Anything with another scheme is not a page.
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/:]+:\d+(\/|$)/.test(s)) return null
    s = `https://${s.replace(/^\/+/, '')}`
  }
  let u: URL
  try { u = new URL(s) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  if (!host) return null
  const port = u.port && u.port !== '80' && u.port !== '443' ? `:${u.port}` : ''
  let path = u.pathname
  try { path = decodeURIComponent(path) } catch { /* keep the encoded form */ }
  path = path.toLowerCase().replace(/\/+$/, '')
  return `${host}${port}${path}`
}

/** True when the key names a page below the site root (an article, not the home page). */
function isArticleKey(key: string): boolean {
  const slash = key.indexOf('/')
  return slash > 0 && key.length > slash + 1
}

/** The live URL of a PUBLISHED article, whichever platform it went to. */
export function publishedUrlOf(a: {
  status?: string | null
  wp_post_url?: string | null
  shopify_article_url?: string | null
  site_post_url?: string | null
}): string | null {
  if (a.status !== 'published') return null
  for (const u of [a.shopify_article_url, a.site_post_url, a.wp_post_url]) {
    if (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) return u.trim()
  }
  return null
}

/**
 * The stored citations that point at `articleUrl`, one entry per engine and
 * question (the latest sighting), newest first.
 */
export function matchArticleCitations(
  articleUrl: string | null,
  citations: StoredCitation[],
  questionsById: Record<string, string>,
): CitationMatch[] {
  const target = normalizeUrlForMatch(articleUrl)
  if (!target || !isArticleKey(target)) return []
  const byKey = new Map<string, CitationMatch>()
  for (const c of citations ?? []) {
    if (!c || typeof c.engine !== 'string' || !c.engine) continue
    if (normalizeUrlForMatch(c.url) !== target) continue
    const question = c.prompt_id ? (questionsById[c.prompt_id] ?? null) : null
    const key = `${c.engine}\u0000${question ?? ''}`
    const prev = byKey.get(key)
    if (!prev || String(c.created_at ?? '') > String(prev.lastSeenAt ?? '')) {
      byKey.set(key, { engine: c.engine, question, lastSeenAt: c.created_at ?? null })
    }
  }
  return [...byKey.values()].sort((a, b) => String(b.lastSeenAt ?? '').localeCompare(String(a.lastSeenAt ?? '')))
}

/** For a list of published articles: which of them any stored citation points at, and by which engines. */
export function citedArticles(
  articles: { id: string; url: string | null }[],
  citations: StoredCitation[],
): Record<string, string[]> {
  const byTarget = new Map<string, string>()
  for (const a of articles) {
    const key = normalizeUrlForMatch(a.url)
    if (key && isArticleKey(key)) byTarget.set(key, a.id)
  }
  const out: Record<string, string[]> = {}
  for (const c of citations ?? []) {
    if (!c || typeof c.engine !== 'string' || !c.engine) continue
    const key = normalizeUrlForMatch(c.url)
    const id = key ? byTarget.get(key) : undefined
    if (!id) continue
    const engines = (out[id] ??= [])
    if (!engines.includes(c.engine)) engines.push(c.engine)
  }
  return out
}

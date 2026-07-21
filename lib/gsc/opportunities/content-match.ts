/**
 * Stage E2A — read-only existing-content matching (pure). Matches a GSC page/query against
 * already-owned project content evidence (topics, generated articles, indexed URLs). It
 * READS evidence only — nothing is ever mutated.
 *
 * False-match guard: a match requires a direct normalized-URL equality OR strong token
 * evidence (≥2 shared meaningful tokens, or exact keyword/title identity). A single shared
 * GENERIC token is never sufficient.
 *
 * urlKey mirrors the semantics of lib/content/internal-links.ts `normalizeUrlKey` (strip
 * protocol, www, query, fragment, trailing slash; lowercase; percent-decode) but is
 * reimplemented locally so this module stays fully isolated from lib/content.
 */
import { contentTokenSet, normalizeQuery } from './normalize'
import type { ContentEvidence, ContentMatch } from './types'

/** Tolerant host+path key: no protocol / www / query / fragment / trailing slash; lowercased. */
export function urlKey(input: string): string {
  const raw = (input || '').trim()
  if (!raw) return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  let host = '', path = ''
  try {
    const u = new URL(withScheme)
    host = u.host.toLowerCase().replace(/^www\./, '')
    path = u.pathname
  } catch {
    return raw.toLowerCase().replace(/[#?].*$/, '').replace(/\/+$/, '')
  }
  let decoded = path
  try { decoded = decodeURIComponent(path) } catch { /* keep raw path */ }
  const cleanPath = decoded.toLowerCase().replace(/\/+$/, '')
  return `${host}${cleanPath}`
}

const setsIntersect = (a: string[], b: string[]) => { const B = new Set(b); return a.filter((t) => B.has(t)) }

/**
 * Best read-only content match for a page + its query cluster, or null. Precedence:
 *   1. direct normalized-URL equality (page ↔ generated article URL / indexed URL) → 1.0
 *   2. exact keyword/title identity with the query → 0.9
 *   3. strong token overlap (≥2 shared meaningful tokens) → Jaccard-scaled ≥0.5
 * A single shared token never matches.
 */
export function matchExistingContent(page: string, primaryQuery: string, evidence: ContentEvidence): ContentMatch | null {
  const pageKey = urlKey(page)
  const qSet = contentTokenSet(primaryQuery)
  const qNorm = normalizeQuery(primaryQuery)

  // 1) Direct URL match — strongest, unambiguous.
  if (pageKey) {
    for (const a of evidence.articles) {
      if (a.url && urlKey(a.url) === pageKey) return { source: 'generated_article', matchType: 'url', confidence: 1, reference: a.title || a.slug, matchedUrl: a.url }
    }
    for (const u of evidence.indexedUrls) {
      if (urlKey(u) === pageKey) return { source: 'indexed_url', matchType: 'url', confidence: 1, reference: u, matchedUrl: u }
    }
  }

  let best: ContentMatch | null = null
  const consider = (m: ContentMatch) => { if (!best || m.confidence > best.confidence) best = m }

  // 2/3) Keyword + title token evidence.
  const keywordCandidates: { text: string; source: ContentMatch['source']; reference: string; matchedUrl: string | null; matchType: ContentMatch['matchType'] }[] = []
  for (const t of evidence.topics) {
    if (t.primaryKeyword) keywordCandidates.push({ text: t.primaryKeyword, source: 'article_topic', reference: t.topic || t.primaryKeyword, matchedUrl: null, matchType: 'keyword' })
    for (const s of t.secondaryKeywords) keywordCandidates.push({ text: s, source: 'article_topic', reference: t.topic || s, matchedUrl: null, matchType: 'keyword' })
  }
  for (const a of evidence.articles) {
    keywordCandidates.push({ text: a.title, source: 'generated_article', reference: a.title || a.slug, matchedUrl: a.url, matchType: 'title' })
  }

  for (const c of keywordCandidates) {
    const cSet = contentTokenSet(c.text)
    if (cSet.length === 0) continue
    // Exact identity with the query is a strong match even for a single token.
    if (normalizeQuery(c.text) === qNorm && qNorm) { consider({ source: c.source, matchType: c.matchType, confidence: 0.9, reference: c.reference, matchedUrl: c.matchedUrl }); continue }
    const inter = setsIntersect(cSet, qSet).length
    if (inter >= 2) {
      const conf = Math.max(0.5, Math.min(0.85, inter / Math.max(cSet.length, qSet.length)))
      consider({ source: c.source, matchType: c.matchType, confidence: conf, reference: c.reference, matchedUrl: c.matchedUrl })
    }
  }

  return best
}

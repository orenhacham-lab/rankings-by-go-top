/**
 * Content module — Internal Linking v1 (client-side, deterministic).
 *
 * Suggests and inserts links from the current article to OTHER published
 * articles in the same project. Runs entirely in the browser using DOMParser —
 * NO AI, no network calls, no automatic insertion. Every suggestion is opt-in:
 * the editor decides which links to add, and nothing is written until the user
 * saves the article (the PATCH route re-sanitizes the HTML).
 *
 * Safety rules baked in here:
 *  - Insert ONLY inside a normal <p> paragraph — never inside headings, tables,
 *    lists inside cells, figures/images, nav, existing <a>, buttons, or code.
 *  - Never overwrite an existing link; never link the same target URL twice;
 *    never reuse the same anchor text twice; skip URLs already linked in body.
 *  - Prefer natural 2–5 word anchor phrases; a single generic word is only used
 *    as a last resort and is flagged `weak`.
 *  - If no safe insertion point exists for a candidate, it is still shown but
 *    marked `insertable: false` so the editor knows it can't be auto-inserted.
 */

export interface LinkCandidate {
  id: string
  title: string
  url: string
  keyword: string | null
}

export interface LinkSuggestion {
  targetId: string
  targetTitle: string
  url: string
  anchorText: string
  reason: 'keyword' | 'titlePhrase' | 'weakGeneric'
  insertable: boolean
  weak: boolean
}

// Elements a link must NEVER be inserted inside (structural / non-prose / already-linked).
const FORBIDDEN_ANCESTORS = 'a, h1, h2, h3, h4, h5, h6, table, thead, tbody, tr, td, th, figure, figcaption, nav, button, code, pre'

/**
 * Defensively repair an href value before it is displayed or written into the
 * document: strip a stray leading slash before the scheme (e.g. "/https://…"),
 * and drop surrounding whitespace. Safe to run on server or client (pure string).
 */
export function normalizeHref(u: string): string {
  return String(u || '').trim().replace(/^\/+(?=https?:\/\/)/i, '')
}

/** Normalize a URL for comparison: drop protocol, lowercase host+path, trim trailing slash. */
function normUrl(u: string): string {
  return normalizeHref(u)
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/** Parse HTML into a document; returns null when DOMParser is unavailable (SSR). */
function parse(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null
  try {
    return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  } catch {
    return null
  }
}

/** Collect the normalized URLs of every existing <a href> in the content. */
export function extractExistingLinkUrls(html: string): Set<string> {
  const set = new Set<string>()
  const doc = parse(html)
  if (!doc) return set
  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href')
    if (href) set.add(normUrl(href))
  })
  return set
}

/** True when the node sits inside a forbidden ancestor (heading/table/link/…). */
function inForbidden(node: Node): boolean {
  const el = node.parentElement
  if (!el) return true
  return !!el.closest(FORBIDDEN_ANCESTORS)
}

/**
 * Find the first safe occurrence of `anchorText` inside a normal <p>. Returns
 * the exact text node + offset, or null if the phrase never appears in prose.
 * Matching is case-insensitive and only accepts whole-phrase substring hits.
 */
function locate(doc: Document, anchorText: string): { node: Text; index: number } | null {
  const needle = anchorText.toLowerCase()
  const paragraphs = Array.from(doc.querySelectorAll('p'))
  for (const p of paragraphs) {
    if (p.closest(FORBIDDEN_ANCESTORS)) continue
    // Walk direct text nodes; only plain text (no partial across element edges).
    const walker = doc.createTreeWalker(p, NodeFilter.SHOW_TEXT)
    let n = walker.nextNode()
    while (n) {
      const text = n as Text
      if (!inForbidden(text)) {
        const idx = text.data.toLowerCase().indexOf(needle)
        if (idx >= 0) return { node: text, index: idx }
      }
      n = walker.nextNode()
    }
  }
  return null
}

/**
 * Insert a single internal link by wrapping the first safe occurrence of
 * `anchorText` in an <a href> (rel="noopener"). Returns the updated body HTML,
 * or null when no safe insertion point exists. Never mutates existing links.
 */
export function insertInternalLink(html: string, anchorText: string, url: string): string | null {
  const doc = parse(html)
  if (!doc) return null
  const hit = locate(doc, anchorText)
  if (!hit) return null

  const { node, index } = hit
  const matchLen = anchorText.length
  const after = node.splitText(index)
  after.splitText(matchLen) // `after` now holds exactly the matched phrase

  const link = doc.createElement('a')
  link.setAttribute('href', normalizeHref(url))
  link.setAttribute('rel', 'noopener')
  link.textContent = after.data
  after.parentNode?.replaceChild(link, after)

  return doc.body.innerHTML
}

const GENERIC_WORDS = new Set([
  'יפן', 'סין', 'נעליים', 'הליכון', 'ריצה', 'הליכה', 'בריאות', 'ספורט', 'אימון',
  'shoes', 'running', 'walking', 'health', 'fitness', 'japan', 'china',
])

/** A good anchor is a natural 2–5 word phrase, not too short. */
function isGoodAnchor(phrase: string): boolean {
  const p = phrase.trim()
  if (p.length < 6) return false
  const words = p.split(/\s+/).filter(Boolean)
  return words.length >= 2 && words.length <= 5
}

/**
 * Choose the best anchor for a candidate, in priority order:
 *  1. its primary keyword — if it's a specific 2–5 word phrase present in prose;
 *  2. a 2–5 word phrase from its title — if that phrase appears naturally;
 *  3. a single meaningful word (keyword) present in prose — flagged `weak`.
 * Returns null when nothing appears safely in the body.
 */
function pickAnchor(
  doc: Document,
  candidate: LinkCandidate,
): { anchor: string; reason: LinkSuggestion['reason']; weak: boolean } | null {
  const kw = (candidate.keyword ?? '').trim()

  // 1) Specific multi-word keyword that already appears in a paragraph.
  if (kw && isGoodAnchor(kw) && locate(doc, kw)) {
    return { anchor: kw, reason: 'keyword', weak: false }
  }

  // 2) A natural phrase from the title that appears in a paragraph. Try the
  //    full title first, then trailing 2–5 word windows so we favour a concrete
  //    phrase over the whole heading.
  const titleWords = candidate.title.trim().split(/\s+/).filter(Boolean)
  const phrases: string[] = []
  if (titleWords.length >= 2 && titleWords.length <= 5) phrases.push(candidate.title.trim())
  for (let size = 5; size >= 2; size--) {
    for (let start = 0; start + size <= titleWords.length; start++) {
      phrases.push(titleWords.slice(start, start + size).join(' '))
    }
  }
  for (const phrase of phrases) {
    if (isGoodAnchor(phrase) && locate(doc, phrase)) {
      return { anchor: phrase, reason: 'titlePhrase', weak: false }
    }
  }

  // 3) Last resort: a single meaningful keyword word present in prose. Skip
  //    obviously generic single words unless there is truly nothing better.
  if (kw) {
    const singles = kw.split(/\s+/).filter((w) => w.length >= 3)
    const preferred = singles.filter((w) => !GENERIC_WORDS.has(w.toLowerCase()))
    const ordered = [...preferred, ...singles.filter((w) => GENERIC_WORDS.has(w.toLowerCase()))]
    for (const w of ordered) {
      if (locate(doc, w)) return { anchor: w, reason: 'weakGeneric', weak: true }
    }
  }

  return null
}

/**
 * Build deterministic link suggestions for the current article body.
 * - One suggestion per target URL, one use per anchor text.
 * - Skips target URLs already linked somewhere in the body.
 * - Insertable suggestions (a safe anchor exists) are returned first, then any
 *   non-insertable candidates, capped at `max` (default 5).
 * Self-links are already excluded by the candidates route, but we also skip any
 * URL that matches an already-present link.
 */
export function suggestInternalLinks(
  html: string,
  candidates: LinkCandidate[],
  opts: { max?: number } = {},
): LinkSuggestion[] {
  const max = Math.min(Math.max(opts.max ?? 5, 1), 5)
  const doc = parse(html)
  if (!doc) return []

  const alreadyLinked = extractExistingLinkUrls(html)
  const shownUrls = new Set<string>()
  const usedAnchors = new Set<string>()

  const insertable: LinkSuggestion[] = []
  const notInsertable: LinkSuggestion[] = []

  for (const cand of candidates) {
    if (!cand.url) continue
    const nUrl = normUrl(cand.url)
    if (shownUrls.has(nUrl) || alreadyLinked.has(nUrl)) continue

    const picked = pickAnchor(doc, cand)
    // Only a specific (non-weak) phrase not yet used elsewhere is insertable.
    if (picked && !picked.weak && !usedAnchors.has(picked.anchor.toLowerCase())) {
      shownUrls.add(nUrl)
      usedAnchors.add(picked.anchor.toLowerCase())
      insertable.push({
        targetId: cand.id,
        targetTitle: cand.title,
        url: normalizeHref(cand.url),
        anchorText: picked.anchor,
        reason: picked.reason,
        insertable: true,
        weak: false,
      })
    } else {
      // Weak single-word anchors and candidates with no safe phrase are shown
      // as informational only — never auto-insertable in v1.
      shownUrls.add(nUrl)
      notInsertable.push({
        targetId: cand.id,
        targetTitle: cand.title,
        url: normalizeHref(cand.url),
        anchorText: picked?.anchor || cand.keyword?.trim() || cand.title.trim(),
        reason: picked?.reason ?? 'titlePhrase',
        insertable: false,
        weak: !!picked?.weak,
      })
    }
  }

  return [...insertable, ...notInsertable].slice(0, max)
}

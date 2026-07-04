/**
 * Content module — Internal Linking v1 (client-side, deterministic, SEO-driven).
 *
 * Anchors are NOT invented. For each target article the anchor candidates come,
 * in priority order, from real project data:
 *   A. the target article's defined keyword (topic primary_keyword),
 *   B. previously-approved manual anchors saved for that exact target (its
 *      inbound "anchor bank", persisted on the target row),
 *   C. the target topic's secondary keywords, if any already exist in the data.
 *
 * A candidate is insertable ONLY when that exact phrase already occurs in the
 * current article body inside safe prose (<p>/<li> — never headings, tables,
 * buttons, figures, nav, code, or existing links). Nothing is generated from
 * the target title, from surrounding words, from related-term maps, or from any
 * body phrase discovery. No AI. Insertion is always a manual editor action and
 * nothing persists until the article is saved.
 */

export interface LinkCandidate {
  id: string
  title: string
  url: string
  keyword: string | null
  secondaryKeywords?: string[]
  /** Previously-approved manual anchors for THIS target (its anchor bank). */
  manualAnchors?: string[]
}

export interface AnchorOption {
  text: string
  source: 'keyword' | 'manual' | 'secondary'
  exists: boolean
  weak: boolean
}

export interface AnchorDebug {
  targetId: string
  url: string
  keyword: string | null
  manualHistory: string[]
  checked: string[]
  found: string[]
  rejected: { anchor: string; reason: string }[]
  selected: string | null
}

export interface LinkSuggestion {
  targetId: string
  targetTitle: string
  url: string
  keyword: string | null
  options: AnchorOption[]
  insertable: boolean
  selectedAnchor: string | null
  debug: AnchorDebug
}

// Elements a link must NEVER be inserted inside (structural / non-prose / already-linked).
const FORBIDDEN_ANCESTORS = 'a, h1, h2, h3, h4, h5, h6, table, thead, tbody, tr, td, th, figure, figcaption, nav, button, code, pre'

// Blocks that hold normal, linkable prose.
const PROSE_BLOCKS = 'p, li'

// Generic words that must never stand alone as an anchor unless they ARE the
// target's defined keyword (and even then the editor approves the insert).
const GENERIC_WORDS = new Set([
  'יפן', 'סין', 'נעליים', 'הליכון', 'ריצה', 'הליכה', 'בריאות', 'ספורט', 'אימון',
  'רצפה', 'ריצוף', 'משטח', 'שיפוע', 'שיפועים', 'עלייה', 'מדריך', 'בחירה', 'בית', 'ביתי',
  'shoes', 'running', 'walking', 'health', 'fitness', 'japan', 'china',
  'flooring', 'floor', 'incline', 'treadmill', 'guide', 'home', 'gym',
])

const STOPWORDS = new Set([
  'של', 'עם', 'על', 'את', 'אל', 'זה', 'זו', 'גם', 'כי', 'אם', 'כדי', 'יותר', 'מאוד',
  'הוא', 'היא', 'הם', 'הן', 'לא', 'כן', 'מה', 'מי', 'למה', 'איך', 'כמו', 'בין', 'אבל',
  'או', 'רק', 'כל', 'יש', 'אין', 'the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'in',
  'on', 'with', 'is', 'are',
])

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
 * Find the first safe occurrence of `anchorText` inside normal prose (<p>/<li>).
 * Returns the exact text node + offset, or null if the phrase never appears in
 * prose. Case-insensitive, whole-phrase substring within a single text node.
 */
function locate(doc: Document, anchorText: string): { node: Text; index: number } | null {
  const needle = anchorText.trim().toLowerCase()
  if (!needle) return null
  const blocks = Array.from(doc.querySelectorAll(PROSE_BLOCKS))
  for (const block of blocks) {
    if (block.closest(FORBIDDEN_ANCESTORS)) continue
    const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT)
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
  const hit = locate(doc, anchorText.trim())
  if (!hit) return null

  const { node, index } = hit
  const matchLen = anchorText.trim().length
  const after = node.splitText(index)
  after.splitText(matchLen) // `after` now holds exactly the matched phrase

  const link = doc.createElement('a')
  link.setAttribute('href', normalizeHref(url))
  link.setAttribute('rel', 'noopener')
  link.textContent = after.data
  after.parentNode?.replaceChild(link, after)

  return doc.body.innerHTML
}

const wordCount = (p: string) => p.trim().split(/\s+/).filter(Boolean).length

/** A generic single word (blocked as a standalone anchor). */
function isGenericSingleWord(phrase: string): boolean {
  const p = phrase.trim()
  return wordCount(p) === 1 && GENERIC_WORDS.has(p.toLowerCase())
}

/** A phrase carries real meaning: at least one content word (not all stopwords). */
function hasContentWord(phrase: string): boolean {
  return phrase.trim().split(/\s+/).filter(Boolean).some((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()))
}

/**
 * Pure shape check for a manual anchor (no DOM needed — reusable server-side).
 * A manual anchor must be a 2–6 word content phrase and not a generic word.
 */
export function manualAnchorShapeValid(phrase: string): boolean {
  const p = (phrase ?? '').trim()
  const wc = wordCount(p)
  if (wc < 2 || wc > 6) return false
  if (isGenericSingleWord(p)) return false
  return hasContentWord(p)
}

/**
 * Validate an editor-typed anchor before manual insertion. It must pass the
 * shape check AND already exist in a safe prose location in the current body.
 */
export function validateManualAnchor(
  html: string,
  phrase: string,
): { ok: boolean; reason?: 'words' | 'generic' | 'notfound' } {
  const p = (phrase ?? '').trim()
  const wc = wordCount(p)
  if (wc < 2 || wc > 6) return { ok: false, reason: 'words' }
  if (isGenericSingleWord(p) || !hasContentWord(p)) return { ok: false, reason: 'generic' }
  const doc = parse(html)
  if (!doc || !locate(doc, p)) return { ok: false, reason: 'notfound' }
  return { ok: true }
}

/**
 * Build deterministic link suggestions for the current article body.
 * Anchor candidates per target = defined keyword → saved manual anchors →
 * secondary keywords. Each is checked for an EXACT safe occurrence in the body.
 * A target is insertable only when at least one candidate exists safely.
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
    shownUrls.add(nUrl)

    const keyword = (cand.keyword ?? '').trim() || null
    const manualHistory = (cand.manualAnchors ?? []).map((s) => s.trim()).filter(Boolean)
    const debug: AnchorDebug = {
      targetId: cand.id,
      url: normalizeHref(cand.url),
      keyword,
      manualHistory,
      checked: [],
      found: [],
      rejected: [],
      selected: null,
    }

    // Ordered raw candidates: A keyword, B manual bank, C secondary keywords.
    const raw: { text: string; source: AnchorOption['source'] }[] = []
    if (keyword) raw.push({ text: keyword, source: 'keyword' })
    for (const m of manualHistory) raw.push({ text: m, source: 'manual' })
    for (const s of cand.secondaryKeywords ?? []) {
      const t = (s ?? '').trim()
      if (t) raw.push({ text: t, source: 'secondary' })
    }

    const options: AnchorOption[] = []
    const seen = new Set<string>()
    for (const r of raw) {
      const key = r.text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      debug.checked.push(r.text)

      const weak = wordCount(r.text) === 1
      // A generic standalone word is allowed ONLY when it is the defined keyword.
      if (isGenericSingleWord(r.text) && r.source !== 'keyword') {
        debug.rejected.push({ anchor: r.text, reason: 'generic-single-word' })
        continue
      }
      const exists = !!locate(doc, r.text)
      if (exists) debug.found.push(r.text)
      else debug.rejected.push({ anchor: r.text, reason: 'not-in-article' })
      options.push({ text: r.text, source: r.source, exists, weak })
    }

    // Default selection: first existing non-weak option, else first existing.
    const existing = options.filter((o) => o.exists && !usedAnchors.has(o.text.toLowerCase()))
    const preferred = existing.find((o) => !o.weak) ?? existing[0] ?? null
    if (preferred) debug.selected = preferred.text

    const sug: LinkSuggestion = {
      targetId: cand.id,
      targetTitle: cand.title,
      url: normalizeHref(cand.url),
      keyword,
      options,
      insertable: !!preferred,
      selectedAnchor: preferred?.text ?? null,
      debug,
    }
    if (preferred) {
      usedAnchors.add(preferred.text.toLowerCase())
      insertable.push(sug)
    } else {
      notInsertable.push(sug)
    }
  }

  return [...insertable, ...notInsertable].slice(0, max)
}

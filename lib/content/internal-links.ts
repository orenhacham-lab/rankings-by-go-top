/**
 * Content module — Internal Linking v1 (client-side, deterministic).
 *
 * Suggests and inserts links from the current article to OTHER published
 * articles in the same project. Runs entirely in the browser using DOMParser —
 * NO AI, no network calls, no automatic insertion. Every suggestion is opt-in:
 * the editor decides which links to add, and nothing is written until the user
 * saves the article (the PATCH route re-sanitizes the HTML).
 *
 * Anchor selection is phrase-first:
 *  - For each target we derive topic "seeds" (its keyword/title words + a small
 *    deterministic related-term map) and scan the current article body for a
 *    natural 2–6 word phrase that already contains one of those seeds.
 *  - Only such an exact, existing, non-linked phrase inside a normal paragraph
 *    or list item is insertable. A lone generic word (e.g. "רצפה", "שיפועים")
 *    is NEVER insertable — it is surfaced as informational only.
 *  - When nothing safe is found the target stays visible and the editor can
 *    pick an exact phrase manually (validated the same way).
 *
 * Safety: insert ONLY inside normal <p>/<li> prose — never inside headings,
 * tables, figures/images, nav, existing <a>, buttons, or code; never overwrite
 * an existing link; one link per target URL; one use per anchor.
 */

export interface LinkCandidate {
  id: string
  title: string
  url: string
  keyword: string | null
}

export interface AnchorDebug {
  url: string
  found: string[]
  rejected: { phrase: string; reason: string }[]
  selected: string | null
}

export interface LinkSuggestion {
  targetId: string
  targetTitle: string
  url: string
  anchorText: string
  reason: 'keyword' | 'contextual' | 'titlePhrase' | 'weakGeneric' | 'manual'
  insertable: boolean
  weak: boolean
  debug: AnchorDebug
}

// Elements a link must NEVER be inserted inside (structural / non-prose / already-linked).
const FORBIDDEN_ANCESTORS = 'a, h1, h2, h3, h4, h5, h6, table, thead, tbody, tr, td, th, figure, figcaption, nav, button, code, pre'

// Blocks that hold normal, linkable prose.
const PROSE_BLOCKS = 'p, li'

// Generic single words that must never stand alone as an anchor. They are still
// perfectly good *inside* a multi-word phrase (e.g. "הליכון עם שיפוע").
const GENERIC_WORDS = new Set([
  'יפן', 'סין', 'נעליים', 'הליכון', 'ריצה', 'הליכה', 'בריאות', 'ספורט', 'אימון',
  'רצפה', 'ריצוף', 'משטח', 'שיפוע', 'שיפועים', 'עלייה', 'מדריך', 'בחירה', 'בית', 'ביתי',
  'shoes', 'running', 'walking', 'health', 'fitness', 'japan', 'china',
  'flooring', 'floor', 'incline', 'treadmill', 'guide', 'home', 'gym',
])

// Connectors / function words that must not be the sole content of a phrase and
// are penalised at the edges of a phrase.
const STOPWORDS = new Set([
  'של', 'עם', 'על', 'את', 'אל', 'זה', 'זו', 'גם', 'כי', 'אם', 'כדי', 'יותר', 'מאוד',
  'הוא', 'היא', 'הם', 'הן', 'לא', 'כן', 'מה', 'מי', 'למה', 'איך', 'כמו', 'בין', 'אבל',
  'או', 'רק', 'כל', 'יש', 'אין', 'אלה', 'הזה', 'הזאת', 'וכן', 'וגם', 'אשר', 'כך',
  // Prepositions that should not open or close a natural anchor phrase.
  'מתחת', 'מעל', 'ליד', 'בתוך', 'לתוך', 'אחרי', 'לפני', 'מול', 'כלפי', 'אצל', 'ורצוי',
  'the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'in', 'on', 'with', 'is', 'are',
  'why', 'how', 'best', 'your', 'you',
])

// Deterministic topic → related terms. Lets us look for phrases "around" a
// concept, not just the concept word itself (no AI). Keys are lowercased.
const RELATED: Record<string, string[]> = {
  // flooring / surface
  'רצפה': ['משטח', 'ריצוף', 'ביתי', 'בית', 'דירה', 'פרקט', 'שטיח', 'יציב'],
  'ריצוף': ['רצפה', 'משטח', 'ביתי'],
  'משטח': ['רצפה', 'ריצוף', 'יציב', 'הליכון'],
  'flooring': ['floor', 'mat', 'surface', 'home', 'gym'],
  'floor': ['flooring', 'mat', 'surface'],
  // incline / slope
  'שיפוע': ['עלייה', 'מדרון', 'שיפועים', 'אימון', 'הליכון'],
  'שיפועים': ['שיפוע', 'עלייה', 'מדרון'],
  'עלייה': ['שיפוע', 'מדרון'],
  'incline': ['slope', 'elevation', 'climb', 'gradient'],
  // treadmill
  'הליכון': ['אימון', 'ריצה', 'הליכה', 'מסלול', 'ביתי'],
  'treadmill': ['walking', 'running', 'workout'],
}

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
 * prose. Matching is case-insensitive and only accepts whole-phrase substring
 * hits within a single text node (so insertion never spans element edges).
 */
function locate(doc: Document, anchorText: string): { node: Text; index: number } | null {
  const needle = anchorText.toLowerCase()
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

/** Split a string into word tokens with their character offsets. */
function tokenize(s: string): { w: string; start: number; end: number }[] {
  const re = /[\p{L}\p{N}]+(?:['’׳״-][\p{L}\p{N}]+)*/gu
  const out: { w: string; start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) out.push({ w: m[0], start: m.index, end: m.index + m[0].length })
  return out
}

const wordCount = (p: string) => p.trim().split(/\s+/).filter(Boolean).length

/** A phrase carries real meaning: 2–6 words with at least one content word. */
function isContentPhrase(phrase: string): boolean {
  const p = phrase.trim()
  if (p.length < 5) return false
  const words = p.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 6) return false
  // At least one word that is neither a stopword nor trivially short.
  return words.some((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()))
}

/** A good auto anchor is a natural 2–6 word content phrase. */
function isGoodAnchor(phrase: string): boolean {
  return isContentPhrase(phrase)
}

/** Derive topic seeds for a target: its keyword/title words + related terms. */
function deriveSeeds(candidate: LinkCandidate): { primary: Set<string>; all: Set<string> } {
  const primary = new Set<string>()
  const all = new Set<string>()
  const source = `${candidate.keyword ?? ''} ${candidate.title ?? ''}`
  for (const { w } of tokenize(source)) {
    const lw = w.toLowerCase()
    if (lw.length < 3 || STOPWORDS.has(lw) || /\d/.test(lw)) continue
    primary.add(lw)
    all.add(lw)
    for (const rel of RELATED[lw] ?? []) all.add(rel.toLowerCase())
  }
  return { primary, all }
}

/** Does a token match a seed (equality or Hebrew/English prefix substring)? */
function tokenMatchesSeed(token: string, seed: string): boolean {
  const t = token.toLowerCase()
  if (t === seed) return true
  // Hebrew often prefixes ה/ב/ל/מ/ו/ש; accept the seed as a substring when the
  // seed is reasonably specific (≥3 chars) to catch "ברצפה", "הרצפה", …
  return seed.length >= 3 && t.includes(seed)
}

/**
 * Discover natural 2–6 word phrases in the body that sit "around" a target's
 * seeds. Only exact, existing, safely-placed phrases are returned, each scored
 * so the caller can pick the most specific. Deterministic; no AI.
 */
function discoverContextualAnchors(
  doc: Document,
  seeds: { primary: Set<string>; all: Set<string> },
): { phrase: string; score: number }[] {
  if (seeds.all.size === 0) return []
  const seedList = Array.from(seeds.all)
  const blocks = Array.from(doc.querySelectorAll(PROSE_BLOCKS))
  const best = new Map<string, { phrase: string; score: number }>()

  for (const block of blocks) {
    if (block.closest(FORBIDDEN_ANCESTORS)) continue
    const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    let n = walker.nextNode()
    while (n) {
      const text = n as Text
      if (!inForbidden(text)) collectFromString(text.data, seedList, seeds.primary, best)
      n = walker.nextNode()
    }
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score || a.phrase.length - b.phrase.length)
}

/** Slide windows over one text-node string; keep the best-scoring valid phrase per key. */
function collectFromString(
  data: string,
  seedList: string[],
  primary: Set<string>,
  best: Map<string, { phrase: string; score: number }>,
): void {
  const toks = tokenize(data)
  if (toks.length < 2) return

  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i]
    if (!tok) continue
    let matchedSeed: string | null = null
    for (const seed of seedList) {
      if (tokenMatchesSeed(tok.w, seed)) { matchedSeed = seed; break }
    }
    if (!matchedSeed) continue
    const seedIsPrimary = primary.has(matchedSeed)

    for (let size = 2; size <= 6; size++) {
      for (let offset = 0; offset < size; offset++) {
        const start = i - offset
        const end = start + size - 1
        if (start < 0 || end >= toks.length) continue
        const first = toks[start]
        const last = toks[end]
        if (!first || !last) continue
        // Reject windows that cross punctuation (sentence break, comma, colon,
        // bullet, brackets…): the only thing allowed between words is whitespace,
        // so an anchor never spans "…ביתי. כשבוחרים…".
        let cleanGaps = true
        for (let k = start; k < end; k++) {
          const a = toks[k]
          const b = toks[k + 1]
          if (!a || !b || /\S/.test(data.slice(a.end, b.start))) { cleanGaps = false; break }
        }
        if (!cleanGaps) continue
        const phrase = data.slice(first.start, last.end).trim()
        if (!isContentPhrase(phrase)) continue

        const words = phrase.split(/\s+/).filter(Boolean)
        const firstW = (words[0] ?? '').toLowerCase()
        const lastW = (words[words.length - 1] ?? '').toLowerCase()

        let score = 0
        score += [0, 0, 2, 3, 3, 2, 1][words.length] ?? 0 // favour 3–4 words
        if (seedIsPrimary) score += 2
        // Strongly prefer a phrase that LEADS with the topic word — that reads as
        // a natural anchor ("רצפה מתאימה", "שיפוע בהליכון") rather than starting
        // mid-sentence ("לוודא שיש רצפה").
        if (seedList.some((s) => tokenMatchesSeed(firstW, s))) score += 3
        else if (seedList.some((s) => tokenMatchesSeed(lastW, s))) score += 1
        if (STOPWORDS.has(firstW)) score -= 2
        if (STOPWORDS.has(lastW)) score -= 1
        // Each interior stopword makes the phrase read less like a clean anchor.
        for (const w of words) if (STOPWORDS.has(w.toLowerCase())) score -= 0.5
        // A phrase that pairs the seed with another content word is more specific.
        if (words.some((w) => w.toLowerCase() !== matchedSeed && !STOPWORDS.has(w.toLowerCase()) && w.length >= 3)) score += 1

        const key = phrase.toLowerCase()
        const prev = best.get(key)
        if (!prev || score > prev.score) best.set(key, { phrase, score })
      }
    }
  }
}

/**
 * Choose the best anchor for a candidate and return debug detail for the panel.
 * Priority: specific keyword phrase → discovered contextual phrase → title
 * phrase → (informational only) a lone generic keyword word flagged `weak`.
 */
function pickAnchor(
  doc: Document,
  candidate: LinkCandidate,
): {
  pick: { anchor: string; reason: LinkSuggestion['reason']; weak: boolean } | null
  debug: AnchorDebug
} {
  const debug: AnchorDebug = { url: normalizeHref(candidate.url), found: [], rejected: [], selected: null }
  const kw = (candidate.keyword ?? '').trim()

  // 1) The full keyword, when it is already a specific multi-word phrase in prose.
  if (kw) {
    if (isGoodAnchor(kw)) {
      if (locate(doc, kw)) { debug.found.push(kw); debug.selected = kw; return { pick: { anchor: kw, reason: 'keyword', weak: false }, debug } }
      debug.rejected.push({ phrase: kw, reason: 'keyword-not-in-body' })
    } else {
      debug.rejected.push({ phrase: kw, reason: 'keyword-not-a-phrase' })
    }
  }

  // 2) Contextual phrase discovery around the target's seeds.
  const seeds = deriveSeeds(candidate)
  const discovered = discoverContextualAnchors(doc, seeds)
  for (const d of discovered.slice(0, 8)) debug.found.push(d.phrase)
  if (discovered.length > 0) {
    const top = discovered[0]!
    debug.selected = top.phrase
    return { pick: { anchor: top.phrase, reason: 'contextual', weak: false }, debug }
  }

  // 3) A natural phrase taken from the target title, if present in prose.
  const titleWords = candidate.title.trim().split(/\s+/).filter(Boolean)
  const titlePhrases: string[] = []
  if (titleWords.length >= 2 && titleWords.length <= 6) titlePhrases.push(candidate.title.trim())
  for (let size = 6; size >= 2; size--) {
    for (let start = 0; start + size <= titleWords.length; start++) {
      titlePhrases.push(titleWords.slice(start, start + size).join(' '))
    }
  }
  for (const phrase of titlePhrases) {
    if (isGoodAnchor(phrase) && locate(doc, phrase)) {
      debug.found.push(phrase); debug.selected = phrase
      return { pick: { anchor: phrase, reason: 'titlePhrase', weak: false }, debug }
    }
  }

  // 4) Last resort — a lone keyword word present in prose. Informational only:
  //    generic single words are NEVER auto-insertable.
  if (kw) {
    for (const w of kw.split(/\s+/).filter((x) => x.length >= 3)) {
      if (locate(doc, w)) {
        debug.rejected.push({ phrase: w, reason: GENERIC_WORDS.has(w.toLowerCase()) ? 'generic-single-word' : 'single-word' })
        return { pick: { anchor: w, reason: 'weakGeneric', weak: true }, debug }
      }
    }
  }

  return { pick: null, debug }
}

/**
 * Validate an editor-typed anchor before allowing manual insertion. It must be
 * an exact 2–6 word content phrase that already exists in a safe prose location
 * and is not a single/generic word. (URL-already-linked is enforced separately.)
 */
export function validateManualAnchor(
  html: string,
  phrase: string,
): { ok: boolean; reason?: 'words' | 'generic' | 'notfound' } {
  const p = (phrase ?? '').trim()
  const words = p.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 6) return { ok: false, reason: 'words' }
  if (!isContentPhrase(p)) return { ok: false, reason: 'generic' }
  const doc = parse(html)
  if (!doc || !locate(doc, p)) return { ok: false, reason: 'notfound' }
  return { ok: true }
}

/**
 * Build deterministic link suggestions for the current article body.
 * - One suggestion per target URL, one use per auto anchor text.
 * - Skips target URLs already linked somewhere in the body.
 * - Insertable (a specific, non-weak phrase exists) first, then informational
 *   targets (weak or no safe anchor) so the editor can pick manually. Cap `max`.
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

    const { pick, debug } = pickAnchor(doc, cand)
    const base = {
      targetId: cand.id,
      targetTitle: cand.title,
      url: normalizeHref(cand.url),
      debug,
    }

    if (pick && !pick.weak && !usedAnchors.has(pick.anchor.toLowerCase())) {
      shownUrls.add(nUrl)
      usedAnchors.add(pick.anchor.toLowerCase())
      insertable.push({ ...base, anchorText: pick.anchor, reason: pick.reason, insertable: true, weak: false })
    } else {
      shownUrls.add(nUrl)
      notInsertable.push({
        ...base,
        anchorText: pick?.anchor || cand.keyword?.trim() || cand.title.trim(),
        reason: pick?.reason ?? 'titlePhrase',
        insertable: false,
        weak: !!pick?.weak,
      })
    }
  }

  return [...insertable, ...notInsertable].slice(0, max)
}

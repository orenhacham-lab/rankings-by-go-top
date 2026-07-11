/**
 * Live anchor placement validation (content module, Phase 3A).
 *
 * Given a topic's anchors and an article's content HTML, determines which
 * anchors are actually present as links. Computed on demand (never persisted)
 * so it always reflects the current content. Required anchors that are missing
 * block "mark as ready".
 */

import type { ArticleTopicAnchor } from '@/lib/supabase/types'
import type { SuggestionLanguage } from '@/lib/content/topic-suggestions'

export interface AnchorPlacement {
  anchorText: string
  targetUrl: string
  required: boolean
  type: 'internal' | 'external'
  placed: boolean
}

export interface AnchorValidation {
  anchorsPlaced: AnchorPlacement[]
  missingRequired: AnchorPlacement[]
  hasBlockingIssues: boolean
}

/** Normalize a URL for comparison: lowercase, drop protocol + trailing slash. */
function normUrl(url: string): string {
  return (url || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
}

/** Extract all href values from HTML. */
function extractHrefs(html: string): string[] {
  const out: string[] = []
  const re = /href\s*=\s*["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html || '')) !== null) out.push(m[1])
  return out
}

/**
 * Validate anchor placement of a topic's anchors against article content.
 * An anchor with an empty target_url is considered "placed" if its anchor_text
 * appears in the content (best-effort), otherwise placement is by href match.
 */
export function validateAnchorPlacement(
  anchors: ArticleTopicAnchor[] | null | undefined,
  contentHtml: string
): AnchorValidation {
  const list = Array.isArray(anchors) ? anchors : []
  const hrefs = extractHrefs(contentHtml).map(normUrl)
  const textLower = (contentHtml || '').toLowerCase()

  const anchorsPlaced: AnchorPlacement[] = list
    .filter((a) => a.anchor_text?.trim() || a.target_url?.trim())
    .map((a) => {
      const target = normUrl(a.target_url)
      let placed = false
      if (target) {
        placed = hrefs.some((h) => h === target || h.startsWith(target) || target.startsWith(h))
      } else if (a.anchor_text?.trim()) {
        placed = textLower.includes(a.anchor_text.trim().toLowerCase())
      }
      return {
        anchorText: a.anchor_text || '',
        targetUrl: a.target_url || '',
        required: a.required === true,
        type: a.type === 'external' ? 'external' : 'internal',
        placed,
      }
    })

  const missingRequired = anchorsPlaced.filter((a) => a.required && !a.placed)
  return {
    anchorsPlaced,
    missingRequired,
    hasBlockingIssues: missingRequired.length > 0,
  }
}

/**
 * Whether the brand/business name appears in the article as a FREE mention —
 * i.e. outside the links the user explicitly requested. When includeBrandName
 * is false, brand inside a user-provided anchor (its text matches a supplied
 * anchor_text, or its href matches a supplied target_url) is allowed; only a
 * mention elsewhere (plain text, heading, a non-requested link) is disallowed.
 */
export function brandMentionedOutsideAnchors(
  contentHtml: string,
  anchors: ArticleTopicAnchor[] | null | undefined,
  brand: string
): boolean {
  const b = (brand || '').trim().toLowerCase()
  if (!b) return false
  const list = Array.isArray(anchors) ? anchors : []
  const urls = list.map((a) => normUrl(a.target_url)).filter(Boolean)
  const texts = list.map((a) => (a.anchor_text || '').trim().toLowerCase()).filter(Boolean)

  // Blank out the inner text of user-provided anchors (brand there is allowed).
  const stripped = (contentHtml || '').replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (m: string, attrs: string, inner: string) => {
    const href = (attrs.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1] || ''
    const hrefN = normUrl(href)
    const innerText = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    const isUserAnchor =
      (!!hrefN && urls.some((u) => u === hrefN || hrefN.startsWith(u) || u.startsWith(hrefN))) ||
      texts.some((t) => t && innerText.includes(t))
    return isUserAnchor ? ' ' : m
  })

  const visible = stripped.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').toLowerCase()
  return visible.includes(b)
}

// ---------------------------------------------------------------------------
// Anchor PLACEMENT quality (Google link best-practices, internal quality rule).
// Works on the built/edited HTML: required anchors must appear only after the
// article has established context (not in the direct answer or the first intro
// paragraph), multiple anchors must be spaced apart, and no mechanical/generic
// link phrasing ("read more", "click here", "אתר כמו", "למידע נוסף").
// ---------------------------------------------------------------------------

// Word thresholds for "established context" before the FIRST anchor may appear.
export const ANCHOR_MIN_WORDS_BEFORE_FIRST = 120
export const ANCHOR_MIN_PARAGRAPHS_BEFORE_FIRST = 2
// Minimum spacing between two consecutive anchors.
export const ANCHOR_MIN_WORD_GAP = 200
export const ANCHOR_MIN_PARAGRAPH_GAP = 2

const MECHANICAL_HE = ['למידע נוסף', 'מידע נוסף', 'לחצו כאן', 'לחץ כאן', 'קראו עוד', 'קרא עוד', 'אתר כמו', 'אתרים כמו', 'אפשר למצוא מידע', 'ניתן למצוא מידע', 'להמשך קריאה', 'ראו כאן', 'ראה כאן']
const MECHANICAL_EN = ['read more', 'click here', 'learn more', 'for more information', 'more information', 'a site like', 'sites like', 'website like', 'find out more', 'more info', 'visit this site', 'see here']

export interface AnchorHit {
  href: string
  text: string
  wordIndex: number        // words of body text before this anchor
  paragraphIndex: number   // index of the enclosing <p> (-1 if not in a <p>)
  paragraphsBefore: number // number of <p> blocks fully closed before it
  afterFirstH2: boolean
  inFirstParagraph: boolean
  precedingText: string    // up to ~60 chars of text right before the link
}

/** Walk the HTML once, collecting every <a> link with its positional context. */
export function scanAnchorHits(html: string): { hits: AnchorHit[]; firstH2Word: number; totalWords: number } {
  const parts = (html || '').split(/(<[^>]+>)/)
  let wordCount = 0
  let pIndex = -1
  let insideP = false
  let pClosed = 0
  let h2Seen = false
  let firstH2Word = -1
  let curPText = ''
  let capturing: (AnchorHit & { _open: boolean }) | null = null
  const hits: AnchorHit[] = []

  for (const seg of parts) {
    if (!seg) continue
    if (seg.startsWith('<')) {
      const tag = seg.toLowerCase()
      if (/^<p[\s>]/.test(tag)) { insideP = true; pIndex++; curPText = '' }
      else if (/^<\/p>/.test(tag)) { insideP = false; pClosed++ }
      else if (/^<h2[\s>]/.test(tag)) { h2Seen = true; if (firstH2Word < 0) firstH2Word = wordCount }
      else if (/^<a[\s>]/.test(tag)) {
        const href = (seg.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1] || ''
        capturing = {
          href, text: '', wordIndex: wordCount,
          paragraphIndex: insideP ? pIndex : -1, paragraphsBefore: pClosed,
          afterFirstH2: h2Seen, inFirstParagraph: insideP && pIndex === 0,
          precedingText: curPText.slice(-60), _open: true,
        }
      } else if (/^<\/a>/.test(tag)) {
        if (capturing) { const { _open, ...hit } = capturing; void _open; hits.push(hit); capturing = null }
      }
      continue
    }
    const txt = seg.replace(/&[a-z]+;/gi, ' ')
    wordCount += txt.split(/\s+/).filter(Boolean).length
    if (insideP) curPText += txt
    if (capturing) capturing.text += txt
  }
  return { hits, firstH2Word, totalWords: wordCount }
}

/** True when an anchor sits too early — before the article establishes context. */
export function isAnchorTooEarly(hit: AnchorHit, firstH2Exists: boolean): boolean {
  if (hit.inFirstParagraph) return true
  const passedParagraphs = hit.paragraphsBefore >= ANCHOR_MIN_PARAGRAPHS_BEFORE_FIRST
  const passedWords = hit.wordIndex >= ANCHOR_MIN_WORDS_BEFORE_FIRST
  const passedH2 = firstH2Exists ? hit.afterFirstH2 : true
  // "whichever is later": the anchor must clear ALL of the thresholds.
  return !(passedParagraphs && passedWords && passedH2)
}

export interface AnchorQuality {
  count: number
  firstAnchorWordIndex: number
  firstAnchorAfterIntro: boolean
  anchorTooEarly: boolean
  anchorsTooClose: boolean
  anchorsInSameParagraph: boolean
  mechanicalAnchorPhrase: boolean
  warnings: string[]
}

/** Assess anchor placement quality across the whole article. */
export function analyzeAnchorQuality(contentHtml: string, language: SuggestionLanguage): AnchorQuality {
  const { hits, firstH2Word } = scanAnchorHits(contentHtml)
  const empty: AnchorQuality = {
    count: 0, firstAnchorWordIndex: -1, firstAnchorAfterIntro: true, anchorTooEarly: false,
    anchorsTooClose: false, anchorsInSameParagraph: false, mechanicalAnchorPhrase: false, warnings: [],
  }
  if (!hits.length) return empty

  const firstH2Exists = firstH2Word >= 0
  const sorted = [...hits].sort((a, b) => a.wordIndex - b.wordIndex)
  const first = sorted[0]
  const anchorTooEarly = isAnchorTooEarly(first, firstH2Exists)

  let anchorsTooClose = false
  let anchorsInSameParagraph = false
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    if (cur.paragraphIndex >= 0 && cur.paragraphIndex === prev.paragraphIndex) anchorsInSameParagraph = true
    const wordGap = cur.wordIndex - prev.wordIndex
    const paraGap = cur.paragraphIndex >= 0 && prev.paragraphIndex >= 0 ? cur.paragraphIndex - prev.paragraphIndex : 99
    if (wordGap < ANCHOR_MIN_WORD_GAP && paraGap < ANCHOR_MIN_PARAGRAPH_GAP) anchorsTooClose = true
  }

  const mech = language === 'he' ? MECHANICAL_HE : MECHANICAL_EN
  let mechanicalAnchorPhrase = false
  for (const h of hits) {
    const hay = `${h.text} ${h.precedingText}`.toLowerCase()
    if (mech.some((p) => hay.includes(p))) { mechanicalAnchorPhrase = true; break }
  }

  const warnings: string[] = []
  if (anchorTooEarly) warnings.push('anchor_too_early')
  if (anchorsTooClose || anchorsInSameParagraph) warnings.push('anchor_spacing_too_close')
  if (mechanicalAnchorPhrase) warnings.push('anchor_inserted_mechanically')

  return {
    count: hits.length,
    firstAnchorWordIndex: first.wordIndex,
    firstAnchorAfterIntro: !anchorTooEarly,
    anchorTooEarly, anchorsTooClose, anchorsInSameParagraph, mechanicalAnchorPhrase, warnings,
  }
}

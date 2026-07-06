/**
 * Server-safe NATURAL-ONLY internal-link placement — Phase 2D.1 (PREVIEW ONLY).
 *
 * Pure, read-only. Determines whether an anchor phrase ALREADY occurs in safe
 * prose (a <p>/<li> that is not inside a heading, table, button, nav/header/
 * footer/aside, figure, script/style, or an existing <a>) at an acceptable
 * position — and, if so, returns the sentence it would be linked in. It does NOT
 * modify HTML, never appends text, never invents a sentence, and never forces a
 * link. If there is no safe natural occurrence it returns a skip reason.
 *
 * This is the read-only half of the eventual insertion pass — no apply here.
 */

import { createHash } from 'crypto'
import { ANCHOR_MIN_WORD_GAP } from '@/lib/content/anchors-check'
import { normalizeHref } from '@/lib/content/internal-links'

/**
 * "Too early" for NATURAL-occurrence INSERTION is defined by structure, not the
 * generation-time 120-word audit floor (ANCHOR_MIN_WORDS_BEFORE_FIRST, which
 * governs article generation and must stay untouched). When the article has an
 * <h2>, any safe prose occurrence AFTER the first heading is acceptable — the
 * "not before the first section" rule already keeps links out of the intro. This
 * word floor is a fallback used ONLY for articles with no headings at all.
 */
const INSERTION_MIN_WORDS_BEFORE_FIRST = 40

// Regions a link must NEVER be placed inside. Blanked (equal-length spaces) so
// their inner text can't match while character offsets stay aligned.
const FORBIDDEN_TAGS = ['nav', 'header', 'footer', 'aside', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'figure', 'figcaption', 'button', 'script', 'style', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']

function blankRegion(m: string): string { return ' '.repeat(m.length) }

/** Blank forbidden regions + existing links (offset-preserving) for safe matching. */
function blankForbidden(html: string): string {
  let out = html
  for (const tag of FORBIDDEN_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), blankRegion)
  }
  out = out.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, blankRegion) // never inside an existing <a>
  return out
}

/** Char ranges of prose blocks (<p> / <li>) in the ORIGINAL html. */
function proseRanges(html: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = []
  const re = /<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) ranges.push({ start: m.index, end: m.index + m[0].length })
  return ranges
}

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ')
}
function wordsBefore(html: string, index: number): number {
  return plainText(html.slice(0, index)).split(/\s+/).filter(Boolean).length
}

function sentencePreview(html: string, ranges: { start: number; end: number }[], index: number, anchor: string): string {
  const r = ranges.find((x) => index >= x.start && index < x.end)
  const text = plainText(r ? html.slice(r.start, r.end) : html).trim()
  const idx = text.toLowerCase().indexOf(anchor.trim().toLowerCase())
  if (idx < 0) return text.slice(0, 160)
  let s = idx
  let e = idx + anchor.length
  while (s > 0 && !/[.!?]/.test(text[s - 1] ?? '') && idx - s < 120) s--
  while (e < text.length && !/[.!?]/.test(text[e] ?? '') && e - (idx + anchor.length) < 120) e++
  const out = text.slice(s, Math.min(e + 1, text.length)).trim()
  return `${s > 0 ? '…' : ''}${out}${e < text.length ? '…' : ''}`
}

export type PlacementSkipReason = 'empty_anchor' | 'anchor_not_found_in_safe_prose' | 'placement_too_early' | 'placement_too_close'

export type OccurrenceResult = 'selected' | 'skipped_forbidden' | 'skipped_non_prose' | 'too_early' | 'too_close'

export interface OccurrenceEval {
  /** Char index in the ORIGINAL html. */
  index: number
  inProse: boolean
  wordOffset: number | null
  result: OccurrenceResult
}

export interface PlacementResult {
  found: boolean
  /** Char index (in the ORIGINAL html) where the chosen occurrence starts. */
  index?: number
  matchLength?: number
  wordOffset?: number
  sentence?: string
  skipReason?: PlacementSkipReason
  // Diagnostics (response-only; no UI depends on these).
  occurrenceCount?: number
  evaluatedOccurrences?: OccurrenceEval[]
  selectedOccurrenceIndex?: number
}

/**
 * Find the first SAFE, well-placed natural occurrence of `anchor` in the body.
 *
 * Scans EVERY occurrence in the original HTML (not just the first): an occurrence
 * inside a heading / table / existing link / button / nav / other forbidden
 * region is skipped and scanning continues to later occurrences. A valid prose
 * (<p>/<li>) occurrence that is not in the intro (before the first <h2>) and not
 * too close to another planned link is selected. Only when NO occurrence
 * qualifies does it report a skip reason. `usedWordOffsets` are the word
 * positions of other planned insertions in this same preview. Read-only.
 */
export function findNaturalAnchorPlacement(html: string, anchor: string, usedWordOffsets: number[] = []): PlacementResult {
  const needle = (anchor || '').trim()
  if (!needle) return { found: false, skipReason: 'empty_anchor', occurrenceCount: 0, evaluatedOccurrences: [] }

  const blanked = blankForbidden(html)
  const ranges = proseRanges(html)
  const inProse = (i: number) => ranges.some((r) => i >= r.start && i < r.end)
  const hay = blanked.toLowerCase()
  const rawHay = html.toLowerCase()
  const nl = needle.toLowerCase()
  const h2 = html.search(/<h2[\s>]/i)

  const evaluated: OccurrenceEval[] = []
  let occurrenceCount = 0
  let occIdx = -1
  let sawProse = false
  let tooEarly = false
  let tooClose = false
  let from = 0
  for (;;) {
    // Iterate raw occurrences so forbidden ones are counted + classified too.
    const k = rawHay.indexOf(nl, from)
    if (k < 0) break
    from = k + nl.length
    occurrenceCount++
    occIdx++

    // Blanked at k ⇒ inside a forbidden region (heading/table/link/nav/button…).
    if (!hay.startsWith(nl, k)) { evaluated.push({ index: k, inProse: false, wordOffset: null, result: 'skipped_forbidden' }); continue }
    if (!inProse(k)) { evaluated.push({ index: k, inProse: false, wordOffset: null, result: 'skipped_non_prose' }); continue }

    sawProse = true
    const wordOffset = wordsBefore(html, k)
    // "Too early" = in the intro (before the first <h2>). With no heading at all,
    // fall back to a modest word floor so links don't land in the opening lines.
    const early = h2 >= 0 ? k < h2 : wordOffset < INSERTION_MIN_WORDS_BEFORE_FIRST
    if (early) { evaluated.push({ index: k, inProse: true, wordOffset, result: 'too_early' }); tooEarly = true; continue }
    if (usedWordOffsets.some((u) => Math.abs(wordOffset - u) < ANCHOR_MIN_WORD_GAP)) { evaluated.push({ index: k, inProse: true, wordOffset, result: 'too_close' }); tooClose = true; continue }

    evaluated.push({ index: k, inProse: true, wordOffset, result: 'selected' })
    return { found: true, index: k, matchLength: needle.length, wordOffset, sentence: sentencePreview(html, ranges, k, needle), occurrenceCount, evaluatedOccurrences: evaluated, selectedOccurrenceIndex: occIdx }
  }

  // No occurrence qualified — report the most actionable reason. A spacing block
  // (too_close) means an otherwise-valid prose occurrence existed, so it takes
  // precedence over too_early (which then means ALL prose occurrences were early).
  const skipReason: PlacementSkipReason = !sawProse
    ? 'anchor_not_found_in_safe_prose'
    : tooClose ? 'placement_too_close' : 'placement_too_early'
  return { found: false, skipReason, occurrenceCount, evaluatedOccurrences: evaluated }
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface ApplyResult {
  ok: boolean
  html?: string
  anchorText?: string
  wordOffset?: number
  skipReason?: PlacementSkipReason
}

/**
 * NATURAL-ONLY insertion: wrap the FIRST safe, well-placed existing occurrence of
 * `anchor` in an <a href> — nothing else. Never appends/rewrites/forces; returns
 * ok:false + skipReason when no safe occurrence exists. Caller must sanitize the
 * returned html. Pure (no I/O).
 */
export function applyNaturalAnchor(html: string, anchor: string, url: string, usedWordOffsets: number[] = []): ApplyResult {
  const p = findNaturalAnchorPlacement(html, anchor, usedWordOffsets)
  if (!p.found || p.index === undefined || p.matchLength === undefined) {
    return { ok: false, skipReason: p.skipReason }
  }
  const i = p.index
  const len = p.matchLength
  const matched = html.slice(i, i + len) // keep the article's original casing
  const link = `<a href="${escAttr(normalizeHref(url))}" rel="noopener">${matched}</a>`
  return { ok: true, html: html.slice(0, i) + link + html.slice(i + len), anchorText: matched, wordOffset: p.wordOffset }
}

// ── Preview-token integrity (apply must match a FRESH preview) ────────────────

export function sha256(s: string): string {
  return createHash('sha256').update(s || '', 'utf8').digest('hex')
}

export interface PreviewTokenInput {
  generatedArticleId: string
  batchId: string
  contentChecksum: string
  linksChecksum: string
  cacheScanCompletedAt: string | null
  cacheScannerVersion: string | null
  wouldInsert: { linkId: string; anchorText: string; targetUrl: string }[]
}

/**
 * Deterministic integrity token over everything apply must not have changed since
 * the preview. Apply recomputes it from CURRENT server state and refuses on any
 * mismatch (stale_preview).
 */
export function computePreviewToken(i: PreviewTokenInput): string {
  const canonical = JSON.stringify({
    v: 1,
    a: i.generatedArticleId,
    b: i.batchId,
    c: i.contentChecksum,
    l: i.linksChecksum,
    s: i.cacheScanCompletedAt,
    sv: i.cacheScannerVersion,
    w: [...i.wouldInsert].map((x) => [x.linkId, x.anchorText, x.targetUrl]).sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0)),
  })
  return sha256(canonical)
}


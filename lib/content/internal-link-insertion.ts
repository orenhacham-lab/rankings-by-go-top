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

/**
 * Minimum word gap between two INSERTED internal links. The generation-time audit
 * (anchors-check) uses ANCHOR_MIN_WORD_GAP (200) for anchor-quality scoring; that
 * is too strict for approved-plan insertion and skips reasonable 2nd/3rd links.
 * Insertion uses a smaller gap so 2–3 approved links in different sentences still
 * apply, while still avoiding same-sentence / dense stacking. The 200 audit
 * constant is unchanged.
 */
export const INTERNAL_LINK_APPLY_MIN_WORD_GAP = 80

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

/**
 * Word offsets of EXISTING <a> links in the html — used to seed the spacing
 * check so a new link is kept the min gap away from links ALREADY present (not
 * just from other links inserted in the same pass). Without this, a fresh
 * preview after an apply "forgets" the just-inserted links as neighbours and
 * re-offers a too-close candidate as would_insert.
 */
export function existingLinkWordOffsets(html: string): number[] {
  const offs: number[] = []
  const re = /<a\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) offs.push(wordsBefore(html, m.index))
  return offs
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
export type ForbiddenReason = 'heading' | 'existing_link' | 'table' | 'button_nav_cta' | 'non_prose' | 'unknown'

export interface OccurrenceEval {
  /** Char index in the ORIGINAL html. */
  index: number
  inProse: boolean
  wordOffset: number | null
  result: OccurrenceResult
  // Rich diagnostics for skipped/forbidden occurrences (response-only).
  forbiddenReason?: ForbiddenReason
  href?: string | null
  insideHeading?: boolean
  insideExistingLink?: boolean
  insideTable?: boolean
  insideButtonNavCta?: boolean
  insideParagraph?: boolean
  htmlSnippet?: string
  textSnippet?: string
}

interface RegionInfo {
  forbiddenReason: ForbiddenReason
  href: string | null
  insideHeading: boolean
  insideExistingLink: boolean
  insideTable: boolean
  insideButtonNavCta: boolean
  insideParagraph: boolean
}

function spansOf(html: string, re: RegExp): { start: number; end: number; open: string }[] {
  const out: { start: number; end: number; open: string }[] = []
  let m: RegExpExecArray | null
  re.lastIndex = 0
  while ((m = re.exec(html)) !== null) out.push({ start: m.index, end: m.index + m[0].length, open: m[0].slice(0, m[0].indexOf('>') + 1) })
  return out
}

/** Classify which forbidden/non-prose region a char index sits inside (diagnostics). */
function classifyRegion(html: string, index: number): RegionInfo {
  const within = (spans: { start: number; end: number; open: string }[]) => spans.find((s) => index >= s.start && index < s.end)
  const inHeading = !!within(spansOf(html, /<(h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi))
  const linkSpan = within(spansOf(html, /<a\b[^>]*>[\s\S]*?<\/a>/gi))
  const inTable = !!within(spansOf(html, /<(table|thead|tbody|tr|td|th)\b[^>]*>[\s\S]*?<\/\1>/gi))
  const inBncta = !!within(spansOf(html, /<(button|nav|header|footer|aside|figure|figcaption)\b[^>]*>[\s\S]*?<\/\1>/gi))
  const inPara = !!within(spansOf(html, /<(p|li)\b[^>]*>[\s\S]*?<\/\1>/gi))
  let href: string | null = null
  if (linkSpan) { const hm = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(linkSpan.open); href = hm ? (hm[2] ?? hm[3] ?? hm[4] ?? null) : null }
  const forbiddenReason: ForbiddenReason =
    linkSpan ? 'existing_link' : inHeading ? 'heading' : inTable ? 'table' : inBncta ? 'button_nav_cta' : !inPara ? 'non_prose' : 'unknown'
  return { forbiddenReason, href, insideHeading: inHeading, insideExistingLink: !!linkSpan, insideTable: inTable, insideButtonNavCta: inBncta, insideParagraph: inPara }
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
 * region is skipped (with a classified reason) and scanning continues. A valid
 * prose (<p>/<li>) occurrence past a modest word floor (so links don't land in
 * the opening snippet) and not too close to another planned link is selected.
 * There is NO "must be after the first <h2>" requirement — for manual approved
 * links a normal paragraph well into the intro is a fine target. Only when NO
 * occurrence qualifies does it report a skip reason. Read-only.
 */
export function findNaturalAnchorPlacement(html: string, anchor: string, usedWordOffsets: number[] = [], opts: { minWordGap?: number } = {}): PlacementResult {
  const minWordGap = opts.minWordGap ?? ANCHOR_MIN_WORD_GAP
  const needle = (anchor || '').trim()
  if (!needle) return { found: false, skipReason: 'empty_anchor', occurrenceCount: 0, evaluatedOccurrences: [] }

  const blanked = blankForbidden(html)
  const ranges = proseRanges(html)
  const inProse = (i: number) => ranges.some((r) => i >= r.start && i < r.end)
  const hay = blanked.toLowerCase()
  const rawHay = html.toLowerCase()
  const nl = needle.toLowerCase()

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

    const snippet = () => {
      const s = Math.max(0, k - 30)
      const htmlSnippet = html.slice(s, k + nl.length + 30)
      return { htmlSnippet, textSnippet: plainText(htmlSnippet).trim().slice(0, 140) }
    }

    // Blanked at k ⇒ inside a forbidden region (heading/table/link/nav/button…).
    if (!hay.startsWith(nl, k)) {
      const reg = classifyRegion(html, k)
      evaluated.push({ index: k, inProse: false, wordOffset: null, result: 'skipped_forbidden', ...reg, ...snippet() })
      continue
    }
    if (!inProse(k)) {
      const reg = classifyRegion(html, k)
      evaluated.push({ index: k, inProse: false, wordOffset: null, result: 'skipped_non_prose', ...reg, ...snippet() })
      continue
    }

    sawProse = true
    const wordOffset = wordsBefore(html, k)
    // "Too early" = only the very opening snippet (below a modest manual floor).
    // NO first-<h2> gate — a paragraph 100+ words in is a valid manual target.
    const early = wordOffset < INSERTION_MIN_WORDS_BEFORE_FIRST
    if (early) { evaluated.push({ index: k, inProse: true, wordOffset, result: 'too_early', insideParagraph: true }); tooEarly = true; continue }
    if (usedWordOffsets.some((u) => Math.abs(wordOffset - u) < minWordGap)) { evaluated.push({ index: k, inProse: true, wordOffset, result: 'too_close' }); tooClose = true; continue }

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
export function applyNaturalAnchor(html: string, anchor: string, url: string, usedWordOffsets: number[] = [], opts: { minWordGap?: number } = {}): ApplyResult {
  const p = findNaturalAnchorPlacement(html, anchor, usedWordOffsets, opts)
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


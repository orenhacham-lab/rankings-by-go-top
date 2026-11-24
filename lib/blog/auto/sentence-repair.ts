/**
 * A REFUSED SENTENCE IS REPAIRED, NOT THE WHOLE ARTICLE THROWN AWAY.
 *
 * The truth gate is a set of word patterns. Every week it refuses a TRUE
 * sentence in a shape nobody wrote a pattern for (a menu, a 0-100% scale, a
 * warning against guarantees), and until now each such refusal cost the whole
 * article: the draft was dropped, the row went back to the queue, and the hour,
 * which is the only pass the language gets that day, was gone. Eight shapes in a
 * week were fixed one by one and the next one still cost a language its day.
 *
 * So the pass now fixes the one sentence it was refused for, and checks again:
 *   1. find the block (paragraph, list item, table cell, heading) that holds the
 *      sentence;
 *   2. round 0: ask the model to rewrite THAT BLOCK without the claim, when the
 *      pass still has the time;
 *   3. later rounds, or no time, or no answer: delete the sentence, or the
 *      block when nothing else is left of it;
 *   4. the caller runs the quality gate and the truth gate on the result again,
 *      so a rewrite that brings the claim back is refused and then deleted.
 *
 * What this NEVER does: relax a rule, or publish a sentence the gate would
 * refuse. The gate runs again on exactly what is published. Anything it cannot
 * locate or safely cut (a sentence in the title or the meta description, one
 * that spans table cells, a block holding a link, a bad Shopify link) is
 * reported as not repairable and the old refusal path runs unchanged.
 */

import { checkTruthLimits, plainText } from '@/lib/blog/auto/truth-limits'

/** The codes whose refusal is about ONE sentence of the body. Links are not. */
export const REPAIRABLE_CODES = new Set([
  'percentage_claim', 'customer_count_claim', 'tracking_cadence_claim', 'rating_claim',
  'ranking_guarantee', 'ai_engine_coverage_claim', 'shopify_schema_claim',
])

/** At most this many repair rounds; a third refusal means the article is not close. */
export const MAX_REPAIR_ROUNDS = 3
/** A model rewrite needs at least this much of the pass left (cover and publish still follow). */
export const REWRITE_MIN_REMAINING_MS = 90_000

export interface RewriteRequest {
  locale: string
  /** The block's plain text. */
  block: string
  /** The sentence in it the gate refused. */
  sentence: string
  /** What the gate said may not be claimed, in words. */
  rule: string
}
/** Returns the replacement text for the block, or null when there is none. */
export type RewriteBlock = (req: RewriteRequest) => Promise<string | null>

export interface RepairAction { code: string; how: 'rewrite' | 'delete'; sentence: string }
export type RepairOutcome =
  | { ok: true; html: string; actions: RepairAction[] }
  | { ok: false; reason: string }

const BLOCK_TAGS = ['p', 'li', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'figcaption', 'dd', 'dt']
/** Blocks that can disappear without leaving a hole in the page. */
const CUTTABLE = new Set(['p', 'li', 'blockquote', 'figcaption'])
const BLOCK = new RegExp(`<(${BLOCK_TAGS.join('|')})\\b[^>]*>([\\s\\S]*?)</\\1>`, 'gi')

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim()

interface Located {
  start: number; end: number; tag: string; open: string; inner: string; plain: string
  /** What is cut from the block: the sentence, or the whole block text when the sentence ran across blocks. */
  target: string
}

/**
 * The block the refusal is about. Usually the smallest block whose text holds
 * the sentence. A heading has no full stop, so the gate's "sentence" can run
 * from a heading into the paragraph under it (measured in the QA suite on the
 * first run); then the blocks inside the sentence are tried ONE BY ONE through
 * the gate itself, and the first that is refused for the same code on its own
 * is the one.
 */
function locate(html: string, sentence: string, code: string): Located | null {
  const needle = collapse(sentence)
  let best: Located | null = null
  const inside: Located[] = []
  BLOCK.lastIndex = 0
  for (let m = BLOCK.exec(html); m; m = BLOCK.exec(html)) {
    const tag = m[1].toLowerCase()
    const inner = m[2]
    // A nested block of the same kind would make the lazy match end too early.
    if (new RegExp(`<${tag}\\b`, 'i').test(inner)) continue
    const plain = plainText(inner)
    if (!plain) continue
    const open = html.slice(m.index, html.indexOf('>', m.index) + 1)
    const at = { start: m.index, end: m.index + m[0].length, tag, open, inner, plain }
    if (plain.includes(needle)) {
      if (!best || plain.length < best.plain.length) best = { ...at, target: needle }
    } else if (needle.includes(plain)) {
      inside.push({ ...at, target: plain })
    }
  }
  if (best) return best
  return inside.find((b) => checkTruthLimits({ title: '', metaDescription: '', html: `${b.open}${b.inner}</${b.tag}>` }).failures.includes(code)) ?? null
}

const hasAnchor = (inner: string): boolean => /<a\b/i.test(inner)

/** `html` with one block's inner HTML replaced, or the block removed (inner = null). */
function splice(html: string, b: Located, inner: string | null): string {
  const replacement = inner === null ? '' : `${b.open}${inner}</${b.tag}>`
  return html.slice(0, b.start) + replacement + html.slice(b.end)
}

/** The block without the sentence: in the HTML when it is there verbatim, else null. */
function withoutSentence(b: Located): string | null {
  const needle = b.target
  const flat = b.inner.replace(/\s+/g, ' ')
  const at = flat.indexOf(needle)
  if (at < 0) return null
  return (flat.slice(0, at) + flat.slice(at + needle.length)).replace(/\s+/g, ' ').trim()
}

async function repairOne(
  html: string, code: string, sentence: string, locale: string, rule: string,
  mode: { rewrite: RewriteBlock | null },
): Promise<{ html: string; action: RepairAction } | { reason: string }> {
  const b = locate(html, sentence, code)
  if (!b) return { reason: `${code}:not_in_body` }

  // A model rewrite of a block that holds a link would lose the link.
  if (mode.rewrite && !hasAnchor(b.inner)) {
    let text: string | null = null
    try { text = await mode.rewrite({ locale, block: b.plain, sentence: b.target, rule }) } catch { text = null }
    const clean = text ? collapse(plainText(text)) : ''
    if (clean && !clean.includes('|')) {
      return { html: splice(html, b, escapeHtml(clean)), action: { code, how: 'rewrite', sentence: b.target } }
    }
  }

  const cut = withoutSentence(b)
  if (cut === null) return { reason: `${code}:not_cuttable` }
  // Nothing readable left of the block: remove it where that leaves no hole.
  if (!plainText(cut)) {
    if (!CUTTABLE.has(b.tag)) return { reason: `${code}:cell_or_heading` }
    return { html: splice(html, b, null), action: { code, how: 'delete', sentence: b.target } }
  }
  return { html: splice(html, b, cut), action: { code, how: 'delete', sentence: b.target } }
}

/**
 * Repair what one truth-gate verdict refused. `round` 0 may rewrite, later
 * rounds only delete. Pure but for the injected `rewrite`.
 */
export async function repairRefusedSentences(input: {
  html: string
  locale: string
  failures: string[]
  offenders: Record<string, string>
  rules: Record<string, string>
  round: number
  rewrite: RewriteBlock | null
}): Promise<RepairOutcome> {
  const actions: RepairAction[] = []
  let html = input.html
  const mode = { rewrite: input.round === 0 ? input.rewrite : null }
  for (const code of input.failures) {
    if (!REPAIRABLE_CODES.has(code)) return { ok: false, reason: `${code}:not_repairable` }
    const sentence = input.offenders[code]
    if (!sentence) return { ok: false, reason: `${code}:no_sentence` }
    const done = await repairOne(html, code, sentence, input.locale, input.rules[code] ?? code, mode)
    if ('reason' in done) return { ok: false, reason: done.reason }
    html = done.html
    actions.push(done.action)
  }
  return { ok: true, html, actions }
}

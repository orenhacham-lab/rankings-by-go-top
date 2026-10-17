/**
 * "More than one main heading" (h1_multiple): may WE fix it? Only when it is provably safe.
 *
 * The plugin (2.1.0) reports the post's OWN content headings (their words, in order) and whether a
 * page builder renders the page; the public page tells us every <h1> a visitor gets. The fix only
 * turns chosen <h1> of the post's content into <h2>, with the words unchanged. It is offered only
 * when:
 *   - the page is not a page-builder page (the builder renders from its own data);
 *   - the content's markup is simple (every <h1> closed, none inside another);
 *   - EVERY content heading is found on the public page with the same words (so the content is
 *     what the visitor sees), and what is left over is the theme's own heading, at most one;
 *   - after the fix exactly one main heading remains: the theme's one (then every content heading
 *     is demoted), or, when the theme has none, the content's first (the others are demoted).
 * Anything else (a theme or template with two headings, a heading we cannot find, a builder page)
 * stays a do-it-yourself card, with the reason. Pure: tested alone.
 */
import type { H1Ref } from './types'

export type H1Plan =
  | { ok: true; demote: H1Ref[]; keep: string; keepFrom: 'theme' | 'content' }
  | { ok: false; reason: 'builder' | 'markup' | 'theme' | 'unproven' | 'nothing' }

/** Headings compared as a visitor reads them: entities as text, spaces collapsed, case kept. */
export function headingKey(s: string): string {
  return String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}

export function planH1Demotion(input: { contentH1: string[] | null; liveH1: string[]; builder: boolean }): H1Plan {
  if (input.builder) return { ok: false, reason: 'builder' }
  if (input.contentH1 === null) return { ok: false, reason: 'markup' }
  const live = input.liveH1.map(headingKey).filter(Boolean)
  const content = input.contentH1.map(headingKey)
  if (live.length < 2) return { ok: false, reason: 'nothing' }
  // Every content heading must be one the visitor gets (each live heading matched once).
  const left = [...live]
  for (const c of content) {
    if (!c) return { ok: false, reason: 'unproven' }
    const i = left.indexOf(c)
    if (i < 0) return { ok: false, reason: 'unproven' }
    left.splice(i, 1)
  }
  // What is left is outside the content: the theme or template.
  if (left.length >= 2) return { ok: false, reason: 'theme' }
  if (content.length === 0) return { ok: false, reason: 'theme' }
  if (left.length === 1) {
    return { ok: true, demote: content.map((text, n) => ({ n, text })), keep: left[0], keepFrom: 'theme' }
  }
  if (content.length < 2) return { ok: false, reason: 'nothing' }
  return { ok: true, demote: content.slice(1).map((text, i) => ({ n: i + 1, text })), keep: content[0], keepFrom: 'content' }
}

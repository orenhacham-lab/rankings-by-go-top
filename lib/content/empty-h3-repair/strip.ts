/**
 * Removing a subheading that has nothing under it — pure, no I/O.
 *
 * Until PR #221 the article generator could write an <h3> whose subsection held
 * nothing, so the heading was followed directly by the next heading. Six
 * published articles still carry it on the merchant's site. This is the one
 * surgical edit the repair (./pass.ts) makes, to the live post and to our copy.
 *
 * WHAT IS "EMPTY". An <h3> element followed, with only whitespace between, by an
 * <h2>, another <h3>, or the end of the content. Closing tags (</div>,
 * </section>, </article>) may sit in between: the heading is then the last thing
 * in its container and still has nothing under it. Anything else that follows
 * (a paragraph, a list, a table, a figure, an <h4>, a call to action) means it
 * has content, and it stays. An FAQ question followed by its answer stays.
 *
 * WORDPRESS BLOCKS. A heading saved by the block editor is wrapped:
 *   <!-- wp:heading {"level":3} --><h3 class="wp-block-heading">…</h3><!-- /wp:heading -->
 * The whole block is removed, comments included, and a following heading that is
 * itself a block (<!-- wp:heading … --> then <h2>/<h3>) counts as a heading. A
 * block whose opening comment has no closing one is left alone.
 *
 * NOTHING ELSE CHANGES. Only the removed ranges (the element, its block comments,
 * and the whitespace up to the next element) are cut; every other byte of the
 * content is kept exactly, so an owner's own edits survive.
 */

export interface EmptyH3Removal {
  /** The content with every empty <h3> removed (the input itself when there was none). */
  html: string
  /** How many were removed. */
  removed: number
  /** Their visible text, in order (normalised): used to match the markdown copy. Never logged. */
  texts: string[]
}

const H3_RE = /<h3\b[^>]*>([\s\S]*?)<\/h3\s*>/gi
/** A block-editor heading opener immediately before the element (whitespace aside). */
const WP_OPEN_BEFORE = /<!--\s*wp:heading\b(?:(?!-->)[\s\S])*-->\s*$/
const WP_CLOSE_AFTER = /^\s*<!--\s*\/wp:heading\s*-->/
/** What may sit between an empty heading and the next heading: whitespace and closing containers. */
const SKIPPABLE = /^(?:\s|<\/(?:div|section|article)\s*>)*/i
const NEXT_IS_HEADING = /^(?:<!--\s*wp:heading\b(?:(?!-->)[\s\S])*-->\s*)?<h[23]\b/i

/** Plain, comparable text of a heading's inner HTML. */
export function headingText(inner: string): string {
  return inner
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Remove every empty <h3> (see the file comment). Never throws on any string. */
export function removeEmptyH3(input: string | null | undefined): EmptyH3Removal {
  const html = typeof input === 'string' ? input : ''
  const ranges: { from: number; to: number; text: string }[] = []
  H3_RE.lastIndex = 0
  for (let m = H3_RE.exec(html); m; m = H3_RE.exec(html)) {
    const start = m.index
    const end = start + m[0].length
    // Block form: an opener right before needs its closer right after, else leave it alone.
    const opener = WP_OPEN_BEFORE.exec(html.slice(Math.max(0, start - 2000), start))
    let from = start
    let after = end
    if (opener) {
      const closer = WP_CLOSE_AFTER.exec(html.slice(end))
      if (!closer) continue
      // The match runs from '<!--' to `start` (whitespace included), so this is the opener's start.
      from = start - opener[0].length
      after = end + closer[0].length
    }
    const rest = html.slice(after)
    const skipped = SKIPPABLE.exec(rest)?.[0] ?? ''
    const tail = rest.slice(skipped.length)
    if (tail !== '' && !NEXT_IS_HEADING.test(tail)) continue
    // Cut the element and the whitespace after it, never the closing containers.
    const ws = /^\s*/.exec(rest)?.[0] ?? ''
    ranges.push({ from, to: after + ws.length, text: headingText(m[1]) })
  }
  if (ranges.length === 0) return { html, removed: 0, texts: [] }
  let out = html
  for (let i = ranges.length - 1; i >= 0; i--) out = out.slice(0, ranges[i].from) + out.slice(ranges[i].to)
  return { html: out, removed: ranges.length, texts: ranges.map((r) => r.text) }
}

/** True when the content has at least one empty <h3>. */
export function hasEmptyH3(input: string | null | undefined): boolean {
  return removeEmptyH3(input).removed > 0
}

const MD_H3 = /^###[ \t]+(.*?)[ \t]*#*[ \t]*$/
const MD_H2_OR_H3 = /^#{2,3}[ \t]+\S/

/**
 * The markdown copy: a `### heading` line with nothing before the next `##`/`###`
 * heading (or the end) is removed with the blank lines after it. When `onlyTexts`
 * is given, only a heading whose text is among them is removed, so the markdown
 * loses exactly the headings the HTML lost.
 */
export function removeEmptyMarkdownH3(input: string | null | undefined, onlyTexts?: string[]): { markdown: string; removed: number } {
  const md = typeof input === 'string' ? input : ''
  if (!md) return { markdown: md, removed: 0 }
  const wanted = onlyTexts ? new Set(onlyTexts.map((t) => headingText(t))) : null
  const lines = md.split('\n')
  const drop = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    const h = MD_H3.exec(lines[i])
    if (!h) continue
    let j = i + 1
    while (j < lines.length && lines[j].trim() === '') j++
    const empty = j >= lines.length || MD_H2_OR_H3.test(lines[j])
    if (!empty) continue
    if (wanted && !wanted.has(headingText(h[1]))) continue
    for (let k = i; k < j; k++) drop.add(k)
  }
  if (drop.size === 0) return { markdown: md, removed: 0 }
  let removed = 0
  for (const k of drop) if (MD_H3.test(lines[k])) removed++
  return { markdown: lines.filter((_, k) => !drop.has(k)).join('\n'), removed }
}

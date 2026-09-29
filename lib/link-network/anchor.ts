/**
 * Where a network link may go in an article, what its anchor may be, and the
 * one edit that writes it (or takes it out again). Pure, no I/O.
 *
 *   bodyParagraphs    the paragraphs a network link may live in: body <p> only,
 *                     never the first or the last one, never inside a list,
 *                     quote, table, figure, aside, header, footer, nav or
 *                     details, never one that already has a link, never a short
 *                     one. So never the footer, a sidebar, a list of links or an
 *                     author box.
 *   validAnchor       2 to 8 words already in the sentence, never "click here".
 *   classifyAnchor    branded / exact / partial / natural (the mix is kept
 *                     mostly branded, partial and natural: rules.ts).
 *   insertLink        wraps the anchor's words, where they already stand in
 *                     that paragraph, in one <a>. It adds and changes no other
 *                     word, and it adds no class, id or data attribute: nothing
 *                     marks a network link as one (no footprint).
 *   removeLink        the reverse, for a placement the giving side rejects.
 */

export type LinkRel = 'follow' | 'nofollow'

export interface BodyParagraph {
  /** Position among the article's <p> elements (0-based), as shown to the model. */
  index: number
  /** Offsets of the paragraph's inner HTML in the article. */
  innerStart: number
  innerEnd: number
  /** Its plain text. */
  text: string
}

const CONTAINERS = ['li', 'ul', 'ol', 'blockquote', 'table', 'figure', 'aside', 'header', 'footer', 'nav', 'details', 'dl']
export const MIN_PARAGRAPH_CHARS = 80

const decode = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

export function plainText(html: string): string {
  return decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function insideContainer(html: string, at: number): boolean {
  const before = html.slice(0, at).toLowerCase()
  return CONTAINERS.some((tag) => {
    const opens = (before.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length
    const closes = (before.match(new RegExp(`</${tag}\\s*>`, 'g')) || []).length
    return opens > closes
  })
}

/** Every paragraph a network link may be placed in (see the file header). */
export function bodyParagraphs(html: string): BodyParagraph[] {
  const all: { index: number; start: number; innerStart: number; innerEnd: number; inner: string }[] = []
  const re = /<p(\s[^>]*)?>([\s\S]*?)<\/p\s*>/gi
  let m: RegExpExecArray | null
  let index = 0
  while ((m = re.exec(html))) {
    const innerStart = m.index + m[0].indexOf('>') + 1
    all.push({ index: index++, start: m.index, innerStart, innerEnd: innerStart + m[2].length, inner: m[2] })
  }
  if (all.length < 3) return []
  const out: BodyParagraph[] = []
  for (const p of all.slice(1, -1)) {
    if (/<a[\s>]/i.test(p.inner)) continue
    if (/<(h[1-6]|p|div|ul|ol|table)[\s>]/i.test(p.inner)) continue
    if (insideContainer(html, p.start)) continue
    const text = plainText(p.inner)
    if (text.length < MIN_PARAGRAPH_CHARS) continue
    out.push({ index: p.index, innerStart: p.innerStart, innerEnd: p.innerEnd, text })
  }
  return out
}

const GENERIC = [
  'כאן', 'לחצו כאן', 'לחץ כאן', 'קישור', 'הקישור', 'באתר', 'באתר הזה', 'למידע נוסף', 'לפרטים', 'לפרטים נוספים', 'קראו עוד', 'קרא עוד',
  'here', 'click here', 'this link', 'link', 'website', 'this website', 'read more', 'learn more', 'more info', 'more information',
]

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean)

/** 2 to 8 words, 4 to 80 characters, text only, not a "click here". */
export function validAnchor(anchor: string): boolean {
  const a = (anchor || '').trim()
  if (a.length < 4 || a.length > 80) return false
  if (/[<>"&]/.test(a)) return false
  const n = words(a).length
  if (n < 2 || n > 8) return false
  return !GENERIC.includes(a.toLowerCase().replace(/[.,:;!?]+$/, ''))
}

const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

/**
 * What kind of anchor it is, for the target:
 *   branded  it names the target (business name, or its domain's name);
 *   exact    it IS one of the target's keywords or its page's title;
 *   partial  it shares most of the words of one of them;
 *   natural  a descriptive phrase that is none of the above.
 */
export function classifyAnchor(anchor: string, target: { brandTerms: string[]; keywords: string[] }): 'branded' | 'exact' | 'partial' | 'natural' {
  const a = norm(anchor)
  if (!a) return 'natural'
  const brands = target.brandTerms.map(norm).filter((b) => b.length >= 3)
  if (brands.some((b) => a.includes(b))) return 'branded'
  const keys = target.keywords.map(norm).filter(Boolean)
  if (keys.some((k) => k === a)) return 'exact'
  const aw = new Set(words(a).filter((w) => w.length > 1))
  for (const k of keys) {
    const kw = words(k).filter((w) => w.length > 1)
    if (!kw.length) continue
    const shared = kw.filter((w) => aw.has(w)).length
    if (shared / kw.length >= 0.5) return 'partial'
  }
  return 'natural'
}

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const LETTER = /[\p{L}\p{N}]/u

/** The <a> for a network link. follow: no rel at all; nofollow: rel="nofollow". Nothing else. */
export function linkTag(url: string, rel: LinkRel): string {
  return `<a href="${escAttr(url)}"${rel === 'nofollow' ? ' rel="nofollow"' : ''}>`
}

/**
 * Wrap the anchor's words, where they already stand in this paragraph, in the
 * link. Only in text between tags (never inside an attribute or across a tag),
 * only on whole words. Returns the new article HTML, or null when the words are
 * not in the paragraph as text.
 */
export function insertLink(html: string, paragraph: BodyParagraph, anchor: string, url: string, rel: LinkRel): string | null {
  if (!validAnchor(anchor)) return null
  const inner = html.slice(paragraph.innerStart, paragraph.innerEnd)
  if (/<a[\s>]/i.test(inner)) return null
  const needle = escText(anchor.trim())
  // Text segments of the paragraph: between tags only.
  const seg = /(^|>)([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = seg.exec(inner))) {
    const text = m[2]
    const segStart = m.index + m[1].length
    let from = 0
    for (;;) {
      const k = text.toLowerCase().indexOf(needle.toLowerCase(), from)
      if (k < 0) break
      from = k + 1
      const before = text[k - 1] ?? ''
      const after = text[k + needle.length] ?? ''
      if ((before && LETTER.test(before)) || (after && LETTER.test(after))) continue
      const at = paragraph.innerStart + segStart + k
      const original = html.slice(at, at + needle.length)
      return `${html.slice(0, at)}${linkTag(url, rel)}${original}</a>${html.slice(at + needle.length)}`
    }
  }
  return null
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The first <a> to exactly this url, as it stands in the HTML, or null. */
function findLink(html: string, url: string): RegExpExecArray | null {
  const href = escRe(escAttr(url))
  return new RegExp(`<a\\s[^>]*href="${href}"[^>]*>([\\s\\S]*?)</a\\s*>`, 'i').exec(html)
}

export function linkPresent(html: string | null | undefined, url: string): boolean {
  return !!html && !!findLink(html, url)
}

/** Take the network link out again: the anchor's words stay, the <a> goes. Null when it is not there. */
export function removeLink(html: string, url: string): string | null {
  const m = findLink(html, url)
  if (!m) return null
  return html.slice(0, m.index) + m[1] + html.slice(m.index + m[0].length)
}

/** The sentence around the link, for the log ("where it appeared"), at most ~220 characters. */
export function linkContext(html: string | null | undefined, url: string): string | null {
  if (!html) return null
  const m = findLink(html, url)
  if (!m) return null
  const open = html.lastIndexOf('<p', m.index)
  const close = html.indexOf('</p', m.index)
  const para = plainText(html.slice(open >= 0 ? open : Math.max(0, m.index - 400), close >= 0 ? close : m.index + 400))
  const anchor = plainText(m[1])
  const at = para.indexOf(anchor)
  if (at < 0) return para.slice(0, 220)
  const dot = para.lastIndexOf('. ', at)
  const start = dot >= 0 ? dot + 2 : 0
  const endDot = para.indexOf('.', at + anchor.length)
  const end = endDot >= 0 ? endDot + 1 : para.length
  const sentence = para.slice(start, end).trim()
  return sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence
}

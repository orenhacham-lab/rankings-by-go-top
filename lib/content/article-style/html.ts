/**
 * The formatted article design: the stored article body, drawn in the
 * project's brand colours, as clean HTML that survives the places it goes.
 *
 * WHERE IT RUNS. Never on the stored body: content_html stays plain semantic
 * HTML (the editor, the internal-link tools and the Shopify publisher all read
 * it), and the design is composed on the way out, like the inline images:
 *   - the article view (components/content/article-style/StyledArticleBody),
 *   - WordPress publishing (lib/content/wordpress-publish.ts),
 *   - custom-site webhook publishing (lib/site-platforms/publish.ts),
 * through applyArticleDesign (./publish.ts). So changing the colours changes
 * every article the next time it is shown or published, and editing an
 * article never loses its design.
 *
 * WHY INLINE STYLES. A WordPress theme, a webhook receiver's page and our own
 * viewer share no stylesheet, and WordPress removes <style> blocks and unknown
 * classes' meaning. Inline style attributes survive wp_kses_post for the
 * properties in STYLE_WHITELIST (each one is in WordPress' safe CSS list), on
 * elements it allows (div, p, h2, h3, ul, li, table, th, td, a, blockquote,
 * figure, img, figcaption, nav). No display, position, url(), or logical
 * border properties: WordPress drops them.
 *
 * SAFETY. The input is sanitized first (sanitizeArticleHtml: no script, no
 * event handler, no style, http/https/mailto/tel links only). The structure is
 * then built from that, and the result passes a second sanitizer whose only
 * allowed attribute additions are `style` with the whitelisted properties,
 * each value checked by a pattern (colours are #rrggbb only). A brand colour
 * that is not a hex colour never reaches the palette (./colors.ts).
 *
 * The minimal design returns the sanitized body unchanged: today's output.
 */
import sanitizeHtml from 'sanitize-html'
import { sanitizeArticleHtml } from '@/lib/content/article-html'
import { articlePalette, mix, type ArticlePalette } from './colors'
import { ARTICLE_STYLE_LABELS, articleLanguage, type ArticleLanguage } from './labels'
import { isCompleteCta, type ArticleCta } from './cta'
import type { ArticleDesign } from './types'

const HEX = /^#[0-9a-f]{6}$/
const PX = '(?:0|\\d{1,2}px)'
const BOX = new RegExp(`^${PX}(?: ${PX}){0,3}$`)
const ONE = new RegExp(`^${PX}$`)
const BORDER = /^(?:0|\d{1,2}px solid #[0-9a-f]{6})$/

/** Every CSS property the design may write, and the only values each may take. */
export const STYLE_WHITELIST: Record<string, RegExp[]> = {
  'color': [HEX],
  'background-color': [HEX],
  'border': [BORDER],
  'border-top': [BORDER],
  'border-bottom': [BORDER],
  'border-left': [BORDER],
  'border-right': [BORDER],
  'border-radius': [/^\d{1,2}px$/],
  'border-collapse': [/^collapse$/],
  'margin': [BOX],
  'padding': [BOX],
  'padding-left': [ONE],
  'padding-right': [ONE],
  'font-size': [/^\d{2}px$/],
  'font-weight': [/^(?:400|600|700)$/],
  'line-height': [/^[12](?:\.\d)?$/],
  'text-align': [/^(?:left|right|center)$/],
  'text-decoration': [/^underline$/],
  'width': [/^100%$/],
  'height': [/^auto$/],
  'overflow': [/^auto$/],
}

/** The article body's tags after design: the stored body's own, plus the boxes. */
const DESIGN_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 's',
  'a', 'br', 'hr', 'nav', 'blockquote', 'code', 'pre',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'figure', 'figcaption', 'span', 'img', 'div',
]

type Role =
  | 'lead' | 'lead-label' | 'lead-text'
  | 'takeaways' | 'takeaways-label' | 'takeaways-list' | 'takeaway'
  | 'faq' | 'faq-title' | 'faq-item' | 'faq-q' | 'faq-a'
  | 'cta' | 'cta-text' | 'cta-link'
  | 'pcta' | 'pcta-title' | 'pcta-text' | 'pcta-action' | 'pcta-button'
  | 'table-wrap'

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Text taken out of already-sanitized HTML keeps its entities; only bare markup characters are escaped again. */
const plain = (s: string) => escText(stripTags(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))

const FAQ_TITLE = /שאלות נפוצות|frequently asked|^faq$/i
const isFaqHeading = (attrs: string, inner: string) => /\bid="faq[^"]*"/i.test(attrs) || FAQ_TITLE.test(stripTags(inner))

/** The first sentence of a paragraph, at most ~170 characters, for the takeaways box. */
function firstSentence(text: string): string {
  const t = text.trim()
  const m = t.match(/^[\s\S]{20,170}?[.!?](?=\s|$)/)
  if (m) return m[0].trim()
  if (t.length <= 170) return t
  const cut = t.slice(0, 170)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 120)).trim()}…`
}

/** Where the FAQ block starts in the body, or -1. */
function faqStart(html: string): number {
  const re = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) if (isFaqHeading(m[1] ?? '', m[2] ?? '')) return m.index
  return -1
}

/** Up to four takeaways: the answer-first sentence that opens each section (the generator writes one per section). */
export function keyTakeaways(html: string): string[] {
  const out: string[] = []
  const re = /<h2\b([^>]*)>([\s\S]*?)<\/h2>((?:(?!<h2\b)[\s\S])*)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null && out.length < 4) {
    if (isFaqHeading(m[1] ?? '', m[2] ?? '')) continue
    const p = (m[3] ?? '').match(/<p\b(?![^>]*article-table-title)[^>]*>([\s\S]*?)<\/p>/i)
    const text = p ? stripTags(p[1] ?? '') : ''
    if (text.length >= 20) out.push(firstSentence(text))
  }
  return out.length >= 3 ? out : []
}

const tag = (name: string, role: Role, inner: string) => `<${name} data-as="${role}">${inner}</${name}>`
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;')

/**
 * The project's call to action (./cta.ts) as bare structure: a heading, the
 * optional line of text and one button. Every text is escaped here; the link
 * is the validated https address, escaped as an attribute. The formatted
 * design styles it by role; the minimal design keeps it plain (the site's own
 * styles apply), so the markers are dropped there.
 */
function ctaBlock(cta: ArticleCta): string {
  return tag('div', 'pcta',
    tag('p', 'pcta-title', `<strong>${escText(cta.heading)}</strong>`) +
    (cta.text ? tag('p', 'pcta-text', escText(cta.text)) : '') +
    tag('p', 'pcta-action', `<a data-as="pcta-button" href="${escAttr(cta.buttonUrl)}">${escText(cta.buttonLabel)}</a>`))
}

/** Where the call to action goes: right before the FAQ block, or at the end of the body. */
function withCta(body: string, cta: ArticleCta): string {
  const at = faqStart(body)
  const block = ctaBlock(cta)
  return at >= 0 ? body.slice(0, at) + block + body.slice(at) : body + block
}

/** The boxes, as bare structure marked with data-as; styling comes after. */
function structure(html: string, lang: ArticleLanguage, cta: ArticleCta | null): string {
  const labels = ARTICLE_STYLE_LABELS[lang]
  const takeaways = keyTakeaways(html)
  let body = html

  // FAQ: a soft panel with one card per question.
  const faqAt = faqStart(body)
  let faq = ''
  if (faqAt >= 0) {
    const rest = body.slice(faqAt)
    const next = rest.slice(1).search(/<h2\b/i)
    const end = next >= 0 ? faqAt + 1 + next : body.length
    const segment = body.slice(faqAt, end)
    const items = segment
      .replace(/^<h2\b([^>]*)>([\s\S]*?)<\/h2>/i, (_m, attrs: string, inner: string) => `<h2${attrs} data-as="faq-title">${inner}</h2>`)
      .replace(/<h3\b([^>]*)>([\s\S]*?)<\/h3>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi,
        (_m, attrs: string, q: string, a: string) => `<div data-as="faq-item"><h3${attrs} data-as="faq-q">${q}</h3><p data-as="faq-a">${a}</p></div>`)
    faq = tag('div', 'faq', items)
    body = body.slice(0, faqAt) + '\u0000FAQ\u0000' + body.slice(end)
  }

  // The project's own call to action takes the FAQ's place in the flow (right before it).
  if (cta) body = body.replace('\u0000FAQ\u0000', ctaBlock(cta) + '\u0000FAQ\u0000')
  if (cta && !body.includes('\u0000FAQ\u0000')) body += ctaBlock(cta)

  // The closing call to action: the body's last paragraph, when it links somewhere
  // (only while the project has no call to action of its own: never two).
  const beforeFaq = body.indexOf('\u0000FAQ\u0000') >= 0 ? body.slice(0, body.indexOf('\u0000FAQ\u0000')) : body
  const paras = [...beforeFaq.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)]
  const last = paras[paras.length - 1]
  if (!cta && last && last.index !== undefined && paras.length > 1 && !/article-table-title/.test(last[1] ?? '') && /<a\b[^>]*href=/i.test(last[2] ?? '')) {
    const trailing = beforeFaq.slice(last.index + last[0].length)
    if (!/<(?:p|h2|h3|ul|ol|table|figure)\b/i.test(trailing)) {
      const inner = (last[2] ?? '').replace(/<a\b/gi, '<a data-as="cta-link"')
      body = body.slice(0, last.index) + tag('div', 'cta', tag('p', 'cta-text', inner)) + body.slice(last.index + last[0].length)
    }
  }
  body = body.replace('\u0000FAQ\u0000', faq)

  // Tables scroll inside a rounded frame on a phone.
  body = body.replace(/<table\b[\s\S]*?<\/table>/gi, (t) => tag('div', 'table-wrap', t))

  // The opening answer (the generator's bold first paragraph) becomes the "in short" box.
  body = body.replace(/^\s*<p>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>/i, (_m, inner: string) =>
    tag('div', 'lead', tag('p', 'lead-label', escText(labels.inBrief)) + tag('p', 'lead-text', inner)))

  // Key takeaways, before the table of contents / the first section.
  if (takeaways.length) {
    const box = tag('div', 'takeaways',
      tag('p', 'takeaways-label', escText(labels.takeaways)) +
      tag('ul', 'takeaways-list', takeaways.map((t) => tag('li', 'takeaway', plain(t))).join('')))
    const at = body.search(/<nav\b|<h2\b/i)
    body = at >= 0 ? body.slice(0, at) + box + body.slice(at) : body + box
  }
  return body
}

function stylesFor(p: ArticlePalette, lang: ArticleLanguage) {
  const start = lang === 'he' ? 'right' : 'left'
  const faint = mix(p.line, '#ffffff', 0.5)
  const byRole: Record<Role, string> = {
    'lead': `margin:0 0 28px;padding:18px 22px;background-color:${p.soft};border:1px solid ${p.line};border-${start}:5px solid ${p.brand};border-radius:12px`,
    'lead-label': `margin:0 0 6px;font-size:13px;font-weight:700;color:${p.text}`,
    'lead-text': `margin:0;font-size:18px;line-height:1.6;font-weight:600;color:${p.ink}`,
    'takeaways': `margin:0 0 32px;padding:20px 24px;background-color:#ffffff;border:1px solid ${p.line};border-top:4px solid ${p.accent};border-radius:12px`,
    'takeaways-label': `margin:0 0 10px;font-size:13px;font-weight:700;color:${p.text}`,
    'takeaways-list': `margin:0;padding-${start}:20px`,
    'takeaway': `margin:0 0 8px;line-height:1.6;color:${p.ink}`,
    'faq': `margin:40px 0 0;padding:24px;background-color:${p.soft};border-radius:16px`,
    'faq-title': `margin:0 0 16px;padding:0;border:0;line-height:1.3;color:${p.ink}`,
    'faq-item': `margin:0 0 12px;padding:16px 18px;background-color:#ffffff;border:1px solid ${p.line};border-radius:12px`,
    'faq-q': `margin:0 0 6px;font-size:17px;line-height:1.3;color:${p.ink}`,
    'faq-a': `margin:0;line-height:1.6;color:${p.muted}`,
    'cta': `margin:36px 0;padding:22px 24px;background-color:${p.brand};border-radius:14px`,
    'cta-text': `margin:0;font-size:17px;line-height:1.6;font-weight:600;color:${p.brandInk}`,
    'cta-link': `color:${p.brandInk};font-weight:700;text-decoration:underline`,
    'table-wrap': `margin:24px 0;overflow:auto;border:1px solid ${p.line};border-radius:12px`,
    'pcta': `margin:40px 0;padding:24px 26px;background-color:${p.brand};border-radius:16px;text-align:${start}`,
    'pcta-title': `margin:0 0 6px;font-size:20px;line-height:1.3;font-weight:700;color:${p.brandInk}`,
    'pcta-text': `margin:0 0 16px;font-size:17px;line-height:1.6;color:${p.brandInk}`,
    'pcta-action': 'margin:0',
    'pcta-button': `padding:10px 20px;background-color:${p.brandInk};color:${p.brand};border-radius:10px;font-weight:700;text-decoration:underline`,
  }
  const byTag: Record<string, string> = {
    h2: `margin:36px 0 14px;padding:0;padding-${start}:12px;border:0;border-${start}:4px solid ${p.brand};line-height:1.3;color:${p.ink}`,
    h3: `margin:24px 0 8px;line-height:1.3;color:${p.ink}`,
    a: `color:${p.text};font-weight:600`,
    blockquote: `margin:24px 0;padding:16px 20px;background-color:${p.soft};border-${start}:4px solid ${p.brand};border-radius:8px;color:${p.ink}`,
    table: 'width:100%;border-collapse:collapse;margin:0;border:0',
    th: `padding:12px 14px;border:0;background-color:${p.soft};border-bottom:2px solid ${p.brand};text-align:${start};font-weight:700;color:${p.ink}`,
    td: `padding:12px 14px;border:0;border-bottom:1px solid ${faint};text-align:${start};color:${p.ink}`,
    figure: 'margin:28px 0',
    img: 'width:100%;height:auto;border-radius:12px',
    figcaption: `margin:8px 0 0;font-size:14px;text-align:center;color:${p.muted}`,
    nav: `margin:0 0 28px;padding:16px 20px;border:1px solid ${p.line};border-radius:12px`,
    hr: `margin:32px 0;border:0;border-top:1px solid ${p.line}`,
  }
  const tableTitle = `margin:24px 0 8px;font-weight:700;color:${p.ink}`
  return { byRole, byTag, tableTitle }
}

/** The second sanitizer: the structure's tags, the stored body's attributes, and `style` from the whitelist only. */
function designSanitizerOptions(p: ArticlePalette, lang: ArticleLanguage): sanitizeHtml.IOptions {
  const s = stylesFor(p, lang)
  return {
    allowedTags: DESIGN_TAGS,
    allowedAttributes: {
      '*': ['style'],
      a: ['href', 'title', 'target', 'rel', 'style'],
      p: ['class', 'dir', 'style'],
      table: ['dir', 'style'],
      th: ['scope', 'colspan', 'rowspan', 'style'],
      td: ['colspan', 'rowspan', 'style'],
      span: ['class', 'style'],
      h2: ['id', 'style'], h3: ['id', 'style'], h4: ['id', 'style'],
      nav: ['class', 'aria-label', 'style'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'class', 'style'],
      figure: ['class', 'data-inline-image-id', 'style'],
      figcaption: ['class', 'style'],
    },
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedStyles: { '*': STYLE_WHITELIST },
    transformTags: {
      '*': (tagName, attribs) => {
        const role = attribs['data-as'] as Role | undefined
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(attribs)) if (k !== 'data-as' && k !== 'style') out[k] = v
        const style = role && role in s.byRole ? s.byRole[role]
          : tagName === 'p' && /\barticle-table-title\b/.test(attribs.class ?? '') ? s.tableTitle
            : s.byTag[tagName]
        if (style) out.style = style
        if (tagName === 'a' && out.target === '_blank') out.rel = 'noopener noreferrer'
        return { tagName, attribs: out }
      },
    },
  }
}

export type ArticleDesignOptions = {
  design: ArticleDesign
  /** The project's brand colours; anything that is not #rrggbb is ignored. */
  colors: readonly string[]
  /** The article's language; read off the text when not given. */
  language?: ArticleLanguage
  /** The project's own call to action (./cta.ts), when it is on; drawn in both designs. */
  cta?: ArticleCta | null
}

/** The minimal design's plain call to action: the same structure, no role markers, no style. */
const plainCta = (html: string) => html.replace(/ data-as="[a-z-]+"/g, '')

/**
 * The article body in the chosen design. `minimal` is the sanitized body as it
 * is today; `formatted` adds the "in short" box, the key takeaways, framed
 * tables, the FAQ cards and the closing call to action, in the brand colours.
 * Pure and idempotent on its input (it always starts from the stored body).
 */
export function styleArticleHtml(html: string, opts: ArticleDesignOptions): string {
  const base = sanitizeArticleHtml(String(html ?? ''))
  const cta = isCompleteCta(opts.cta) ? opts.cta : null
  if (!base) return base
  if (opts.design !== 'formatted') return cta ? sanitizeArticleHtml(plainCta(withCta(base, cta))) : base
  const lang = opts.language ?? articleLanguage(base)
  const palette = articlePalette(opts.colors)
  return sanitizeHtml(structure(base, lang, cta), designSanitizerOptions(palette, lang)).trim()
}

/**
 * A JAPANESE FACE for a PDF that has Japanese text in it.
 *
 * Every HTML-to-PDF document this repository builds declares a Latin/Hebrew font
 * stack — 'Segoe UI', Helvetica, Arial — and none of those fonts has a Japanese
 * glyph. A renderer that cannot find a glyph draws a replacement box (豆腐,
 * "tofu"), so a monthly report whose keyword table holds Japanese keywords would
 * arrive as rows of empty rectangles. The renderer is PDFShift's, in their cloud,
 * and which system fonts it has is not something we can read or rely on, so the
 * document carries its own face rather than hoping for one.
 *
 * It is keyed off the TEXT, not off a locale: an agency working in a Hebrew
 * dashboard can manage a Japanese site, and that report's UI is Hebrew while its
 * keyword column is Japanese. A locale check would miss exactly that case, and it
 * is the common one for us. Nothing is added to a document with no Japanese in it,
 * so no existing report changes and no webfont is fetched for it.
 */
import { isScriptless } from '@/lib/text/segment'

/**
 * Noto Sans JP, Regular, SERVED FROM OUR OWN DOMAIN (public/fonts, see the NOTICE
 * beside it). Not from fonts.googleapis.com: a stylesheet there would make Google
 * a recipient of a request on every Japanese report, which is a privacy-policy
 * change and a third party in the render path, for a file that never changes. One
 * weight and one file, 3.2 MB, full Japanese coverage — Google's own CSS splits
 * Japanese into a hundred unicode-range subsets, which a PDF renderer would have
 * to fetch one by one.
 *
 * The URL is absolute and points at production on purpose: the renderer is
 * PDFShift's own machine, so a relative path or a preview host would resolve to
 * nothing there.
 */
const NOTO_JP_URL = 'https://www.gotopseo.com/fonts/NotoSansJP-Regular.woff'

/**
 * The same document, with a Japanese face declared, when it needs one.
 *
 * The stylesheet link goes in `<head>` and the family is appended to `body`'s own
 * stack through a `!important`-free override that comes later in the cascade, so
 * the Latin and Hebrew text keeps the face it already had and only the characters
 * the first fonts cannot draw fall through to Noto. A document without a `</head>`
 * is returned untouched rather than guessed at.
 */
export function withJapaneseFont(html: string): string {
  if (!isScriptless(html)) return html
  const head = html.indexOf('</head>')
  if (head < 0) return html
  // The system faces a Japanese machine would have come first, then ours: a
  // renderer that already has Hiragino or Yu Gothic uses it and never fetches the
  // file, and one that has no Japanese glyph at all falls through to Noto instead
  // of printing boxes.
  const inject = `<style>@font-face { font-family: 'Noto Sans JP'; font-style: normal; font-weight: 400; src: url('${NOTO_JP_URL}') format('woff'); }`
    + `body, th, td, h1, h2, h3, p, li, span, strong { font-family: 'Segoe UI', Helvetica, Arial, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, 'Noto Sans CJK JP', 'Noto Sans JP', sans-serif; }</style>`
  return `${html.slice(0, head)}${inject}${html.slice(head)}`
}

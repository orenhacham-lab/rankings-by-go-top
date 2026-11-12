/**
 * A CJK FACE for a PDF that has Japanese or Korean text in it.
 *
 * Every HTML-to-PDF document this repository builds declares a Latin/Hebrew font
 * stack — 'Segoe UI', Helvetica, Arial — and none of those fonts has a Japanese
 * or a Hangul glyph. A renderer that cannot find a glyph draws a replacement box
 * (豆腐, "tofu"), so a monthly report whose keyword table holds Japanese or
 * Korean keywords would arrive as rows of empty rectangles. The renderer is
 * PDFShift's, in their cloud, and which system fonts it has is not something we
 * can read or rely on, so the document carries its own face rather than hoping
 * for one.
 *
 * It is keyed off the TEXT, not off a locale: an agency working in a Hebrew
 * dashboard can manage a Japanese or a Korean site, and that report's UI is
 * Hebrew while its keyword column is not. A locale check would miss exactly that
 * case, and it is the common one for us. Nothing is added to a document with no
 * such text in it, so no existing report changes and no webfont is fetched for it.
 *
 * WHY THE SCRIPT AND NOT ONE FACE FOR BOTH: Noto Sans JP has no Hangul and Noto
 * Sans KR has no kana, and each file is three megabytes. Declaring both on every
 * document would double the bytes the renderer fetches for a report that needs
 * one of them, so the document is READ and only the faces its own characters
 * need are declared. A report that holds both — an agency managing a Japanese
 * site and a Korean one, in one account — gets both, because `textScript` can
 * only answer with one script and the one it loses would print boxes.
 */

/**
 * Noto Sans JP and Noto Sans KR, Regular, SERVED FROM OUR OWN DOMAIN
 * (public/fonts, see the NOTICE beside them). Not from fonts.googleapis.com: a
 * stylesheet there would make Google a recipient of a request on every Japanese
 * or Korean report, which is a privacy-policy change and a third party in the
 * render path, for a file that never changes. One weight and one file each,
 * about 3 MB, full coverage of the script — Google's own CSS splits both
 * languages into a hundred unicode-range subsets, which a PDF renderer would
 * have to fetch one by one.
 *
 * The URLs are absolute and point at production on purpose: the renderer is
 * PDFShift's own machine, so a relative path or a preview host would resolve to
 * nothing there.
 */
const NOTO_JP_URL = 'https://www.gotopseo.com/fonts/NotoSansJP-Regular.woff'
const NOTO_KR_URL = 'https://www.gotopseo.com/fonts/NotoSansKR-Regular.woff'

/**
 * The faces to declare, per script. The system faces that machine might have
 * come FIRST in each stack, then ours: a renderer that already has Hiragino or
 * Malgun Gothic uses it and never fetches the file, and one that has no glyph at
 * all falls through to Noto instead of printing boxes.
 */
const FACE = {
  ja: {
    family: 'Noto Sans JP',
    url: NOTO_JP_URL,
    stack: `'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, 'Noto Sans CJK JP', 'Noto Sans JP'`,
  },
  ko: {
    family: 'Noto Sans KR',
    url: NOTO_KR_URL,
    stack: `'Apple SD Gothic Neo', 'Malgun Gothic', 'Nanum Gothic', 'Noto Sans CJK KR', 'Noto Sans KR'`,
  },
} as const

/**
 * The same document, with a CJK face declared, when it needs one.
 *
 * The stylesheet goes in `<head>` and the family is appended to `body`'s own
 * stack through a `!important`-free override that comes later in the cascade, so
 * the Latin and Hebrew text keeps the face it already had and only the characters
 * the first fonts cannot draw fall through to Noto. A document without a `</head>`
 * is returned untouched rather than guessed at.
 *
 * Thai also answers `isScriptless`, and it gets no face here: we publish in no
 * Thai locale, so a Thai report cannot exist yet, and a file would be three
 * megabytes committed for nobody. When Thai arrives it is another entry in FACE.
 */
export function withCjkFont(html: string): string {
  // Kana or Han is Japanese, Hangul is Korean, and a document can hold both.
  // Han with no kana reads as Japanese for the same reason `textScript` answers
  // it that way: Japanese is a language we publish in and Chinese is not.
  const needs: Array<keyof typeof FACE> = []
  if (/[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(html)) needs.push('ja')
  if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/.test(html)) needs.push('ko')
  if (needs.length === 0) return html
  const head = html.indexOf('</head>')
  if (head < 0) return html
  const faces = needs.map((s) => FACE[s])
  const inject = `<style>`
    + faces.map((f) => `@font-face { font-family: '${f.family}'; font-style: normal; font-weight: 400; src: url('${f.url}') format('woff'); }`).join('')
    + `body, th, td, h1, h2, h3, p, li, span, strong { font-family: 'Segoe UI', Helvetica, Arial, ${faces.map((f) => f.stack).join(', ')}, sans-serif; }</style>`
  return `${html.slice(0, head)}${inject}${html.slice(head)}`
}

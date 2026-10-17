/**
 * HEADING IDS AND THE TABLE OF CONTENTS, computed on the SERVER.
 *
 * The article body used to be assembled in the browser: a client component
 * parsed the HTML with DOMParser, added an id to every h2/h3 and collected the
 * list for the contents box. That meant the body existed only after JavaScript
 * ran, so the HTML a crawler receives for an article carried the title, the
 * metadata and the JSON-LD — and, where the text should be, a loading
 * skeleton. Google runs JavaScript; a good share of the AI engines' crawlers
 * do not, which is the opposite of what these articles are for.
 *
 * So the same job is done here, with no DOM: a plain scan over the sanitized
 * HTML. It runs once per request on the server and the result is in the
 * response.
 */

export interface ArticleHeading {
  text: string
  id: string
  level: 2 | 3
}

/** The text of a heading, with its inner markup and entities removed. */
function headingText(inner: string): string {
  return inner
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The id a heading gets, from its text.
 *
 * `\p{L}` rather than a Hebrew-and-Latin character class: the class this
 * replaced dropped every accented letter, so a Spanish "Índice de contenidos"
 * became "ndice-de-contenidos" and a heading written entirely in accented
 * words got no id at all — its contents link pointed nowhere.
 */
export function headingId(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '')
}

/**
 * Give every h2 and h3 an id, and return the headings in document order.
 *
 * An id already on the heading is kept, so an article that links to its own
 * section keeps working. A duplicate id is suffixed, because two headings with
 * the same text are common ("Shopify" under two different sections) and an
 * anchor must resolve to one place.
 */
export function withHeadingIds(html: string): { html: string; headings: ArticleHeading[] } {
  const headings: ArticleHeading[] = []
  const used = new Set<string>()
  let index = 0

  const out = html.replace(
    /<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (whole, levelRaw: string, attrs: string, inner: string) => {
      const level = Number(levelRaw) as 2 | 3
      const text = headingText(inner)
      const existing = /\sid\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]

      let id = existing || headingId(text) || `heading-${index}`
      if (!existing) {
        let unique = id
        let n = 2
        while (used.has(unique)) unique = `${id}-${n++}`
        id = unique
      }
      used.add(id)
      index += 1

      if (text) headings.push({ text, id, level })
      if (existing) return whole
      return `<h${level}${attrs} id="${id}">${inner}</h${level}>`
    },
  )

  return { html: out, headings }
}

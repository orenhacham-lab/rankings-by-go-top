/**
 * REAL COMPONENTS INSIDE AN ARTICLE'S BODY.
 *
 * An article is a row of HTML in the database, so everything it wanted to show
 * had to be expressible as flat markup. The plans were therefore a hand-written
 * `<table>`: four rows of prices typed into the article, which is both a worse
 * thing to look at than the pricing page's cards and a second place for a price
 * to be wrong.
 *
 * Instead the article marks a PLACE and the page puts the real component there:
 *
 *   <div class="gt-plans"></div>   the plan cards, priced in the visitor's currency
 *   <div class="gt-cta"></div>     the trial call to action
 *
 * A class, not a `data-` attribute, because the sanitizer's allow-list already
 * carries `class` for every tag (lib/content/public-article-html.ts) — a new
 * attribute would have had to be allowed there, widening what any article may
 * carry in order to add a feature only we use.
 *
 * An unknown `gt-` class is left alone as ordinary markup: it renders as the
 * empty div it is, rather than erasing the paragraph around it.
 */

export const ARTICLE_WIDGETS = ['plans', 'cta'] as const
export type ArticleWidget = (typeof ARTICLE_WIDGETS)[number]

export type ArticleBlock =
  | { kind: 'html'; html: string }
  | { kind: 'widget'; widget: ArticleWidget }

/** `<div class="... gt-plans ...">` … `</div>`, in any attribute order. */
const WIDGET_DIV = /<div\b[^>]*\bclass\s*=\s*"([^"]*)"[^>]*>\s*<\/div>/gi

function widgetIn(classList: string): ArticleWidget | null {
  const classes = classList.split(/\s+/)
  return ARTICLE_WIDGETS.find((w) => classes.includes(`gt-${w}`)) ?? null
}

/**
 * The article body as a sequence of HTML runs and widgets.
 *
 * Takes ALREADY SANITIZED html: this only cuts the string, so passing raw
 * content here would hand unsanitized markup to the renderer.
 */
export function splitArticleBlocks(sanitizedHtml: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = []
  let cursor = 0

  for (const match of sanitizedHtml.matchAll(WIDGET_DIV)) {
    const widget = widgetIn(match[1] ?? '')
    if (!widget) continue

    const before = sanitizedHtml.slice(cursor, match.index)
    if (before.trim()) blocks.push({ kind: 'html', html: before })
    blocks.push({ kind: 'widget', widget })
    cursor = match.index + match[0].length
  }

  const rest = sanitizedHtml.slice(cursor)
  if (rest.trim()) blocks.push({ kind: 'html', html: rest })

  return blocks
}

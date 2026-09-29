/**
 * THE ONE PLACE that decides what an article body looks like on a site, used
 * by all three who show it:
 *   - the article-design preview in the settings (components/settings/ArticleStylePreview),
 *   - the article view in the dashboard (components/content/article-style/StyledArticleBody),
 *   - publishing: WordPress and a custom site's webhook (./publish.ts → applyArticleDesign).
 *
 * The owner saw a call-to-action box in the preview that the published article
 * did not have (wave 8): the preview drew a sample whose last paragraph always
 * carried a link, and the design turns such a paragraph into the box, while a
 * real generated article rarely ends with a link. Now the box is the project's
 * own call to action (./cta.ts), and the preview, the view and the site all
 * get it from this function, so what the preview shows is what is published.
 *
 * Shopify and Wix stay minimal and without a call to action (effectiveDesign,
 * siteCta). Minimal with no call to action returns the body untouched: exactly
 * today's output.
 *
 * Pure: no I/O, safe in the browser and on the server.
 */
import { siteCta, type ArticleCta } from './cta'
import { styleArticleHtml, type ArticleDesignOptions } from './html'
import type { ArticleLanguage } from './labels'
import { effectiveDesign, type ArticleStyle, type DesignPlatform } from './types'

export type SiteDesignInput = {
  style: Pick<ArticleStyle, 'design' | 'brandColors'>
  cta: ArticleCta | null | undefined
  platform: DesignPlatform
  language?: ArticleLanguage
}

/** The design options a site receives, or null when the body goes out untouched. */
export function siteDesignOptions(input: SiteDesignInput): ArticleDesignOptions | null {
  const design = effectiveDesign(input.style, input.platform)
  const cta = siteCta(input.cta, input.platform)
  if (design !== 'formatted' && !cta) return null
  return { design, colors: input.style.brandColors, cta, ...(input.language ? { language: input.language } : {}) }
}

/** The body as the site shows it. */
export function designForSite(html: string, input: SiteDesignInput): string {
  const opts = siteDesignOptions(input)
  return opts ? styleArticleHtml(html, opts) : html
}

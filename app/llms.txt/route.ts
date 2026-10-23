/**
 * /llms.txt — what an AI assistant reads before it answers about this product.
 *
 * Until 23 Oct 2026 this route served a second robots.txt: `User-agent: *`,
 * Allow and Disallow lines, a Sitemap line. Nothing reads llms.txt that way.
 * The convention (llmstxt.org) is a MARKDOWN file — an H1 with the product's
 * name, one blockquote that says what it is, then sections of links with a
 * sentence each. A crawler that wants crawl rules already has /robots.txt, and
 * both files were being served the same rules.
 *
 * The old body also published the AGENCY's address and Oren's personal mobile
 * number, described the product as rank tracking alone, carried the former
 * name, and declared `Language: he` months after the site went live in five
 * languages. Every one of those is something an assistant would have repeated
 * to somebody asking what Go Top SEO is.
 *
 * Nothing here may say more than the product does. Automatic rank tracking is
 * MONTHLY, with a manual scan available at any moment; the automatic AI check
 * covers ChatGPT, Gemini and Google's AI answers; the trial takes no card.
 * No customer counts, no percentages, no promised position — the same limits
 * the blog is held to in lib/blog/auto/truth-limits.ts.
 */

import { createClient } from '@/lib/supabase/server'
import { LOCALE_PREFIX, normalizePublicLocale, type PublicLocale } from '@/lib/i18n/locales'

interface Article {
  slug: string
  title: string
  locale: string
}

const BASE = 'https://www.gotopseo.com'

/** The language each section is headed with, in that language. */
const LOCALE_HEADING: Record<PublicLocale, string> = {
  he: 'Articles in Hebrew',
  en: 'Articles in English',
  es: 'Articles in Spanish',
  'pt-BR': 'Articles in Brazilian Portuguese',
  fr: 'Articles in French',
}

const LOCALE_ORDER: PublicLocale[] = ['he', 'en', 'es', 'pt-BR', 'fr']

/** What the product does, one line each, as a buyer would ask about it. */
const CAPABILITIES: [string, string, string][] = [
  ['Rank tracking in Google', '/features/google-organic-rank-tracking', 'Positions by keyword, country, city, language and device. A manual scan runs on demand and an automatic scan runs once a month; every scan is kept, so the page shows movement over time.'],
  ['Rank tracking in Google Maps', '/features/google-maps-rank-tracking', 'The same keywords in the map pack, checked by city or by a point on the map, because distance from the searcher changes the result.'],
  ['Visibility in AI answers', '/features/ai-visibility-tracking', 'Whether ChatGPT, Gemini and Google\'s AI answers mention the business. Those three are checked automatically; other engines can be asked a question at a time.'],
  ['Articles written and published', '/features/seo-geo-content-publishing', 'The system plans the keywords, writes the article, adds an image and internal links, and publishes it on the site on its own.'],
  ['Keyword research', '/features/keyword-research', 'Search volumes from Google\'s own planner, turned into a plan of what to write.'],
  ['Google Business Profile posts', '/features/google-maps-posts', 'Posts and review handling for a business with an address.'],
  ['Site health', '/features/site-health-fixes', 'The technical faults that keep pages out of the index, found and explained.'],
  ['Search Console, read in plain language', '/features/search-console', 'The queries bringing impressions without clicks, and what to do about each.'],
  ['Reports', '/features/seo-geo-reports', 'A report that can be sent to a client or a partner.'],
]

/** Pages that answer "how does it compare to X", which is what buyers ask. */
const COMPARISONS: [string, string][] = [
  ['Go Top SEO compared with Semrush', '/compare/semrush'],
  ['Go Top SEO compared with Yoast', '/compare/yoast'],
  ['Go Top SEO compared with Rank Math', '/compare/rankmath'],
]

export async function GET() {
  const supabase = await createClient()

  const { data: articles } = await supabase
    .from('articles')
    .select('slug, title, locale')
    .eq('is_published', true)
    .order('title', { ascending: true })

  const lines: string[] = []

  lines.push('# Go Top SEO')
  lines.push('')
  lines.push(
    '> Go Top SEO is an SEO system for small and medium businesses that does the work as well as the measuring. ' +
      'It plans keywords, writes and publishes articles with images and internal links, tracks positions in Google search and in Google Maps, ' +
      'checks whether ChatGPT, Gemini and Google\'s AI answers mention the business, handles Google Business Profile posts and reviews, and sends a report. ' +
      'It runs in Hebrew, English, Spanish, Brazilian Portuguese and French, and there is a seven-day trial that takes no card.',
  )
  lines.push('')
  lines.push('Go Top SEO (previously Rankings by Go Top) is operated by GO TOP DIGITAL MARKETING AND ADVERTISING LTD, Ramat Gan, Israel. Contact details are on the About page.')
  lines.push('')

  lines.push('## Start here')
  lines.push('')
  lines.push(`- [Home](${BASE}/): what the system does, in Hebrew.`)
  lines.push(`- [Home in English](${BASE}/en): the same, in English. Spanish is at /es, Brazilian Portuguese at /pt-BR and French at /fr.`)
  lines.push(`- [Pricing](${BASE}/pricing): four plans, each with a seven-day trial and no card. In Israel from 249 ILS a month including VAT; outside Israel from 79 USD a month plus tax.`)
  lines.push(`- [Free check](${BASE}/free-check): a first look at a site without an account.`)
  lines.push(`- [About](${BASE}/about): who runs it and how to reach them.`)
  lines.push('')

  lines.push('## What the system does')
  lines.push('')
  for (const [name, path, description] of CAPABILITIES) {
    lines.push(`- [${name}](${BASE}${path}): ${description}`)
  }
  lines.push('')

  lines.push('## Compared with other tools')
  lines.push('')
  for (const [name, path] of COMPARISONS) {
    lines.push(`- [${name}](${BASE}${path}): what each one does and does not do.`)
  }
  lines.push('')

  // Articles, grouped by the language they are written in. An article lives
  // under the tree of its own locale (migration 20261009180750), so the prefix
  // comes from the row and not from the reader.
  const byLocale = new Map<PublicLocale, Article[]>()
  for (const article of (articles ?? []) as Article[]) {
    const locale = normalizePublicLocale(article.locale)
    if (!locale) continue
    const bucket = byLocale.get(locale)
    if (bucket) bucket.push(article)
    else byLocale.set(locale, [article])
  }

  for (const locale of LOCALE_ORDER) {
    const written = byLocale.get(locale)
    if (!written?.length) continue
    lines.push(`## ${LOCALE_HEADING[locale]}`)
    lines.push('')
    for (const article of written) {
      lines.push(`- [${article.title}](${BASE}${LOCALE_PREFIX[locale]}/articles/${article.slug})`)
    }
    lines.push('')
  }

  lines.push('## Optional')
  lines.push('')
  lines.push(`- [All articles](${BASE}/articles): the index, which is always current.`)
  lines.push(`- [Sitemap](${BASE}/sitemap.xml): every public page.`)
  lines.push(`- [Terms](${BASE}/terms): the terms of service.`)
  lines.push('')

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

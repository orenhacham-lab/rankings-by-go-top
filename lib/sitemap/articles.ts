/**
 * The article list of the HUMAN site map, for one language.
 *
 * WHY THIS FILE EXISTS. The Hebrew map (`app/(public)/sitemap/page.tsx`) read
 * `articles` with `is_published` and NO locale filter, in the browser, and
 * printed every row as `/articles/<slug>`. An article lives under the tree of
 * its own language, so on 12.11.2026 the page advertised 157 links of which
 * 125 led to "מאמר לא נמצא" — measured in production on
 * /articles/what-is-a-metasearch-engine, an English slug under the Hebrew
 * tree. `app/sitemap.xml/route.ts` had the same defect and was fixed there
 * alone; the human page was never brought in line.
 *
 * `.eq('locale', locale)` is the contract, the same one `ArticlesIndex` and
 * `getPublicArticle` apply: a map shows the articles of its own language, and
 * the site's language never switches between pages. `articleHref` builds the
 * path from the locale rather than by hand, so there is one place that knows
 * Hebrew has no prefix.
 *
 * Read on the SERVER, with the anon key under RLS (only `is_published` rows
 * are visible), so the titles are in the HTML a crawler receives — the reason
 * this page exists at all.
 */
import { createClient } from '@/lib/supabase/server'
import { articleHref } from '@/lib/articles/i18n'
import type { PublicLocale } from '@/lib/i18n/locales'

export interface SitemapLink {
  label: string
  href: string
}

export async function sitemapArticleLinks(locale: PublicLocale): Promise<SitemapLink[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select('slug, title')
    .eq('is_published', true)
    .eq('locale', locale)
    .order('title', { ascending: true })

  return (data ?? [])
    .filter((row): row is { slug: string; title: string } => Boolean(row?.slug && row?.title))
    .map((row) => ({ label: row.title, href: articleHref(locale, row.slug) }))
}

/** The section the maps append, or nothing when the language has no articles yet. */
export function sitemapArticleSection(
  title: string,
  links: SitemapLink[],
): Array<{ title: string; links: SitemapLink[] }> {
  return links.length > 0 ? [{ title, links }] : []
}

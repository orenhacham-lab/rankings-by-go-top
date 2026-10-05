import { createClient } from '@/lib/supabase/server'
import { spanishSiteEnabled } from '@/lib/i18n/spanish-site'
import { portugueseSiteEnabled } from '@/lib/i18n/portuguese-site'

interface Article {
  slug: string
  published_at: string
}

/**
 * A STATIC public/sitemap.xml USED TO SHADOW THIS ROUTE.
 *
 * A file in public/ is served before a route of the same path, so until it was
 * deleted (5 October 2026) every request for /sitemap.xml got a hand-written
 * file last touched on 30 September with five URLs in it: the home page, login,
 * articles, privacy and accessibility. Everything this route builds — pricing,
 * about, the six feature pages, the English tree, the whole Spanish tree, every
 * published article — was never submitted to Google at all, while the route
 * looked right in the repository. robots.txt points at this path, so there was
 * nothing else to notice.
 *
 * lib/i18n/__qa__/portuguese-public-site.qa.ts fails if the file comes back.
 */
export async function GET() {
  const supabase = await createClient()

  // Fetch all published articles
  const { data: articles } = await supabase
    .from('articles')
    .select('slug, published_at')
    .eq('is_published', true)
    .order('published_at', { ascending: false })

  const baseUrl = 'https://www.gotopseo.com'
  const today = new Date().toISOString().split('T')[0]

  // Build static pages
  const staticPages = [
    {
      url: baseUrl,
      lastmod: today,
      changefreq: 'weekly',
      priority: '1.0',
    },
    {
      url: `${baseUrl}/free-check`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.9',
    },
    {
      url: `${baseUrl}/pricing`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.9',
    },
    {
      url: `${baseUrl}/about`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.8',
    },
    {
      url: `${baseUrl}/affiliates`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.6',
    },
    {
      url: `${baseUrl}/articles`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.8',
    },
    {
      url: `${baseUrl}/sitemap`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.7',
    },
    // Hebrew feature pages
    {
      url: `${baseUrl}/features/seo-geo-content-publishing`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.8',
    },
    {
      url: `${baseUrl}/features/google-organic-rank-tracking`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.8',
    },
    {
      url: `${baseUrl}/features/google-maps-rank-tracking`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.8',
    },
    {
      url: `${baseUrl}/features/ai-visibility-tracking`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.8',
    },
    {
      url: `${baseUrl}/features/seo-geo-reports`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.8',
    },
    {
      url: `${baseUrl}/features/keyword-research`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.8',
    },
    // Hebrew legal pages
    {
      url: `${baseUrl}/privacy`,
      lastmod: today,
      changefreq: 'yearly',
      priority: '0.3',
    },
    {
      url: `${baseUrl}/terms`,
      lastmod: today,
      changefreq: 'yearly',
      priority: '0.3',
    },
    {
      url: `${baseUrl}/refund-policy`,
      lastmod: today,
      changefreq: 'yearly',
      priority: '0.3',
    },
    {
      url: `${baseUrl}/accessibility`,
      lastmod: today,
      changefreq: 'yearly',
      priority: '0.3',
    },
    // English site root and equivalents
    {
      url: `${baseUrl}/en`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.9',
    },
    {
      url: `${baseUrl}/en/free-check`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.8',
    },
    {
      url: `${baseUrl}/en/pricing`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.8',
    },
    {
      url: `${baseUrl}/en/about`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.7',
    },
    {
      url: `${baseUrl}/en/affiliates`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.6',
    },
    {
      url: `${baseUrl}/en/articles`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.7',
    },
    // English feature pages
    {
      url: `${baseUrl}/en/features/seo-geo-content-publishing`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.7',
    },
    {
      url: `${baseUrl}/en/features/google-organic-rank-tracking`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.7',
    },
    {
      url: `${baseUrl}/en/features/google-maps-rank-tracking`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.7',
    },
    {
      url: `${baseUrl}/en/features/ai-visibility-tracking`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.7',
    },
    {
      url: `${baseUrl}/en/features/seo-geo-reports`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.7',
    },
    {
      url: `${baseUrl}/en/features/keyword-research`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.7',
    },
    // English legal pages
    {
      url: `${baseUrl}/en/privacy`,
      lastmod: today,
      changefreq: 'yearly',
      priority: '0.3',
    },
    {
      url: `${baseUrl}/en/terms`,
      lastmod: today,
      changefreq: 'yearly',
      priority: '0.3',
    },
    {
      url: `${baseUrl}/en/refund-policy`,
      lastmod: today,
      changefreq: 'yearly',
      priority: '0.3',
    },
    {
      url: `${baseUrl}/en/accessibility`,
      lastmod: today,
      changefreq: 'yearly',
      priority: '0.3',
    },
  ]

  // A TRANSLATED TREE, only once it exists. While a language's flag is off its
  // pages answer 404 (app/(public)/es/layout.tsx, app/(public)/pt-BR/layout.tsx),
  // so listing them here would submit 404s to Google. Legal pages are not
  // listed: the whole legal tree is noindex.
  //
  // ONE list of paths for both languages, because the trees are mirrors: a page
  // added to one and forgotten in the other would otherwise be a sitemap that
  // disagrees with the hreflang built from the same mirror (lib/seo/hreflang.ts).
  const translatedPaths: Array<{ path: string; changefreq: string; priority: string }> = [
    { path: '', changefreq: 'weekly', priority: '0.9' },
    { path: '/free-check', changefreq: 'monthly', priority: '0.8' },
    { path: '/pricing', changefreq: 'monthly', priority: '0.8' },
    { path: '/about', changefreq: 'monthly', priority: '0.7' },
    { path: '/affiliates', changefreq: 'monthly', priority: '0.6' },
    { path: '/articles', changefreq: 'weekly', priority: '0.7' },
    { path: '/sitemap', changefreq: 'weekly', priority: '0.6' },
    { path: '/features/seo-geo-content-publishing', changefreq: 'monthly', priority: '0.7' },
    { path: '/features/google-organic-rank-tracking', changefreq: 'monthly', priority: '0.7' },
    { path: '/features/google-maps-rank-tracking', changefreq: 'monthly', priority: '0.7' },
    { path: '/features/ai-visibility-tracking', changefreq: 'monthly', priority: '0.7' },
    { path: '/features/seo-geo-reports', changefreq: 'monthly', priority: '0.7' },
    { path: '/features/keyword-research', changefreq: 'monthly', priority: '0.7' },
  ]

  const treePages = (prefix: string) =>
    translatedPaths.map((p) => ({ url: `${baseUrl}${prefix}${p.path}`, lastmod: today, changefreq: p.changefreq, priority: p.priority }))

  const spanishPages = spanishSiteEnabled() ? treePages('/es') : []
  const portuguesePages = portugueseSiteEnabled() ? treePages('/pt-BR') : []

  // Build article entries
  const articleEntries = (articles || []).map((article: Article) => ({
    url: `${baseUrl}/articles/${article.slug}`,
    lastmod: article.published_at?.split('T')[0] || today,
    changefreq: 'monthly',
    priority: '0.7',
  }))

  // Combine all entries
  const allEntries = [...staticPages, ...spanishPages, ...portuguesePages, ...articleEntries]

  // Build XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${allEntries
  .map(
    (entry) => `  <url>
    <loc>${entry.url}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

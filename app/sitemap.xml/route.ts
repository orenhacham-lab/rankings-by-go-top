import { createClient } from '@/lib/supabase/server'

interface Article {
  slug: string
  published_at: string
}

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
      url: `${baseUrl}/en/accessibility`,
      lastmod: today,
      changefreq: 'yearly',
      priority: '0.3',
    },
  ]

  // Build article entries
  const articleEntries = (articles || []).map((article: Article) => ({
    url: `${baseUrl}/articles/${article.slug}`,
    lastmod: article.published_at?.split('T')[0] || today,
    changefreq: 'monthly',
    priority: '0.7',
  }))

  // Combine all entries
  const allEntries = [...staticPages, ...articleEntries]

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

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

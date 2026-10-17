import { createClient } from '@/lib/supabase/server'
import { LOCALE_PREFIX, normalizePublicLocale } from '@/lib/i18n/locales'

interface Article {
  slug: string
  title: string
  locale: string
}

export async function GET() {
  const supabase = await createClient()

  // Fetch all published articles
  const { data: articles } = await supabase
    .from('articles')
    .select('slug, title, locale')
    .eq('is_published', true)
    .order('title', { ascending: true })

  const baseUrl = 'https://www.gotopseo.com'

  // Build the llms.txt content
  let content = `# LLMs.txt - AI Agent Guidelines for Go Top SEO
# https://llms.txt

User-agent: *
Disallow: /admin
Disallow: /dashboard
Disallow: /api
Disallow: /login
Disallow: /privacy
Disallow: /accessibility

Allow: /
Allow: /about
Allow: /articles
Allow: /sitemap

Sitemap: ${baseUrl}/sitemap.xml

# Contact Information
Contact: oren@gotop.co.il
Phone: 054-9489377

# Company Information
Name: Go Top SEO (previously Rankings by Go Top)
Description: Advanced location tracking system for SEO promotion - Google organic results and Google Maps rankings
Website: ${baseUrl}
Language: he
Country: IL

# Services
- Location ranking monitoring
- SEO promotion tools
- Google Maps optimization
- Rank tracking system
- Website performance analysis

# Published Articles
`

  // Add all published articles
  if (articles && articles.length > 0) {
    articles.forEach((article: Article) => {
      // Under the tree of the language it is written in: `articles.locale`
      // (migration 20261009180750). The Hebrew path was right while the blog
      // was Hebrew-only and became a 404 for every other language.
      const prefix = LOCALE_PREFIX[normalizePublicLocale(article.locale) ?? 'he']
      content += `- ${article.title}: ${baseUrl}${prefix}/articles/${article.slug}\n`
    })
  }

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

import { createClient } from '@/lib/supabase/server'

interface Article {
  id: string
  slug: string
  title: string
  meta_description?: string
  excerpt?: string
  content?: string
  featured_image_url?: string
  featured_image_alt?: string
  author?: string
  published_at?: string
}

function extractFaqSchema(content: string): Array<{ '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }> {
  const faqSchema: Array<{ '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }> = []

  const faqSectionMatch = content.match(/<h2[^>]*>[^<]*שאלות נפוצות[^<]*<\/h2>([\s\S]*?)(?=<h2|$)/i)
  if (!faqSectionMatch) return faqSchema

  const faqContent = faqSectionMatch[1]
  const pRegex = /<p[^>]*>\s*<strong[^>]*>([^<]+)<\/strong>\s*<br\s*\/?>\s*([^<]+)<\/p>/gi
  let match

  while ((match = pRegex.exec(faqContent)) !== null) {
    const question = match[1]?.trim()
    const answer = match[2]?.trim()

    if (question && answer) {
      faqSchema.push({
        '@type': 'Question',
        name: question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: answer,
        },
      })
    }
  }

  return faqSchema
}

export async function GET() {
  const supabase = await createClient()

  // Fetch all published articles
  const { data: articles } = await supabase
    .from('articles')
    .select('id, slug, title, meta_description, excerpt, content, featured_image_url, featured_image_alt, author, published_at')
    .eq('is_published', true)
    .order('published_at', { ascending: false })

  const baseUrl = 'https://www.gotopseo.com'

  // Organization schema
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Rankings by Go Top',
    url: baseUrl,
    logo: `${baseUrl}/gotop-primary.png`,
    description: 'Advanced location tracking system for SEO promotion - Google organic results and Google Maps rankings',
    sameAs: [],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      email: 'oren@gotop.co.il',
      telephone: '054-9489377',
    },
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'IL',
    },
  }

  // SoftwareApplication schema
  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Rankings by Go Top',
    applicationCategory: 'BusinessApplication',
    description: 'Advanced SEO rank tracking system for monitoring Google search and Google Maps rankings',
    url: baseUrl,
    offers: {
      '@type': 'Offer',
      price: 'varies',
      priceCurrency: 'ILS',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '5',
      ratingCount: '100',
    },
  }

  // Generate article schemas
  const articleSchemas = (articles || []).map((article: Article) => ({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.meta_description || article.excerpt,
    url: `${baseUrl}/articles/${article.slug}`,
    ...(article.featured_image_url && {
      image: article.featured_image_url,
    }),
    ...(article.author && {
      author: {
        '@type': 'Person',
        name: article.author,
      },
    }),
    ...(article.published_at && {
      datePublished: article.published_at,
    }),
    publisher: {
      '@type': 'Organization',
      name: 'Rankings by Go Top',
      logo: {
        '@type': 'ImageObject',
        url: `${baseUrl}/gotop-primary.png`,
      },
    },
  }))

  // Generate FAQ schemas for articles with FAQ sections
  const faqSchemas = (articles || [])
    .filter((article) => article.content)
    .map((article) => {
      const faqSchema = extractFaqSchema(article.content || '')
      if (faqSchema.length === 0) return null

      return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        url: `${baseUrl}/articles/${article.slug}`,
        mainEntity: faqSchema,
      }
    })
    .filter(Boolean)

  // Combined schema response
  const combinedSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@graph': [
      organizationSchema,
      softwareSchema,
      ...articleSchemas,
      ...faqSchemas,
    ],
  }

  return Response.json(combinedSchema, {
    headers: {
      'Content-Type': 'application/ld+json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

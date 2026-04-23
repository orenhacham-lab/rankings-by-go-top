import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

async function getArticleData(slug: string) {
  const supabase = await createClient()
  const { data: article } = await supabase
    .from('articles')
    .select('title, meta_description, excerpt, content, featured_image_url, featured_image_alt, author, published_at')
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  return article
}

function extractFaqSchema(content: string): Array<{ '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }> {
  const faqSchema: Array<{ '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }> = []

  // Find FAQ section - h2 containing "שאלות נפוצות"
  const faqSectionMatch = content.match(/<h2[^>]*>[^<]*שאלות נפוצות[^<]*<\/h2>([\s\S]*?)(?=<h2|$)/i)
  if (!faqSectionMatch) return faqSchema

  const faqContent = faqSectionMatch[1]

  // Match each <p> containing <strong>question</strong><br>answer
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

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const article = await getArticleData(slug)

  if (!article) {
    return {
      title: 'מאמר לא נמצא | Rankings by Go Top',
      description: 'המאמר המבוקש אינו קיים או הוסר',
    }
  }

  const description = article.meta_description || article.excerpt || `מאמר בנושא ${article.title} מאת Rankings by Go Top`
  const url = `https://www.gotopseo.com/articles/${slug}`

  return {
    title: `${article.title} | Rankings by Go Top`,
    description,
    openGraph: {
      title: article.title,
      description,
      url,
      type: 'article',
      ...(article.featured_image_url && {
        images: [
          {
            url: article.featured_image_url,
            alt: article.featured_image_alt || article.title,
          },
        ],
      }),
      ...(article.published_at && {
        publishedTime: article.published_at,
      }),
      ...(article.author && {
        authors: [article.author],
      }),
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description,
      ...(article.featured_image_url && {
        images: [article.featured_image_url],
      }),
    },
    alternates: {
      canonical: url,
    },
  }
}

export default async function ArticleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const article = await getArticleData(slug)

  const faqSchema = article?.content ? extractFaqSchema(article.content) : []
  const articleUrl = `https://www.gotopseo.com/articles/${slug}`

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'דף הבית',
        item: 'https://www.gotopseo.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'מאמרים',
        item: 'https://www.gotopseo.com/articles',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: article?.title || 'מאמר',
        item: articleUrl,
      },
    ],
  }

  const articleSchema = article
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: article.meta_description || article.excerpt,
        ...(article.featured_image_url && {
          image: article.featured_image_url,
        }),
        ...(article.author && {
          author: {
            '@type': 'Person',
            name: article.author,
            url: 'https://www.gotopseo.com',
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
            url: 'https://www.gotopseo.com/gotop-primary.png',
          },
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': articleUrl,
        },
      }
    : null

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {articleSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
        />
      )}
      {faqSchema.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: faqSchema,
            }),
          }}
        />
      )}
      {children}
    </>
  )
}

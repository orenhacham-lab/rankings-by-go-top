import type { Metadata } from 'next'
import { buildArticleMetadata, buildArticleSchemas, getPublicArticle } from '@/lib/articles/server'
import { jsonForScriptTag } from '@/lib/content/public-article-html'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  return buildArticleMetadata(slug, 'de')
}

export default async function ArticleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const article = await getPublicArticle(slug, 'de')
  const { breadcrumbSchema, articleSchema, faqSchema } = buildArticleSchemas(article, slug, 'de')

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScriptTag(breadcrumbSchema) }} />
      {articleSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScriptTag(articleSchema) }} />
      )}
      {faqSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScriptTag(faqSchema) }} />
      )}
      {children}
    </>
  )
}

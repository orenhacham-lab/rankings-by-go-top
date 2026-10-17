import { ArticleView } from '@/components/public/articles/ArticleView'

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ArticleView locale="en" slug={slug} />
}

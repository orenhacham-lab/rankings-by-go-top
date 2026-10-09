import { use } from 'react'
import { ArticleView } from '@/components/public/articles/ArticleView'

export default function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return <ArticleView locale="pt-BR" slug={slug} />
}

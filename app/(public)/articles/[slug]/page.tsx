'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'

interface Article {
  id: string
  slug: string
  title: string
  content: string
  author: string | null
  published_at: string | null
}

export default function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function loadArticle() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('articles')
        .select('id, slug, title, content, author, published_at')
        .eq('slug', slug)
        .eq('is_published', true)
        .single()

      if (error || !data) {
        setNotFound(true)
      } else {
        setArticle(data)
      }
      setLoading(false)
    }

    loadArticle()
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
        <div className="flex items-center justify-center py-20 text-slate-400">
          <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
          טוען...
        </div>
      </div>
    )
  }

  if (notFound || !article) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
        <div className="max-w-3xl mx-auto py-12 px-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <h1 className="text-2xl font-bold text-slate-900 mb-4">מאמר לא נמצא</h1>
            <p className="text-slate-600 mb-6">המאמר שחיפשת אינו קיים או הוסר</p>
            <Link href="/articles">
              <Button>← חזור למאמרים</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      <div className="max-w-3xl mx-auto py-12 px-4">
        <Link href="/articles" className="text-blue-600 hover:underline mb-6 inline-block">
          ← חזור למאמרים
        </Link>

        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            {article.title}
          </h1>

          <div className="flex items-center gap-4 pb-6 border-b border-slate-200 mb-8">
            {article.author && (
              <span className="text-sm text-slate-600">
                <span className="font-medium">מאת:</span> {article.author}
              </span>
            )}
            {article.published_at && (
              <span className="text-sm text-slate-500">
                {new Date(article.published_at).toLocaleDateString('he-IL', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            )}
          </div>

          <div
            className="prose prose-sm max-w-none text-slate-700 article-content"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        </article>
      </div>
    </div>
  )
}

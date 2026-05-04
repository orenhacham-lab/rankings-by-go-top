'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'

interface Article {
  id: string
  slug: string
  title: string
  excerpt: string | null
  author: string | null
  published_at: string | null
  featured_image_url: string | null
  featured_image_alt: string | null
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadArticles() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('articles')
        .select('id, slug, title, excerpt, author, published_at, featured_image_url, featured_image_alt')
        .eq('is_published', true)
        .order('published_at', { ascending: false })

      if (!error && data) {
        setArticles(data)
      }
      setLoading(false)
    }

    loadArticles()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
        <PublicNav />
        <div className="flex items-center justify-center pt-32 pb-20 text-slate-400">
          <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
          טוען...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
      <PublicNav />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto pt-28 pb-12 px-4">
          <Breadcrumbs items={[{ label: 'מאמרים', href: '/articles' }]} />
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">מאמרים</h1>
            <p className="text-slate-600">מאמרים וטיפים בנושאי קידום אתרים, שיווק דיגיטלי וטכנולוגיה</p>
          </div>

        {articles.length === 0 ? null : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {articles.map((article) => (
              <Link key={article.id} href={`/articles/${article.slug}`}>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col">
                  {article.featured_image_url ? (
                    <div className="relative w-full h-48 bg-slate-200">
                      <Image
                        src={article.featured_image_url}
                        alt={article.featured_image_alt || article.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-blue-200 to-blue-100 flex items-center justify-center">
                      <span className="text-slate-400">אין תמונה</span>
                    </div>
                  )}

                  <div className="p-6 flex flex-col flex-1">
                    <h2 className="text-xl font-bold text-slate-900 mb-2 line-clamp-2">
                      {article.title}
                    </h2>

                    {article.excerpt && (
                      <p className="text-slate-600 text-sm mb-4 line-clamp-3 flex-1">
                        {article.excerpt}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 mb-4">
                      {article.author && (
                        <span className="text-xs text-slate-500">
                          {article.author}
                        </span>
                      )}
                      {article.published_at && (
                        <span className="text-xs text-slate-400">
                          {new Date(article.published_at).toLocaleDateString('he-IL')}
                        </span>
                      )}
                    </div>

                    <span className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                      לקריאה &gt;&gt;
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
        </div>
      </div>
      <Footer />
    </div>
  )
}

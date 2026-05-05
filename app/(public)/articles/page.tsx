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

        {/* Software Promo Section */}
        <div className="mt-16 space-y-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 p-8 lg:p-12 shadow-2xl">
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />

            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div className="text-white">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-white text-xs font-semibold mb-4">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Rankings by Go Top
                </div>
                <h3 className="text-3xl lg:text-4xl font-extrabold mb-4 leading-tight">
                  עקוב אחר הדירוגים שלך<br />בגוגל בזמן אמת
                </h3>
                <p className="text-blue-100 text-lg mb-6 leading-relaxed">
                  מערכת מקצועית למעקב מיקומים בגוגל אורגני וגוגל מפות. דוחות מפורטים, מעקב מגמות ותמיכה אישית בעברית.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/login"
                    className="px-6 py-3 rounded-xl bg-white text-blue-600 font-semibold text-base shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all"
                  >
                    התחל ניסיון חינם
                  </Link>
                  <Link
                    href="/pricing"
                    className="px-6 py-3 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-white font-semibold text-base hover:bg-white/20 transition-all"
                  >
                    צפה במחירים
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { num: '1000+', label: 'מילות מפתח' },
                  { num: '24/7', label: 'מעקב רציף' },
                  { num: '100%', label: 'בעברית' },
                  { num: '7 ימים', label: 'ניסיון חינם' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white/10 backdrop-blur rounded-2xl p-4 lg:p-6 border border-white/20">
                    <div className="text-2xl lg:text-3xl font-extrabold text-white mb-1">{stat.num}</div>
                    <div className="text-sm text-blue-100">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: 'גוגל אורגני',
                desc: 'מעקב אחרי דירוגים בעמודי 1-2 בגוגל עם תוצאות מדויקות',
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                ),
              },
              {
                title: 'גוגל מפות',
                desc: 'מעקב לפי מיקום גיאוגרפי מדויק - עיר, מיקוד, נקודת ציון',
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ),
              },
              {
                title: 'דוחות מקצועיים',
                desc: 'יצוא דוחות PDF ו-Excel עם מגמות, השוואות וניתוח מתקדם',
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                ),
              },
            ].map((feat) => (
              <div key={feat.title} className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-lg transition-all">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center mb-4 shadow-md">
                  {feat.icon}
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">{feat.title}</h4>
                <p className="text-sm text-slate-600 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}

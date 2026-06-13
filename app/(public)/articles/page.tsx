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

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav />

      {/* Hero Section */}
      <section className="relative pt-28 lg:pt-36 pb-16 lg:pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.15),_transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgb(226 232 240) 1px, transparent 1px), linear-gradient(to bottom, rgb(226 232 240) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 60% 50% at 50% 30%, black, transparent)',
          }}
        />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'מאמרים', href: '/articles' }]} />

          <div className="text-center mt-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs lg:text-sm font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              בלוג Rankings by Go Top
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight mb-4">
              מאמרים, מדריכים <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">ותובנות</span>
            </h1>
            <p className="text-lg lg:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              תכנים מקצועיים בנושאי קידום אתרים, נראות ב-AI, שיווק דיגיטלי וטכנולוגיה — מהצוות של Go Top.
            </p>
          </div>
        </div>
      </section>

      <main className="flex-1 pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-500">
              <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
              טוען מאמרים...
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-lg text-slate-600">בקרוב יפורסמו כאן מאמרים חדשים.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((article) => (
                <Link key={article.id} href={`/articles/${article.slug}`} className="group">
                  <article className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:border-blue-300 transition-all duration-300 h-full flex flex-col">
                    {article.featured_image_url ? (
                      <div className="relative w-full aspect-[16/9] bg-slate-100 overflow-hidden">
                        <Image
                          src={article.featured_image_url}
                          alt={article.featured_image_alt || article.title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                    ) : (
                      <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-blue-100 via-indigo-100 to-purple-100 flex items-center justify-center overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,_rgba(255,255,255,0.5),_transparent_50%)]" />
                        <svg className="relative w-16 h-16 text-blue-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                        </svg>
                      </div>
                    )}

                    <div className="p-6 flex flex-col flex-1">
                      <h2 className="text-xl font-bold text-slate-900 mb-3 line-clamp-2 group-hover:text-blue-600 transition-colors">
                        {article.title}
                      </h2>

                      {article.excerpt && (
                        <p className="text-slate-600 text-sm mb-4 line-clamp-3 leading-relaxed flex-1">
                          {article.excerpt}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                        <div className="flex flex-col">
                          {article.author && (
                            <span className="text-xs font-medium text-slate-700">
                              {article.author}
                            </span>
                          )}
                          {article.published_at && (
                            <span className="text-xs text-slate-400">
                              {new Date(article.published_at).toLocaleDateString('he-IL')}
                            </span>
                          )}
                        </div>
                        <span className="inline-flex items-center gap-1 text-blue-600 group-hover:text-blue-700 font-semibold text-sm">
                          לקריאת המאמר
                          <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}

          {/* Software Promo Section */}
          <div className="mt-20 space-y-8">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-500 p-8 lg:p-12 shadow-2xl">
              <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />

              <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div className="text-white">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-white text-xs font-semibold mb-4">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    Rankings by Go Top
                  </div>
                  <h3 className="text-3xl lg:text-4xl font-extrabold mb-4 leading-tight">
                    עקבו אחר הדירוגים שלכם<br />בגוגל בזמן אמת
                  </h3>
                  <p className="text-blue-100 text-lg mb-6 leading-relaxed">
                    מערכת מקצועית למעקב מיקומים בגוגל אורגני וגוגל מפות. דוחות מפורטים, מעקב מגמות ותמיכה אישית בעברית.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href="/signup"
                      className="px-6 py-3 rounded-xl bg-white text-blue-600 font-semibold text-base shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all"
                    >
                      התחילו ניסיון חינם
                    </Link>
                    <Link
                      href="/pricing"
                      className="px-6 py-3 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-white font-semibold text-base hover:bg-white/20 transition-all"
                    >
                      צפו במחירים
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
                  desc: 'מעקב אחר דירוגים בעמודי 1-2 בגוגל עם תוצאות מדויקות',
                  icon: (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  ),
                },
                {
                  title: 'גוגל מפות',
                  desc: 'מעקב לפי מיקום גיאוגרפי מדויק — עיר, מיקוד, נקודת ציון',
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
      </main>
      <Footer />
    </div>
  )
}

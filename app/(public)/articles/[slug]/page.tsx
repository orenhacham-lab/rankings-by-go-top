'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'

// ============================================================
// ARTICLE ACCESS CONTROL NOTE
// ============================================================
// Articles are accessible via direct URL /articles/[slug]
// SECURITY: RLS ensures only published articles (is_published=true) are readable
// DISCOVERY: Articles are ONLY linked from /articles listing page
// LIMITATION: Direct URL access is technically possible if user knows the slug
//   This is standard web app behavior - cannot be prevented without:
//   - Token-based access (overkill for public content)
//   - Infrastructure-level reverse proxy rules
// MITIGATION: No internal links point directly to article URLs
//   Articles are only discoverable via /articles page

interface Article {
  id: string
  slug: string
  title: string
  content: string
  author: string | null
  published_at: string | null
  featured_image_url: string | null
  featured_image_alt: string | null
}

export default function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function loadArticle() {
      if (!slug) {
        setNotFound(true)
        setLoading(false)
        return
      }

      const supabase = createClient()

      // CRITICAL: Only fetch published articles
      // This prevents unauthorized access to unpublished articles
      const { data, error } = await supabase
        .from('articles')
        .select('id, slug, title, content, author, published_at, featured_image_url, featured_image_alt')
        .eq('slug', slug)
        .eq('is_published', true)
        .single()

      if (error || !data) {
        // Not found OR not published - both show 404
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
        <PublicNav />
        <div className="flex items-center justify-center pt-32 pb-20 text-slate-400">
          <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
          טוען...
        </div>
      </div>
    )
  }

  if (notFound || !article) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
        <PublicNav />
        <div className="flex-1">
          <div className="max-w-3xl mx-auto pt-28 pb-12 px-4">
            <Breadcrumbs items={[{ label: 'מאמרים', href: '/articles' }, { label: 'מאמר לא נמצא', href: '#' }]} />
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
              <h1 className="text-2xl font-bold text-slate-900 mb-4">מאמר לא נמצא</h1>
              <p className="text-slate-600 mb-6">המאמר שחיפשת אינו קיים או הוסר</p>
              <div className="flex gap-4 justify-center flex-wrap">
                <Link href="/articles">
                  <Button>← חזור למאמרים</Button>
                </Link>
                <Link href="/">
                  <Button>← חזור לעמוד הבית</Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  // Extract headings for TOC and add IDs
  let headings: Array<{ text: string; id: string; level: number }> = []
  let contentWithIds = article.content

  if (typeof document !== 'undefined') {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = article.content

    Array.from(tempDiv.querySelectorAll('h2, h3')).forEach((heading, index) => {
      const text = heading.textContent || ''
      const baseId = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-֐-׿]/g, '')
      const id = baseId || `heading-${index}`
      heading.id = id

      headings.push({
        text,
        id,
        level: parseInt(heading.tagName[1]),
      })
    })

    contentWithIds = tempDiv.innerHTML
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav />
      <div className="flex-1">
        {/* Article Hero with gradient background */}
        <div className="relative pt-28 lg:pt-32 pb-8 bg-gradient-to-br from-blue-50 via-white to-indigo-50 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.1),_transparent_50%)]" />
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <Breadcrumbs items={[{ label: 'מאמרים', href: '/articles' }, { label: article.title, href: '#' }]} />
          </div>
        </div>

        <div className="max-w-4xl mx-auto pb-12 px-4 sm:px-6 lg:px-8">
          <article className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden -mt-4">
            {/* Article Header with Image */}
            <div className="flex flex-col lg:flex-row gap-8 p-8 lg:p-10 items-start">
              <div className="flex-1">
                <h1 className="text-3xl lg:text-4xl xl:text-5xl font-extrabold text-slate-900 mb-6 leading-tight tracking-tight">
                  {article.title}
                </h1>

                <div className="flex flex-wrap items-center gap-4 pb-6 border-b border-slate-200">
                  {article.author && (
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                        {article.author.charAt(0)}
                      </div>
                      <span className="text-sm text-slate-700 font-medium">
                        {article.author}
                      </span>
                    </div>
                  )}
                  {article.published_at && (
                    <span className="text-sm text-slate-500 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {new Date(article.published_at).toLocaleDateString('he-IL', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </div>
              </div>

              {/* Article Image */}
              {article.featured_image_url && (
                <div className="lg:w-64 lg:h-64 relative flex-shrink-0">
                  <Image
                    src={article.featured_image_url}
                    alt={article.featured_image_alt || article.title}
                    width={256}
                    height={256}
                    className="w-full h-full object-cover rounded-xl shadow-md"
                  />
                </div>
              )}
            </div>

            {/* Article Content */}
            <div className="px-8 lg:px-10 py-8">
              <div
                className="max-w-none text-slate-700 article-content [&_h2]:scroll-mt-4 [&_h3]:scroll-mt-4 [&_h2]:text-2xl [&_h2]:lg:text-3xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-8 [&_h2]:mb-4 [&_h3]:text-xl [&_h3]:lg:text-2xl [&_h3]:font-bold [&_h3]:text-slate-900 [&_h3]:mt-6 [&_h3]:mb-3 [&_p]:mb-4 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-2 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:space-y-2 [&_ol]:mb-4 [&_a]:text-blue-600 [&_a]:hover:underline [&_strong]:font-bold [&_strong]:text-slate-900"
                dangerouslySetInnerHTML={{ __html: contentWithIds }}
              />
            </div>

            {/* Table of Contents at the end */}
            {headings && headings.length > 0 && (
              <div className="px-8 lg:px-10 py-8 border-t border-slate-200 bg-slate-50">
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 pb-3 border-b border-slate-200 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    תוכן עניינים
                  </h3>
                  <ul className="space-y-2">
                    {headings.map((heading, index) => (
                      <li key={index} style={{ paddingRight: (heading.level - 2) * 16 }}>
                        <a
                          href={`#${heading.id}`}
                          className="text-blue-600 hover:text-blue-700 hover:underline text-sm transition-colors"
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </article>

          {/* Software promotion section */}
          <SoftwarePromoSection />
        </div>
      </div>
      <Footer />
    </div>
  )
}

function SoftwarePromoSection() {
  return (
    <div className="mt-12 space-y-8">
      {/* Hero CTA Card */}
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

          {/* Stats grid */}
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

      {/* Feature highlights */}
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
  )
}

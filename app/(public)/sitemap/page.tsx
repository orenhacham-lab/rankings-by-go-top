'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'
import { createClient } from '@/lib/supabase/client'

interface Article {
  id: string
  slug: string
  title: string
}

interface SitemapSection {
  title: string
  description?: string
  links: Array<{ label: string; href: string }>
}

export default function SitemapPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadArticles() {
      const supabase = createClient()
      const { data } = await supabase
        .from('articles')
        .select('id, slug, title')
        .eq('is_published', true)
        .order('title', { ascending: true })

      if (data) {
        setArticles(data)
      }
      setLoading(false)
    }

    loadArticles()
  }, [])

  const sections: SitemapSection[] = [
    {
      title: 'עמודים באתר',
      links: [
        { label: 'עמוד הבית', href: '/' },
        { label: 'עמוד מחירים', href: '/pricing' },
        { label: 'עמוד אודות', href: '/about' },
        { label: 'עמוד מאמרים', href: '/articles' },
      ],
    },
    {
      title: 'יכולות המערכת',
      links: [
        { label: 'בדיקת מיקום בגוגל אורגני', href: '/features/google-organic-rank-tracking' },
        { label: 'בדיקת מיקום בגוגל מפות', href: '/features/google-maps-rank-tracking' },
        { label: 'מעקב נראות AI', href: '/features/ai-visibility-tracking' },
        { label: 'דוחות SEO/GEO', href: '/features/seo-geo-reports' },
        { label: 'מחקר ביטויים', href: '/features/keyword-research' },
      ],
    },
    {
      title: 'חשבון וחוקים',
      links: [
        { label: 'כניסה לחשבון', href: '/login' },
        { label: 'התחילו ניסיון חינם', href: '/signup' },
        { label: 'מדיניות פרטיות', href: '/privacy' },
        { label: 'תקנון ותנאי שימוש', href: '/terms' },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
      <PublicNav />
      <main className="flex-1 pt-28 pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <Breadcrumbs items={[{ label: 'מפת אתר', href: '/sitemap' }]} />

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-4">מפת אתר</h1>
            <p className="text-slate-600 mb-8">
              כאן תמצאו את כל העמודים והקטגוריות ב-Rankings by Go Top
            </p>

            <div className="space-y-12">
              {sections.map((section, index) => (
                <section key={index}>
                  <h2 className="text-2xl font-bold text-slate-900 mb-4">{section.title}</h2>
                  {section.description && (
                    <p className="text-sm text-slate-600 mb-4">{section.description}</p>
                  )}
                  <ul className="space-y-3">
                    {section.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className="text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-2"
                        >
                          <span>→</span>
                          <span>{link.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {!loading && articles.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold text-slate-900 mb-4">מאמרים באתר</h2>
                  <ul className="space-y-3">
                    {articles.map((article) => (
                      <li key={article.id}>
                        <Link
                          href={`/articles/${article.slug}`}
                          className="text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-2"
                        >
                          <span>→</span>
                          <span>{article.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <div className="mt-8 pt-8 border-t border-slate-200">
              <p className="text-slate-600 text-sm">
                לקבלת מידע נוסף, בקרו ב
                <Link href="/about" className="text-blue-600 hover:underline mx-1">
                  עמוד אודות
                </Link>
                או{' '}
                <a href="mailto:oren@gotop.co.il" className="text-blue-600 hover:underline">
                  צרו קשר
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

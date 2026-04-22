'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'

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
  image_url: string | null
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
        .select('id, slug, title, content, author, published_at, image_url')
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
        <div className="flex items-center justify-center py-20 text-slate-400">
          <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
          טוען...
        </div>
      </div>
    )
  }

  if (notFound || !article) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
        <div className="flex-1">
          <div className="max-w-3xl mx-auto py-12 px-4">
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

  // Extract headings for table of contents
  const tempDiv = typeof document !== 'undefined' ? document.createElement('div') : null
  if (tempDiv) {
    tempDiv.innerHTML = article.content
    var headings = Array.from(tempDiv.querySelectorAll('h2, h3')).map((h) => ({
      text: h.textContent || '',
      id: h.textContent?.toLowerCase().replace(/\s+/g, '-') || '',
      level: parseInt(h.tagName[1]),
    }))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
      <div className="flex-1">
        <div className="max-w-4xl mx-auto py-12 px-4">
          <Breadcrumbs items={[{ label: 'מאמרים', href: '/articles' }, { label: article.title, href: '#' }]} />

          <div className="flex gap-4 mb-8">
            <Link href="/articles" className="text-blue-600 hover:underline text-sm">
              ← חזור למאמרים
            </Link>
            <Link href="/" className="text-blue-600 hover:underline text-sm">
              ← חזור לעמוד הבית
            </Link>
          </div>

          <article className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Article Header with Image */}
            <div className="flex flex-col lg:flex-row gap-8 p-8 items-start">
              <div className="flex-1">
                <h1 className="text-4xl font-bold text-slate-900 mb-4">
                  {article.title}
                </h1>

                <div className="flex flex-wrap items-center gap-4 pb-6 border-b border-slate-200 mb-8">
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
              </div>

              {/* Article Image */}
              {article.image_url && (
                <div className="lg:w-64 lg:h-64 relative flex-shrink-0">
                  <Image
                    src={article.image_url}
                    alt={article.title}
                    width={256}
                    height={256}
                    className="w-full h-full object-cover rounded-lg"
                  />
                </div>
              )}
            </div>

            {/* Table of Contents */}
            {headings && headings.length > 0 && (
              <div className="px-8 py-6 border-t border-slate-200 bg-slate-50">
                <h2 className="font-bold text-slate-900 mb-4">תוכן עניינים</h2>
                <ul className="space-y-2">
                  {headings.map((heading, index) => (
                    <li key={index} style={{ marginRight: (heading.level - 2) * 20 }}>
                      <a href={`#${heading.id}`} className="text-blue-600 hover:underline text-sm">
                        {heading.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Article Content */}
            <div className="px-8 py-8">
              <div
                className="prose prose-sm max-w-none text-slate-700 article-content [&_h2]:scroll-mt-4 [&_h3]:scroll-mt-4"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />
            </div>
          </article>
        </div>
      </div>
      <Footer />
    </div>
  )
}

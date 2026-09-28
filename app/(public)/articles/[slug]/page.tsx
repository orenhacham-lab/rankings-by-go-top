'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { CalendarDays, FileQuestion, ListTree } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import BackLink from '@/components/ui/BackLink'
import { Skeleton } from '@/components/ui/Skeleton'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'
import { CONTAINER } from '@/components/public/marketing'
import { ArticlesPromo, type ArticlesPromoCopy } from '@/components/public/ArticlesPromo'
import { sanitizePublicArticleHtml } from '@/lib/content/public-article-html'
import { authHref } from '@/lib/i18n/auth-href'

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
  meta_title: string | null
  meta_description: string | null
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
        .select('id, slug, title, content, author, published_at, featured_image_url, featured_image_alt, meta_title, meta_description')
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
      <div className="flex min-h-screen flex-col bg-canvas">
        <PublicNav />
        <div className={`${CONTAINER} max-w-4xl flex-1 pt-28 pb-20 lg:pt-32`}>
          <div role="status" aria-busy="true" className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-10">
            <span className="sr-only">טוען...</span>
            <div aria-hidden="true" className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
              <div className="space-y-3 pt-6">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-5/6" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (notFound || !article) {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <PublicNav />
        <main className="flex-1">
          <div className={`${CONTAINER} max-w-3xl pt-28 pb-16 lg:pt-32`}>
            <Breadcrumbs items={[{ label: 'מאמרים', href: '/articles' }, { label: 'מאמר לא נמצא', href: '#' }]} />
            <div className="mt-8 flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center shadow-card">
              <div className="mb-1 flex size-12 items-center justify-center rounded-inset bg-action-soft text-action ring-8 ring-sunk/70" aria-hidden="true">
                <FileQuestion className="size-5" />
              </div>
              <h1 className="text-title font-bold tracking-tight text-ink">מאמר לא נמצא</h1>
              <p className="text-copy text-muted">המאמר שחיפשת אינו קיים או הוסר</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <BackLink href="/articles">חזור למאמרים</BackLink>
                <BackLink href="/">חזור לעמוד הבית</BackLink>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  // Extract headings for TOC and add IDs
  let headings: Array<{ text: string; id: string; level: number }> = []
  // Sanitized at render as well as on write (lib/content/public-article-html):
  // this HTML is injected on the app's own origin.
  const safeContent = sanitizePublicArticleHtml(article.content)
  let contentWithIds = safeContent

  if (typeof document !== 'undefined') {
    // DOMParser, not innerHTML on a detached element: an inert document never
    // loads images or fires handlers while the headings are being read.
    const tempDiv = new DOMParser().parseFromString(safeContent, 'text/html').body

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
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav />
      <main className="flex-1">
        <div className={`${CONTAINER} max-w-4xl pt-28 pb-16 lg:pt-32 lg:pb-20`}>
          <Breadcrumbs items={[{ label: 'מאמרים', href: '/articles' }, { label: article.title, href: '#' }]} />

          <article className="mt-6 overflow-hidden rounded-card border border-line bg-surface shadow-card">
            {/* Article Header with Image */}
            <div className="flex flex-col items-start gap-8 p-6 sm:p-10 lg:flex-row">
              <div className="min-w-0 flex-1">
                <h1 className="mb-6 text-title font-bold tracking-tight text-ink text-balance sm:text-display">
                  {article.title}
                </h1>

                <div className="flex flex-wrap items-center gap-4 border-b border-line pb-6">
                  {article.author && (
                    <div className="flex items-center gap-2">
                      <span className="flex size-9 items-center justify-center rounded-pill bg-action-soft text-caption font-bold text-action" aria-hidden="true">
                        {article.author.charAt(0)}
                      </span>
                      <span className="text-copy font-medium text-ink">
                        {article.author}
                      </span>
                    </div>
                  )}
                  {article.published_at && (
                    <span className="flex items-center gap-1.5 text-copy text-muted">
                      <CalendarDays className="size-4" aria-hidden="true" />
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
                <div className="relative shrink-0 lg:size-64">
                  <Image
                    src={article.featured_image_url}
                    alt={article.featured_image_alt || article.title}
                    width={256}
                    height={256}
                    className="size-full rounded-inset border border-line object-cover"
                  />
                </div>
              )}
            </div>

            {/* Article Content */}
            <div className="px-6 pb-10 sm:px-10">
              <div
                className="article-content max-w-none text-section font-normal leading-8 text-body [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-title [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-ink [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-section [&_h3]:font-semibold [&_h3]:text-ink [&_p]:mb-5 [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:ps-6 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:ps-6 [&_a]:font-medium [&_a]:text-action [&_a]:underline-offset-4 [&_a:hover]:underline [&_strong]:font-semibold [&_strong]:text-ink [&_img]:rounded-inset [&_blockquote]:border-s-[3px] [&_blockquote]:border-line-strong [&_blockquote]:ps-4 [&_blockquote]:text-muted"
                dangerouslySetInnerHTML={{ __html: contentWithIds }}
              />
            </div>

            {/* Table of Contents at the end */}
            {headings && headings.length > 0 && (
              <nav aria-labelledby="article-toc" className="border-t border-line bg-sunk px-6 py-8 sm:px-10">
                <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
                  <h3 id="article-toc" className="mb-4 flex items-center gap-2 border-b border-line pb-3 text-section font-semibold text-ink">
                    <ListTree className="size-5 text-action" aria-hidden="true" />
                    תוכן עניינים
                  </h3>
                  <ul className="space-y-2">
                    {headings.map((heading, index) => (
                      <li key={index} style={{ paddingInlineStart: (heading.level - 2) * 16 }}>
                        <a
                          href={`#${heading.id}`}
                          className="rounded-control text-copy text-action underline-offset-4 transition-colors duration-150 ease-snappy hover:text-action-hover hover:underline"
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </nav>
            )}
          </article>

          {/* Software promotion section */}
          <div className="mt-12">
            <ArticlesPromo copy={PROMO} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

const PROMO: ArticlesPromoCopy = {
  badge: 'Rankings by Go Top',
  title: ['עקוב אחר הדירוגים שלך', 'בגוגל, מתי שתרצה'],
  body: 'מערכת מקצועית למעקב מיקומים בגוגל אורגני וגוגל מפות. סריקה ידנית בכל רגע וסריקה אוטומטית חודשית, דוחות מפורטים ותמיכה אישית בעברית.',
  signup: { label: 'התחל ניסיון חינם', href: authHref('signup', 'he') },
  pricing: { label: 'צפה במחירים', href: '/pricing' },
  stats: [
    { num: '1000+', label: 'מילות מפתח' },
    { num: '2', label: 'מנועי דירוג (Google + Maps)' },
    { num: '100%', label: 'בעברית' },
    { num: '7 ימים', label: 'ניסיון חינם' },
  ],
  features: [
    { title: 'גוגל אורגני', desc: 'מעקב אחרי דירוגים בעמודי 1-2 בגוגל עם תוצאות מדויקות' },
    { title: 'גוגל מפות', desc: 'מעקב לפי מיקום גיאוגרפי מדויק - עיר, מיקוד, נקודת ציון' },
    { title: 'דוחות מקצועיים', desc: 'יצוא דוחות PDF ו-Excel עם מגמות, השוואות וניתוח מתקדם' },
  ],
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, FileText, Newspaper } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'
import { PageHero, Section } from '@/components/public/marketing'
import { ArticlesPromo, type ArticlesPromoCopy } from '@/components/public/ArticlesPromo'
import { authHref } from '@/lib/i18n/auth-href'

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
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="he" />

      <main className="flex-1">
        <PageHero
          compact
          before={<Breadcrumbs items={[{ label: 'מאמרים', href: '/articles' }]} />}
          eyebrow="בלוג Go Top SEO"
          title="מאמרים, מדריכים"
          accent="ותובנות"
          subtitle="תכנים מקצועיים בנושאי קידום אתרים, נראות ב-AI, שיווק דיגיטלי וטכנולוגיה — מהצוות של Go Top."
        />

        <Section className="pt-10 sm:pt-12 lg:pt-14">
          {loading ? (
            <div role="status" aria-busy="true" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <span className="sr-only">טוען מאמרים...</span>
              {[0, 1, 2].map((i) => (
                <div key={i} aria-hidden="true" className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
                  <Skeleton className="aspect-[16/9] w-full rounded-none" />
                  <div className="space-y-3 p-5">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="rounded-card border border-line bg-surface shadow-card">
              <EmptyState icon={<Newspaper />} title="בקרוב יפורסמו כאן מאמרים חדשים." />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/articles/${article.slug}`}
                  className="group rounded-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                >
                  <article className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-[border-color,box-shadow] duration-150 ease-snappy group-hover:border-line-strong group-hover:shadow-pop">
                    {article.featured_image_url ? (
                      <div className="relative aspect-[16/9] w-full overflow-hidden bg-sunk">
                        <Image
                          src={article.featured_image_url}
                          alt={article.featured_image_alt || article.title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-[16/9] w-full items-center justify-center bg-sunk text-muted" aria-hidden="true">
                        <FileText className="size-10" strokeWidth={1.5} />
                      </div>
                    )}

                    <div className="flex flex-1 flex-col p-5 sm:p-6">
                      <h2 className="mb-2 line-clamp-2 text-section font-semibold text-ink transition-colors duration-150 ease-snappy group-hover:text-action">
                        {article.title}
                      </h2>

                      {article.excerpt && (
                        <p className="mb-4 line-clamp-3 flex-1 text-copy text-body">
                          {article.excerpt}
                        </p>
                      )}

                      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
                        <div className="flex min-w-0 flex-col">
                          {article.author && (
                            <span className="truncate text-caption font-medium text-ink">
                              {article.author}
                            </span>
                          )}
                          {article.published_at && (
                            <span className="text-caption tabular-nums text-muted">
                              {new Date(article.published_at).toLocaleDateString('he-IL')}
                            </span>
                          )}
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 text-copy font-semibold text-action">
                          לקריאת המאמר
                          <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}

          {/* Software Promo Section */}
          <div className="mt-16 sm:mt-20">
            <ArticlesPromo copy={PROMO} />
          </div>
        </Section>
      </main>
      <Footer locale="he" />
    </div>
  )
}

const PROMO: ArticlesPromoCopy = {
  badge: 'Go Top SEO',
  title: ['עקבו אחר הדירוגים שלכם', 'בגוגל, מתי שתרצו'],
  body: 'מערכת מקצועית למעקב מיקומים בגוגל אורגני וגוגל מפות. סריקה ידנית בכל רגע וסריקה אוטומטית חודשית, דוחות מפורטים ותמיכה אישית בעברית.',
  signup: { label: 'התחילו ניסיון חינם', href: authHref('signup', 'he') },
  pricing: { label: 'צפו במחירים', href: '/pricing' },
  stats: [
    { num: '1000+', label: 'מילות מפתח' },
    { num: '2', label: 'מנועי דירוג (Google + Maps)' },
    { num: '100%', label: 'בעברית' },
    { num: '7 ימים', label: 'ניסיון חינם' },
  ],
  features: [
    { title: 'גוגל אורגני', desc: 'מעקב אחר דירוגים בעמודי 1-2 בגוגל עם תוצאות מדויקות' },
    { title: 'גוגל מפות', desc: 'מעקב לפי מיקום גיאוגרפי מדויק — עיר, מיקוד, נקודת ציון' },
    { title: 'דוחות מקצועיים', desc: 'יצוא דוחות PDF ו-Excel עם מגמות, השוואות וניתוח מתקדם' },
  ],
}

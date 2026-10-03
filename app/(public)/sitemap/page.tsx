'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { createClient } from '@/lib/supabase/client'
import { authHref } from '@/lib/i18n/auth-href'

interface Article {
  id: string
  slug: string
  title: string
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

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
        { label: 'כניסה לחשבון', href: authHref('login', 'he') },
        { label: 'התחילו ניסיון חינם', href: authHref('signup', 'he') },
        { label: 'מדיניות פרטיות', href: '/privacy' },
        { label: 'תקנון ותנאי שימוש', href: '/terms' },
        { label: 'מדיניות ביטול והחזרים', href: '/refund-policy' },
      ],
    },
  ]

  const articleSection: SitemapSection[] = !loading && articles.length > 0
    ? [{ title: 'מאמרים באתר', links: articles.map((article) => ({ label: article.title, href: `/articles/${article.slug}` })) }]
    : []

  return (
    <LegalFrame locale="he" breadcrumbs={[{ label: 'מפת אתר', href: '/sitemap' }]}>
      <LegalHeader title="מפת אתר" subtitle="כאן תמצאו את כל העמודים והקטגוריות ב-Go Top SEO" />

      <SitemapGroups groups={[...sections, ...articleSection]} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        לקבלת מידע נוסף, בקרו ב
        <Link href="/about" className={`${LEGAL_LINK} mx-1`}>
          עמוד אודות
        </Link>
        או{' '}
        <a href="mailto:oren@gotop.co.il" className={LEGAL_LINK}>
          צרו קשר
        </a>
      </p>
    </LegalFrame>
  )
}

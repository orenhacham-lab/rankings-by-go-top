import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { sitemapArticleLinks, sitemapArticleSection } from '@/lib/sitemap/articles'
import { authHref } from '@/lib/i18n/auth-href'

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

/**
 * The Hebrew site map.
 *
 * The article list used to be fetched in the browser with no locale filter and
 * printed under `/articles/<slug>`, so 125 of the 157 links it advertised were
 * "מאמר לא נמצא" — every article of the other nine languages. It is read on the
 * server now, filtered to Hebrew; see `lib/sitemap/articles.ts`.
 */
export default async function SitemapPage() {
  const articles = await sitemapArticleLinks('he')

  const sections: SitemapSection[] = [
    {
      title: 'עמודים באתר',
      links: [
        { label: 'עמוד הבית', href: '/' },
        { label: 'עמוד מחירים', href: '/pricing' },
        { label: 'עמוד אודות', href: '/about' },
        { label: 'עמוד מאמרים', href: '/articles' },
        { label: 'בדיקת אתר חינמית', href: '/free-check' },
        { label: 'מי מסורקי ה-AI חסום אצלכם?', href: '/ai-crawlers' },
        { label: 'תוכנית שותפים', href: '/affiliates' },
      ],
    },
    {
      title: 'יכולות המערכת',
      links: [
        { label: 'יצירה, תזמון ופרסום תוכן', href: '/features/seo-geo-content-publishing' },
        { label: 'בדיקת מיקום בגוגל אורגני', href: '/features/google-organic-rank-tracking' },
        { label: 'בדיקת מיקום בגוגל מפות', href: '/features/google-maps-rank-tracking' },
        { label: 'מעקב נראות AI', href: '/features/ai-visibility-tracking' },
        { label: 'דוחות SEO/GEO', href: '/features/seo-geo-reports' },
        { label: 'מחקר ביטויים', href: '/features/keyword-research' },
        { label: 'תיקוני אתר', href: '/features/site-health-fixes' },
        { label: 'קישורים לאתר', href: '/features/site-links' },
        { label: 'פוסטים בגוגל מפות', href: '/features/google-maps-posts' },
        { label: 'פרופיל העסק בגוגל', href: '/features/google-business-profile' },
        { label: 'אתם מול המתחרים', href: '/features/competitor-tracking' },
        { label: 'נתוני Search Console', href: '/features/search-console' },
      ],
    },
    {
      title: 'למי זה מתאים',
      links: [
        { label: 'בעלי עסקים', href: '/solutions/businesses' },
        { label: 'סוכנויות', href: '/solutions/agencies' },
        { label: 'אתרי וורדפרס', href: '/solutions/wordpress' },
        { label: 'חנויות שופיפיי', href: '/solutions/shopify' },
      ],
    },
    {
      title: 'השוואות',
      links: [
        { label: 'כל ההשוואות', href: '/compare' },
        { label: 'Go Top SEO מול Semrush', href: '/compare/semrush' },
        { label: 'Go Top SEO מול Yoast', href: '/compare/yoast' },
        { label: 'Go Top SEO מול Rank Math', href: '/compare/rankmath' },
        { label: 'Go Top SEO מול Surfer', href: '/compare/surfer' },
        { label: 'Go Top SEO מול Writesonic', href: '/compare/writesonic' },
        { label: 'Go Top SEO מול BrightLocal', href: '/compare/brightlocal' },
        { label: 'Go Top SEO מול Booster SEO', href: '/compare/booster' },
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
        { label: 'תנאי תוכנית השותפים', href: '/affiliate-terms' },
      ],
    },
  ]

  const articleSection: SitemapSection[] = sitemapArticleSection('מאמרים באתר', articles)

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
        <a href="mailto:contact@gotopseo.com" className={LEGAL_LINK}>
          צרו קשר
        </a>
      </p>
    </LegalFrame>
  )
}

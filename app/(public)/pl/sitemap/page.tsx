import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { authHref } from '@/lib/i18n/auth-href'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'Mapa witryny | Go Top SEO',
  description: 'Mapa witryny Go Top SEO. Wszystkie strony w jednym miejscu.',
  openGraph: {
    title: 'Mapa witryny | Go Top SEO',
    description: 'Mapa witryny Go Top SEO',
    url: 'https://www.gotopseo.com/pl/sitemap',
    locale: LOCALE_CONFIG['pl'].ogLocale,
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default function PolishSitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: 'Strony',
      links: [
        { label: 'Strona główna', href: '/pl' },
        { label: 'Cennik', href: '/pl/pricing' },
        { label: 'O nas', href: '/pl/about' },
        { label: 'Artykuły', href: '/pl/articles' },
        { label: 'Bezpłatna analiza', href: '/pl/free-check' },
        { label: 'Które roboty AI blokuje Państwa witryna?', href: '/pl/ai-crawlers' },
        { label: 'Program partnerski', href: '/pl/affiliates' },
      ],
    },
    {
      title: 'Konto',
      links: [
        { label: 'Zaloguj się', href: authHref('login', 'pl') },
        { label: 'Zacznij darmowy okres próbny', href: authHref('signup', 'pl') },
      ],
    },
    {
      title: 'Funkcje',
      links: [
        { label: 'Pisanie i publikowanie treści', href: '/pl/features/seo-geo-content-publishing' },
        { label: 'Mierzenie pozycji w Google', href: '/pl/features/google-organic-rank-tracking' },
        { label: 'Mierzenie pozycji w Mapach Google', href: '/pl/features/google-maps-rank-tracking' },
        { label: 'Mierzenie widoczności w AI', href: '/pl/features/ai-visibility-tracking' },
        { label: 'Raporty o SEO i GEO', href: '/pl/features/seo-geo-reports' },
        { label: 'Analiza słów kluczowych', href: '/pl/features/keyword-research' },
        { label: 'Poprawki na witrynie', href: '/pl/features/site-health-fixes' },
        { label: 'Linki do witryny', href: '/pl/features/site-links' },
        { label: 'Wpisy w Mapach Google', href: '/pl/features/google-maps-posts' },
        { label: 'Państwa firma i konkurenci', href: '/pl/features/competitor-tracking' },
        { label: 'Dane z Search Console', href: '/pl/features/search-console' },
      ],
    },
    {
      title: 'Dla kogo',
      links: [
        { label: 'Firmy', href: '/pl/solutions/businesses' },
        { label: 'Agencje i usługodawcy', href: '/pl/solutions/agencies' },
        { label: 'Witryny na WordPressie', href: '/pl/solutions/wordpress' },
        { label: 'Sklepy na Shopify', href: '/pl/solutions/shopify' },
      ],
    },
    {
      title: 'Porównanie z innymi narzędziami',
      links: [
        { label: 'Wszystkie porównania', href: '/pl/compare' },
        { label: 'Go Top SEO a Semrush', href: '/pl/compare/semrush' },
        { label: 'Go Top SEO a Yoast', href: '/pl/compare/yoast' },
        { label: 'Go Top SEO a Rank Math', href: '/pl/compare/rankmath' },
        { label: 'Go Top SEO a Surfer', href: '/pl/compare/surfer' },
        { label: 'Go Top SEO a Writesonic', href: '/pl/compare/writesonic' },
        { label: 'Go Top SEO a BrightLocal', href: '/pl/compare/brightlocal' },
      ],
    },
    {
      title: 'Informacje prawne',
      links: [
        { label: 'Polityka prywatności', href: '/pl/privacy' },
        { label: 'Regulamin', href: '/pl/terms' },
        { label: 'Zasady rezygnacji i zwrotów', href: '/pl/refund-policy' },
        { label: 'Dostępność', href: '/pl/accessibility' },
        { label: 'Umowa programu partnerskiego', href: '/pl/affiliate-terms' },
      ],
    },
  ]

  return (
    <LegalFrame locale="pl" breadcrumbs={[{ label: 'Mapa witryny', href: '/pl/sitemap' }]}>
      <LegalHeader title="Mapa witryny" subtitle="Wszystkie strony i sekcje Go Top SEO w jednym miejscu" />

      <SitemapGroups groups={sections} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        Więcej o nas na{' '}
        <Link href="/pl/about" className={`${LEGAL_LINK} mx-1`}>
          stronie &bdquo;O nas&rdquo;
        </Link>
        . Na pytania odpowiadamy{' '}
        <a href="mailto:oren@gotop.co.il" className={LEGAL_LINK}>
          e-mailem
        </a>
      </p>
    </LegalFrame>
  )
}

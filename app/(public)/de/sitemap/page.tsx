import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { authHref } from '@/lib/i18n/auth-href'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'Sitemap | Go Top SEO',
  description: 'Die Sitemap von Go Top SEO. Alle Seiten an einem Ort.',
  openGraph: {
    title: 'Sitemap | Go Top SEO',
    description: 'Die Sitemap von Go Top SEO',
    url: 'https://www.gotopseo.com/de/sitemap',
    locale: LOCALE_CONFIG['de'].ogLocale,
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default function GermanSitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: 'Seiten',
      links: [
        { label: 'Startseite', href: '/de' },
        { label: 'Preise', href: '/de/pricing' },
        { label: 'Über uns', href: '/de/about' },
        { label: 'Artikel', href: '/de/articles' },
        { label: 'Kostenlose Analyse', href: '/de/free-check' },
        { label: 'Welche KI-Crawler blockiert Ihre Website?', href: '/de/ai-crawlers' },
        { label: 'Partnerprogramm', href: '/de/affiliates' },
      ],
    },
    {
      title: 'Konto',
      links: [
        { label: 'Anmelden', href: authHref('login', 'de') },
        { label: 'Kostenlose Testphase starten', href: authHref('signup', 'de') },
      ],
    },
    {
      title: 'Funktionen',
      links: [
        { label: 'Inhalte schreiben und veröffentlichen', href: '/de/features/seo-geo-content-publishing' },
        { label: 'Positionen bei Google messen', href: '/de/features/google-organic-rank-tracking' },
        { label: 'Positionen in Google Maps messen', href: '/de/features/google-maps-rank-tracking' },
        { label: 'Sichtbarkeit in der KI messen', href: '/de/features/ai-visibility-tracking' },
        { label: 'Berichte zu SEO und GEO', href: '/de/features/seo-geo-reports' },
        { label: 'Keyword-Recherche', href: '/de/features/keyword-research' },
        { label: 'Korrekturen an der Website', href: '/de/features/site-health-fixes' },
        { label: 'Links auf die Website', href: '/de/features/site-links' },
        { label: 'Beiträge für Google Maps', href: '/de/features/google-maps-posts' },
        { label: 'Ihr Unternehmen und die Wettbewerber', href: '/de/features/competitor-tracking' },
        { label: 'Die Daten der Search Console', href: '/de/features/search-console' },
      ],
    },
    {
      title: 'Für wen',
      links: [
        { label: 'Unternehmen', href: '/de/solutions/businesses' },
        { label: 'Agenturen und Dienstleister', href: '/de/solutions/agencies' },
        { label: 'Websites mit WordPress', href: '/de/solutions/wordpress' },
        { label: 'Shops mit Shopify', href: '/de/solutions/shopify' },
      ],
    },
    {
      title: 'Vergleich mit anderen Werkzeugen',
      links: [
        { label: 'Alle Vergleiche', href: '/de/compare' },
        { label: 'Go Top SEO gegen Semrush', href: '/de/compare/semrush' },
        { label: 'Go Top SEO gegen Yoast', href: '/de/compare/yoast' },
        { label: 'Go Top SEO gegen Rank Math', href: '/de/compare/rankmath' },
        { label: 'Go Top SEO gegen Surfer', href: '/de/compare/surfer' },
        { label: 'Go Top SEO gegen Writesonic', href: '/de/compare/writesonic' },
        { label: 'Go Top SEO gegen BrightLocal', href: '/de/compare/brightlocal' },
      ],
    },
    {
      title: 'Rechtliches',
      links: [
        { label: 'Datenschutzerklärung', href: '/de/privacy' },
        { label: 'Nutzungsbedingungen', href: '/de/terms' },
        { label: 'Kündigungs- und Rückerstattungsrichtlinie', href: '/de/refund-policy' },
        { label: 'Barrierefreiheit', href: '/de/accessibility' },
        { label: 'Vereinbarung des Partnerprogramms', href: '/de/affiliate-terms' },
      ],
    },
  ]

  return (
    <LegalFrame locale="de" breadcrumbs={[{ label: 'Sitemap', href: '/de/sitemap' }]}>
      <LegalHeader title="Sitemap" subtitle="Alle Seiten und Bereiche von Go Top SEO an einem Ort" />

      <SitemapGroups groups={sections} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        Mehr über uns steht auf der{' '}
        <Link href="/de/about" className={`${LEGAL_LINK} mx-1`}>
          Seite „Über uns“
        </Link>
        . Fragen beantworten wir{' '}
        <a href="mailto:oren@gotop.co.il" className={LEGAL_LINK}>
          per E-Mail
        </a>
      </p>
    </LegalFrame>
  )
}

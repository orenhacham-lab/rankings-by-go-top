import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { authHref } from '@/lib/i18n/auth-href'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'
import { SOCIAL_PREVIEW_IMAGE } from '@/lib/seo/social-preview'

export const metadata = {
  title: 'Sitemap | Go Top SEO',
  description: 'De sitemap van Go Top SEO. Alle pagina’s op één plek.',
  openGraph: {
    images: [SOCIAL_PREVIEW_IMAGE],
    title: 'Sitemap | Go Top SEO',
    description: 'De sitemap van Go Top SEO',
    url: 'https://www.gotopseo.com/nl/sitemap',
    locale: LOCALE_CONFIG['nl'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/nl/sitemap',
    // The ten maps are one page in ten languages. Without this block the
    // page inherits the root layout's alternates, which name the ten HOME
    // pages as this page's translations and (in Hebrew) canonicalise the map
    // to the home page — measured 11.11.2026 on all ten.
    languages: buildHreflangAlternates('/sitemap', '/en/sitemap', '/es/sitemap'),
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default function DutchSitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: 'Pagina’s',
      links: [
        { label: 'Startpagina', href: '/nl' },
        { label: 'Prijzen', href: '/nl/pricing' },
        { label: 'Over ons', href: '/nl/about' },
        { label: 'Artikelen', href: '/nl/articles' },
        { label: 'Gratis analyse', href: '/nl/free-check' },
        { label: 'Welke AI-crawlers blokkeert uw website?', href: '/nl/ai-crawlers' },
        { label: 'Partnerprogramma', href: '/nl/affiliates' },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Inloggen', href: authHref('login', 'nl') },
        { label: 'Gratis proefperiode starten', href: authHref('signup', 'nl') },
      ],
    },
    {
      title: 'Functies',
      links: [
        { label: 'Content schrijven en publiceren', href: '/nl/features/seo-geo-content-publishing' },
        { label: 'Posities in Google meten', href: '/nl/features/google-organic-rank-tracking' },
        { label: 'Posities in Google Maps meten', href: '/nl/features/google-maps-rank-tracking' },
        { label: 'Zichtbaarheid in AI meten', href: '/nl/features/ai-visibility-tracking' },
        { label: 'Rapporten over SEO en GEO', href: '/nl/features/seo-geo-reports' },
        { label: 'Zoekwoordenonderzoek', href: '/nl/features/keyword-research' },
        { label: 'Correcties aan de website', href: '/nl/features/site-health-fixes' },
        { label: 'Links naar de website', href: '/nl/features/site-links' },
        { label: 'Berichten voor Google Maps', href: '/nl/features/google-maps-posts' },
        { label: 'Google Bedrijfsprofiel', href: '/nl/features/google-business-profile' },
        { label: 'Uw bedrijf en de concurrenten', href: '/nl/features/competitor-tracking' },
        { label: 'De gegevens uit Search Console', href: '/nl/features/search-console' },
      ],
    },
    {
      title: 'Voor wie',
      links: [
        { label: 'Bedrijven', href: '/nl/solutions/businesses' },
        { label: 'Bureaus en dienstverleners', href: '/nl/solutions/agencies' },
        { label: 'Websites met WordPress', href: '/nl/solutions/wordpress' },
        { label: 'Winkels met Shopify', href: '/nl/solutions/shopify' },
      ],
    },
    {
      title: 'Vergelijking met andere hulpmiddelen',
      links: [
        { label: 'Alle vergelijkingen', href: '/nl/compare' },
        { label: 'Go Top SEO tegenover Semrush', href: '/nl/compare/semrush' },
        { label: 'Go Top SEO tegenover Yoast', href: '/nl/compare/yoast' },
        { label: 'Go Top SEO tegenover Rank Math', href: '/nl/compare/rankmath' },
        { label: 'Go Top SEO tegenover Surfer', href: '/nl/compare/surfer' },
        { label: 'Go Top SEO tegenover Writesonic', href: '/nl/compare/writesonic' },
        { label: 'Go Top SEO tegenover BrightLocal', href: '/nl/compare/brightlocal' },
        { label: 'Go Top SEO tegenover Booster SEO', href: '/nl/compare/booster' },
      ],
    },
    {
      title: 'Juridisch',
      links: [
        { label: 'Privacyverklaring', href: '/nl/privacy' },
        { label: 'Gebruiksvoorwaarden', href: '/nl/terms' },
        { label: 'Opzeg- en terugbetaalbeleid', href: '/nl/refund-policy' },
        { label: 'Toegankelijkheid', href: '/nl/accessibility' },
        { label: 'Overeenkomst van het partnerprogramma', href: '/nl/affiliate-terms' },
      ],
    },
  ]

  return (
    <LegalFrame locale="nl" breadcrumbs={[{ label: 'Sitemap', href: '/nl/sitemap' }]}>
      <LegalHeader title="Sitemap" subtitle="Alle pagina&rsquo;s en onderdelen van Go Top SEO op &eacute;&eacute;n plek" />

      <SitemapGroups groups={sections} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        Meer over ons staat op de{' '}
        <Link href="/nl/about" className={`${LEGAL_LINK} mx-1`}>
          pagina &ldquo;Over ons&rdquo;
        </Link>
        . Vragen beantwoorden wij{' '}
        <a href="mailto:contact@gotopseo.com" className={LEGAL_LINK}>
          per e-mail
        </a>
      </p>
    </LegalFrame>
  )
}

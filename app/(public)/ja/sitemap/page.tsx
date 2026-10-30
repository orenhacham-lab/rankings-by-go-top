import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { authHref } from '@/lib/i18n/auth-href'

export const metadata = {
  title: 'Mappa del sito | Go Top SEO',
  description: 'Mappa del sito di Go Top SEO: tutte le nostre pagine in un unico posto.',
  openGraph: {
    title: 'Mappa del sito | Go Top SEO',
    description: 'Mappa del sito di Go Top SEO',
    url: 'https://www.gotopseo.com/ja/sitemap',
    locale: 'it_IT',
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default function JapaneseSitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: 'Pagine',
      links: [
        { label: 'Home', href: '/ja' },
        { label: 'Prezzi', href: '/ja/pricing' },
        { label: 'Chi siamo', href: '/ja/about' },
        { label: 'Articoli', href: '/ja/articles' },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Accedi', href: authHref('login', 'ja') },
        { label: 'Inizia la prova gratuita', href: authHref('signup', 'ja') },
      ],
    },
    {
      title: 'Funzionalità',
      links: [
        { label: 'Creazione e pubblicazione di contenuti', href: '/ja/features/seo-geo-content-publishing' },
        { label: 'Monitoraggio della posizione in Google organico', href: '/ja/features/google-organic-rank-tracking' },
        { label: 'Monitoraggio della posizione in Google Maps', href: '/ja/features/google-maps-rank-tracking' },
        { label: 'Monitoraggio della visibilità nelle IA', href: '/ja/features/ai-visibility-tracking' },
        { label: 'Report SEO e GEO', href: '/ja/features/seo-geo-reports' },
        { label: 'Ricerca di parole chiave', href: '/ja/features/keyword-research' },
        { label: 'Correzioni sul sito', href: '/ja/features/site-health-fixes' },
        { label: 'Link verso il vostro sito', href: '/ja/features/site-links' },
        { label: 'Post su Google Maps', href: '/ja/features/google-maps-posts' },
        { label: 'Voi e i concorrenti', href: '/ja/features/competitor-tracking' },
        { label: 'Dati di Search Console', href: '/ja/features/search-console' },
      ],
    },
    {
      title: 'Per chi',
      links: [
        { label: 'Titolari d’azienda', href: '/ja/solutions/businesses' },
        { label: 'Agenzie', href: '/ja/solutions/agencies' },
        { label: 'Siti WordPress', href: '/ja/solutions/wordpress' },
        { label: 'Negozi Shopify', href: '/ja/solutions/shopify' },
      ],
    },
    {
      title: 'Confronti',
      links: [
        { label: 'Go Top SEO a confronto con Semrush', href: '/ja/compare/semrush' },
        { label: 'Go Top SEO a confronto con Yoast', href: '/ja/compare/yoast' },
        { label: 'Go Top SEO a confronto con Rank Math', href: '/ja/compare/rankmath' },
      ],
    },
    {
      title: 'Note legali',
      links: [
        { label: 'Informativa sulla privacy', href: '/ja/privacy' },
        { label: 'Condizioni d’uso', href: '/ja/terms' },
        { label: 'Politica di annullamento e rimborso', href: '/ja/refund-policy' },
        { label: 'Accessibilità', href: '/ja/accessibility' },
        { label: 'Contratto del programma di affiliazione', href: '/ja/affiliate-terms' },
      ],
    },
  ]

  return (
    <LegalFrame locale="ja" breadcrumbs={[{ label: 'Mappa del sito', href: '/ja/sitemap' }]}>
      <LegalHeader title="Mappa del sito" subtitle="Qui trovate tutte le pagine e tutte le sezioni di Go Top SEO" />

      <SitemapGroups groups={sections} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        Per saperne di più, visitate la nostra{' '}
        <Link href="/ja/about" className={`${LEGAL_LINK} mx-1`}>
          pagina Chi siamo
        </Link>
        oppure{' '}
        <a href="mailto:oren@gotop.co.il" className={LEGAL_LINK}>
          scriveteci
        </a>
      </p>
    </LegalFrame>
  )
}

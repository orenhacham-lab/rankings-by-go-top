import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { authHref } from '@/lib/i18n/auth-href'

export const metadata = {
  title: 'Mappa del sito | Go Top SEO',
  description: 'Mappa del sito di Go Top SEO: tutte le nostre pagine in un unico posto.',
  openGraph: {
    title: 'Mappa del sito | Go Top SEO',
    description: 'Mappa del sito di Go Top SEO',
    url: 'https://www.gotopseo.com/it/sitemap',
    locale: 'it_IT',
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default function ItalianSitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: 'Pagine',
      links: [
        { label: 'Home', href: '/it' },
        { label: 'Prezzi', href: '/it/pricing' },
        { label: 'Chi siamo', href: '/it/about' },
        { label: 'Articoli', href: '/it/articles' },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Accedi', href: authHref('login', 'it') },
        { label: 'Inizia la prova gratuita', href: authHref('signup', 'it') },
      ],
    },
    {
      title: 'Funzionalità',
      links: [
        { label: 'Creazione e pubblicazione di contenuti', href: '/it/features/seo-geo-content-publishing' },
        { label: 'Monitoraggio della posizione in Google organico', href: '/it/features/google-organic-rank-tracking' },
        { label: 'Monitoraggio della posizione in Google Maps', href: '/it/features/google-maps-rank-tracking' },
        { label: 'Monitoraggio della visibilità nelle IA', href: '/it/features/ai-visibility-tracking' },
        { label: 'Report SEO e GEO', href: '/it/features/seo-geo-reports' },
        { label: 'Ricerca di parole chiave', href: '/it/features/keyword-research' },
        { label: 'Correzioni sul sito', href: '/it/features/site-health-fixes' },
        { label: 'Link verso il vostro sito', href: '/it/features/site-links' },
        { label: 'Post su Google Maps', href: '/it/features/google-maps-posts' },
        { label: 'Voi e i concorrenti', href: '/it/features/competitor-tracking' },
        { label: 'Dati di Search Console', href: '/it/features/search-console' },
      ],
    },
    {
      title: 'Per chi',
      links: [
        { label: 'Titolari d’azienda', href: '/it/solutions/businesses' },
        { label: 'Agenzie', href: '/it/solutions/agencies' },
        { label: 'Siti WordPress', href: '/it/solutions/wordpress' },
        { label: 'Negozi Shopify', href: '/it/solutions/shopify' },
      ],
    },
    {
      title: 'Confronti',
      links: [
        { label: 'Go Top SEO a confronto con Semrush', href: '/it/compare/semrush' },
        { label: 'Go Top SEO a confronto con Yoast', href: '/it/compare/yoast' },
        { label: 'Go Top SEO a confronto con Rank Math', href: '/it/compare/rankmath' },
      ],
    },
    {
      title: 'Note legali',
      links: [
        { label: 'Informativa sulla privacy', href: '/it/privacy' },
        { label: 'Condizioni d’uso', href: '/it/terms' },
        { label: 'Politica di annullamento e rimborso', href: '/it/refund-policy' },
        { label: 'Accessibilità', href: '/it/accessibility' },
        { label: 'Contratto del programma di affiliazione', href: '/it/affiliate-terms' },
      ],
    },
  ]

  return (
    <LegalFrame locale="it" breadcrumbs={[{ label: 'Mappa del sito', href: '/it/sitemap' }]}>
      <LegalHeader title="Mappa del sito" subtitle="Qui trovate tutte le pagine e tutte le sezioni di Go Top SEO" />

      <SitemapGroups groups={sections} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        Per saperne di più, visitate la nostra{' '}
        <Link href="/it/about" className={`${LEGAL_LINK} mx-1`}>
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

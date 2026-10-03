import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'

export const metadata = {
  title: 'Mapa del sitio | Go Top SEO',
  description: 'Mapa del sitio de Go Top SEO: todas nuestras páginas en un solo lugar.',
  openGraph: {
    title: 'Mapa del sitio | Go Top SEO',
    description: 'Mapa del sitio de Go Top SEO',
    url: 'https://www.gotopseo.com/es/sitemap',
    locale: 'es_ES',
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default function SpanishSitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: 'Páginas',
      links: [
        { label: 'Inicio', href: '/es' },
        { label: 'Precios', href: '/es/pricing' },
        { label: 'Quiénes somos', href: '/es/about' },
        { label: 'Artículos', href: '/es/articles' },
      ],
    },
    {
      // Sign-in and sign-up have no Spanish version yet (the dashboard is
      // Hebrew and English), so these point at the English forms and the
      // group says so rather than letting a visitor discover it.
      title: 'Cuenta',
      description: 'El registro y el acceso están por ahora en inglés.',
      links: [
        { label: 'Acceder', href: '/en/login' },
        { label: 'Empezar la prueba gratuita', href: '/en/signup' },
      ],
    },
    {
      title: 'Funciones',
      links: [
        { label: 'Seguimiento de posiciones en Google orgánico', href: '/es/features/google-organic-rank-tracking' },
        { label: 'Seguimiento de posiciones en Google Maps', href: '/es/features/google-maps-rank-tracking' },
        { label: 'Seguimiento de la visibilidad en IA', href: '/es/features/ai-visibility-tracking' },
        { label: 'Informes SEO y GEO', href: '/es/features/seo-geo-reports' },
        { label: 'Investigación de palabras clave', href: '/es/features/keyword-research' },
      ],
    },
    {
      // The legal documents are owned by a separate piece of work and have no
      // Spanish version yet. The links go to the English ones, which are the
      // documents in force, and the description states the language instead of
      // implying a Spanish text exists.
      title: 'Legal',
      description: 'Estos documentos están disponibles por ahora en inglés.',
      links: [
        { label: 'Política de privacidad', href: '/en/privacy' },
        { label: 'Términos de uso', href: '/en/terms' },
        { label: 'Política de cancelación y reembolso', href: '/en/refund-policy' },
        { label: 'Accesibilidad', href: '/en/accessibility' },
      ],
    },
  ]

  return (
    <LegalFrame locale="es" breadcrumbs={[{ label: 'Mapa del sitio', href: '/es/sitemap' }]}>
      <LegalHeader title="Mapa del sitio" subtitle="Aquí encuentras todas las páginas y secciones de Go Top SEO" />

      <SitemapGroups groups={sections} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        Para saber más, visita nuestra{' '}
        <Link href="/es/about" className={`${LEGAL_LINK} mx-1`}>
          página sobre nosotros
        </Link>
        o{' '}
        <a href="mailto:oren@gotop.co.il" className={LEGAL_LINK}>
          escríbenos
        </a>
      </p>
    </LegalFrame>
  )
}

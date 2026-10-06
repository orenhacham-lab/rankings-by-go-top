import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { authHref } from '@/lib/i18n/auth-href'

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
      title: 'Cuenta',
      links: [
        { label: 'Acceder', href: authHref('login', 'es') },
        { label: 'Empezar la prueba gratuita', href: authHref('signup', 'es') },
      ],
    },
    {
      title: 'Funciones',
      links: [
        { label: 'Creación y publicación de contenido', href: '/es/features/seo-geo-content-publishing' },
        { label: 'Seguimiento de posiciones en Google orgánico', href: '/es/features/google-organic-rank-tracking' },
        { label: 'Seguimiento de posiciones en Google Maps', href: '/es/features/google-maps-rank-tracking' },
        { label: 'Seguimiento de la visibilidad en IA', href: '/es/features/ai-visibility-tracking' },
        { label: 'Informes SEO y GEO', href: '/es/features/seo-geo-reports' },
        { label: 'Investigación de palabras clave', href: '/es/features/keyword-research' },
        { label: 'Correcciones del sitio', href: '/es/features/site-health-fixes' },
        { label: 'Tú frente a la competencia', href: '/es/features/competitor-tracking' },
        { label: 'Datos de Search Console', href: '/es/features/search-console' },
      ],
    },
    {
      title: 'Para quién',
      links: [
        { label: 'Dueños de negocios', href: '/es/solutions/businesses' },
        { label: 'Agencias', href: '/es/solutions/agencies' },
        { label: 'Sitios WordPress', href: '/es/solutions/wordpress' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Política de privacidad', href: '/es/privacy' },
        { label: 'Términos de uso', href: '/es/terms' },
        { label: 'Política de cancelación y reembolso', href: '/es/refund-policy' },
        { label: 'Accesibilidad', href: '/es/accessibility' },
        { label: 'Acuerdo del Programa de Socios', href: '/es/affiliate-terms' },
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

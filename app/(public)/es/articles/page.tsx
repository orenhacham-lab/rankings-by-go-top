import { Newspaper } from 'lucide-react'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'
import { ButtonLink, PageHero, Section } from '@/components/public/marketing'
import { ArticlesPromo, type ArticlesPromoCopy } from '@/components/public/ArticlesPromo'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'Artículos sobre SEO, posiciones y visibilidad en IA | Go Top SEO',
  description: 'Artículos, guías y consejos sobre el seguimiento de posiciones en Google, SEO y visibilidad en ChatGPT, Gemini, Perplexity y otros motores de IA.',
  openGraph: {
    title: 'Artículos sobre SEO, posiciones y visibilidad en IA | Go Top SEO',
    description: 'Artículos y guías sobre seguimiento de posiciones, SEO y visibilidad en IA',
    url: 'https://www.gotopseo.com/es/articles',
    type: 'website',
    locale: 'es_ES',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/es/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function SpanishArticlesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="es" />
      <main className="flex-1">
        <PageHero
          compact
          before={<Breadcrumbs items={[{ label: 'Artículos', href: '/es/articles' }]} locale="es" />}
          title="Artículos"
          subtitle="Guías y análisis sobre el seguimiento de posiciones en Google, SEO y visibilidad en IA"
        />

        <Section className="pt-10 sm:pt-12 lg:pt-14">
          {/* Same honest "coming soon" state as the English page: there are no
              Spanish articles yet, and the page says so rather than showing an
              empty list or the Hebrew ones. */}
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center shadow-card sm:px-10">
            <div className="mb-1 flex size-12 items-center justify-center rounded-inset bg-action-soft text-action ring-8 ring-sunk/70" aria-hidden="true">
              <Newspaper className="size-5" />
            </div>
            <h2 className="text-title font-bold tracking-tight text-ink">Los artículos en español llegan pronto</h2>
            <p className="max-w-2xl text-section font-normal text-body text-pretty">
              Estamos preparando una biblioteca de artículos en español sobre seguimiento de
              posiciones, buenas prácticas de SEO y visibilidad en IA. Mientras tanto, puedes
              empezar a seguir tus posiciones hoy con la prueba gratuita de 7 días.
            </p>
            <div className="mt-4 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">
              <ButtonLink href="/en/signup" size="lg">Empezar la prueba gratuita</ButtonLink>
              <ButtonLink href="/es/pricing" variant="secondary" size="lg">Ver precios</ButtonLink>
            </div>
          </div>

          <div className="mt-16 sm:mt-20">
            <ArticlesPromo copy={PROMO} />
          </div>
        </Section>
      </main>
      <Footer locale="es" />
    </div>
  )
}

const PROMO: ArticlesPromoCopy = {
  badge: 'Go Top SEO',
  title: ['Sigue tus posiciones', 'en Google cuando lo necesites'],
  body: 'Plataforma profesional para seguir tus posiciones en Google orgánico y en Google Maps. Lanza un análisis cuando quieras, o deja que se ejecute solo una vez al mes. Informes detallados, seguimiento de tendencias y soporte personal.',
  signup: { label: 'Empezar la prueba gratuita', href: '/en/signup' },
  pricing: { label: 'Ver precios', href: '/es/pricing' },
  stats: [
    { num: '1000+', label: 'Palabras clave' },
    { num: '2', label: 'Motores de posición (Google + Maps)' },
    { num: 'IA', label: 'Seguimiento de visibilidad' },
    { num: '7 días', label: 'De prueba gratuita' },
  ],
  features: [
    { title: 'Google orgánico', desc: 'Sigue tus posiciones en las páginas 1 y 2 de Google con resultados precisos' },
    { title: 'Google Maps', desc: 'Sigue tu posición por ubicación: ciudad, código postal o punto de referencia' },
    { title: 'Informes profesionales', desc: 'Exporta informes en PDF y Excel con tendencias, comparativas y análisis avanzado' },
  ],
}

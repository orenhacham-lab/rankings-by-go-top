import { Metadata } from 'next'
import { ArrowUpDown, ChartColumn, Clock, Eye, FileSpreadsheet, Handshake, History, Sparkles, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportsVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingEs } from '@/lib/i18n/public/landing-es'

export const metadata: Metadata = {
  title: 'Informes SEO y GEO | Go Top SEO',
  description: 'Informes profesionales en PDF y Excel con posiciones, tendencias y análisis de competencia, listos para enviar a un cliente en segundos.',
  alternates: {
    canonical: 'https://www.gotopseo.com/es/features/seo-geo-reports',
    languages: buildHreflangAlternates('/features/seo-geo-reports', '/en/features/seo-geo-reports', '/es/features/seo-geo-reports'),
  },
}

export default function SEOGeoReportsFeaturePage() {
  return <FeaturePage locale="es" content={CONTENT} />
}

const C = FEATURE_COMMON.es

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Informes',
    eyebrowIcon: ChartColumn,
    title: 'Un informe que muestra qué ha cambiado,',
    accent: 'en un clic',
    subtitle: 'Posiciones en Google y en Maps y visibilidad en los motores de IA, en un informe PDF o Excel listo para enviar a un cliente, a tu jefe, o para ti.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ReportsVisual copy={landingEs.features.reports.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Por qué un informe',
      title: 'El buen trabajo tiene que verse',
      intro: 'Un informe claro ahorra explicaciones y muestra que la web avanza.',
      items: [
        { icon: Eye, title: 'La foto completa', body: 'Google, Maps e IA en un mismo lugar, en lugar de capturas de varias herramientas.' },
        { icon: Clock, title: 'Sin montarlo a mano', body: 'Los datos ya están en la plataforma. El informe se construye con ellos en un clic.' },
        { icon: Handshake, title: 'Confianza del cliente', body: 'Para agencias: un informe periódico muestra al cliente qué ha cambiado y por qué seguir.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Cómo funciona',
      title: 'De los datos al informe en tres pasos',
      items: [
        { title: 'Elige un proyecto', body: 'Cada web es su propio proyecto, con sus propios informes.' },
        { title: 'Exporta', body: 'PDF para enviar, o Excel para trabajar con los datos.' },
        { title: 'Envíalo', body: 'A un cliente, a tu jefe o a un socio, sin nada que maquetar.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Qué hay en el informe',
      title: 'Todo lo que importa, nada de lo que no',
      items: [
        { icon: TrendingUp, title: 'Posiciones y cambios', body: 'Para cada término: la posición de hoy, la anterior, y el cambio entre las dos.' },
        { icon: ArrowUpDown, title: 'La página que posiciona', body: 'Qué página de tu web aparece para cada término.' },
        { icon: ChartColumn, title: 'Tráfico estimado', body: 'Una estimación de las visitas desde Google, según el volumen de búsqueda y la posición actual.' },
        { icon: Sparkles, title: 'Visibilidad en IA', body: 'Menciones y citas de tu web, para cada motor de IA por separado.' },
        { icon: History, title: 'Historial completo', body: 'En el archivo Excel: todas las comprobaciones a lo largo del tiempo, no solo la última.' },
        { icon: FileSpreadsheet, title: 'PDF y Excel', body: 'Un PDF cuidado para enviar, y Excel para quien quiera trabajar con los números.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Preguntas',
      title: 'Lo que se pregunta sobre los informes',
      items: [
        // Honest about what exists today: the export itself has no Spanish yet.
        { q: '¿En qué idiomas salen los informes?', a: 'Por ahora puedes exportar un informe en inglés o en hebreo. El informe en español llegará con el panel en español.' },
        { q: '¿Puedo hacer un informe aparte para cada cliente?', a: 'Sí. Cada web es su propio proyecto, y cada proyecto tiene su propio informe. El número de proyectos de cada plan está en la página de precios.' },
        { q: '¿Los informes entran en todos los planes?', a: 'Sí. Los informes en PDF y Excel entran en todos los planes.' },
      ],
    },
  ],
  cta: {
    title: 'Tu primer informe está a unos días',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}

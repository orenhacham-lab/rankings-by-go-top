import { Metadata } from 'next'
import { FileSpreadsheet, FileText, Globe, History, LineChart, Link2, MapPin, Smartphone, Target, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingEs } from '@/lib/i18n/public/landing-es'

export const metadata: Metadata = {
  title: 'Seguimiento de posiciones en Google orgánico | Go Top SEO',
  description: 'Sigue tus posiciones en Google por palabra clave, ubicación, idioma y dispositivo. Lanza un análisis cuando quieras, o una vez al mes de forma automática, con informes de tendencias y competencia.',
  alternates: {
    canonical: 'https://www.gotopseo.com/es/features/google-organic-rank-tracking',
    languages: buildHreflangAlternates('/features/google-organic-rank-tracking', '/en/features/google-organic-rank-tracking', '/es/features/google-organic-rank-tracking'),
  },
}

export default function GoogleOrganicFeaturePage() {
  return <FeaturePage locale="es" content={CONTENT} />
}

const C = FEATURE_COMMON.es

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Posiciones en Google',
    eyebrowIcon: TrendingUp,
    title: 'Sabe en qué puesto estás en Google,',
    accent: 'y si el trabajo está dando resultado',
    subtitle: 'Sigue cada término que te importa, por país, ciudad, idioma y dispositivo. Analiza cuando quieras, o una vez al mes de forma automática, con el historial de cada cambio.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <RankVisual copy={landingEs.features.rank.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Por qué medir',
      title: 'Lo que no se mide no mejora',
      intro: 'Sin seguimiento no hay forma de saber si un artículo nuevo, un cambio en la web o el trabajo de una agencia han movido algo.',
      items: [
        { icon: LineChart, title: 'Ve la dirección', body: 'Arriba, abajo o igual para cada término, de un análisis al siguiente.' },
        { icon: FileText, title: 'Une el contenido al resultado', body: 'Mira qué páginas suben cuando se publica un artículo, y sobre qué escribir después.' },
        { icon: Target, title: 'Céntrate en lo que está cerca', body: 'Los términos que están justo por debajo de la primera página suelen ser la oportunidad más cercana. El seguimiento te dice cuáles son.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Cómo funciona',
      title: 'Configúralo una vez y ve cada cambio',
      items: [
        { title: 'Añade tus términos', body: 'Escribe los términos que te importan, o añádelos desde la investigación de palabras clave en un clic.' },
        { title: 'Elige dónde y en qué dispositivo', body: 'País, idioma, ciudad, ordenador o móvil, porque los resultados cambian con cada uno.' },
        { title: 'Analiza y ve la tendencia', body: 'Lanza un análisis manual cuando quieras, o uno mensual automático que se ejecuta solo. Cada resultado se guarda en tu historial.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Qué obtienes',
      title: 'Una foto precisa de dónde estás en Google',
      items: [
        { icon: Smartphone, title: 'Ordenador y móvil, por separado', body: 'Los resultados en móvil y en ordenador no siempre son iguales. Comprueba cada uno por su lado.' },
        { icon: Globe, title: 'Por país, ciudad e idioma', body: 'Mira lo que ve un cliente cuando busca desde el lugar que te importa.' },
        { icon: Link2, title: 'Qué página posiciona', body: 'Para cada término, qué página de tu web aparece en los resultados.' },
        { icon: History, title: 'Historial completo', body: 'Cada análisis se guarda, así ves el recorrido y no solo la foto de hoy.' },
        { icon: MapPin, title: 'También Google Maps', body: 'Sigue los mismos términos en Maps, por ciudad o por zona.' },
        { icon: FileSpreadsheet, title: 'Informes en PDF y Excel', body: 'Posiciones, cambios e historial en un informe que puedes pasar a quien quieras.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Preguntas',
      title: 'Lo que se pregunta sobre el seguimiento de posiciones',
      items: [
        { q: '¿Cada cuánto se comprueban las posiciones?', a: 'Cada vez que lanzas un análisis manual, y además puedes activar un análisis mensual automático. Por ahora no hay un análisis automático diario ni semanal.' },
        { q: '¿Por qué lo que veo en Google no coincide con la plataforma?', a: 'Google personaliza los resultados por ubicación, dispositivo e historial de búsqueda. La plataforma comprueba en condiciones fijas que tú defines, y eso la hace mejor para comparar en el tiempo.' },
        { q: '¿Cuántos términos puedo seguir?', a: 'Depende de tu plan. Los cupos exactos están en la página de precios.' },
      ],
    },
  ],
  cta: {
    title: 'Descubre dónde estás hoy',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}

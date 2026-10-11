import { Metadata } from 'next'
import { Coins, Info, Lightbulb, Plus, Sparkles, Target, TrendingUp, Search } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { KeywordIdeasVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Investigación de palabras clave | Go Top SEO',
  description: 'Descubre ideas de palabras clave con datos de Google Ads: volumen de búsqueda, competencia y coste por clic estimado. Añádelas al seguimiento de posiciones o conviértelas en preguntas para la IA.',
  alternates: {
    canonical: 'https://www.gotopseo.com/es/features/keyword-research',
    languages: buildHreflangAlternates('/features/keyword-research', '/en/features/keyword-research', '/es/features/keyword-research'),
  },
}

export default function KeywordResearchFeaturePage() {
  return <FeaturePage locale="es" content={CONTENT} path="/features/keyword-research" />
}

const C = FEATURE_COMMON.es

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Investigación de palabras clave',
    eyebrowIcon: Search,
    title: 'Escribe sobre lo que tus clientes',
    accent: 'están buscando de verdad',
    subtitle: 'Ideas de palabras clave con datos de Google Ads, con volumen de búsqueda mensual, competencia y coste por clic estimado. Añade las buenas al seguimiento, o conviértelas en preguntas para la IA en un clic.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: (
      <KeywordIdeasVisual
        seed="instalación aire acondicionado"
        headers={['Palabra clave', 'Búsquedas al mes', 'Competencia']}
        rows={[
          { keyword: 'instalación aire acondicionado split', volume: '1.900', competition: 'Media', level: 'medium', added: true },
          { keyword: 'precio instalación aire acondicionado', volume: '1.300', competition: 'Baja', level: 'low' },
          { keyword: 'aire acondicionado por conductos', volume: '590', competition: 'Alta', level: 'high' },
          { keyword: 'reparación aire acondicionado alcalá', volume: '320', competition: 'Baja', level: 'low', added: true },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Por qué empezar aquí',
      title: 'Un artículo buenísimo sobre un término que nadie busca no trae a nadie',
      intro: 'La investigación muestra qué busca la gente, con qué frecuencia y lo difícil que es competir, antes de escribir una sola palabra.',
      items: [
        { icon: TrendingUp, title: 'Demanda real', body: 'Volumen de búsqueda mensual estimado para cada término, a partir de los datos de Google.' },
        { icon: Target, title: 'Dónde puedes ganar', body: 'La competencia de cada término, para que elijas los que de verdad puedes posicionar.' },
        { icon: Coins, title: 'Cuánto vale un clic', body: 'Lo que pagan los anunciantes por clic, una buena señal de cuánto vale un término para los negocios.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Cómo funciona',
      title: 'De una idea a una lista de trabajo',
      items: [
        { title: 'Empieza por un término o una web', body: 'Escribe un término o la dirección de una web, y elige país e idioma.' },
        { title: 'Recibe ideas con datos', body: 'Una lista de términos relacionados, con volumen de búsqueda, competencia y coste por clic estimado.' },
        { title: 'Ponlos a trabajar', body: 'Añade términos al seguimiento de posiciones, o conviértelos en preguntas para el seguimiento en IA.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Qué puedes hacer',
      title: 'Todo lo que necesitas para elegir los términos correctos',
      items: [
        { icon: Lightbulb, title: 'Ideas desde un término o una web', body: 'Términos relacionados a partir de un solo término, o de la dirección de una web.' },
        { icon: TrendingUp, title: 'Volumen de búsqueda', body: 'Cuántas veces se busca cada término al mes, según la estimación de Google.' },
        { icon: Target, title: 'Competencia', body: 'Baja, media o alta, para cada término.' },
        { icon: Coins, title: 'Coste por clic estimado', body: 'El rango de pujas para la parte alta de la página en la búsqueda de pago.' },
        { icon: Plus, title: 'Al seguimiento en un clic', body: 'El término que elijas entra directamente en el seguimiento de posiciones del proyecto.' },
        { icon: Sparkles, title: 'Preguntas para el seguimiento en IA', body: 'Convierte un término en una pregunta en lenguaje natural para comprobar si los motores de IA te recomiendan.' },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: 'Sobre los datos',
      body: (
        <>
          <p>Los datos vienen de la API de Google Ads. El volumen de búsqueda, la competencia y el coste por clic son estimaciones de Google, y cambian según el sector, la temporada y la ubicación.</p>
          <p>Son un buen punto de partida para elegir temas. El resultado real se mide en el seguimiento de posiciones.</p>
        </>
      ),
    },
  ],
  cta: {
    title: 'Encuentra los términos que merece la pena trabajar',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}

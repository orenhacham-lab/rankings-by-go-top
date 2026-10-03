import { Metadata } from 'next'
import { FileSpreadsheet, History, MapPin, Navigation, Phone, Search, Store, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Seguimiento de posiciones en Google Maps | Go Top SEO',
  description: 'Sigue tu visibilidad local en Google Maps. Comprueba tu posición por ciudad y por zona, algo imprescindible en SEO local.',
  alternates: {
    canonical: 'https://www.gotopseo.com/es/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates('/features/google-maps-rank-tracking', '/en/features/google-maps-rank-tracking', '/es/features/google-maps-rank-tracking'),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="es" content={CONTENT} />
}

const C = FEATURE_COMMON.es

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Google Maps',
    eyebrowIcon: MapPin,
    title: 'Cuando alguien busca cerca un negocio como el tuyo,',
    accent: 'sabe dónde estás en el mapa',
    subtitle: 'Sigue tu posición en Google Maps por término y por zona: una ciudad, o un punto exacto del mapa. Mira quién está por delante de ti y cómo se mueve tu posición con el tiempo.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    // The example is a Spanish market, not a translated American one: the same
    // choice as the Spanish landing page's demo (Madrid, Clima Norte).
    visual: (
      <MapsVisual
        positionLabel="Tu posición"
        position="3"
        positionSub='en Madrid, "instalación aire acondicionado"'
        changeLabel="Este mes"
        change="2"
        changeSub="puestos arriba"
        reviewsLabel="reseñas"
        rows={[
          { rank: 1, name: 'Clima Sur Instalaciones', stars: 4.8, reviews: 212 },
          { rank: 2, name: 'Aire Pleno Madrid', stars: 4.6, reviews: 174 },
          { rank: 3, name: 'Tu negocio', stars: 4.7, reviews: 131, highlight: true },
          { rank: 4, name: 'Frío Norte Clima', stars: 4.4, reviews: 98 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Por qué el mapa',
      title: 'En la búsqueda local, el mapa es el escaparate',
      intro: 'Cuando alguien busca un servicio cerca, Google muestra primero unos pocos negocios en el mapa. Ahí se decide a quién llamar.',
      items: [
        { icon: Phone, title: 'Desde ahí llaman', body: 'Desde los resultados del mapa, la gente llama, pide la ruta o entra en tu web con un toque.' },
        { icon: Users, title: 'Pocos puestos, muchos competidores', body: 'Solo un puñado de negocios se lleva los primeros puestos. Necesitas saber si eres uno de ellos.' },
        { icon: MapPin, title: 'Cada zona es otra carrera', body: 'Puedes ser el primero en una ciudad y no aparecer en la de al lado. El seguimiento por zona lo muestra.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Cómo funciona',
      title: 'Tres pasos para tener el mapa claro',
      items: [
        { title: 'Configura tu negocio', body: 'Añade tu negocio y la zona a la que das servicio.' },
        { title: 'Elige términos y zonas', body: 'Por ejemplo "instalación aire acondicionado" en Madrid, o desde un punto exacto del mapa.' },
        { title: 'Sigue la evolución', body: 'Analiza manualmente cuando quieras o una vez al mes de forma automática, con el historial de cada cambio.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Qué obtienes',
      title: 'Tu sitio en el mapa, sin suponer nada',
      items: [
        { icon: MapPin, title: 'Por ciudad o por zona', body: 'Comprueba cada término en la zona donde están tus clientes.' },
        { icon: Navigation, title: 'Un punto exacto del mapa', body: 'Comprueba desde las coordenadas que elijas, para ver lo que ve un cliente que está justo ahí.' },
        { icon: Store, title: 'Quién está por delante', body: 'Los negocios que aparecen por encima de ti en los resultados, con su valoración de Google.' },
        { icon: History, title: 'Historial de posiciones', body: 'Mira cómo cambió tu posición de un análisis al siguiente.' },
        { icon: Search, title: 'También la búsqueda normal', body: 'Sigue los mismos términos en los resultados normales de Google.' },
        { icon: FileSpreadsheet, title: 'Informes en PDF y Excel', body: 'Tus posiciones en Maps entran en un informe que puedes pasar a quien quieras.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Preguntas',
      title: 'Lo que se pregunta sobre el seguimiento en Maps',
      items: [
        { q: '¿Necesito un perfil de empresa en Google?', a: 'Para aparecer en Maps hace falta un perfil de empresa en Google. El seguimiento muestra dónde aparece tu perfil, o si no aparece.' },
        { q: '¿Cada cuánto se comprueba mi posición?', a: 'Cada vez que lanzas un análisis manual, y además puedes activar un análisis mensual automático. Por ahora no hay un análisis automático diario ni semanal.' },
        { q: '¿Cada término en Maps cuenta como una comprobación aparte?', a: 'Sí. Una comprobación en Google es un término en un sitio, así que el mismo término en la búsqueda normal y en Maps cuenta como dos comprobaciones.' },
      ],
    },
  ],
  cta: {
    title: 'Descubre quién se lleva las llamadas en tu zona',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}

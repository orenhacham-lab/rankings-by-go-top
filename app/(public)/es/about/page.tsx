import { AboutPage, type AboutCopy } from '@/components/public/AboutPage'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export default function SpanishAboutPage() {
  return <AboutPage locale="es" copy={COPY} />
}

/**
 * The same page as the Hebrew and English ones, in Spanish. Every claim here
 * is one the other two already make: the years of experience, who builds the
 * platform, and what it does. Nothing is added for the Spanish market, because
 * nothing new is true of it yet.
 */
const COPY: AboutCopy = {
  breadcrumb: { label: ABOUT_BREADCRUMB['es'], href: '/es/about' },
  title: '11 años de SEO,',
  accent: 'en una plataforma que trabaja para ti.',
  subtitle: 'Una plataforma que escribe y publica artículos en tu web, sigue en qué puesto apareces en Google y en Google Maps, y comprueba si los motores de IA te recomiendan. La construye Go Top, una agencia digital con más de 11 años de experiencia en SEO y publicidad de pago.',
  who: {
    title: 'Quién está detrás de la plataforma',
    paragraphs: [
      'Go Top SEO la construye Go Top, una agencia digital con más de 11 años de experiencia en SEO orgánico, publicidad de pago y desarrollo web para empresas en Israel y fuera de él.',
      'La plataforma salió de nuestro trabajo diario con clientes: vimos qué informes entiende la gente de verdad, qué datos les ayudan a decidir y por dónde se va el tiempo. Así que construimos un solo lugar donde el contenido se escribe, se publica y se mide, en Google y en los motores de IA.',
    ],
  },
  founderEyebrow: 'Quién está detrás',
  gaps: {
    title: 'Qué faltaba, y qué construimos en su lugar',
    body: 'Queríamos que un negocio pudiera hacer todo lo necesario para que lo encuentren, en un solo sitio, sin tener que aprender SEO.',
    missingLabel: 'Qué faltaba',
    builtLabel: 'Qué construimos',
    rows: [
      {
        pain: { title: 'El seguimiento manual de posiciones lleva demasiado tiempo', description: 'Comprobar las mismas palabras clave una y otra vez, varias pantallas de resultados y cálculos a mano que cargan el día a día.' },
        answer: { title: 'Posiciones en Google y en Google Maps', description: 'Seguimiento de cada frase en la búsqueda normal y en Maps, por zona y por dispositivo, con el historial de cada cambio.' },
      },
      {
        pain: { title: 'Datos repartidos entre herramientas', description: 'Posiciones en Google, en Maps, en motores de IA y en otras fuentes, sin una sola imagen clara.' },
        answer: { title: 'Todo en un mismo sitio', description: 'La investigación de palabras clave, las posiciones, la visibilidad en IA y tus artículos están conectados entre sí, no repartidos en cuatro herramientas distintas.' },
      },
      {
        pain: { title: 'Los motores de IA ya son parte de la búsqueda', description: 'Cada vez más clientes preguntan a ChatGPT, Gemini y Perplexity. Necesitas saber si tu negocio está en la respuesta.' },
        answer: { title: 'Seguimiento de la visibilidad en IA', description: 'Mira si tu negocio se menciona, se cita o se recomienda en las respuestas de ChatGPT, Gemini, Perplexity y otros motores de IA.' },
      },
      {
        pain: { title: 'Contenido que se queda a medio camino', description: 'Saber sobre qué escribir es la mitad del trabajo. También hay que escribirlo, subirlo a la web y medirlo.' },
        answer: { title: 'Artículos escritos y publicados', description: 'Artículos completos sobre temas que apruebas, con imágenes, una sección de preguntas y enlaces internos, publicados en WordPress o Shopify.' },
      },
    ],
  },
  approach: {
    title: 'Cómo trabajamos',
    items: [
      {
        title: 'Transparencia',
        description: 'Decimos qué se mide, de dónde vienen los datos y qué significan. Sin métricas infladas.',
      },
      {
        title: 'Datos útiles',
        description: 'Informes que cuentan una historia de negocio clara, no solo números bonitos.',
      },
      {
        title: 'Interfaz sencilla',
        description:
          'Una pantalla con tu contenido, tus posiciones en Google y en Maps y tu visibilidad en IA, sin ruido de más.',
      },
      {
        title: 'SEO y GEO juntos',
        description: 'Contenido pensado para Google y para los motores de IA, y medición de los dos.',
      },
    ],
  },
  choose: {
    title: 'Por qué elegir Go Top SEO',
    items: [
      {
        title: 'Atención personal, sin rebajas',
        description:
          'Sin un "gestor de cuenta" que cambia cada mes. Trabajas con los mismos profesionales, que conocen tu negocio.',
      },
      {
        title: 'Transparencia total',
        description: 'Siempre sabes qué pasa en tu cuenta, qué funcionó, qué no, y cómo mejorarlo.',
      },
      {
        title: 'Conocimiento sin jerga',
        description: 'Sin palabras infladas. Hablamos de resultados que puedes medir y entender.',
      },
      {
        title: 'Nosotros también tenemos un negocio',
        description: 'Entendemos la presión, el presupuesto limitado y la necesidad de ver resultados, porque lo vivimos igual.',
      },
    ],
  },
  cta: {
    title: '¿Quieres ver qué podríamos hacer con tu web?',
    body: FEATURE_COMMON.es.closeBody,
    contact: '¿Dudas? Habla con nosotros:',
    updated: 'Esta página se actualizó por última vez en septiembre de 2026',
  },
}

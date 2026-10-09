/**
 * The Spanish home page's words (app/(public)/es/page.tsx renders them through
 * components/public/LandingPage.tsx).
 *
 * Neutral Spanish, addressing the reader as "tú" throughout. The demo's example
 * business is in Madrid rather than in Austin: the Spanish site opens in Spain,
 * and a demo full of US cities and dollar figures reads as a translated page
 * rather than a Spanish one. Its names and figures are illustrative and the
 * caption under the demo says so — the same promise the other two locales make.
 *
 * Every claim is one the product keeps: no invented customers, totals, logos or
 * press. Prices come from the plan catalogue, so the page cannot drift from it.
 */
import type { LandingCopy } from '@/components/public/LandingPage'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'

/**
 * The lowest monthly price. Spain's own price is not set yet, so the Spanish
 * page shows the USD price every market outside Israel is billed in today —
 * grouped the Spanish way. It changes to euros when the euro prices are set.
 */
const FROM_USD = Math.min(...Object.values(PLAN_CATALOG).map((p) => p.priceUSD)).toLocaleString('es-ES')
const TRIAL_DAYS = TRIAL_CATALOG.days

export const landingEs: LandingCopy = {
  hero: {
    eyebrow: 'Posicionamiento automático en Google y en los motores de IA, en un solo sistema',
    title: 'Tus próximos clientes ya están buscando.',
    accent: 'Nos aseguramos de que te encuentren.',
    subtitle:
      'Go Top SEO escribe y publica artículos que responden a lo que buscan tus clientes, y después te muestra dónde apareces en Google, Google Maps, ChatGPT y Gemini. Sin equipo de contenido. Sin conjeturas.',
    signup: `Prueba gratis ${TRIAL_DAYS} días`,
    trialNote: 'Sin tarjeta de crédito, sin compromiso. Cancela cuando quieras.',
    checkLead: '¿Aún no lo tienes claro? Haz un análisis gratuito de tu sitio, sin registro:',
    dashboard: 'Ir a mi panel',
    trust: ['Publica en WordPress y Shopify', 'Soporte de personas reales'],
    climbChip: 'Puesto 3 en Google',
    published: 'Artículo publicado en tu sitio',
  },
  demo: {
    label: 'Una demo real de la plataforma',
    caption: 'Demo del producto. Los nombres de negocios y las cifras son ejemplos.',
    tabs: ['Subiendo en Google', 'Un artículo nuevo', 'Recomendado por la IA'],
    describe: [
      'La pantalla de palabras clave: un término que subió del puesto 18 al 3 en Google, y otros tres en ascenso.',
      'La pantalla de artículos: se escribe un artículo nuevo, pasa el control de calidad y queda programado para publicarse en el sitio.',
      'La pantalla de visibilidad en IA: una respuesta de ChatGPT que recomienda el negocio, y los motores que lo mencionan.',
    ],
    address: 'app.gotopseo.com',
    rail: ['Panel', 'Palabras clave', 'Estrategia de contenido', 'Artículos', 'Visibilidad en IA', 'Informes'],
    rank: {
      heading: 'Palabras clave',
      keyword: 'instalación aire acondicionado madrid',
      positionLabel: 'Posición en Google',
      period: 'Últimas 8 semanas',
      from: 18,
      to: 3,
      columns: ['Palabra clave', 'Posición', 'Cambio'],
      rows: [
        { keyword: 'precio aire acondicionado split', from: 24, to: 7 },
        { keyword: 'reparación aire acondicionado alcalá', from: 31, to: 9 },
        { keyword: 'limpieza de aire acondicionado', from: 15, to: 5 },
      ],
      mapsLabel: 'Google Maps, Madrid',
      mapsValue: 'Puesto 2',
      toast: 'Has subido 15 puestos en Google',
    },
    article: {
      heading: 'Artículo nuevo',
      title: 'Cuánto cuesta instalar un aire acondicionado split y qué preguntar antes',
      subheading: '¿Qué determina el precio?',
      checksTitle: 'Control de calidad',
      checks: ['Preguntas y respuestas', 'Datos estructurados', 'Enlaces internos', 'Imagen destacada', 'Títulos guiados por la búsqueda'],
      draft: 'Escribiendo',
      scheduled: 'Programado',
      when: 'Mar 9:00',
      toast: 'Publicando en WordPress',
    },
    ai: {
      heading: 'Visibilidad en IA',
      question: '¿Quién instala bien aire acondicionado en Madrid?',
      intro: 'Aquí tienes algunas empresas con buenas recomendaciones en la zona:',
      items: [
        { name: 'Clima Norte', desc: 'Instaladores con licencia, garantía del trabajo y respuesta el mismo día.', you: true },
        { name: 'AireMadrid Clima', desc: 'Precios razonables en limpieza y mantenimiento.' },
        { name: 'Confort Ibérica', desc: 'Especialistas en sistemas por conductos.' },
      ],
      youTag: 'Tu negocio',
      mentionedIn: 'Mencionado en:',
      engines: [
        { name: 'ChatGPT', on: true },
        { name: 'Gemini', on: true },
        { name: 'Perplexity', on: true },
        { name: 'Copilot', on: false },
        { name: 'Grok', on: true },
        { name: 'Google AI', on: false },
      ],
      toast: 'ChatGPT te recomienda',
    },
  },
  worksWith: {
    label: 'Comprobamos y publicamos por ti en:',
    names: ['Google', 'Google Maps', 'ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'WordPress', 'Shopify'],
  },
  outcomes: {
    eyebrow: 'Qué obtienes',
    title: 'Qué hace Go Top SEO por ti mientras tú llevas el negocio',
    body: 'No es otra herramienta que aprender. Es un sistema que hace el trabajo y luego te muestra los resultados.',
    items: [
      {
        title: 'Contenido que trae clientes, no solo visitas',
        desc: 'La plataforma encuentra qué buscan y qué preguntan tus clientes, escribe artículos completos sobre ello y los publica en tu sitio con una cadencia estable. Tú solo eliges los temas.',
        chips: ['Se publica solo', 'Con imágenes', 'Secciones de preguntas', 'Enlaces internos'],
      },
      {
        title: 'Un sitio en las respuestas de ChatGPT y Gemini',
        desc: 'Cada vez más gente pregunta a la IA en lugar de buscar. Comprueba si te recomiendan, a quién recomiendan en tu lugar y qué mejorar.',
        chips: ['6 motores de IA', 'Frente a tus competidores'],
      },
      {
        title: 'Una imagen clara de lo que funciona',
        desc: 'Posiciones en Google y en Maps, menciones en IA y artículos publicados en una sola pantalla. Sin hojas de cálculo y sin adivinar.',
        chips: ['Informes en PDF y Excel', 'Historial completo'],
      },
    ],
    stats: [
      { value: 6, label: 'motores de IA comprobados', detail: 'ChatGPT, Gemini, Perplexity, Copilot, Grok y Google AI' },
      { value: 3, label: 'canales en un informe', detail: 'Google, Google Maps y respuestas de IA' },
      { value: 2, label: 'plataformas donde publicar', detail: 'WordPress y Shopify, sin copiar y pegar' },
      { value: TRIAL_DAYS, label: 'días de prueba gratis', detail: 'Sin tarjeta de crédito' },
    ],
  },
  shift: {
    eyebrow: 'La búsqueda ha cambiado',
    title: 'Los clientes ya no solo buscan en Google. Preguntan a la IA y reciben tres recomendaciones.',
    body: 'Si tu sitio no responde a sus preguntas, ni en Google ni en una respuesta de ChatGPT, esa recomendación se la lleva un competidor. Casi ningún negocio sabe cómo está, porque ninguna herramienta le ha mostrado las dos cosas a la vez.',
    withoutTitle: 'Sin Go Top SEO',
    without: [
      'Un artículo cada dos meses, cuando alguien encuentra el hueco',
      'Sin una idea clara de qué escribir ni de qué término merece la pena',
      'Posiciones comprobadas a mano, o sin comprobar',
      'Sin saber si ChatGPT te recomienda a ti o a un competidor',
    ],
    withTitle: 'Con Go Top SEO',
    with: [
      'Un calendario de contenido estable que publica cuando tú decides',
      'Temas elegidos a partir de lo que de verdad buscan tus clientes',
      'Seguimiento automático de tus posiciones en Google y en Google Maps',
      'Comprobaciones periódicas de lo que dicen de ti ChatGPT, Gemini y cuatro motores más',
    ],
  },
  flow: {
    eyebrow: 'Cómo funciona',
    title: 'De una dirección web a contenido que funciona, en cuatro pasos',
    body: 'Tú decides qué se escribe. La plataforma hace el resto.',
    steps: [
      { tag: 'Gratis, sin registro', title: 'Analiza tu sitio', desc: 'Escribe una dirección. En menos de un minuto deducimos a qué se dedica el negocio, quiénes son sus clientes y qué te está frenando en Google y en la IA.' },
      { tag: 'Tú lo apruebas', title: 'Recibe un plan', desc: 'Términos de búsqueda, las preguntas que hacen los clientes y una lista de artículos listos para escribir. Tú eliges qué entra.' },
      { tag: 'Automático', title: 'Los artículos se escriben y se publican', desc: 'Cada artículo llega con imágenes y preguntas y respuestas, y sale en tu sitio cuando lo programaste. En sitios WordPress con el plugin de Go Top, también se añaden datos estructurados.' },
      { tag: 'Transparente', title: 'Comprueba los resultados', desc: 'Posiciones en Google y en Maps, menciones en IA e informes que puedes enviar a quien quieras.' },
    ],
    cta: 'Empieza con un análisis gratuito',
  },
  features: {
    eyebrow: 'Qué incluye',
    title: 'Todo lo que necesitas para subir, en un solo lugar',
    body: 'Cuatro herramientas que trabajan juntas, así cada artículo se mide y cada medición da pie al siguiente artículo.',
    more: 'Saber más',
    note: 'Los nombres y las cifras de las imágenes son ejemplos.',
    content: {
      overline: 'Contenido y publicación',
      title: 'Artículos escritos para que te encuentren, no para rellenar un blog',
      body: 'Cada artículo se construye alrededor de una búsqueda real: títulos salidos de lo que pregunta la gente, una sección de preguntas y respuestas, enlaces internos a las páginas que venden y, en sitios WordPress con el plugin de Go Top, datos estructurados que leen Google y los motores de IA. Tú lo revisas, lo ajustas si hace falta, y la plataforma lo publica.',
      points: ['Una imagen destacada e imágenes en el texto', 'Un control de calidad antes de cada publicación', 'Programación y publicación directa en WordPress y Shopify'],
      href: '/features/seo-geo-content-publishing',
      visual: {
        heading: 'Esta semana en tu sitio',
        days: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
        items: [
          { day: 0, title: 'Cómo elegir el aire acondicionado del dormitorio', status: 'published', label: 'Publicado' },
          { day: 2, title: 'Cuánto cuesta instalar un split', status: 'scheduled', label: 'Programado' },
          { day: 4, title: 'Limpieza del aire acondicionado: ¿cada cuánto?', status: 'writing', label: 'Escribiendo' },
        ],
        destinationLabel: 'Publicando en',
        destinations: ['WordPress', 'Shopify'],
      },
    },
    ai: {
      overline: 'Visibilidad en IA',
      title: 'Sabe cuándo ChatGPT te recomienda y cuándo elige a un competidor',
      body: 'Les hacemos a los motores de IA las preguntas que hacen tus clientes y comprobamos quién aparece en la respuesta. Verás en qué preguntas ganas, dónde se lleva la recomendación un competidor y qué mejorar en tu sitio.',
      points: ['ChatGPT, Gemini, Perplexity, Copilot, Grok y Google AI', 'Lado a lado con tus competidores', 'Recomendaciones sobre qué cambiar para entrar en la respuesta'],
      href: '/features/ai-visibility-tracking',
      visual: {
        heading: 'Quién aparece en la respuesta',
        engines: ['ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'Google AI'],
        rows: [
          { question: '¿Quién instala aire acondicionado en Madrid?', hits: [true, true, true, false, true, false] },
          { question: '¿Cuánto cuesta limpiar el aire acondicionado?', hits: [true, false, true, false, false, true] },
        ],
        shareTitle: 'Cuota de menciones',
        you: { label: 'Tu negocio', value: 58 },
        rival: { label: 'Competidor principal', value: 42 },
      },
    },
    rank: {
      overline: 'Posiciones en Google',
      title: 'Ve cada subida, en Google y en Google Maps',
      body: 'Sigue cada término que te importa, en la búsqueda normal y en Maps por ciudad o zona, con un historial que muestra si los artículos están haciendo su trabajo.',
      points: ['Google orgánico por país, idioma y dispositivo', 'Google Maps por ciudad o zona', 'Investigación de palabras clave con volumen de búsqueda y competencia'],
      href: '/features/google-organic-rank-tracking',
      visual: {
        heading: 'Tus palabras clave',
        columns: ['Palabra clave', 'Posición', 'Cambio'],
        rows: [
          { keyword: 'instalación aire acondicionado madrid', pos: 3, up: 15 },
          { keyword: 'precio aire acondicionado split', pos: 7, up: 17 },
          { keyword: 'reparación aire acondicionado alcalá', pos: 9, up: 22 },
          { keyword: 'limpieza de aire acondicionado', pos: 5, up: 10 },
        ],
        maps: { label: 'Google Maps', area: 'Madrid', value: 'Puesto 2 de 20' },
      },
    },
    reports: {
      overline: 'Informes',
      title: 'Un informe que puedes enviar a un cliente o a tu jefe, en un clic',
      body: 'Exporta posiciones, tendencias y visibilidad en IA a PDF y Excel. Las agencias llevan varios sitios de clientes desde una sola cuenta, cada uno en su propio proyecto.',
      points: ['PDF y Excel en un clic', 'Varios sitios en una cuenta', 'Todos los datos en un lugar, sin montar informes a mano'],
      href: '/features/seo-geo-reports',
      visual: {
        heading: 'Informe de rendimiento',
        period: 'Septiembre',
        stats: [
          { label: 'Palabras clave en la primera página', value: '14', up: true },
          { label: 'Menciones en IA', value: '9', up: true },
          { label: 'Artículos publicados', value: '8' },
          { label: 'Posición media', value: '6,2', up: true },
        ],
        clientsLabel: 'Proyectos:',
        clients: ['clima-norte.es', 'estudio-dana.es', '+3'],
      },
    },
  },
  audience: {
    eyebrow: 'Para quién es',
    title: 'Para cualquiera que quiera que su sitio traiga clientes',
    body: 'No necesitas saber de SEO. Necesitas saber qué vendes.',
    items: [
      {
        title: 'Dueños de negocio',
        desc: 'Quieres más contactos desde Google sin aprender SEO ni contratar a un redactor. Aprueba los temas y el resto ocurre solo.',
        gain: 'Un sitio que trabaja mientras tú estás ocupado',
      },
      {
        title: 'Autónomos y agencias',
        desc: 'Lleva varios clientes desde una cuenta, produce contenido más rápido y entrégale a cada cliente un informe claro.',
        gain: 'Más clientes en las mismas horas de trabajo',
      },
      {
        title: 'Equipos de marketing',
        desc: 'Mantén un ritmo de publicación estable y comprueba en un solo lugar qué hace el contenido en Google y en la IA.',
        gain: 'Una respuesta clara a "¿está funcionando?"',
      },
    ],
  },
  check: {
    eyebrow: 'Análisis gratuito del sitio',
    title: '¿Aún no lo tienes claro? Deja que te mostremos lo que vemos',
    body: 'El análisis lee tu sitio de verdad y devuelve un primer resumen de investigación en menos de un minuto:',
    items: [
      'Qué entendimos del negocio y quiénes son tus clientes',
      'Qué competidores aparecen junto a ti',
      'Qué te está frenando en Google, con las pruebas sacadas de tu sitio',
      'Cuánto está listo el sitio para las respuestas de la IA',
      'La lista de artículos que escribiríamos para ti',
    ],
    cta: 'Analizar mi sitio',
    note: 'Gratis, sin registro y sin tarjeta de crédito.',
    preview: {
      domain: 'clima-norte.es',
      heading: 'Tu primer resumen de investigación',
      scoreLabel: 'Preparación para la IA',
      score: '3/4',
      findings: ['A las imágenes les falta el texto alternativo', 'Sin sección de preguntas y respuestas', 'La meta descripción tiene una longitud incorrecta'],
      lockedLabel: 'Más hallazgos y competidores se desbloquean con una cuenta gratuita',
    },
  },
  faq: {
    eyebrow: 'Preguntas',
    title: 'Lo que suele preguntarse la gente antes de empezar',
    body: '¿No encuentras tu respuesta? Escríbenos por WhatsApp.',
    items: [
      {
        q: 'No sé nada de SEO. ¿Esto es para mí?',
        a: 'Sí. La plataforma elige los términos, propone los temas y escribe los artículos. Lo que te queda es decidir qué encaja con el negocio y aprobarlo.',
      },
      {
        q: '¿Se va a publicar algo en mi sitio sin que yo lo vea?',
        a: 'Solo se escriben los temas que apruebas, y cada artículo pasa un control de calidad antes de publicarse. Puedes revisar y editar cualquier artículo y elegir cuándo se publica.',
      },
      {
        q: '¿Por qué no escribirlo yo mismo con ChatGPT?',
        a: 'Puedes, pero entonces eliges los temas, compruebas los términos, montas las preguntas y los datos estructurados, enlazas las páginas entre sí, lo subes al sitio y compruebas si funcionó, todo por tu cuenta. Go Top SEO lleva la cadena completa y mide el resultado en Google y en la IA.',
      },
      {
        q: '¿Con qué sitios funciona?',
        a: 'La publicación directa funciona con WordPress y Shopify. El seguimiento de posiciones, la visibilidad en IA y la investigación de palabras clave funcionan con cualquier sitio.',
      },
      {
        q: `¿Qué pasa cuando terminan los ${TRIAL_DAYS} días de prueba?`,
        a: 'Eliges un plan y sigues justo donde lo dejaste. ¿No elegiste ninguno? No se cobra nada, porque nunca te pedimos una tarjeta.',
      },
      {
        q: '¿Puedo cancelar?',
        a: 'Sí, cuando quieras desde el panel, sin penalizaciones ni gastos de cancelación.',
      },
    ],
  },
  cta: {
    title: 'Tu próximo cliente está buscando hoy. Que te encuentre.',
    body: `Analiza tu sitio gratis, o empieza una prueba de ${TRIAL_DAYS} días y tu primer artículo puede escribirse hoy.`,
    check: 'Analizar mi sitio gratis',
    signup: 'Empieza la prueba gratuita',
    dashboard: 'Ir a mi panel',
    pricing: `Planes desde ${FROM_USD} USD al mes.`,
    pricingLink: 'Ver todos los planes y precios',
  },
}

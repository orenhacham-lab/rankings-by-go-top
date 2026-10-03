/**
 * The Spanish pricing page's words around the plan grid
 * (app/(public)/es/pricing/page.tsx renders them through
 * components/public/pricing/PricingSections.tsx).
 *
 * Every figure is read from the plan and trial catalogs, so the page cannot
 * drift from what the server enforces. No customer, total, quote or logo is
 * claimed. The badge says what it is, a recommendation, not a sales figure.
 *
 * THE PRICE ITSELF is not in this file. The grid reads it from the visitor's
 * billing market (lib/billing/server-market.ts), which is decided by country
 * and not by the page's language: a visitor in Spain sees the same dollar
 * price every market outside Israel is billed in today, because Spain's own
 * euro price is not set yet. Nothing here promises a currency.
 */
import type { PricingCopy } from '@/components/public/pricing/PricingSections'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'
import { CHECKS_EXPLAINER } from '@/lib/plans/features'

const DAYS = TRIAL_CATALOG.days
const BASIC_ARTICLES = PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide
const ADVANCED_ARTICLES = PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide

export const pricingEs: PricingCopy = {
  hero: {
    eyebrow: 'Precios',
    title: 'Todo lo necesario para que te encuentren,',
    accent: 'por un precio al mes',
    subtitle: 'Artículos escritos y publicados en tu web, seguimiento de tus posiciones en Google y en Google Maps, y una comprobación de si ChatGPT y Gemini te recomiendan. Elige el plan según lo que necesites y empieza con una prueba gratuita.',
    trust: [`${DAYS} días de prueba gratis`, 'Sin tarjeta de crédito', 'Cancela cuando quieras desde tu panel'],
  },
  plans: {
    perMonth: '/mes',
    popular: 'Nuestra elección',
    cta: `Pruébalo gratis ${DAYS} días`,
    dashboard: 'Ir a mi panel',
    noCard: 'Sin tarjeta de crédito',
    checksNote: CHECKS_EXPLAINER.es,
    everyPlanLabel: 'En todos los planes',
    everyPlan: [
      'Publicación programada automática en WordPress, Shopify y Wix',
      'Seguimiento de tu posición en Google y en Google Maps',
      'Comprobación de si 6 motores de IA, como ChatGPT y Gemini, te mencionan',
      'Una puntuación de salud de la web con la lista de arreglos',
      'Informes en PDF y Excel que puedes enviar',
      'Soporte personal',
    ],
  },
  unsure: {
    text: '¿Aún no lo tienes claro? Empieza por una comprobación gratuita de tu web.',
    cta: 'Analizar mi web',
  },
  included: {
    eyebrow: 'En todos los planes',
    title: 'Sin extras. Todo entra desde el primer día.',
    body: 'Los planes solo se diferencian en volumen: cuántas webs, cuántos artículos y cuántas comprobaciones tienes cada mes. Las funciones son las mismas en todos.',
    items: [
      {
        title: 'Artículos escritos y publicados',
        desc: 'La plataforma escribe artículos completos sobre los temas que apruebas, con imágenes, una sección de preguntas y enlaces internos, y los publica en tu web según un calendario.',
      },
      {
        title: 'Seguimiento en Google y Google Maps',
        desc: 'Mira en qué puesto apareces para cada frase que te importa, en la búsqueda normal y en Maps, y cómo se mueve con el tiempo.',
      },
      {
        title: 'Visibilidad en motores de IA',
        desc: 'Comprueba si ChatGPT, Gemini, Perplexity, Copilot, Grok y Google AI te mencionan, y a quién mencionan en tu lugar.',
      },
      {
        title: 'Investigación de palabras clave',
        desc: 'La plataforma encuentra lo que buscan y preguntan tus clientes, y propone por dónde empezar.',
      },
      {
        title: 'Informes que puedes enviar',
        desc: 'Posiciones, tendencias y visibilidad en IA en un informe PDF o Excel hecho en un clic, listo para un cliente o para la dirección.',
      },
      {
        title: 'Soporte personal',
        desc: 'Te responden personas de verdad, por WhatsApp y por correo.',
      },
    ],
  },
  value: {
    eyebrow: 'Por qué sale a cuenta',
    title: 'Una suscripción en lugar de tres trabajos',
    body: 'Normalmente necesitas a alguien que elija temas y escriba, a alguien que lo suba a la web y una herramienta que compruebe si ha funcionado. Aquí todo pasa en un mismo sitio.',
    items: [
      {
        title: 'El trabajo se hace, no solo se mide',
        desc: 'No es otro informe esperando a que alguien actúe. La plataforma escribe y publica los artículos ella misma, solo sobre temas que has aprobado.',
      },
      {
        title: 'Ves exactamente qué estás pagando',
        desc: 'Artículos publicados, cambios de posición y menciones en IA en un mismo panel, y en un informe que puedes pasar a quien quieras.',
      },
      {
        title: 'Sin ataduras',
        desc: `Una prueba de ${DAYS} días sin tarjeta, pago mensual y cancelación cuando quieras desde tu panel.`,
      },
    ],
  },
  usage: {
    eyebrow: 'Cómo se cuenta el consumo',
    title: 'Sin letra pequeña',
    body: 'Tres unidades sencillas, y cada cupo se renueva cada mes.',
    items: [
      {
        title: 'Artículo',
        desc: 'Crear un artículo nuevo gasta uno de tu cupo. Editar, programar o publicar uno que ya existe no gasta nada.',
      },
      {
        title: 'Comprobación de posición en Google',
        desc: 'Mirar en qué puesto aparece una palabra clave, en un sitio: Google o Google Maps. La misma palabra clave en los dos cuenta como dos comprobaciones.',
      },
      {
        title: 'Comprobación de visibilidad en IA',
        desc: 'Hacer una pregunta a un motor de IA y ver si tu negocio se menciona. La misma pregunta en ChatGPT y en Gemini cuenta como dos comprobaciones.',
      },
    ],
    note: 'El cupo de artículos es por cuenta. En los planes con más de una web, se reparte entre todas tus webs.',
  },
  faq: {
    eyebrow: 'Preguntas',
    title: 'Lo que se pregunta antes de elegir un plan',
    body: '¿No encuentras tu respuesta? Escríbenos por WhatsApp.',
    items: [
      {
        q: '¿Qué plan nos conviene?',
        a: `Basic y Advanced son para una sola web, y la diferencia principal entre ellos son los artículos al mes: ${BASIC_ARTICLES} frente a ${ADVANCED_ARTICLES}. Premium es para quien lleva más de una web, y Agency para gestionar webs de clientes. Puedes empezar pequeño y subir de plan cuando quieras.`,
      },
      {
        q: '¿Qué incluye la prueba gratuita?',
        a: `${DAYS} días sin tarjeta: una web, hasta ${TRIAL_CATALOG.maxKeywordsPerProject} palabras clave, hasta ${TRIAL_CATALOG.maxGoogleChecksLifetime} comprobaciones de posición en Google, hasta ${TRIAL_CATALOG.maxAIChecksLifetime} comprobaciones de visibilidad en IA y un artículo, para que veas todo el proceso desde el principio hasta la publicación.`,
      },
      {
        q: `¿Qué pasa cuando acaban los ${DAYS} días de prueba?`,
        a: 'Eliges un plan y sigues desde donde estabas. Si no eliges ninguno, no se cobra nada, porque nunca te pedimos una tarjeta.',
      },
      {
        q: '¿Podemos cambiar de plan o cancelar?',
        a: 'Sí. Cambia de plan cuando quieras y los nuevos cupos se aplican desde ese momento. Cancela desde tu panel, sin penalizaciones ni gastos de cancelación.',
      },
      {
        q: '¿Qué pasa con los artículos que no usamos?',
        a: 'El cupo se renueva cada mes, y los artículos sin usar no se acumulan para el mes siguiente.',
      },
      {
        q: '¿Los análisis se ejecutan solos?',
        a: 'Lanza un análisis manual cuando quieras, o activa un análisis mensual automático que se ejecuta solo cada mes. Por ahora no hay un análisis automático diario ni semanal.',
      },
      {
        q: '¿Se pueden programar y publicar los artículos automáticamente?',
        a: 'Sí. Programa un artículo para una fecha futura, o publícalo al momento en una web conectada: WordPress, Shopify o Wix.',
      },
      {
        q: '¿Cómo se protegen nuestros datos?',
        a: 'Todo el tráfico va cifrado (SSL/TLS), las contraseñas se guardan cifradas y cada cuenta ve solo sus propios datos. La información se comparte únicamente con los proveedores sobre los que funciona la plataforma, como alojamiento, pagos y datos de búsqueda, según la política de privacidad.',
        // The Spanish privacy policy is owned by the legal thread; until it
        // exists this link points at the English one, which is live.
        link: { label: 'Leer la política de privacidad', href: '/en/privacy' },
      },
    ],
  },
  cta: {
    title: '¿Quieres ver primero qué encuentra la plataforma en tu web?',
    body: `La comprobación gratuita lee tu web y te devuelve un primer resumen de investigación, sin registro. O abre una prueba de ${DAYS} días y pruébalo todo.`,
    check: 'Analizar mi web gratis',
    trial: 'Empezar la prueba gratuita',
    dashboard: 'Ir a mi panel',
  },
}

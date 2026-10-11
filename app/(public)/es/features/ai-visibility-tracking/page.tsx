import { Metadata } from 'next'
import { Award, FileSpreadsheet, Lightbulb, LineChart, Link2, MessagesSquare, Sparkles, Target, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingEs } from '@/lib/i18n/public/landing-es'

export const metadata: Metadata = {
  title: 'Seguimiento de la visibilidad en IA | Go Top SEO',
  description: 'Sigue las menciones de tu negocio en ChatGPT, Gemini, Perplexity y Google AI. Mide tu GEO, la optimización para motores generativos.',
  alternates: {
    canonical: 'https://www.gotopseo.com/es/features/ai-visibility-tracking',
    languages: buildHreflangAlternates('/features/ai-visibility-tracking', '/en/features/ai-visibility-tracking', '/es/features/ai-visibility-tracking'),
  },
}

export default function AIVisibilityFeaturePage() {
  return <FeaturePage locale="es" content={CONTENT} path="/features/ai-visibility-tracking" />
}

const C = FEATURE_COMMON.es

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Visibilidad en los motores de IA',
    eyebrowIcon: Sparkles,
    title: 'Cuando un cliente pregunta a ChatGPT,',
    accent: 'sabe si te recomienda',
    subtitle: 'La plataforma hace a ChatGPT, Gemini, Perplexity, Copilot, Grok y Google AI las preguntas que hacen tus clientes, y muestra quién aparece en la respuesta: tú, o un competidor.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <AiVisual copy={landingEs.features.ai.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Por qué importa ahora',
      title: 'Hay clientes que ya no buscan en Google. Preguntan a la IA.',
      intro: 'Quien aparece en la respuesta se lleva la recomendación. Quien no aparece no está en la conversación.',
      items: [
        { icon: MessagesSquare, title: 'La pregunta se movió al chat', body: 'En lugar de repasar diez resultados, la gente hace una pregunta y recibe una respuesta con unos pocos nombres. Uno de ellos debería ser el tuyo.' },
        { icon: Award, title: 'Una recomendación que la gente se cree', body: 'Cuando un motor de IA menciona un negocio, suena a recomendación. Un cliente que llega así llega decidido.' },
        { icon: Target, title: 'Tus competidores puede que ya estén', body: 'Sin comprobarlo no hay forma de saber a quién recomiendan en tu sector. El seguimiento lo muestra pregunta a pregunta y motor a motor.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Cómo funciona',
      title: 'Tres pasos para tener la foto clara',
      items: [
        { title: 'Elige las preguntas', body: 'La plataforma propone preguntas a partir de las palabras clave de tu negocio, y tú añades o quitas. Por ejemplo: "¿Quién instala aire acondicionado en Madrid?"' },
        { title: 'Cada motor se pregunta por separado', body: 'Cada pregunta va a los seis motores, y cada respuesta se lee y se comprueba.' },
        { title: 'Mira quién entra', body: 'Para cada pregunta: si te mencionaron, si tu web se citó como fuente, y a quién mencionaron en tu lugar.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Qué obtienes',
      title: 'Todo lo que necesitas para entrar en la respuesta',
      items: [
        { icon: Sparkles, title: 'Menciones por motor', body: 'En cada uno de los seis motores por separado, porque cada uno responde de otra manera.' },
        { icon: Link2, title: 'Citado como fuente', body: 'Si la respuesta apunta a tu web como fuente, no solo a tu nombre.' },
        { icon: Users, title: 'A quién mencionan en tu lugar', body: 'Los competidores que salen en las respuestas, y las preguntas en las que se llevan la recomendación.' },
        { icon: Lightbulb, title: 'Qué mejorar', body: 'Recomendaciones sobre qué añadir o cambiar en tu web para tener más posibilidades de estar en la respuesta.' },
        { icon: LineChart, title: 'Tendencias en el tiempo', body: 'Cada comprobación se guarda, así puedes ver si la visibilidad sube cuando se publican artículos.' },
        { icon: FileSpreadsheet, title: 'Informes en PDF y Excel', body: 'Menciones y citas por motor, en un informe que puedes enviar a un cliente o a tu jefe.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Preguntas',
      title: 'Lo que se pregunta sobre la visibilidad en IA',
      items: [
        { q: '¿Qué diferencia hay entre SEO y GEO?', a: 'El SEO es aparecer en los resultados de Google. El GEO es aparecer en las respuestas de los motores de IA. La plataforma mide los dos, y los artículos que escribe están pensados para los dos: estructura clara y secciones de preguntas, además de datos estructurados en sitios WordPress con el plugin de Go Top.' },
        { q: '¿Garantizáis que apareceremos en las respuestas?', a: 'No. Nadie controla lo que responde un motor de IA. Lo que sí hacemos: medir exactamente dónde estás, mostrar quién aparece en tu lugar y crear contenido que mejora tus posibilidades.' },
        { q: '¿Cómo se cuenta una comprobación de IA?', a: 'Una pregunta en un motor es una comprobación. La misma pregunta en los seis motores son seis comprobaciones. El cupo de cada plan está en la página de precios.' },
      ],
    },
  ],
  cta: {
    title: 'Descubre qué dice ChatGPT sobre tu sector',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}

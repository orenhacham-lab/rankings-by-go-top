import { Metadata } from 'next'
import { FileCheck2, FileText, Globe, Image as ImageIcon, Link2, ListChecks, PenLine, Search, Send, ShieldCheck, ShoppingBag } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ContentVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { landingEs } from '@/lib/i18n/public/landing-es'

export const metadata: Metadata = {
  title: 'Creación, programación y publicación de contenido SEO y GEO | Go Top SEO',
  description:
    'Planifica temas, recibe un artículo completo escrito por IA, edítalo, prográmalo y publícalo directamente en WordPress o Shopify, todo desde un mismo lugar.',
  alternates: {
    canonical: 'https://www.gotopseo.com/es/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates('/features/seo-geo-content-publishing', '/en/features/seo-geo-content-publishing', '/es/features/seo-geo-content-publishing'),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return <FeaturePage locale="es" content={CONTENT} />
}

const C = FEATURE_COMMON.es

const faqs = [
  {
    q: '¿Tengo que editar cada artículo antes de que se publique?',
    a: 'No hace falta, pero siempre puedes. Solo se escriben los temas que has aprobado, cada artículo pasa un control de calidad antes de publicarse, y puedes leerlo, editarlo y aprobarlo antes de que salga.',
  },
  {
    q: '¿En qué webs puedo publicar?',
    a: 'La publicación directa funciona con WordPress y Shopify. Conecta tu web una vez, y los artículos aprobados van directos a ella.',
  },
  {
    q: '¿Cómo funciona la programación?',
    a: 'Cuando apruebas un artículo, publícalo al momento o elige una fecha y una hora. La plataforma lo publica ella sola cuando llega ese momento.',
  },
  {
    q: '¿Los artículos vienen con imágenes y títulos SEO?',
    a: 'Sí. Cada artículo viene con una imagen destacada e imágenes en el texto, un meta título y una meta descripción, y todo se puede editar antes de publicar.',
  },
  {
    q: '¿Cómo funciona el cupo de artículos?',
    a: 'Cada plan incluye un número de artículos al mes. El cupo es por cuenta, se renueva cada mes, y los artículos sin usar no se acumulan. Crear un artículo gasta uno; editar, programar y publicar no gastan nada.',
  },
  {
    q: '¿Y si se me acaban a mitad de mes?',
    a: 'Sube a un plan con más artículos y sigue en el mismo mes.',
  },
  {
    q: '¿Puedo probarlo antes de pagar?',
    a: `Sí. Una prueba de ${TRIAL_CATALOG.days} días sin tarjeta de crédito, con un artículo incluido para que veas todo el proceso hasta la publicación.`,
  },
]

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Redacción y publicación',
    eyebrowIcon: FileText,
    title: 'Artículos escritos y publicados en tu web,',
    accent: 'sin un equipo de contenido',
    subtitle: 'Planifica temas, apruébalos y recibe un artículo completo con imágenes, una sección de preguntas y enlaces internos. Edítalo si quieres, y publícalo en WordPress o Shopify, ahora o en la fecha que elijas.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ContentVisual copy={landingEs.features.content.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Por qué el contenido se atasca',
      title: 'El contenido se va dejando porque en realidad son tres trabajos',
      intro: 'Encontrar un tema, escribirlo y subirlo a la web. Cada uno lleva tiempo, así que se pasa al mes siguiente. Aquí los tres pasan en un mismo lugar.',
      items: [
        { icon: Search, title: 'Encontrar sobre qué escribir', body: 'Comprobar qué busca la gente, qué cubren ya los competidores y qué le falta a tu web.' },
        { icon: PenLine, title: 'Escribirlo bien', body: 'Un buen borrador lleva horas, y después toca editarlo y revisarlo más.' },
        { icon: Send, title: 'Subirlo a la web', body: 'Copiar, subir imágenes, rellenar los campos SEO y acordarse de darle a publicar.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Cómo funciona',
      title: 'Del tema al artículo publicado en cinco pasos',
      items: [
        { title: 'Planifica temas', body: 'La plataforma propone temas a partir de las palabras clave de tu negocio y de tu sector.' },
        { title: 'Aprueba', body: 'Elige los temas que encajan ahora. Solo esos se escriben.' },
        { title: 'Recibe un artículo completo', body: 'Título, cuerpo, subtítulos, imágenes, una sección de preguntas y enlaces internos.' },
        { title: 'Revisa y edita', body: 'Léelo, cambia todo lo que quieras, y apruébalo cuando esté listo.' },
        { title: 'Programa o publica', body: 'Ahora, o en la fecha y la hora que elijas, directo a WordPress o Shopify.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'En cada artículo',
      title: 'Un artículo completo, no un texto en bruto',
      items: [
        { icon: FileText, title: 'Un artículo entero', body: 'El tema que aprobaste se convierte en un artículo completo, no en un resumen ni en un esquema.' },
        { icon: ImageIcon, title: 'Imágenes', body: 'Una imagen destacada e imágenes en el texto, sin tener que buscarlas y subirlas tú.' },
        { icon: ListChecks, title: 'Preguntas y datos estructurados', body: 'Una sección de preguntas en cada artículo. En sitios WordPress con el plugin de Go Top, también se añaden datos estructurados que Google y los motores de IA pueden leer.' },
        { icon: Link2, title: 'Enlaces internos', body: 'Enlaces propuestos a otras páginas de tu web, y tú apruebas cuáles entran.' },
        { icon: FileCheck2, title: 'Meta título y meta descripción', body: 'Escritos para la búsqueda, y editables como todo lo demás.' },
        { icon: ShieldCheck, title: 'Un control de calidad antes de publicar', body: 'Cada artículo se revisa antes de salir, así no se publica nada a medias.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Publicación directa',
      title: 'Conecta una vez y publica sin copiar y pegar',
      intro: 'Un artículo que has aprobado va directo a tu web, con sus imágenes y sus campos SEO.',
      items: [
        { icon: Globe, title: 'WordPress', body: 'Conecta tu web de WordPress y publica artículos en ella al momento o programados.' },
        { icon: ShoppingBag, title: 'Shopify', body: 'Conecta tu tienda de Shopify y publica artículos del blog directamente desde la plataforma.' },
      ],
    },
    { kind: 'faq', eyebrow: 'Preguntas', title: 'Lo que se pregunta sobre la redacción y la publicación', items: faqs },
  ],
  cta: {
    title: 'Tu próximo artículo podría escribirse hoy',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}

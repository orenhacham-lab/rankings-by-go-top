import { Metadata } from 'next'
import { FileCheck2, FileText, Globe, Image as ImageIcon, Link2, ListChecks, PenLine, Search, Send, ShieldCheck, ShoppingBag } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ContentVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { landingPtBR } from '@/lib/i18n/public/landing-pt-BR'

export const metadata: Metadata = {
  title: 'Criação, agendamento e publicação de conteúdo SEO e GEO | Go Top SEO',
  description:
    'Planeje temas, receba um artigo completo escrito por IA, edite, agende e publique direto no WordPress ou na Shopify, tudo em um só lugar.',
  alternates: {
    canonical: 'https://www.gotopseo.com/pt-BR/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates('/features/seo-geo-content-publishing', '/en/features/seo-geo-content-publishing', '/es/features/seo-geo-content-publishing'),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return <FeaturePage locale="pt-BR" content={CONTENT} />
}

const C = FEATURE_COMMON['pt-BR']

const faqs = [
  {
    q: 'Preciso editar cada artigo antes de ele ser publicado?',
    a: 'Não é obrigatório, mas você sempre pode. Só são escritos os temas que você aprovou, cada artigo passa por um controle de qualidade antes de ser publicado, e você pode ler, editar e aprovar antes de ele sair.',
  },
  {
    q: 'Em quais sites posso publicar?',
    a: 'A publicação direta funciona com WordPress e Shopify. Conecte o seu site uma vez, e os artigos aprovados vão direto para ele.',
  },
  {
    q: 'Como funciona o agendamento?',
    a: 'Quando você aprova um artigo, publique na hora ou escolha uma data e um horário. A plataforma publica sozinha quando chegar o momento.',
  },
  {
    q: 'Os artigos vêm com imagens e títulos SEO?',
    a: 'Sim. Cada artigo vem com uma imagem de destaque e imagens no texto, um meta título e uma meta descrição, e tudo pode ser editado antes de publicar.',
  },
  {
    q: 'Como funciona a cota de artigos?',
    a: 'Cada plano inclui um número de artigos por mês. A cota é por conta, renova todo mês, e os artigos não usados não se acumulam. Criar um artigo consome um; editar, agendar e publicar não consomem nada.',
  },
  {
    q: 'E se acabarem no meio do mês?',
    a: 'Suba para um plano com mais artigos e continue no mesmo mês.',
  },
  {
    q: 'Posso testar antes de pagar?',
    a: `Sim. Um teste de ${TRIAL_CATALOG.days} dias sem cartão de crédito, com um artigo incluído para você ver todo o processo até a publicação.`,
  },
]

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Redação e publicação',
    eyebrowIcon: FileText,
    title: 'Artigos escritos e publicados no seu site,',
    accent: 'sem uma equipe de conteúdo',
    subtitle: 'Planeje temas, aprove-os e receba um artigo completo com imagens, uma seção de perguntas e links internos. Edite se quiser, e publique no WordPress ou na Shopify, agora ou na data que você escolher.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ContentVisual copy={landingPtBR.features.content.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Por que o conteúdo trava',
      title: 'O conteúdo vai sendo deixado de lado porque, na verdade, são três trabalhos',
      intro: 'Encontrar um tema, escrevê-lo e subi-lo no site. Cada um toma tempo, então fica para o mês seguinte. Aqui os três acontecem em um só lugar.',
      items: [
        { icon: Search, title: 'Encontrar sobre o que escrever', body: 'Conferir o que as pessoas buscam, o que os concorrentes já cobrem e o que falta no seu site.' },
        { icon: PenLine, title: 'Escrever bem', body: 'Um bom rascunho leva horas, e depois ainda é preciso editar e revisar.' },
        { icon: Send, title: 'Subir no site', body: 'Copiar, subir imagens, preencher os campos de SEO e lembrar de clicar em publicar.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Como funciona',
      title: 'Do tema ao artigo publicado em cinco passos',
      items: [
        { title: 'Planeje temas', body: 'A plataforma sugere temas a partir das palavras-chave do seu negócio e do seu setor.' },
        { title: 'Aprove', body: 'Escolha os temas que fazem sentido agora. Só esses são escritos.' },
        { title: 'Receba um artigo completo', body: 'Título, corpo, subtítulos, imagens, uma seção de perguntas e links internos.' },
        { title: 'Revise e edite', body: 'Leia, mude tudo o que quiser, e aprove quando estiver pronto.' },
        { title: 'Agende ou publique', body: 'Agora, ou na data e no horário que você escolher, direto no WordPress ou na Shopify.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Em cada artigo',
      title: 'Um artigo completo, não um texto bruto',
      items: [
        { icon: FileText, title: 'Um artigo inteiro', body: 'O tema que você aprovou vira um artigo completo, não um resumo nem um esboço.' },
        { icon: ImageIcon, title: 'Imagens', body: 'Uma imagem de destaque e imagens no texto, sem você precisar procurá-las e subi-las.' },
        { icon: ListChecks, title: 'Perguntas e dados estruturados', body: 'Uma seção de perguntas e dados estruturados que o Google e os mecanismos de IA conseguem ler.' },
        { icon: Link2, title: 'Links internos', body: 'Links sugeridos para outras páginas do seu site, e você aprova quais entram.' },
        { icon: FileCheck2, title: 'Meta título e meta descrição', body: 'Escritos para a busca, e editáveis como todo o resto.' },
        { icon: ShieldCheck, title: 'Um controle de qualidade antes de publicar', body: 'Cada artigo é revisado antes de sair, assim nada é publicado pela metade.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'Publicação direta',
      title: 'Conecte uma vez e publique sem copiar e colar',
      intro: 'Um artigo que você aprovou vai direto para o seu site, com as suas imagens e os seus campos de SEO.',
      items: [
        { icon: Globe, title: 'WordPress', body: 'Conecte o seu site WordPress e publique artigos nele na hora ou de forma agendada.' },
        { icon: ShoppingBag, title: 'Shopify', body: 'Conecte a sua loja Shopify e publique artigos do blog direto pela plataforma.' },
      ],
    },
    { kind: 'faq', eyebrow: 'Perguntas', title: 'O que se pergunta sobre a redação e a publicação', items: faqs },
  ],
  cta: {
    title: 'Seu próximo artigo pode ser escrito hoje',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}

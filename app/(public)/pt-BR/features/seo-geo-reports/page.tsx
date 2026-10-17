import { Metadata } from 'next'
import { ArrowUpDown, ChartColumn, Clock, Eye, FileSpreadsheet, Handshake, History, Sparkles, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportsVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingPtBR } from '@/lib/i18n/public/landing-pt-BR'

export const metadata: Metadata = {
  title: 'Relatórios SEO e GEO | Go Top SEO',
  description: 'Relatórios profissionais em PDF e Excel com posições, tendências e análise de concorrência, prontos para enviar a um cliente em segundos.',
  alternates: {
    canonical: 'https://www.gotopseo.com/pt-BR/features/seo-geo-reports',
    languages: buildHreflangAlternates('/features/seo-geo-reports', '/en/features/seo-geo-reports', '/es/features/seo-geo-reports'),
  },
}

export default function SEOGeoReportsFeaturePage() {
  return <FeaturePage locale="pt-BR" content={CONTENT} path="/features/seo-geo-reports" />
}

const C = FEATURE_COMMON['pt-BR']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Relatórios',
    eyebrowIcon: ChartColumn,
    title: 'Um relatório que mostra o que mudou,',
    accent: 'com um clique',
    subtitle: 'Posições no Google e no Maps e visibilidade nos mecanismos de IA, em um relatório PDF ou Excel pronto para enviar a um cliente, ao seu chefe, ou para você.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ReportsVisual copy={landingPtBR.features.reports.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Por que um relatório',
      title: 'O bom trabalho precisa ser visto',
      intro: 'Um relatório claro poupa explicações e mostra que o site está avançando.',
      items: [
        { icon: Eye, title: 'O quadro completo', body: 'Google, Maps e IA em um só lugar, em vez de capturas de tela de várias ferramentas.' },
        { icon: Clock, title: 'Sem montar à mão', body: 'Os dados já estão na plataforma. O relatório é construído com eles em um clique.' },
        { icon: Handshake, title: 'Confiança do cliente', body: 'Para agências: um relatório periódico mostra ao cliente o que mudou e por que continuar.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Como funciona',
      title: 'Dos dados ao relatório em três passos',
      items: [
        { title: 'Escolha um projeto', body: 'Cada site é o seu próprio projeto, com os seus próprios relatórios.' },
        { title: 'Exporte', body: 'PDF para enviar, ou Excel para trabalhar com os dados.' },
        { title: 'Envie', body: 'A um cliente, ao seu chefe ou a um sócio, sem nada para diagramar.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'O que há no relatório',
      title: 'Tudo o que importa, nada do que não importa',
      items: [
        { icon: TrendingUp, title: 'Posições e mudanças', body: 'Para cada termo: a posição de hoje, a anterior, e a mudança entre as duas.' },
        { icon: ArrowUpDown, title: 'A página que ranqueia', body: 'Qual página do seu site aparece para cada termo.' },
        { icon: ChartColumn, title: 'Tráfego estimado', body: 'Uma estimativa das visitas vindas do Google, segundo o volume de busca e a posição atual.' },
        { icon: Sparkles, title: 'Visibilidade em IA', body: 'Menções e citações do seu site, para cada mecanismo de IA separadamente.' },
        { icon: History, title: 'Histórico completo', body: 'No arquivo Excel: todas as verificações ao longo do tempo, não só a última.' },
        { icon: FileSpreadsheet, title: 'PDF e Excel', body: 'Um PDF caprichado para enviar, e Excel para quem quiser trabalhar com os números.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Perguntas',
      title: 'O que se pergunta sobre os relatórios',
      items: [
        // Honest about what exists today: the export itself has no Portuguese yet.
        { q: 'Em quais idiomas saem os relatórios?', a: 'Por enquanto você pode exportar um relatório em inglês ou em hebraico. O relatório em português chegará com o painel em português.' },
        { q: 'Posso fazer um relatório separado para cada cliente?', a: 'Sim. Cada site é o seu próprio projeto, e cada projeto tem o seu próprio relatório. O número de projetos de cada plano está na página de preços.' },
        { q: 'Os relatórios estão em todos os planos?', a: 'Sim. Os relatórios em PDF e Excel estão em todos os planos.' },
      ],
    },
  ],
  cta: {
    title: 'Seu primeiro relatório está a poucos dias',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}

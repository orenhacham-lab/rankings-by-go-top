import { Metadata } from 'next'
import { FileSpreadsheet, FileText, Globe, History, LineChart, Link2, MapPin, Smartphone, Target, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingPtBR } from '@/lib/i18n/public/landing-pt-BR'

export const metadata: Metadata = {
  title: 'Acompanhamento de posições no Google orgânico | Go Top SEO',
  description: 'Acompanhe suas posições no Google por palavra-chave, local, idioma e dispositivo. Faça uma análise quando quiser, ou uma vez por mês de forma automática, com relatórios de tendências e concorrência.',
  alternates: {
    canonical: 'https://www.gotopseo.com/pt-BR/features/google-organic-rank-tracking',
    languages: buildHreflangAlternates('/features/google-organic-rank-tracking', '/en/features/google-organic-rank-tracking', '/es/features/google-organic-rank-tracking'),
  },
}

export default function GoogleOrganicFeaturePage() {
  return <FeaturePage locale="pt-BR" content={CONTENT} path="/features/google-organic-rank-tracking" />
}

const C = FEATURE_COMMON['pt-BR']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Posições no Google',
    eyebrowIcon: TrendingUp,
    title: 'Saiba em que posição você está no Google,',
    accent: 'e se o trabalho está dando resultado',
    subtitle: 'Acompanhe cada termo que importa para você, por país, cidade, idioma e dispositivo. Analise quando quiser, ou uma vez por mês de forma automática, com o histórico de cada mudança.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <RankVisual copy={landingPtBR.features.rank.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Por que medir',
      title: 'O que não se mede não melhora',
      intro: 'Sem acompanhamento, não há como saber se um artigo novo, uma mudança no site ou o trabalho de uma agência mexeram em alguma coisa.',
      items: [
        { icon: LineChart, title: 'Veja a direção', body: 'Para cima, para baixo ou igual em cada termo, de uma análise para a seguinte.' },
        { icon: FileText, title: 'Ligue o conteúdo ao resultado', body: 'Veja quais páginas sobem quando um artigo é publicado, e sobre o que escrever em seguida.' },
        { icon: Target, title: 'Foque no que está perto', body: 'Os termos que estão logo abaixo da primeira página costumam ser a oportunidade mais próxima. O acompanhamento mostra quais são.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Como funciona',
      title: 'Configure uma vez e veja cada mudança',
      items: [
        { title: 'Adicione os seus termos', body: 'Digite os termos que importam para você, ou adicione-os a partir da pesquisa de palavras-chave com um clique.' },
        { title: 'Escolha onde e em qual dispositivo', body: 'País, idioma, cidade, computador ou celular, porque os resultados mudam com cada um.' },
        { title: 'Analise e veja a tendência', body: 'Faça uma análise manual quando quiser, ou uma mensal automática que roda sozinha. Cada resultado fica guardado no seu histórico.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'O que você recebe',
      title: 'Um retrato preciso de onde você está no Google',
      items: [
        { icon: Smartphone, title: 'Computador e celular, separados', body: 'Os resultados no celular e no computador nem sempre são iguais. Confira cada um por si.' },
        { icon: Globe, title: 'Por país, cidade e idioma', body: 'Veja o que um cliente vê quando busca a partir do lugar que importa para você.' },
        { icon: Link2, title: 'Qual página ranqueia', body: 'Para cada termo, qual página do seu site aparece nos resultados.' },
        { icon: History, title: 'Histórico completo', body: 'Cada análise é guardada, assim você vê o caminho percorrido e não só a foto de hoje.' },
        { icon: MapPin, title: 'Também o Google Maps', body: 'Acompanhe os mesmos termos no Maps, por cidade ou por região.' },
        { icon: FileSpreadsheet, title: 'Relatórios em PDF e Excel', body: 'Posições, mudanças e histórico em um relatório que você pode repassar a quem quiser.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Perguntas',
      title: 'O que se pergunta sobre o acompanhamento de posições',
      items: [
        { q: 'Com que frequência as posições são conferidas?', a: 'A cada vez que você faz uma análise manual, e você também pode ativar uma análise mensal automática. Por enquanto não há análise automática diária nem semanal.' },
        { q: 'Por que o que eu vejo no Google não bate com a plataforma?', a: 'O Google personaliza os resultados por local, dispositivo e histórico de buscas. A plataforma confere em condições fixas que você define, e isso a torna melhor para comparar ao longo do tempo.' },
        { q: 'Quantos termos posso acompanhar?', a: 'Depende do seu plano. As cotas exatas estão na página de preços.' },
      ],
    },
  ],
  cta: {
    title: 'Descubra onde você está hoje',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}

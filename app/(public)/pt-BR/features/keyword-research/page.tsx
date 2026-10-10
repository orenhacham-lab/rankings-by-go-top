import { Metadata } from 'next'
import { Coins, Info, Lightbulb, Plus, Sparkles, Target, TrendingUp, Search } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { KeywordIdeasVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Pesquisa de palavras-chave | Go Top SEO',
  description: 'Descubra ideias de palavras-chave com dados do Google Ads: volume de busca, concorrência e custo por clique estimado. Adicione-as ao acompanhamento de posições ou transforme-as em perguntas para a IA.',
  alternates: {
    canonical: 'https://www.gotopseo.com/pt-BR/features/keyword-research',
    languages: buildHreflangAlternates('/features/keyword-research', '/en/features/keyword-research', '/es/features/keyword-research'),
  },
}

export default function KeywordResearchFeaturePage() {
  return <FeaturePage locale="pt-BR" content={CONTENT} path="/features/keyword-research" />
}

const C = FEATURE_COMMON['pt-BR']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Pesquisa de palavras-chave',
    eyebrowIcon: Search,
    title: 'Escreva sobre o que os seus clientes',
    accent: 'estão realmente buscando',
    subtitle: 'Ideias de palavras-chave com dados do Google Ads, com volume de busca mensal, concorrência e custo por clique estimado. Adicione as boas ao acompanhamento, ou transforme-as em perguntas para a IA com um clique.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: (
      <KeywordIdeasVisual
        seed="instalação de ar-condicionado"
        headers={['Palavra-chave', 'Buscas por mês', 'Concorrência']}
        rows={[
          { keyword: 'instalação de ar-condicionado split', volume: '1.900', competition: 'Média', level: 'medium', added: true },
          { keyword: 'preço de instalação de ar-condicionado', volume: '1.300', competition: 'Baixa', level: 'low' },
          { keyword: 'ar-condicionado de duto', volume: '590', competition: 'Alta', level: 'high' },
          { keyword: 'conserto de ar-condicionado em guarulhos', volume: '320', competition: 'Baixa', level: 'low', added: true },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Por que começar por aqui',
      title: 'Um artigo excelente sobre um termo que ninguém busca não traz ninguém',
      intro: 'A pesquisa mostra o que as pessoas buscam, com que frequência e o quão difícil é competir, antes de você escrever uma única palavra.',
      items: [
        { icon: TrendingUp, title: 'Demanda real', body: 'Volume de busca mensal estimado para cada termo, a partir dos dados do Google.' },
        { icon: Target, title: 'Onde você pode ganhar', body: 'A concorrência de cada termo, para você escolher os que realmente consegue ranquear.' },
        { icon: Coins, title: 'Quanto vale um clique', body: 'O que os anunciantes pagam por clique, um bom sinal de quanto um termo vale para as empresas.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Como funciona',
      title: 'De uma ideia a uma lista de trabalho',
      items: [
        { title: 'Comece por um termo ou um site', body: 'Digite um termo ou o endereço de um site, e escolha o país e o idioma.' },
        { title: 'Receba ideias com dados', body: 'Uma lista de termos relacionados, com volume de busca, concorrência e custo por clique estimado.' },
        { title: 'Ponha-os para trabalhar', body: 'Adicione termos ao acompanhamento de posições, ou transforme-os em perguntas para o acompanhamento em IA.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'O que você pode fazer',
      title: 'Tudo de que você precisa para escolher os termos certos',
      items: [
        { icon: Lightbulb, title: 'Ideias a partir de um termo ou de um site', body: 'Termos relacionados a partir de um único termo, ou do endereço de um site.' },
        { icon: TrendingUp, title: 'Volume de busca', body: 'Quantas vezes cada termo é buscado por mês, segundo a estimativa do Google.' },
        { icon: Target, title: 'Concorrência', body: 'Baixa, média ou alta, para cada termo.' },
        { icon: Coins, title: 'Custo por clique estimado', body: 'A faixa de lances para o topo da página na busca paga.' },
        { icon: Plus, title: 'Para o acompanhamento com um clique', body: 'O termo que você escolher entra direto no acompanhamento de posições do projeto.' },
        { icon: Sparkles, title: 'Perguntas para o acompanhamento em IA', body: 'Transforme um termo em uma pergunta em linguagem natural para conferir se os mecanismos de IA recomendam você.' },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: 'Sobre os dados',
      body: (
        <>
          <p>Os dados vêm da API do Google Ads. O volume de busca, a concorrência e o custo por clique são estimativas do Google, e mudam conforme o setor, a época do ano e o local.</p>
          <p>São um bom ponto de partida para escolher temas. O resultado real é medido no acompanhamento de posições.</p>
        </>
      ),
    },
  ],
  cta: {
    title: 'Encontre os termos que valem a pena trabalhar',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}

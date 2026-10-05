import { Metadata } from 'next'
import { FileSpreadsheet, History, MapPin, Navigation, Phone, Search, Store, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Acompanhamento de posições no Google Maps | Go Top SEO',
  description: 'Acompanhe a sua visibilidade local no Google Maps. Confira a sua posição por cidade e por região, algo indispensável no SEO local.',
  alternates: {
    canonical: 'https://www.gotopseo.com/pt-BR/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates('/features/google-maps-rank-tracking', '/en/features/google-maps-rank-tracking', '/es/features/google-maps-rank-tracking'),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="pt-BR" content={CONTENT} />
}

const C = FEATURE_COMMON['pt-BR']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Google Maps',
    eyebrowIcon: MapPin,
    title: 'Quando alguém procura por perto um negócio como o seu,',
    accent: 'saiba onde você está no mapa',
    subtitle: 'Acompanhe a sua posição no Google Maps por termo e por região: uma cidade ou um ponto exato do mapa. Veja quem está na sua frente e como a sua posição se move ao longo do tempo.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    // The example is a Brazilian market, not a translated American one: the same
    // choice as the Portuguese landing page's demo (São Paulo).
    visual: (
      <MapsVisual
        positionLabel="Sua posição"
        position="3"
        positionSub='em São Paulo, "instalação de ar-condicionado"'
        changeLabel="Este mês"
        change="2"
        changeSub="posições acima"
        reviewsLabel="avaliações"
        rows={[
          { rank: 1, name: 'Clima Sul Instalações', stars: 4.8, reviews: 212 },
          { rank: 2, name: 'Ar Pleno São Paulo', stars: 4.6, reviews: 174 },
          { rank: 3, name: 'Seu negócio', stars: 4.7, reviews: 131, highlight: true },
          { rank: 4, name: 'Frio Norte Climatização', stars: 4.4, reviews: 98 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'Por que o mapa',
      title: 'Na busca local, o mapa é a vitrine',
      intro: 'Quando alguém procura um serviço por perto, o Google mostra primeiro poucos negócios no mapa. É ali que se decide para quem ligar.',
      items: [
        { icon: Phone, title: 'É de lá que ligam', body: 'Nos resultados do mapa, as pessoas ligam, pedem a rota ou entram no seu site com um toque.' },
        { icon: Users, title: 'Poucas posições, muitos concorrentes', body: 'Só um punhado de negócios fica com as primeiras posições. Você precisa saber se é um deles.' },
        { icon: MapPin, title: 'Cada região é outra corrida', body: 'Você pode ser o primeiro em uma cidade e nem aparecer na vizinha. O acompanhamento por região mostra isso.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: 'Como funciona',
      title: 'Três passos para ter o mapa claro',
      items: [
        { title: 'Configure o seu negócio', body: 'Adicione o seu negócio e a região que você atende.' },
        { title: 'Escolha termos e regiões', body: 'Por exemplo "instalação de ar-condicionado" em São Paulo, ou a partir de um ponto exato do mapa.' },
        { title: 'Acompanhe a evolução', body: 'Analise manualmente quando quiser ou uma vez por mês de forma automática, com o histórico de cada mudança.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'O que você recebe',
      title: 'Seu lugar no mapa, sem suposições',
      items: [
        { icon: MapPin, title: 'Por cidade ou por região', body: 'Confira cada termo na região onde estão os seus clientes.' },
        { icon: Navigation, title: 'Um ponto exato do mapa', body: 'Confira a partir das coordenadas que você escolher, para ver o que vê um cliente que está bem ali.' },
        { icon: Store, title: 'Quem está na sua frente', body: 'Os negócios que aparecem acima de você nos resultados, com a avaliação deles no Google.' },
        { icon: History, title: 'Histórico de posições', body: 'Veja como a sua posição mudou de uma análise para a seguinte.' },
        { icon: Search, title: 'Também a busca normal', body: 'Acompanhe os mesmos termos nos resultados normais do Google.' },
        { icon: FileSpreadsheet, title: 'Relatórios em PDF e Excel', body: 'Suas posições no Maps entram em um relatório que você pode repassar a quem quiser.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'Perguntas',
      title: 'O que se pergunta sobre o acompanhamento no Maps',
      items: [
        { q: 'Preciso de um perfil de empresa no Google?', a: 'Para aparecer no Maps é preciso ter um perfil de empresa no Google. O acompanhamento mostra onde o seu perfil aparece, ou se ele não aparece.' },
        { q: 'Com que frequência a minha posição é conferida?', a: 'A cada vez que você faz uma análise manual, e você também pode ativar uma análise mensal automática. Por enquanto não há análise automática diária nem semanal.' },
        { q: 'Cada termo no Maps conta como uma verificação separada?', a: 'Sim. Uma verificação no Google é um termo em um lugar, então o mesmo termo na busca normal e no Maps conta como duas verificações.' },
      ],
    },
  ],
  cta: {
    title: 'Descubra quem fica com as ligações na sua região',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}

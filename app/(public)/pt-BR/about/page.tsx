import { AboutPage, type AboutCopy } from '@/components/public/AboutPage'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export default function PortugueseAboutPage() {
  return <AboutPage locale="pt-BR" copy={COPY} />
}

/**
 * The same page as the Hebrew, English and Spanish ones, in Portuguese. Every
 * claim here is one the others already make: the years of experience, who
 * builds the platform, and what it does. Nothing is added for the Brazilian
 * market, because nothing new is true of it yet.
 */
const COPY: AboutCopy = {
  breadcrumb: { label: 'Quem somos', href: '/pt-BR/about' },
  title: '11 anos de SEO,',
  accent: 'em uma plataforma que trabalha para você.',
  subtitle: 'Uma plataforma que escreve e publica artigos no seu site, acompanha em que posição você aparece no Google e no Google Maps, e verifica se os mecanismos de IA recomendam você. Ela é construída pela Go Top, uma agência digital com mais de 11 anos de experiência em SEO e publicidade paga.',
  who: {
    title: 'Quem está por trás da plataforma',
    paragraphs: [
      'O Go Top SEO é construído pela Go Top, uma agência digital com mais de 11 anos de experiência em SEO orgânico, publicidade paga e desenvolvimento web para empresas em Israel e fora dele.',
      'A plataforma nasceu do nosso trabalho diário com clientes: vimos quais relatórios as pessoas realmente entendem, quais dados ajudam a decidir e onde o tempo se perde. Por isso construímos um só lugar onde o conteúdo é escrito, publicado e medido, no Google e nos mecanismos de IA.',
    ],
  },
  founderEyebrow: 'Quem está por trás',
  gaps: {
    title: 'O que faltava, e o que construímos no lugar',
    body: 'Queríamos que uma empresa pudesse fazer tudo o que é preciso para ser encontrada, em um só lugar, sem ter que aprender SEO.',
    missingLabel: 'O que faltava',
    builtLabel: 'O que construímos',
    rows: [
      {
        pain: { title: 'O acompanhamento manual de posições toma tempo demais', description: 'Conferir as mesmas palavras-chave de novo e de novo, várias telas de resultados e contas feitas à mão que pesam no dia a dia.' },
        answer: { title: 'Posições no Google e no Google Maps', description: 'Acompanhamento de cada frase na busca normal e no Maps, por região e por dispositivo, com o histórico de cada mudança.' },
      },
      {
        pain: { title: 'Dados espalhados entre ferramentas', description: 'Posições no Google, no Maps, nos mecanismos de IA e em outras fontes, sem uma imagem clara e única.' },
        answer: { title: 'Tudo em um só lugar', description: 'A pesquisa de palavras-chave, as posições, a visibilidade em IA e seus artigos estão conectados entre si, não espalhados em quatro ferramentas diferentes.' },
      },
      {
        pain: { title: 'Os mecanismos de IA já fazem parte da busca', description: 'Cada vez mais clientes perguntam ao ChatGPT, ao Gemini e ao Perplexity. Você precisa saber se a sua empresa está na resposta.' },
        answer: { title: 'Acompanhamento da visibilidade em IA', description: 'Veja se a sua empresa é mencionada, citada ou recomendada nas respostas do ChatGPT, Gemini, Perplexity e outros mecanismos de IA.' },
      },
      {
        pain: { title: 'Conteúdo que fica pela metade', description: 'Saber sobre o que escrever é metade do trabalho. Também é preciso escrever, subir no site e medir.' },
        answer: { title: 'Artigos escritos e publicados', description: 'Artigos completos sobre temas que você aprova, com imagens, uma seção de perguntas e links internos, publicados no WordPress ou na Shopify.' },
      },
    ],
  },
  approach: {
    title: 'Como trabalhamos',
    items: [
      {
        title: 'Transparência',
        description: 'Dizemos o que é medido, de onde vêm os dados e o que eles significam. Sem métricas infladas.',
      },
      {
        title: 'Dados úteis',
        description: 'Relatórios que contam uma história de negócio clara, não só números bonitos.',
      },
      {
        title: 'Interface simples',
        description:
          'Uma tela com o seu conteúdo, suas posições no Google e no Maps e sua visibilidade em IA, sem ruído a mais.',
      },
      {
        title: 'SEO e GEO juntos',
        description: 'Conteúdo pensado para o Google e para os mecanismos de IA, e medição dos dois.',
      },
    ],
  },
  choose: {
    title: 'Por que escolher o Go Top SEO',
    items: [
      {
        title: 'Atendimento pessoal, sem enrolação',
        description:
          'Sem um "gerente de conta" que muda todo mês. Você trabalha com os mesmos profissionais, que conhecem o seu negócio.',
      },
      {
        title: 'Transparência total',
        description: 'Você sempre sabe o que acontece na sua conta, o que funcionou, o que não funcionou e como melhorar.',
      },
      {
        title: 'Conhecimento sem jargão',
        description: 'Sem palavras infladas. Falamos de resultados que você pode medir e entender.',
      },
      {
        title: 'Nós também temos um negócio',
        description: 'Entendemos a pressão, o orçamento limitado e a necessidade de ver resultados, porque vivemos o mesmo.',
      },
    ],
  },
  cta: {
    title: 'Quer ver o que poderíamos fazer pelo seu site?',
    body: FEATURE_COMMON['pt-BR'].closeBody,
    contact: 'Dúvidas? Fale com a gente:',
    updated: 'Esta página foi atualizada pela última vez em setembro de 2026',
  },
}

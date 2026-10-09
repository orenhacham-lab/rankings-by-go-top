/**
 * The Brazilian Portuguese home page's words (app/(public)/pt-BR/page.tsx renders
 * them through components/public/LandingPage.tsx).
 *
 * Brazilian Portuguese, addressing the reader as "você" throughout. The demo's
 * example business is in São Paulo rather than in Austin: the Portuguese site
 * opens in Brazil, and a demo full of US cities and dollar figures reads as a
 * translated page rather than a Brazilian one. Its names and figures are
 * illustrative and the caption under the demo says so, the same promise the
 * other locales make.
 *
 * Every claim is one the product keeps: no invented customers, totals, logos or
 * press. Prices come from the plan catalogue, so the page cannot drift from it.
 */
import type { LandingCopy } from '@/components/public/LandingPage'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'

/**
 * The lowest monthly price. Brazil's own price is not set yet, so the
 * Portuguese page shows the USD price every market outside Israel is billed in
 * today, grouped the Brazilian way.
 */
const FROM_USD = Math.min(...Object.values(PLAN_CATALOG).map((p) => p.priceUSD)).toLocaleString('pt-BR')
const TRIAL_DAYS = TRIAL_CATALOG.days

export const landingPtBR: LandingCopy = {
  hero: {
    eyebrow: 'Posicionamento automático no Google e nos motores de IA, em um só sistema',
    title: 'Seus próximos clientes já estão pesquisando.',
    accent: 'Nós fazemos com que eles encontrem você.',
    subtitle:
      'O Go Top SEO escreve e publica artigos que respondem ao que os seus clientes procuram, e depois mostra onde você aparece no Google, no Google Maps, no ChatGPT e no Gemini. Sem equipe de conteúdo. Sem achismo.',
    signup: `Teste grátis por ${TRIAL_DAYS} dias`,
    trialNote: 'Sem cartão de crédito, sem compromisso. Cancele quando quiser.',
    checkLead: 'Ainda na dúvida? Faça uma análise gratuita do seu site, sem cadastro:',
    dashboard: 'Ir para o meu painel',
    trust: ['Publica no WordPress e na Shopify', 'Suporte feito por pessoas de verdade'],
    climbChip: '3º lugar no Google',
    published: 'Artigo publicado no seu site',
  },
  demo: {
    label: 'Uma demonstração real da plataforma',
    caption: 'Demonstração do produto. Os nomes de empresas e os números são exemplos.',
    tabs: ['Subindo no Google', 'Um artigo novo', 'Recomendado pela IA'],
    describe: [
      'A tela de palavras-chave: um termo que subiu da 18ª para a 3ª posição no Google, e outros três em alta.',
      'A tela de artigos: um artigo novo é escrito, passa pelo controle de qualidade e fica agendado para ser publicado no site.',
      'A tela de visibilidade em IA: uma resposta do ChatGPT que recomenda a empresa, e os motores que a mencionam.',
    ],
    address: 'app.gotopseo.com',
    rail: ['Painel', 'Palavras-chave', 'Estratégia de conteúdo', 'Artigos', 'Visibilidade em IA', 'Relatórios'],
    rank: {
      heading: 'Palavras-chave',
      keyword: 'instalação de ar condicionado são paulo',
      positionLabel: 'Posição no Google',
      period: 'Últimas 8 semanas',
      from: 18,
      to: 3,
      columns: ['Palavra-chave', 'Posição', 'Variação'],
      rows: [
        { keyword: 'preço de ar condicionado split', from: 24, to: 7 },
        { keyword: 'conserto de ar condicionado guarulhos', from: 31, to: 9 },
        { keyword: 'limpeza de ar condicionado', from: 15, to: 5 },
      ],
      mapsLabel: 'Google Maps, São Paulo',
      mapsValue: '2º lugar',
      toast: 'Você subiu 15 posições no Google',
    },
    article: {
      heading: 'Artigo novo',
      title: 'Quanto custa instalar um ar condicionado split e o que perguntar antes',
      subheading: 'O que define o preço?',
      checksTitle: 'Controle de qualidade',
      checks: ['Perguntas e respostas', 'Dados estruturados', 'Links internos', 'Imagem de destaque', 'Títulos guiados pela busca'],
      draft: 'Escrevendo',
      scheduled: 'Agendado',
      when: 'Ter 9:00',
      toast: 'Publicando no WordPress',
    },
    ai: {
      heading: 'Visibilidade em IA',
      question: 'Quem instala ar condicionado direito em São Paulo?',
      intro: 'Aqui estão algumas empresas bem recomendadas na região:',
      items: [
        { name: 'Clima Norte', desc: 'Instaladores habilitados, garantia do serviço e atendimento no mesmo dia.', you: true },
        { name: 'ArSP Clima', desc: 'Preços justos em limpeza e manutenção.' },
        { name: 'Conforto Brasil', desc: 'Especialistas em sistemas com dutos.' },
      ],
      youTag: 'Sua empresa',
      mentionedIn: 'Mencionada em:',
      engines: [
        { name: 'ChatGPT', on: true },
        { name: 'Gemini', on: true },
        { name: 'Perplexity', on: true },
        { name: 'Copilot', on: false },
        { name: 'Grok', on: true },
        { name: 'Google AI', on: false },
      ],
      toast: 'O ChatGPT recomenda você',
    },
  },
  worksWith: {
    label: 'Verificamos e publicamos por você em:',
    names: ['Google', 'Google Maps', 'ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'WordPress', 'Shopify'],
  },
  outcomes: {
    eyebrow: 'O que você ganha',
    title: 'O que o Go Top SEO faz por você enquanto você cuida do negócio',
    body: 'Não é mais uma ferramenta para aprender. É um sistema que faz o trabalho e depois mostra os resultados.',
    items: [
      {
        title: 'Conteúdo que traz clientes, não só visitas',
        desc: 'A plataforma descobre o que os seus clientes procuram e perguntam, escreve artigos completos sobre isso e os publica no seu site em um ritmo constante. Você só escolhe os temas.',
        chips: ['Publica sozinho', 'Com imagens', 'Seções de perguntas', 'Links internos'],
      },
      {
        title: 'Um lugar nas respostas do ChatGPT e do Gemini',
        desc: 'Cada vez mais gente pergunta à IA em vez de pesquisar. Veja se ela recomenda você, quem ela recomenda no seu lugar e o que melhorar.',
        chips: ['6 motores de IA', 'Frente aos seus concorrentes'],
      },
      {
        title: 'Uma visão clara do que funciona',
        desc: 'Posições no Google e no Maps, menções em IA e artigos publicados em uma única tela. Sem planilhas e sem adivinhar.',
        chips: ['Relatórios em PDF e Excel', 'Histórico completo'],
      },
    ],
    stats: [
      { value: 6, label: 'motores de IA verificados', detail: 'ChatGPT, Gemini, Perplexity, Copilot, Grok e Google AI' },
      { value: 3, label: 'canais em um só relatório', detail: 'Google, Google Maps e respostas de IA' },
      { value: 2, label: 'plataformas para publicar', detail: 'WordPress e Shopify, sem copiar e colar' },
      { value: TRIAL_DAYS, label: 'dias de teste grátis', detail: 'Sem cartão de crédito' },
    ],
  },
  shift: {
    eyebrow: 'A busca mudou',
    title: 'Os clientes não pesquisam mais só no Google. Eles perguntam à IA e recebem três recomendações.',
    body: 'Se o seu site não responde às perguntas deles, nem no Google nem em uma resposta do ChatGPT, essa recomendação vai para um concorrente. Quase nenhuma empresa sabe como está, porque nenhuma ferramenta mostrou as duas coisas ao mesmo tempo.',
    withoutTitle: 'Sem o Go Top SEO',
    without: [
      'Um artigo a cada dois meses, quando alguém arruma um tempo',
      'Sem uma ideia clara do que escrever nem de qual termo vale a pena',
      'Posições conferidas à mão, ou nem conferidas',
      'Sem saber se o ChatGPT recomenda você ou um concorrente',
    ],
    withTitle: 'Com o Go Top SEO',
    with: [
      'Um calendário de conteúdo constante que publica quando você decide',
      'Temas escolhidos a partir do que os seus clientes realmente procuram',
      'Acompanhamento automático das suas posições no Google e no Google Maps',
      'Verificações periódicas do que o ChatGPT, o Gemini e mais quatro motores dizem sobre você',
    ],
  },
  flow: {
    eyebrow: 'Como funciona',
    title: 'De um endereço de site a conteúdo que funciona, em quatro passos',
    body: 'Você decide o que é escrito. A plataforma faz o resto.',
    steps: [
      { tag: 'Grátis, sem cadastro', title: 'Analise o seu site', desc: 'Digite um endereço. Em menos de um minuto descobrimos a que a empresa se dedica, quem são os clientes dela e o que está te segurando no Google e na IA.' },
      { tag: 'Você aprova', title: 'Receba um plano', desc: 'Termos de busca, as perguntas que os clientes fazem e uma lista de artigos prontos para escrever. Você escolhe o que entra.' },
      { tag: 'Automático', title: 'Os artigos são escritos e publicados', desc: 'Cada artigo chega com imagens e perguntas e respostas, e vai ao ar no seu site na data em que você agendou. Em sites WordPress com o plugin da Go Top, também são adicionados dados estruturados.' },
      { tag: 'Transparente', title: 'Acompanhe os resultados', desc: 'Posições no Google e no Maps, menções em IA e relatórios que você pode enviar a quem quiser.' },
    ],
    cta: 'Comece com uma análise gratuita',
  },
  features: {
    eyebrow: 'O que está incluído',
    title: 'Tudo o que você precisa para subir, em um só lugar',
    body: 'Quatro ferramentas que trabalham juntas, para que cada artigo seja medido e cada medição dê origem ao próximo artigo.',
    more: 'Saiba mais',
    note: 'Os nomes e os números das imagens são exemplos.',
    content: {
      overline: 'Conteúdo e publicação',
      title: 'Artigos escritos para serem encontrados, não para encher um blog',
      body: 'Cada artigo é construído em torno de uma busca real: títulos que vêm do que as pessoas perguntam, uma seção de perguntas e respostas, links internos para as páginas que vendem e, em sites WordPress com o plugin da Go Top, dados estruturados que o Google e os motores de IA leem. Você revisa, ajusta se precisar, e a plataforma publica.',
      points: ['Uma imagem de destaque e imagens no texto', 'Um controle de qualidade antes de cada publicação', 'Agendamento e publicação direta no WordPress e na Shopify'],
      href: '/features/seo-geo-content-publishing',
      visual: {
        heading: 'Esta semana no seu site',
        days: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
        items: [
          { day: 0, title: 'Como escolher o ar condicionado do quarto', status: 'published', label: 'Publicado' },
          { day: 2, title: 'Quanto custa instalar um split', status: 'scheduled', label: 'Agendado' },
          { day: 4, title: 'Limpeza do ar condicionado: de quanto em quanto tempo?', status: 'writing', label: 'Escrevendo' },
        ],
        destinationLabel: 'Publicando em',
        destinations: ['WordPress', 'Shopify'],
      },
    },
    ai: {
      overline: 'Visibilidade em IA',
      title: 'Saiba quando o ChatGPT recomenda você e quando ele escolhe um concorrente',
      body: 'Fazemos aos motores de IA as perguntas que os seus clientes fazem e verificamos quem aparece na resposta. Você verá em quais perguntas ganha, onde um concorrente leva a recomendação e o que melhorar no seu site.',
      points: ['ChatGPT, Gemini, Perplexity, Copilot, Grok e Google AI', 'Lado a lado com os seus concorrentes', 'Recomendações do que mudar para entrar na resposta'],
      href: '/features/ai-visibility-tracking',
      visual: {
        heading: 'Quem aparece na resposta',
        engines: ['ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'Google AI'],
        rows: [
          { question: 'Quem instala ar condicionado em São Paulo?', hits: [true, true, true, false, true, false] },
          { question: 'Quanto custa limpar o ar condicionado?', hits: [true, false, true, false, false, true] },
        ],
        shareTitle: 'Participação nas menções',
        you: { label: 'Sua empresa', value: 58 },
        rival: { label: 'Principal concorrente', value: 42 },
      },
    },
    rank: {
      overline: 'Posições no Google',
      title: 'Veja cada subida, no Google e no Google Maps',
      body: 'Acompanhe cada termo que importa para você, na busca normal e no Maps por cidade ou região, com um histórico que mostra se os artigos estão fazendo o trabalho deles.',
      points: ['Google orgânico por país, idioma e dispositivo', 'Google Maps por cidade ou região', 'Pesquisa de palavras-chave com volume de busca e concorrência'],
      href: '/features/google-organic-rank-tracking',
      visual: {
        heading: 'Suas palavras-chave',
        columns: ['Palavra-chave', 'Posição', 'Variação'],
        rows: [
          { keyword: 'instalação de ar condicionado são paulo', pos: 3, up: 15 },
          { keyword: 'preço de ar condicionado split', pos: 7, up: 17 },
          { keyword: 'conserto de ar condicionado guarulhos', pos: 9, up: 22 },
          { keyword: 'limpeza de ar condicionado', pos: 5, up: 10 },
        ],
        maps: { label: 'Google Maps', area: 'São Paulo', value: '2º lugar de 20' },
      },
    },
    reports: {
      overline: 'Relatórios',
      title: 'Um relatório que você pode enviar a um cliente ou ao seu chefe, em um clique',
      body: 'Exporte posições, tendências e visibilidade em IA para PDF e Excel. As agências gerenciam vários sites de clientes a partir de uma única conta, cada um no seu próprio projeto.',
      points: ['PDF e Excel em um clique', 'Vários sites em uma conta', 'Todos os dados em um só lugar, sem montar relatórios à mão'],
      href: '/features/seo-geo-reports',
      visual: {
        heading: 'Relatório de desempenho',
        period: 'Setembro',
        stats: [
          { label: 'Palavras-chave na primeira página', value: '14', up: true },
          { label: 'Menções em IA', value: '9', up: true },
          { label: 'Artigos publicados', value: '8' },
          { label: 'Posição média', value: '6,2', up: true },
        ],
        clientsLabel: 'Projetos:',
        clients: ['clima-norte.com.br', 'estudio-dana.com.br', '+3'],
      },
    },
  },
  audience: {
    eyebrow: 'Para quem é',
    title: 'Para quem quer que o site traga clientes',
    body: 'Você não precisa saber de SEO. Precisa saber o que vende.',
    items: [
      {
        title: 'Donos de negócio',
        desc: 'Você quer mais contatos vindos do Google sem aprender SEO nem contratar um redator. Aprove os temas e o resto acontece sozinho.',
        gain: 'Um site que trabalha enquanto você está ocupado',
      },
      {
        title: 'Autônomos e agências',
        desc: 'Gerencie vários clientes a partir de uma conta, produza conteúdo mais rápido e entregue a cada cliente um relatório claro.',
        gain: 'Mais clientes nas mesmas horas de trabalho',
      },
      {
        title: 'Equipes de marketing',
        desc: 'Mantenha um ritmo de publicação constante e veja em um só lugar o que o conteúdo faz no Google e na IA.',
        gain: 'Uma resposta clara para "está funcionando?"',
      },
    ],
  },
  check: {
    eyebrow: 'Análise gratuita do site',
    title: 'Ainda não está convencido? Deixe-nos mostrar o que enxergamos',
    body: 'A análise lê o seu site de verdade e devolve um primeiro resumo de pesquisa em menos de um minuto:',
    items: [
      'O que entendemos do negócio e quem são os seus clientes',
      'Quais concorrentes aparecem ao seu lado',
      'O que está te segurando no Google, com as provas tiradas do seu site',
      'Quão pronto o site está para as respostas da IA',
      'A lista de artigos que escreveríamos para você',
    ],
    cta: 'Analisar o meu site',
    note: 'Grátis, sem cadastro e sem cartão de crédito.',
    preview: {
      domain: 'clima-norte.com.br',
      heading: 'Seu primeiro resumo de pesquisa',
      scoreLabel: 'Preparo para a IA',
      score: '3/4',
      findings: ['As imagens estão sem texto alternativo', 'Sem seção de perguntas e respostas', 'A meta descrição tem um tamanho incorreto'],
      lockedLabel: 'Mais descobertas e concorrentes são liberados com uma conta gratuita',
    },
  },
  faq: {
    eyebrow: 'Perguntas',
    title: 'O que as pessoas costumam perguntar antes de começar',
    body: 'Não encontrou a sua resposta? Fale com a gente pelo WhatsApp.',
    items: [
      {
        q: 'Não sei nada de SEO. Isso é para mim?',
        a: 'Sim. A plataforma escolhe os termos, propõe os temas e escreve os artigos. O que sobra para você é decidir o que combina com o negócio e aprovar.',
      },
      {
        q: 'Algo vai ser publicado no meu site sem que eu veja?',
        a: 'Só são escritos os temas que você aprova, e cada artigo passa por um controle de qualidade antes de ser publicado. Você pode revisar e editar qualquer artigo e escolher quando ele é publicado.',
      },
      {
        q: 'Por que não escrever eu mesmo com o ChatGPT?',
        a: 'Pode, mas aí você escolhe os temas, confere os termos, monta as perguntas e os dados estruturados, liga as páginas entre si, sobe tudo para o site e verifica se funcionou, tudo por conta própria. O Go Top SEO cuida da cadeia inteira e mede o resultado no Google e na IA.',
      },
      {
        q: 'Com quais sites funciona?',
        a: 'A publicação direta funciona com WordPress e Shopify. O acompanhamento de posições, a visibilidade em IA e a pesquisa de palavras-chave funcionam com qualquer site.',
      },
      {
        q: `O que acontece quando os ${TRIAL_DAYS} dias de teste terminam?`,
        a: 'Você escolhe um plano e continua exatamente de onde parou. Não escolheu nenhum? Nada é cobrado, porque nunca pedimos um cartão.',
      },
      {
        q: 'Posso cancelar?',
        a: 'Sim, quando quiser, direto no painel, sem multas nem taxas de cancelamento.',
      },
    ],
  },
  cta: {
    title: 'Seu próximo cliente está pesquisando hoje. Faça com que ele encontre você.',
    body: `Analise o seu site grátis, ou comece um teste de ${TRIAL_DAYS} dias e o seu primeiro artigo pode ser escrito hoje.`,
    check: 'Analisar o meu site grátis',
    signup: 'Comece o teste gratuito',
    dashboard: 'Ir para o meu painel',
    pricing: `Planos a partir de ${FROM_USD} USD por mês.`,
    pricingLink: 'Ver todos os planos e preços',
  },
}

/**
 * The Brazilian Portuguese pricing page's words around the plan grid
 * (app/(public)/pt-BR/pricing/page.tsx renders them through
 * components/public/pricing/PricingSections.tsx).
 *
 * Every figure is read from the plan and trial catalogs, so the page cannot
 * drift from what the server enforces. No customer, total, quote or logo is
 * claimed. The badge says what it is, a recommendation, not a sales figure.
 *
 * THE PRICE ITSELF is not in this file. The grid reads it from the visitor's
 * billing market (lib/billing/server-market.ts), which is decided by country
 * and not by the page's language: a visitor in Brazil sees the same dollar
 * price every market outside Israel is billed in today, because Brazil's own
 * local price is not set yet. Nothing here promises a currency.
 */
import type { PricingCopy } from '@/components/public/pricing/PricingSections'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'
import { CHECKS_EXPLAINER } from '@/lib/plans/features'

const DAYS = TRIAL_CATALOG.days
const BASIC_ARTICLES = PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide
const ADVANCED_ARTICLES = PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide

export const pricingPtBR: PricingCopy = {
  hero: {
    eyebrow: 'Preços',
    title: 'Tudo o que é preciso para ser encontrado,',
    accent: 'por um preço mensal',
    subtitle: 'Artigos escritos e publicados no seu site, acompanhamento das suas posições no Google e no Google Maps, e uma verificação de se o ChatGPT e o Gemini recomendam você. Escolha o plano conforme o que você precisa e comece com um teste gratuito.',
    trust: [`${DAYS} dias de teste grátis`, 'Sem cartão de crédito', 'Cancele quando quiser pelo seu painel'],
  },
  plans: {
    perMonth: '/mês',
    popular: 'Nossa escolha',
    cta: `Teste grátis por ${DAYS} dias`,
    dashboard: 'Ir para o meu painel',
    noCard: 'Sem cartão de crédito',
    checksNote: CHECKS_EXPLAINER['pt-BR'],
    taxNote: 'Em um pagamento com cartão quem vende é a Creem, como comerciante registrada: ela calcula o imposto pelo seu endereço de cobrança e mostra o valor final antes do pagamento. Os preços aqui não o incluem.',
    everyPlanLabel: 'Em todos os planos',
    everyPlan: [
      'Publicação agendada automática no WordPress, na Shopify e no Wix',
      'Acompanhamento da sua posição no Google e no Google Maps',
      'Verificação de se 6 motores de IA, como o ChatGPT e o Gemini, mencionam você',
      'Uma nota de saúde do site com a lista de correções',
      'Relatórios em PDF e Excel que você pode enviar',
      'Suporte pessoal',
    ],
  },
  unsure: {
    text: 'Ainda não está convencido? Comece por uma verificação gratuita do seu site.',
    cta: 'Analisar o meu site',
  },
  included: {
    eyebrow: 'Em todos os planos',
    title: 'Sem extras. Tudo entra desde o primeiro dia.',
    body: 'Os planos só se diferenciam em volume: quantos sites, quantos artigos e quantas verificações você tem por mês. Os recursos são os mesmos em todos.',
    items: [
      {
        title: 'Artigos escritos e publicados',
        desc: 'A plataforma escreve artigos completos sobre os temas que você aprova, com imagens, uma seção de perguntas e links internos, e os publica no seu site de acordo com um calendário.',
      },
      {
        title: 'Acompanhamento no Google e no Google Maps',
        desc: 'Veja em que posição você aparece para cada frase que importa, na busca normal e no Maps, e como isso se move ao longo do tempo.',
      },
      {
        title: 'Visibilidade em motores de IA',
        desc: 'Verifique se o ChatGPT, o Gemini, o Perplexity, o Copilot, o Grok e o Google AI mencionam você, e quem eles mencionam no seu lugar.',
      },
      {
        title: 'Pesquisa de palavras-chave',
        desc: 'A plataforma descobre o que os seus clientes procuram e perguntam, e sugere por onde começar.',
      },
      {
        title: 'Relatórios que você pode enviar',
        desc: 'Posições, tendências e visibilidade em IA em um relatório PDF ou Excel feito em um clique, pronto para um cliente ou para a diretoria.',
      },
      {
        title: 'Suporte pessoal',
        desc: 'Quem responde são pessoas de verdade, pelo WhatsApp e por e-mail.',
      },
    ],
  },
  value: {
    eyebrow: 'Por que vale a pena',
    title: 'Uma assinatura no lugar de três trabalhos',
    body: 'Normalmente você precisa de alguém que escolha os temas e escreva, de alguém que suba tudo para o site e de uma ferramenta que verifique se funcionou. Aqui tudo acontece em um só lugar.',
    items: [
      {
        title: 'O trabalho é feito, não só medido',
        desc: 'Não é mais um relatório esperando alguém agir. A plataforma escreve e publica os artigos sozinha, apenas sobre temas que você aprovou.',
      },
      {
        title: 'Você vê exatamente pelo que está pagando',
        desc: 'Artigos publicados, mudanças de posição e menções em IA em um mesmo painel, e em um relatório que você pode passar a quem quiser.',
      },
      {
        title: 'Sem amarras',
        desc: `Um teste de ${DAYS} dias sem cartão, pagamento mensal e cancelamento quando você quiser pelo seu painel.`,
      },
    ],
  },
  usage: {
    eyebrow: 'Como o uso é contado',
    title: 'Sem letras miúdas',
    body: 'Três unidades simples, e cada franquia é renovada todo mês.',
    items: [
      {
        title: 'Artigo',
        desc: 'Criar um artigo novo consome um da sua franquia. Editar, agendar ou publicar um que já existe não consome nada.',
      },
      {
        title: 'Verificação de posição no Google',
        desc: 'Ver em que posição uma palavra-chave aparece, em um lugar: Google ou Google Maps. A mesma palavra-chave nos dois conta como duas verificações.',
      },
      {
        title: 'Verificação de visibilidade em IA',
        desc: 'Fazer uma pergunta a um motor de IA e ver se a sua empresa é mencionada. A mesma pergunta no ChatGPT e no Gemini conta como duas verificações.',
      },
    ],
    note: 'A franquia de artigos é por conta. Nos planos com mais de um site, ela é dividida entre todos os seus sites.',
  },
  faq: {
    eyebrow: 'Perguntas',
    title: 'O que se pergunta antes de escolher um plano',
    body: 'Não encontrou a sua resposta? Fale com a gente pelo WhatsApp.',
    items: [
      {
        q: 'Qual plano serve para nós?',
        a: `Basic e Advanced são para um único site, e a principal diferença entre eles são os artigos por mês: ${BASIC_ARTICLES} contra ${ADVANCED_ARTICLES}. O Premium é para quem cuida de mais de um site, e o Agency para gerenciar sites de clientes. Você pode começar pequeno e mudar de plano quando quiser.`,
      },
      {
        q: 'O que inclui o teste gratuito?',
        a: `${DAYS} dias sem cartão: um site, até ${TRIAL_CATALOG.maxKeywordsPerProject} palavras-chave, até ${TRIAL_CATALOG.maxGoogleChecksLifetime} verificações de posição no Google, até ${TRIAL_CATALOG.maxAIChecksLifetime} verificações de visibilidade em IA e um artigo, para que você veja todo o processo, do começo até a publicação.`,
      },
      {
        q: `O que acontece quando os ${DAYS} dias de teste acabam?`,
        a: 'Você escolhe um plano e continua de onde parou. Se não escolher nenhum, nada é cobrado, porque nunca pedimos um cartão.',
      },
      {
        q: 'Podemos mudar de plano ou cancelar?',
        a: 'Sim. Mude de plano quando quiser e as novas franquias valem a partir daquele momento. Cancele pelo seu painel, sem multas nem taxas de cancelamento.',
      },
      {
        q: 'O que acontece com os artigos que não usamos?',
        a: 'A franquia é renovada todo mês, e os artigos não usados não se acumulam para o mês seguinte.',
      },
      {
        q: 'As análises rodam sozinhas?',
        a: 'Faça uma análise manual quando quiser, ou ative uma análise mensal automática que roda sozinha todo mês. Por enquanto não há análise automática diária nem semanal.',
      },
      {
        q: 'Os artigos podem ser agendados e publicados automaticamente?',
        a: 'Sim. Agende um artigo para uma data futura, ou publique-o na hora em um site conectado: WordPress, Shopify ou Wix.',
      },
      {
        q: 'Como os nossos dados são protegidos?',
        a: 'Todo o tráfego é criptografado (SSL/TLS), as senhas são guardadas criptografadas e cada conta vê apenas os próprios dados. As informações são compartilhadas somente com os provedores sobre os quais a plataforma funciona, como hospedagem, pagamentos e dados de busca, conforme a política de privacidade.',
        // The Portuguese privacy policy is owned by the legal thread; until it
        // exists this link points at the English one, which is live.
        link: { label: 'Ler a política de privacidade', href: '/en/privacy' },
      },
    ],
  },
  cta: {
    title: 'Quer ver primeiro o que a plataforma encontra no seu site?',
    body: `A verificação gratuita lê o seu site e devolve um primeiro resumo de pesquisa, sem cadastro. Ou abra um teste de ${DAYS} dias e experimente tudo.`,
    check: 'Analisar o meu site grátis',
    trial: 'Começar o teste gratuito',
    dashboard: 'Ir para o meu painel',
  },
}

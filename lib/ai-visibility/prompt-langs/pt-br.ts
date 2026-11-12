/**
 * Brazilian Portuguese AI-visibility questions.
 *
 * Brazil first, and Brazilian rather than European throughout: "celular" not
 * "telemóvel", "você" not "tu", gerund ("está procurando") not infinitive
 * ("está a procurar"), and the R$ market's own words for what a shop is —
 * "loja", "assistência", "orçamento". Every entry is a question a real customer
 * types into ChatGPT or Gemini, never a keyword string.
 */
import type { BusinessCategory, QueryDef } from '../prompt-templates'
import type { LangPack } from './index'

const BRAND_REVIEW = (score = 74): QueryDef => ({
  intent: 'brand', text: 'Avaliações sobre {{business}}', score, offering: 'generic',
})

const BANK: Record<BusinessCategory, QueryDef[]> = {
  perfume: [
    { intent: 'recommendation', text: 'Qual perfume dar de presente para uma mulher?', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Qual perfume dar de presente para um homem?', score: 93, offering: 'primary', themeBoost: { audienceMen: 5 } },
    { intent: 'pre_purchase', text: 'Como escolher um perfume que combine comigo?', score: 87, offering: 'primary' },
    { intent: 'recommendation', text: 'Melhores perfumarias {{country}}', score: 89, offering: 'primary' },
    { intent: 'comparison', text: 'Qual a diferença entre eau de parfum e eau de toilette?', score: 85, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Onde comprar perfume importado original na internet?', score: 91, offering: 'primary', themeBoost: { online: 5 } },
    { intent: 'local', text: 'Marcas de perfume de nicho que valem a pena', score: 83, offering: 'local', themeBoost: { niche: 4 } },
    { intent: 'gift', text: 'Qual perfume dar de presente?', score: 85, offering: 'secondary', themeBoost: { gift: 5 } },
    { intent: 'commercial', text: 'Onde comprar perfume com desconto?', score: 81, offering: 'secondary', themeBoost: { price: 4 } },
    BRAND_REVIEW(),
  ],

  sports_store: [
    { intent: 'recommendation', text: 'Melhores lojas de artigos esportivos {{country}}', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Como escolher um tênis de corrida para o meu tipo de pisada?', score: 89, offering: 'primary' },
    { intent: 'recommendation', text: 'Melhores marcas de roupa de treino para usar todo dia', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'Tênis de corrida ou tênis de academia: qual a diferença?', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'Onde comprar artigos esportivos mais barato {{country}}?', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  gifts: [
    { intent: 'gift', text: 'Ideias de presente de casamento', score: 89, offering: 'primary' },
    { intent: 'gift', text: 'Ideias de presente de aniversário diferentes', score: 87, offering: 'primary' },
    { intent: 'gift', text: 'Ideias de brinde corporativo para funcionários', score: 85, offering: 'primary' },
    { intent: 'recommendation', text: 'Onde comprar presentes criativos {{country}}?', score: 85, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  appliance_store: [
    { intent: 'recommendation', text: 'Melhores lojas de eletrodomésticos {{country}}', score: 89, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Como escolher uma máquina de lavar roupa?', score: 85, offering: 'primary' },
    { intent: 'local', text: 'Onde o eletrodoméstico sai mais barato: loja física ou internet?', score: 83, offering: 'local', themeBoost: { online: 3, price: 3 } },
    BRAND_REVIEW(),
  ],

  agency: [
    { intent: 'recommendation', text: 'Melhores agências de SEO {{country}}', score: 93, offering: 'primary' },
    { intent: 'recommendation', text: 'Melhores agências de marketing digital {{country}}', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Como escolher uma agência de marketing digital?', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'Vale mais a pena investir em SEO ou em anúncios pagos?', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'Quanto custa SEO {{country}}?', score: 89, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  cleaning: [
    { intent: 'recommendation', text: 'Melhores empresas de limpeza de escritório em {{city}}', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'Como escolher uma empresa de limpeza de confiança?', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'Quanto custa por mês a limpeza de um escritório?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  ecommerce: [
    { intent: 'recommendation', text: 'Melhores lojas online {{country}}', score: 87, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Como saber se uma loja online é confiável?', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'Onde comprar mais barato pela internet {{country}}?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  saas: [
    { intent: 'pre_purchase', text: '{{business}} serve para uma empresa pequena?', score: 92, offering: 'primary' },
    { intent: 'commercial', text: 'Quanto custa o {{business}}?', score: 90, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'pre_purchase', text: 'Quais são os prós e contras do {{business}}?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'O {{business}} vale o preço que cobra?', score: 86, offering: 'primary', themeBoost: { price: 3 } },
    { intent: 'pre_purchase', text: 'Como começar a usar o {{business}}?', score: 84, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Para quem o {{business}} é indicado?', score: 82, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  product_brand: [
    { intent: 'informational', text: 'Quais são os prós e contras dos produtos da {{business}}?', score: 92, offering: 'primary' },
    { intent: 'local', text: 'Onde comprar produtos da {{business}}?', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: 'O que olhar antes de comprar um produto da {{business}}?', score: 88, offering: 'primary' },
    { intent: 'commercial', text: 'Onde os produtos da {{business}} saem mais barato?', score: 86, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'Vale a pena comprar produto da {{business}} novo ou recondicionado?', score: 84, offering: 'primary' },
    { intent: 'recommendation', text: 'Quais são os melhores produtos da {{business}} este ano?', score: 83, offering: 'primary' },
    { intent: 'brand', text: 'Avaliações dos produtos da {{business}}', score: 74, offering: 'generic' },
  ],

  florist: [
    { intent: 'local', text: 'Entrega de flores no mesmo dia em {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'Melhor floricultura de {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  second_hand_fashion: [
    { intent: 'recommendation', text: 'Onde comprar roupa feminina de segunda mão?', score: 94, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Melhores brechós femininos', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Onde encontrar roupa vintage feminina?', score: 92, offering: 'primary', themeBoost: { audienceWomen: 4 } },
    { intent: 'pre_purchase', text: 'Como saber se uma peça de segunda mão é de boa qualidade?', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'É seguro comprar roupa usada pela internet?', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'Onde encontrar roupa feminina de segunda mão barata?', score: 90, offering: 'primary', themeBoost: { price: 5 } },
    { intent: 'commercial', text: 'Quanto vale a pena gastar em roupa de segunda mão de qualidade?', score: 88, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'Como montar um guarda-roupa com peças de segunda mão?', score: 87, offering: 'primary' },
    { intent: 'informational', text: 'Onde encontrar roupa de grife de segunda mão?', score: 86, offering: 'primary' },
    { intent: 'local', text: 'Brechós em {{city}}', score: 88, offering: 'local', requiresCity: true, themeBoost: { audienceWomen: 3 } },
    { intent: 'brand', text: 'A {{business}} é um brechó confiável?', score: 84, offering: 'secondary' },
  ],

  restaurant: [
    { intent: 'recommendation', text: 'Melhores restaurantes de {{city}}', score: 91, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'Restaurante para um jantar romântico em {{city}}', score: 85, offering: 'local', requiresCity: true },
    BRAND_REVIEW(),
  ],

  travel: [
    { intent: 'recommendation', text: 'Qual o melhor site para montar uma viagem internacional?', score: 92, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Como montar um roteiro de viagem por conta própria?', score: 90, offering: 'primary' },
    { intent: 'comparison', text: 'Vale mais a pena pacote de viagem ou viajar por conta própria?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'Qual a melhor época para achar passagem internacional barata?', score: 86, offering: 'primary' },
    { intent: 'commercial', text: 'Quanto custa um pacote de viagem internacional?', score: 85, offering: 'secondary', themeBoost: { price: 4 } },
    BRAND_REVIEW(),
  ],

  healthcare: [
    { intent: 'recommendation', text: 'Melhores clínicas particulares de {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  legal: [
    { intent: 'recommendation', text: 'Melhores escritórios de advocacia {{country}}', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'Quanto custa uma consulta com advogado {{country}}?', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  real_estate: [
    { intent: 'recommendation', text: 'Melhores imobiliárias de {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  fitness: [
    { intent: 'recommendation', text: 'Melhores academias de {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  beauty: [
    { intent: 'recommendation', text: 'Melhores salões de beleza de {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  education: [
    { intent: 'recommendation', text: 'Melhores cursos de tecnologia {{country}}', score: 87, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  home_improvement_service: [
    { intent: 'recommendation', text: 'Qual a melhor empresa para reformar uma cozinha em {{city}}?', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'Melhor empresa para reformar um banheiro em {{city}}', score: 92, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'O que verificar antes de contratar uma empresa de reforma?', score: 88, offering: 'primary' },
    { intent: 'recommendation', text: 'Qual a melhor empresa de reforma completa em {{city}}?', score: 90, offering: 'primary', requiresCity: true },
    { intent: 'commercial', text: 'Quanto custa reformar uma casa em {{city}}?', score: 89, offering: 'secondary', requiresCity: true, themeBoost: { price: 4 } },
    { intent: 'transactional', text: 'Como escolher uma empresa de reforma de confiança?', score: 85, offering: 'primary' },
  ],

  local_service: [
    { intent: 'recommendation', text: 'Profissionais recomendados em {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'O que observar ao contratar um profissional?', score: 81, offering: 'primary' },
    { intent: 'commercial', text: 'Quanto custa contratar um profissional em {{city}}?', score: 79, offering: 'secondary', requiresCity: true, themeBoost: { price: 3 } },
  ],

  generic: [
    { intent: 'recommendation', text: 'O que a {{business}} faz e em que ela ajuda?', score: 77, offering: 'primary' },
    BRAND_REVIEW(),
  ],
}

/**
 * Brazilian Portuguese keeps the noun and its article together in `one`,
 * because the gender is the article's and not the frame's: "uma agência",
 * "um restaurante". `price` carries its own article too.
 */
const SERVICE_LABELS: LangPack['serviceLabels'] = {
  agency: { one: 'uma agência de marketing digital', plural: 'agências de marketing digital', price: 'o SEO de um site' },
  cleaning: { one: 'uma empresa de limpeza', plural: 'empresas de limpeza', price: 'a limpeza de um escritório' },
  home_improvement_service: { one: 'uma empresa de reforma', plural: 'empresas de reforma', price: 'a reforma de uma casa' },
  local_service: { one: 'um profissional da região', plural: 'profissionais da região', price: 'o serviço' },
  legal: { one: 'um escritório de advocacia', plural: 'escritórios de advocacia', price: 'uma consulta com advogado' },
  real_estate: { one: 'uma imobiliária', plural: 'imobiliárias' },
  healthcare: { one: 'uma clínica particular', plural: 'clínicas particulares', price: 'uma consulta particular' },
  education: { one: 'um centro de formação', plural: 'centros de formação', price: 'um curso profissionalizante' },
  florist: { one: 'uma floricultura', plural: 'floriculturas', price: 'uma entrega de flores' },
  gifts: { one: 'uma loja de presentes', plural: 'lojas de presentes' },
  perfume: { one: 'uma perfumaria', plural: 'perfumarias', price: 'um perfume de qualidade' },
  sports_store: { one: 'uma loja de artigos esportivos', plural: 'lojas de artigos esportivos' },
  appliance_store: { one: 'uma loja de eletrodomésticos', plural: 'lojas de eletrodomésticos' },
  second_hand_fashion: { one: 'um brechó', plural: 'brechós' },
  restaurant: { one: 'um restaurante', plural: 'restaurantes' },
  travel: { one: 'um serviço de planejamento de viagens', plural: 'serviços de planejamento de viagens', price: 'o planejamento de uma viagem' },
  fitness: { one: 'uma academia', plural: 'academias', price: 'uma mensalidade de academia' },
  beauty: { one: 'um salão de beleza', plural: 'salões de beleza', price: 'um tratamento de beleza' },
  ecommerce: { one: 'uma loja online', plural: 'lojas online' },
  saas: { one: 'uma plataforma de software', plural: 'plataformas de software' },
}

export const PT_BR_PACK: LangPack = {
  code: 'pt-BR',

  intentLabel: {
    recommendation: 'Recomendação',
    comparison: 'Comparação',
    commercial: 'Preço',
    pre_purchase: 'Antes de comprar',
    transactional: 'Escolha',
    local: 'Local',
    brand: 'Marca',
    informational: 'Informação',
    alternatives: 'Alternativas',
    gift: 'Presente',
  },

  categoryLabel: {
    agency: 'agência de marketing ou SEO',
    ecommerce: 'loja online',
    perfume: 'perfumaria',
    sports_store: 'loja de artigos esportivos',
    gifts: 'loja de presentes',
    appliance_store: 'loja de eletrodomésticos',
    saas: 'produto SaaS',
    product_brand: 'marca de produtos',
    local_service: 'serviço local',
    home_improvement_service: 'reforma e construção',
    cleaning: 'empresa de limpeza',
    florist: 'floricultura',
    restaurant: 'restaurante',
    healthcare: 'serviço de saúde',
    legal: 'escritório de advocacia',
    real_estate: 'imobiliária',
    fitness: 'academia',
    beauty: 'beleza e bem-estar',
    education: 'formação e ensino',
    second_hand_fashion: 'moda feminina de segunda mão',
    travel: 'viagens e turismo',
    generic: 'empresa',
  },
  genericCategoryLabel: 'empresa',

  bank: BANK,

  /**
   * Stored WITH the preposition already contracted, because Portuguese
   * contracts it with the country's gender — "no Brasil" but "na Alemanha",
   * "nos Estados Unidos" but "em Israel". Every frame above therefore reads a
   * bare `{{country}}` and lets the table supply the preposition; the
   * alternative, a frame that writes "do {{country}}" itself, produced
   * "Melhores agências de SEO do Alemanha".
   */
  countryNames: {
    IL: 'em Israel',
    US: 'nos Estados Unidos',
    GB: 'no Reino Unido',
    DE: 'na Alemanha',
    FR: 'na França',
    ES: 'na Espanha',
    BR: 'no Brasil',
    PT: 'em Portugal',
    MX: 'no México',
    AR: 'na Argentina',
    CL: 'no Chile',
  },

  placeholder: { business: 'a empresa', city: 'sua região' },

  reason: {
    category: (v) => `Com base na categoria do negócio: ${v}`,
    intent: (v) => `Intenção de busca: ${v}`,
    location: (v) => `Localização: ${v}`,
    themes: {
      gift: 'Intenção de presente detectada nas palavras-chave',
      online: 'Intenção de compra online detectada',
      price: 'Sensibilidade a preço detectada',
      audienceMen: 'Público detectado: homens',
      audienceWomen: 'Público detectado: mulheres',
      audienceKids: 'Público detectado: crianças',
      niche: 'Interesse detectado por marcas de luxo ou de nicho',
    },
  },

  keywordFrames: {
    price: (kw) => `Quanto custa ${kw}?`,
    review: (kw) => `Avaliações sobre ${kw}`,
    prePurchase: (kw) => `O que verificar antes de escolher ${kw}?`,
    recommendation: (kw) => `Qual fornecedor é recomendado para ${kw}?`,
    local: (kw, city) => `Qual fornecedor é recomendado para ${kw} em ${city}?`,
  },

  genCopy: {
    insufficient: 'Para gerar perguntas mais precisas, complete o perfil de IA do negócio.',
    review: 'Verificação',
    insufficientReason: 'falta contexto',
    starter: 'inicial',
    default_: 'padrão',
    starterValue: 'Perguntas iniciais: complete o perfil para sugestões mais precisas',
  },

  intentWords: new Set([
    'comprar', 'compra', 'contratar', 'pedir', 'escolher', 'procurar',
    'preço', 'preco', 'preços', 'precos', 'valor', 'custo', 'orçamento', 'orcamento',
    'avaliações', 'avaliacoes', 'opiniões', 'opinioes', 'melhor', 'melhores',
    'barato', 'barata', 'baratos', 'baratas', 'promoção', 'promocao', 'desconto', 'oferta',
  ]),
  intentPhrases: ['em promoção', 'em promocao', 'melhor preço', 'melhor preco', 'bom preço', 'bom preco'],

  serviceLabels: SERVICE_LABELS,

  intentQuestion: (intent, label, location) => {
    switch (intent) {
      case 'recommendation':
        return `Como escolher ${label.one}?`
      case 'decision':
        return `O que verificar antes de escolher ${label.one}?`
      case 'trust':
        return `Como saber se ${label.one} é de confiança?`
      case 'price':
        return label.price ? `Quanto custa ${label.price}?` : null
      case 'local':
        return location ? `Onde encontrar ${label.one} em ${location}?` : null
      case 'comparison':
        return `Como comparar ${label.plural}?`
      case 'alternatives':
        return `Quais são as alternativas a ${label.one}?`
      default:
        return null
    }
  },

  safeCurated: {
    price: (isService) => `Quanto custa ${isService ? 'esse serviço' : 'um serviço desse tipo'}?`,
    choose: (label) => `Como escolher ${label}?`,
    reviews: (name) => `Avaliações sobre ${name}`,
    local: (label, city) => `Melhores opções de ${label} em ${city}`,
  },

  nameQuestions: (name, label) =>
    label
      ? [
          { prompt: `Quais são as avaliações sobre ${name}?`, intent: 'brand' as const },
          { prompt: `Dá para confiar na ${name}?`, intent: 'pre_purchase' as const },
          { prompt: `Como a ${name} se compara a outras ${label.plural}?`, intent: 'comparison' as const },
        ]
      : [
          { prompt: `Quais são as avaliações sobre ${name}?`, intent: 'brand' as const },
          { prompt: `O que os clientes falam sobre a ${name}?`, intent: 'recommendation' as const },
        ],

  difference: (a, b) => `Qual a diferença entre ${a} e ${b}?`,

  genericQuestions: [
    'Como escolher uma empresa de confiança nessa área?',
    'O que verificar antes de escolher um fornecedor?',
    'Como comparar empresas da mesma área?',
    'O que mais importa antes de fechar com um fornecedor?',
  ],

  commercialPattern: /(pre[çc]o|quanto\s+custa|custo|valor|or[çc]amento|comprar|contratar|barat[oa]|promo[çc][ãa]o|desconto|mensalidade)/i,
  locationPattern: /(perto\s+de\s+mim|na\s+minha\s+(?:cidade|regi[ãa]o|cidade\s+natal)|aqui\s+perto|pr[óo]ximo\s+de\s+mim)/i,

  valueReason: {
    commercial: 'Quem busca isso está perto de comprar.',
    competitive: 'Aqui os concorrentes aparecem mais que o negócio.',
    local: 'Oportunidade de melhorar a visibilidade local.',
    prePurchase: 'É uma busca com alta intenção de compra.',
    recommendation: 'Boa oportunidade de ganhar clientes de forma orgânica.',
    frequent: 'É uma pergunta frequente nos motores de IA.',
    rare: 'O negócio quase não aparece em perguntas desse tipo.',
  },

  phrasingBuckets: [
    { bucket: 'pt_recommendation_provider', test: /^(?:qual\s+(?:[ao]\s+)?(?:melhor|empresa|fornecedor|loja|marca|op[çc][ãa]o)|melhores?\s+|quem\s+[ée]\s+(?:o\s+)?melhor)/i },
    { bucket: 'pt_price', test: /^(?:quanto\s+(?:custa|vale|sai)|qual\s+(?:o\s+)?(?:pre[çc]o|valor|custo))/i },
    { bucket: 'pt_pre_purchase', test: /^(?:como\s+(?:escolher|saber|montar)|o\s+que\s+(?:verificar|olhar|observar))/i },
    { bucket: 'pt_comparison', test: /^(?:qual\s+a\s+diferen[çc]a|vale\s+mais\s+a\s+pena|compensa\s+mais)/i },
    { bucket: 'pt_reviews', test: /^(?:avalia[çc][õo]es|o\s+que\s+(?:os\s+clientes\s+)?falam|d[áa]\s+para\s+confiar)/i },
    { bucket: 'pt_local', test: /^(?:onde\s+(?:comprar|encontrar|achar)|entrega\s+)/i },
  ],

  familyPrefix: /^(?:quanto\s+(?:custa|vale|sai)\s+(?:o|a|um|uma)?\s*|qual\s+(?:o\s+|a\s+)?(?:melhor|pre[çc]o\s+(?:de|do|da)?|valor\s+(?:de|do|da)?|diferen[çc]a\s+entre)\s*|melhores?\s+|como\s+(?:escolher|comparar|encontrar|achar|saber\s+se)\s+(?:o|a|um|uma|os|as)?\s*|o\s+que\s+(?:verificar|olhar|observar)\s+antes\s+de\s+(?:escolher|contratar|comprar)\s+(?:o|a|um|uma)?\s*|onde\s+(?:comprar|encontrar|achar)\s+(?:o|a|um|uma|os|as)?\s*|avalia[çc][õo]es\s+(?:sobre|de|do|da)\s*)/iu,

  priceFilter: {
    priceQuestion: /quanto\s+(?:custa|sai)|qual\s+o\s+(?:pre[çc]o|valor|custo)/i,
    businessEntity: /(empresa|loja|marca|fornecedor|ag[êe]ncia|assist[êe]ncia|brech[óo]|imobili[áa]ria)/i,
  },

  filters: {
    doubledIntent: [
      /quanto\s+custa[\s\S]*\bpre[çc]o\b|\bpre[çc]o\b[\s\S]*quanto\s+custa/i,
      /avalia[çc][õo]es[\s\S]*avalia[çc][õo]es|opini[õo]es[\s\S]*opini[õo]es/i,
      /\bmelhor(?:es)?\b[\s\S]*\bmelhor(?:es)?\b/i,
      /\bcomparar\b[\s\S]*\bcomparar\b|\bcompara[çc][ãa]o\b[\s\S]*\bcompara[çc][ãa]o\b/i,
      /\bbarat[oa]s?\b[\s\S]*\bbarat[oa]s?\b|\bpromo[çc][ãa]o\b[\s\S]*\bpromo[çc][ãa]o\b/i,
      /^(?:avalia[çc][õo]es\s+sobre|quanto\s+custa)\s+(?:comprar|contratar|pre[çc]o|avalia[çc][õo]es|melhor)\b/i,
    ],
    gift: /\bpresente?s?\b|\bpresentear\b|\bbrinde\b/i,
    stackedModifiers: ['melhor', 'melhores', 'barato', 'barata', 'qualidade', 'recomendado', 'em promoção', 'com desconto'],
    unnatural: [
      /\bou\s+(?:outras\s+alternativas|outras\s+op[çc][õo]es|outros\s+fornecedores)\b/i,
      /^quem\s+[ée]\s+recomendado\s+para\b/i,
      /como\s+(?:achar|encontrar|escolher)\s+\S+\s+na\s+minha\s+cidade/i,
    ],
    unnaturalForProducts: [
      /\bfornecedor\s+(?:para|de)\b/i,
      /\bespecialista\s+(?:para|em|recomendado)\b/i,
      /\bempresa\s+recomendada\s+para\b/i,
    ],
  },
}

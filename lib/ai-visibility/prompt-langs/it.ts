/**
 * Italian AI-visibility questions.
 *
 * Italy throughout, and the register a customer actually uses with a chatbot:
 * second person singular ("come scegliere", "mi conviene"), "negozio" rather
 * than "punto vendita", "preventivo" for a quote. The elided article is written
 * out where the noun needs it ("un'agenzia"), because the frames below insert
 * the noun phrase whole rather than gluing an article onto it.
 */
import type { BusinessCategory, QueryDef } from '../prompt-templates'
import type { LangPack } from './index'

const BRAND_REVIEW = (score = 74): QueryDef => ({
  intent: 'brand', text: 'Recensioni su {{business}}', score, offering: 'generic',
})

const BANK: Record<BusinessCategory, QueryDef[]> = {
  perfume: [
    { intent: 'recommendation', text: 'Quale profumo regalare a una donna?', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Quale profumo regalare a un uomo?', score: 93, offering: 'primary', themeBoost: { audienceMen: 5 } },
    { intent: 'pre_purchase', text: 'Come scegliere un profumo che mi stia bene?', score: 87, offering: 'primary' },
    { intent: 'recommendation', text: 'Migliori profumerie {{country}}', score: 89, offering: 'primary' },
    { intent: 'comparison', text: 'Che differenza c\'è tra eau de parfum e eau de toilette?', score: 85, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Dove comprare profumi originali online?', score: 91, offering: 'primary', themeBoost: { online: 5 } },
    { intent: 'local', text: 'Marche di profumi di nicchia che valgono la spesa', score: 83, offering: 'local', themeBoost: { niche: 4 } },
    { intent: 'gift', text: 'Quale profumo regalare?', score: 85, offering: 'secondary', themeBoost: { gift: 5 } },
    { intent: 'commercial', text: 'Dove comprare profumi in offerta?', score: 81, offering: 'secondary', themeBoost: { price: 4 } },
    BRAND_REVIEW(),
  ],

  sports_store: [
    { intent: 'recommendation', text: 'Migliori negozi di articoli sportivi {{country}}', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Come scegliere le scarpe da running giuste per me?', score: 89, offering: 'primary' },
    { intent: 'recommendation', text: 'Migliori marche di abbigliamento sportivo per allenarsi ogni giorno', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'Scarpe da running o da palestra: che differenza c\'è?', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'Dove comprare articoli sportivi a meno {{country}}?', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  gifts: [
    { intent: 'gift', text: 'Idee regalo per un matrimonio', score: 89, offering: 'primary' },
    { intent: 'gift', text: 'Idee regalo di compleanno originali', score: 87, offering: 'primary' },
    { intent: 'gift', text: 'Idee regalo aziendali per i dipendenti', score: 85, offering: 'primary' },
    { intent: 'recommendation', text: 'Dove comprare regali originali {{country}}?', score: 85, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  appliance_store: [
    { intent: 'recommendation', text: 'Migliori negozi di elettrodomestici {{country}}', score: 89, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Come scegliere una lavatrice?', score: 85, offering: 'primary' },
    { intent: 'local', text: 'Gli elettrodomestici costano meno online o in negozio?', score: 83, offering: 'local', themeBoost: { online: 3, price: 3 } },
    BRAND_REVIEW(),
  ],

  agency: [
    { intent: 'recommendation', text: 'Migliori agenzie SEO {{country}}', score: 93, offering: 'primary' },
    { intent: 'recommendation', text: 'Migliori agenzie di marketing digitale {{country}}', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Come scegliere un\'agenzia di marketing digitale?', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'Conviene investire in SEO o in annunci a pagamento?', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'Quanto costa la SEO {{country}}?', score: 89, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  cleaning: [
    { intent: 'recommendation', text: 'Migliori imprese di pulizie per uffici a {{city}}', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'Come scegliere un\'impresa di pulizie affidabile?', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'Quanto costa al mese la pulizia di un ufficio?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  ecommerce: [
    { intent: 'recommendation', text: 'Migliori negozi online {{country}}', score: 87, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Come capire se un negozio online è affidabile?', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'Dove si compra a meno online {{country}}?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  saas: [
    { intent: 'pre_purchase', text: '{{business}} va bene per una piccola impresa?', score: 92, offering: 'primary' },
    { intent: 'commercial', text: 'Quanto costa {{business}}?', score: 90, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'pre_purchase', text: 'Quali sono i pro e i contro di {{business}}?', score: 88, offering: 'primary' },
    { intent: 'informational', text: '{{business}} vale quello che costa?', score: 86, offering: 'primary', themeBoost: { price: 3 } },
    { intent: 'pre_purchase', text: 'Come si inizia a usare {{business}}?', score: 84, offering: 'primary' },
    { intent: 'pre_purchase', text: 'A chi serve {{business}}?', score: 82, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  product_brand: [
    { intent: 'informational', text: 'Quali sono i pro e i contro dei prodotti {{business}}?', score: 92, offering: 'primary' },
    { intent: 'local', text: 'Dove comprare i prodotti {{business}}?', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Cosa guardare prima di comprare un prodotto {{business}}?', score: 88, offering: 'primary' },
    { intent: 'commercial', text: 'Dove costano meno i prodotti {{business}}?', score: 86, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'Meglio un prodotto {{business}} nuovo o ricondizionato?', score: 84, offering: 'primary' },
    { intent: 'recommendation', text: 'Quali sono i migliori prodotti {{business}} di quest\'anno?', score: 83, offering: 'primary' },
    { intent: 'brand', text: 'Recensioni dei prodotti {{business}}', score: 74, offering: 'generic' },
  ],

  florist: [
    { intent: 'local', text: 'Consegna fiori in giornata a {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'Miglior fioraio a {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  second_hand_fashion: [
    { intent: 'recommendation', text: 'Dove comprare abbigliamento femminile di seconda mano?', score: 94, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Migliori negozi di moda di seconda mano per donna', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Dove trovare abiti vintage da donna?', score: 92, offering: 'primary', themeBoost: { audienceWomen: 4 } },
    { intent: 'pre_purchase', text: 'Come capire se un capo di seconda mano è di qualità?', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'È sicuro comprare vestiti usati online?', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'Dove trovare abbigliamento femminile di seconda mano a poco?', score: 90, offering: 'primary', themeBoost: { price: 5 } },
    { intent: 'commercial', text: 'Quanto conviene spendere per un usato di qualità?', score: 88, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'Come costruire un armadio con capi di seconda mano?', score: 87, offering: 'primary' },
    { intent: 'informational', text: 'Dove trovare capi di marca di seconda mano?', score: 86, offering: 'primary' },
    { intent: 'local', text: 'Negozi di moda di seconda mano a {{city}}', score: 88, offering: 'local', requiresCity: true, themeBoost: { audienceWomen: 3 } },
    { intent: 'brand', text: '{{business}} è un negozio di seconda mano affidabile?', score: 84, offering: 'secondary' },
  ],

  restaurant: [
    { intent: 'recommendation', text: 'Migliori ristoranti a {{city}}', score: 91, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'Dove andare per una cena romantica a {{city}}?', score: 85, offering: 'local', requiresCity: true },
    BRAND_REVIEW(),
  ],

  travel: [
    { intent: 'recommendation', text: 'Qual è il sito migliore per organizzare un viaggio all\'estero?', score: 92, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Come organizzare un viaggio da solo?', score: 90, offering: 'primary' },
    { intent: 'comparison', text: 'Conviene un viaggio organizzato o uno fai da te?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'Quand\'è il momento migliore per trovare voli internazionali a poco?', score: 86, offering: 'primary' },
    { intent: 'commercial', text: 'Quanto costa un viaggio organizzato all\'estero?', score: 85, offering: 'secondary', themeBoost: { price: 4 } },
    BRAND_REVIEW(),
  ],

  healthcare: [
    { intent: 'recommendation', text: 'Migliori cliniche private a {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  legal: [
    { intent: 'recommendation', text: 'Migliori studi legali {{country}}', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'Quanto costa una consulenza da un avvocato {{country}}?', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  real_estate: [
    { intent: 'recommendation', text: 'Migliori agenzie immobiliari a {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  fitness: [
    { intent: 'recommendation', text: 'Migliori palestre a {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  beauty: [
    { intent: 'recommendation', text: 'Migliori centri estetici a {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  education: [
    { intent: 'recommendation', text: 'Migliori corsi di informatica {{country}}', score: 87, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  home_improvement_service: [
    { intent: 'recommendation', text: 'Qual è l\'impresa migliore per ristrutturare una cucina a {{city}}?', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'Migliore impresa per rifare un bagno a {{city}}', score: 92, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'Cosa controllare prima di affidarsi a un\'impresa di ristrutturazioni?', score: 88, offering: 'primary' },
    { intent: 'recommendation', text: 'Qual è la migliore impresa per una ristrutturazione completa a {{city}}?', score: 90, offering: 'primary', requiresCity: true },
    { intent: 'commercial', text: 'Quanto costa ristrutturare una casa a {{city}}?', score: 89, offering: 'secondary', requiresCity: true, themeBoost: { price: 4 } },
    { intent: 'transactional', text: 'Come scegliere un\'impresa di ristrutturazioni affidabile?', score: 85, offering: 'primary' },
  ],

  local_service: [
    { intent: 'recommendation', text: 'Professionisti consigliati a {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'A cosa fare attenzione quando si sceglie un professionista?', score: 81, offering: 'primary' },
    { intent: 'commercial', text: 'Quanto costa chiamare un professionista a {{city}}?', score: 79, offering: 'secondary', requiresCity: true, themeBoost: { price: 3 } },
  ],

  generic: [
    { intent: 'recommendation', text: 'Cosa fa {{business}} e in cosa aiuta?', score: 77, offering: 'primary' },
    BRAND_REVIEW(),
  ],
}

/**
 * The noun phrase carries its own article, elision included ("un'agenzia"),
 * because the gender is the noun's and not the frame's.
 */
const SERVICE_LABELS: LangPack['serviceLabels'] = {
  agency: { one: 'un\'agenzia di marketing digitale', plural: 'agenzie di marketing digitale', price: 'la SEO di un sito' },
  cleaning: { one: 'un\'impresa di pulizie', plural: 'imprese di pulizie', price: 'la pulizia di un ufficio' },
  home_improvement_service: { one: 'un\'impresa di ristrutturazioni', plural: 'imprese di ristrutturazioni', price: 'la ristrutturazione di una casa' },
  local_service: { one: 'un professionista della zona', plural: 'professionisti della zona', price: 'l\'intervento' },
  legal: { one: 'uno studio legale', plural: 'studi legali', price: 'una consulenza da un avvocato' },
  real_estate: { one: 'un\'agenzia immobiliare', plural: 'agenzie immobiliari' },
  healthcare: { one: 'una clinica privata', plural: 'cliniche private', price: 'una visita privata' },
  education: { one: 'un centro di formazione', plural: 'centri di formazione', price: 'un corso professionale' },
  florist: { one: 'un fioraio', plural: 'fiorai', price: 'una consegna di fiori' },
  gifts: { one: 'un negozio di regali', plural: 'negozi di regali' },
  perfume: { one: 'una profumeria', plural: 'profumerie', price: 'un profumo di qualità' },
  sports_store: { one: 'un negozio di articoli sportivi', plural: 'negozi di articoli sportivi' },
  appliance_store: { one: 'un negozio di elettrodomestici', plural: 'negozi di elettrodomestici' },
  second_hand_fashion: { one: 'un negozio di seconda mano', plural: 'negozi di seconda mano' },
  restaurant: { one: 'un ristorante', plural: 'ristoranti' },
  travel: { one: 'un servizio di organizzazione viaggi', plural: 'servizi di organizzazione viaggi', price: 'l\'organizzazione di un viaggio' },
  fitness: { one: 'una palestra', plural: 'palestre', price: 'un abbonamento in palestra' },
  beauty: { one: 'un centro estetico', plural: 'centri estetici', price: 'un trattamento estetico' },
  ecommerce: { one: 'un negozio online', plural: 'negozi online' },
  saas: { one: 'una piattaforma software', plural: 'piattaforme software' },
}

export const IT_PACK: LangPack = {
  code: 'it',

  intentLabel: {
    recommendation: 'Consiglio',
    comparison: 'Confronto',
    commercial: 'Prezzo',
    pre_purchase: 'Prima di acquistare',
    transactional: 'Scelta',
    local: 'Locale',
    brand: 'Marca',
    informational: 'Informazione',
    alternatives: 'Alternative',
    gift: 'Regalo',
  },

  categoryLabel: {
    agency: 'agenzia di marketing o SEO',
    ecommerce: 'negozio online',
    perfume: 'profumeria',
    sports_store: 'negozio di articoli sportivi',
    gifts: 'negozio di regali',
    appliance_store: 'negozio di elettrodomestici',
    saas: 'prodotto SaaS',
    product_brand: 'marca di prodotti',
    local_service: 'servizio locale',
    home_improvement_service: 'ristrutturazioni ed edilizia',
    cleaning: 'impresa di pulizie',
    florist: 'fioraio',
    restaurant: 'ristorante',
    healthcare: 'servizio sanitario',
    legal: 'studio legale',
    real_estate: 'agenzia immobiliare',
    fitness: 'palestra',
    beauty: 'bellezza e benessere',
    education: 'formazione',
    second_hand_fashion: 'moda femminile di seconda mano',
    travel: 'viaggi e turismo',
    generic: 'azienda',
  },
  genericCategoryLabel: 'azienda',

  bank: BANK,

  /**
   * Stored WITH the preposition, because Italian articulates it: "in Italia"
   * but "negli Stati Uniti", "nel Regno Unito". The frames above read a bare
   * `{{country}}` so the table decides, rather than every frame writing "in"
   * and producing "in Stati Uniti".
   */
  countryNames: {
    IL: 'in Israele',
    US: 'negli Stati Uniti',
    GB: 'nel Regno Unito',
    DE: 'in Germania',
    FR: 'in Francia',
    ES: 'in Spagna',
    IT: 'in Italia',
    CH: 'in Svizzera',
    AT: 'in Austria',
    BE: 'in Belgio',
  },

  placeholder: { business: 'l\'azienda', city: 'la tua zona' },

  reason: {
    category: (v) => `In base alla categoria dell'attività: ${v}`,
    intent: (v) => `Intento di ricerca: ${v}`,
    location: (v) => `Località: ${v}`,
    themes: {
      gift: 'Rilevato intento regalo nelle parole chiave',
      online: 'Rilevato intento di acquisto online',
      price: 'Rilevata sensibilità al prezzo',
      audienceMen: 'Pubblico rilevato: uomini',
      audienceWomen: 'Pubblico rilevato: donne',
      audienceKids: 'Pubblico rilevato: bambini',
      niche: 'Rilevato interesse per marche di lusso o di nicchia',
    },
  },

  keywordFrames: {
    price: (kw) => `Quanto costa ${kw}?`,
    review: (kw) => `Recensioni su ${kw}`,
    prePurchase: (kw) => `Cosa controllare prima di scegliere ${kw}?`,
    recommendation: (kw) => `Quale fornitore è consigliato per ${kw}?`,
    local: (kw, city) => `Quale fornitore è consigliato per ${kw} a ${city}?`,
  },

  genCopy: {
    insufficient: 'Per generare domande più precise, completa il profilo IA dell\'attività.',
    review: 'Verifica',
    insufficientReason: 'contesto insufficiente',
    starter: 'iniziale',
    default_: 'predefinito',
    starterValue: 'Domande iniziali: completa il profilo per proposte più precise',
  },

  intentWords: new Set([
    'comprare', 'acquistare', 'acquisto', 'ordinare', 'scegliere', 'cercare',
    'prezzo', 'prezzi', 'costo', 'costi', 'tariffa', 'tariffe', 'preventivo',
    'recensioni', 'opinioni', 'migliore', 'migliori', 'economico', 'economica',
    'offerta', 'offerte', 'sconto', 'sconti', 'promozione',
  ]),
  intentPhrases: ['in offerta', 'in promozione', 'miglior prezzo', 'prezzo migliore', 'a poco prezzo'],

  serviceLabels: SERVICE_LABELS,

  intentQuestion: (intent, label, location) => {
    switch (intent) {
      case 'recommendation':
        return `Come scegliere ${label.one}?`
      case 'decision':
        return `Cosa controllare prima di scegliere ${label.one}?`
      case 'trust':
        return `Come capire se ${label.one} è affidabile?`
      case 'price':
        return label.price ? `Quanto costa ${label.price}?` : null
      case 'local':
        return location ? `Dove trovare ${label.one} a ${location}?` : null
      case 'comparison':
        return `Come confrontare ${label.plural}?`
      case 'alternatives':
        return `Quali sono le alternative a ${label.one}?`
      default:
        return null
    }
  },

  safeCurated: {
    price: (isService) => `Quanto costa ${isService ? 'questo servizio' : 'un servizio di questo tipo'}?`,
    choose: (label) => `Come scegliere ${label}?`,
    reviews: (name) => `Recensioni su ${name}`,
    local: (label, city) => `Migliori ${label} a ${city}`,
  },

  nameQuestions: (name, label) =>
    label
      ? [
          { prompt: `Quali sono le recensioni su ${name}?`, intent: 'brand' as const },
          { prompt: `Ci si può fidare di ${name}?`, intent: 'pre_purchase' as const },
          { prompt: `Come si confronta ${name} con le altre ${label.plural}?`, intent: 'comparison' as const },
        ]
      : [
          { prompt: `Quali sono le recensioni su ${name}?`, intent: 'brand' as const },
          { prompt: `Cosa dicono i clienti di ${name}?`, intent: 'recommendation' as const },
        ],

  difference: (a, b) => `Che differenza c'è tra ${a} e ${b}?`,

  genericQuestions: [
    'Come scegliere un\'azienda affidabile in questo settore?',
    'Cosa controllare prima di scegliere un fornitore?',
    'Come confrontare aziende dello stesso settore?',
    'Cosa conta di più prima di affidarsi a un fornitore?',
  ],

  commercialPattern: /(prezz[oi]|quanto\s+costa|cost[oi]|tariff[ae]|preventivo|comprare|acquistare|ordinare|economic[oa]|offerta|sconto|promozione|abbonamento)/i,
  locationPattern: /(vicino\s+a\s+me|nella\s+mia\s+(?:citt[àa]|zona)|qui\s+vicino|in\s+zona)/i,

  valueReason: {
    commercial: 'Chi cerca questo è vicino all\'acquisto.',
    competitive: 'Qui i concorrenti compaiono più dell\'attività.',
    local: 'Occasione per migliorare la visibilità locale.',
    prePurchase: 'È una ricerca con forte intento di acquisto.',
    recommendation: 'Buona occasione per ottenere più clienti in modo organico.',
    frequent: 'È una domanda frequente nei motori IA.',
    rare: 'L\'attività compare molto poco su domande di questo tipo.',
  },

  phrasingBuckets: [
    { bucket: 'it_recommendation_provider', test: /^(?:qual(?:e)?\s+(?:[èe]\s+)?(?:il|la|l'|lo)?\s*(?:miglior|migliore)|migliori?\s+|chi\s+[èe]\s+il\s+migliore)/i },
    { bucket: 'it_price', test: /^(?:quanto\s+(?:costa|costano|conviene)|qual\s+[èe]\s+il\s+(?:prezzo|costo))/i },
    { bucket: 'it_pre_purchase', test: /^(?:come\s+(?:scegliere|capire|organizzare|costruire)|cosa\s+(?:controllare|guardare|fare\s+attenzione))/i },
    { bucket: 'it_comparison', test: /^(?:che\s+differenza|qual\s+[èe]\s+la\s+differenza|conviene\s+|meglio\s+)/i },
    { bucket: 'it_reviews', test: /^(?:recensioni|cosa\s+dicono|ci\s+si\s+pu[òo]\s+fidare)/i },
    { bucket: 'it_local', test: /^(?:dove\s+(?:comprare|trovare|andare)|consegna\s+)/i },
  ],

  familyPrefix: /^(?:quanto\s+(?:costa|costano|conviene\s+spendere\s+per)\s+(?:il|lo|la|l'|un|uno|una|un')?\s*|qual\s+[èe]\s+(?:il|lo|la|l')?\s*(?:miglior(?:e)?|prezzo\s+(?:di|del|della)?|costo\s+(?:di|del|della)?|differenza\s+tra)\s*|migliori?\s+|come\s+(?:scegliere|confrontare|trovare|capire\s+se)\s+(?:il|lo|la|l'|un|uno|una|un'|i|le|gli)?\s*|cosa\s+(?:controllare|guardare)\s+prima\s+di\s+(?:scegliere|comprare|acquistare)\s+(?:il|lo|la|l'|un|uno|una|un')?\s*|dove\s+(?:comprare|trovare)\s+(?:il|lo|la|l'|un|uno|una|un'|i|le|gli)?\s*|recensioni\s+(?:su|dei|di|del|della)\s*|che\s+differenza\s+c'[èe]\s+tra\s*)/iu,

  priceFilter: {
    priceQuestion: /quanto\s+cost(?:a|ano)|qual\s+[èe]\s+il\s+(?:prezzo|costo)/i,
    businessEntity: /(azienda|impresa|negozio|marca|fornitore|agenzia|studio\s+legale)/i,
  },

  filters: {
    doubledIntent: [
      /quanto\s+costa[\s\S]*\bprezzo\b|\bprezzo\b[\s\S]*quanto\s+costa|\btariffa\b[\s\S]*quanto\s+costa/i,
      /recensioni[\s\S]*recensioni|opinioni[\s\S]*opinioni/i,
      /\bmiglior(?:e|i)?\b[\s\S]*\bmiglior(?:e|i)?\b/i,
      /\bconfrontare\b[\s\S]*\bconfrontare\b|\bconfronto\b[\s\S]*\bconfronto\b/i,
      /\beconomic[oa]\b[\s\S]*\beconomic[oa]\b|\boffert[ae]\b[\s\S]*\boffert[ae]\b/i,
      /^(?:recensioni\s+su|quanto\s+costa)\s+(?:comprare|acquistare|prezzo|recensioni|migliore)\b/i,
    ],
    gift: /\bregal(?:o|i|are)\b|\bidee\s+regalo\b/i,
    stackedModifiers: ['migliore', 'migliori', 'economico', 'economica', 'qualità', 'consigliato', 'in offerta', 'con sconto'],
    unnatural: [
      /\bo\s+(?:altre\s+alternative|altre\s+opzioni|altri\s+fornitori)\b/i,
      /^chi\s+[èe]\s+consigliato\s+per\b/i,
      /come\s+(?:trovare|scegliere)\s+\S+\s+nella\s+mia\s+citt[àa]/i,
    ],
    unnaturalForProducts: [
      /\bfornitore\s+(?:per|di)\b/i,
      /\besperto\s+(?:per|di|consigliato)\b/i,
      /\bazienda\s+consigliata\s+per\b/i,
    ],
  },
}

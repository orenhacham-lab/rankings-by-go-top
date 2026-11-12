/**
 * Dutch AI-visibility questions.
 *
 * The Netherlands first and readable in Flanders: "winkel" rather than
 * "zaak", "bedrijf" rather than "firma", no Belgian-only "schrijnwerker". The
 * address is the informal "je", which is what a Dutch customer types into a
 * chatbot and what Dutch commercial sites use.
 *
 * Dutch needs only one indefinite article ("een"), so `one` carries it and
 * `subject`/`oblique` are never needed; the plural is bare, as in English.
 */
import type { BusinessCategory, QueryDef } from '../prompt-templates'
import type { LangPack } from './index'

const BRAND_REVIEW = (score = 74): QueryDef => ({
  intent: 'brand', text: 'Ervaringen met {{business}}', score, offering: 'generic',
})

const BANK: Record<BusinessCategory, QueryDef[]> = {
  perfume: [
    { intent: 'recommendation', text: 'Welke parfum geef je cadeau aan een vrouw?', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Welke parfum geef je cadeau aan een man?', score: 93, offering: 'primary', themeBoost: { audienceMen: 5 } },
    { intent: 'pre_purchase', text: 'Hoe kies je een parfum dat bij je past?', score: 87, offering: 'primary' },
    { intent: 'recommendation', text: 'Beste parfumerieën in {{country}}', score: 89, offering: 'primary' },
    { intent: 'comparison', text: 'Wat is het verschil tussen eau de parfum en eau de toilette?', score: 85, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Waar koop je originele parfum online?', score: 91, offering: 'primary', themeBoost: { online: 5 } },
    { intent: 'local', text: 'Welke niche parfummerken zijn het waard?', score: 83, offering: 'local', themeBoost: { niche: 4 } },
    { intent: 'gift', text: 'Welke parfum is een goed cadeau?', score: 85, offering: 'secondary', themeBoost: { gift: 5 } },
    { intent: 'commercial', text: 'Waar koop je parfum met korting?', score: 81, offering: 'secondary', themeBoost: { price: 4 } },
    BRAND_REVIEW(),
  ],

  sports_store: [
    { intent: 'recommendation', text: 'Beste sportwinkels in {{country}}', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Hoe kies je hardloopschoenen die bij je passen?', score: 89, offering: 'primary' },
    { intent: 'recommendation', text: 'Welke sportkleding gaat lang mee bij dagelijks trainen?', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'Wat is het verschil tussen hardloopschoenen en zaalschoenen?', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'Waar zijn sportartikelen in {{country}} goedkoper?', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  gifts: [
    { intent: 'gift', text: 'Cadeau-ideeën voor een bruiloft', score: 89, offering: 'primary' },
    { intent: 'gift', text: 'Originele cadeau-ideeën voor een verjaardag', score: 87, offering: 'primary' },
    { intent: 'gift', text: 'Cadeau-ideeën voor medewerkers', score: 85, offering: 'primary' },
    { intent: 'recommendation', text: 'Waar koop je bijzondere cadeaus in {{country}}?', score: 85, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  appliance_store: [
    { intent: 'recommendation', text: 'Beste witgoedwinkels in {{country}}', score: 89, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Hoe kies je een wasmachine?', score: 85, offering: 'primary' },
    { intent: 'local', text: 'Zijn huishoudelijke apparaten online of in de winkel goedkoper?', score: 83, offering: 'local', themeBoost: { online: 3, price: 3 } },
    BRAND_REVIEW(),
  ],

  agency: [
    { intent: 'recommendation', text: 'Beste SEO-bureaus in {{country}}', score: 93, offering: 'primary' },
    { intent: 'recommendation', text: 'Beste online marketingbureaus in {{country}}', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Hoe kies je een online marketingbureau?', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'Is SEO of betaald adverteren slimmer?', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'Wat kost SEO in {{country}}?', score: 89, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  cleaning: [
    { intent: 'recommendation', text: 'Beste schoonmaakbedrijven voor kantoren in {{city}}', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'Hoe kies je een betrouwbaar schoonmaakbedrijf?', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'Wat kost kantoorschoonmaak per maand?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  ecommerce: [
    { intent: 'recommendation', text: 'Beste webshops in {{country}}', score: 87, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Hoe weet je of een webshop betrouwbaar is?', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'Waar koop je online het goedkoopst in {{country}}?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  saas: [
    { intent: 'pre_purchase', text: 'Is {{business}} geschikt voor een klein bedrijf?', score: 92, offering: 'primary' },
    { intent: 'commercial', text: 'Wat kost {{business}}?', score: 90, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'pre_purchase', text: 'Wat zijn de voor- en nadelen van {{business}}?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'Is {{business}} het geld waard?', score: 86, offering: 'primary', themeBoost: { price: 3 } },
    { intent: 'pre_purchase', text: 'Hoe begin je met {{business}}?', score: 84, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Voor wie is {{business}} bedoeld?', score: 82, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  product_brand: [
    { intent: 'informational', text: 'Wat zijn de voor- en nadelen van producten van {{business}}?', score: 92, offering: 'primary' },
    { intent: 'local', text: 'Waar koop je producten van {{business}}?', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Waar moet je op letten bij een product van {{business}}?', score: 88, offering: 'primary' },
    { intent: 'commercial', text: 'Waar zijn producten van {{business}} het goedkoopst?', score: 86, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'Kun je beter nieuw of refurbished kopen bij {{business}}?', score: 84, offering: 'primary' },
    { intent: 'recommendation', text: 'Wat zijn de beste producten van {{business}} dit jaar?', score: 83, offering: 'primary' },
    { intent: 'brand', text: 'Ervaringen met producten van {{business}}', score: 74, offering: 'generic' },
  ],

  florist: [
    { intent: 'local', text: 'Bloemen dezelfde dag bezorgd in {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'Beste bloemist in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  second_hand_fashion: [
    { intent: 'recommendation', text: 'Waar koop je tweedehands dameskleding?', score: 94, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Beste tweedehandswinkels voor dameskleding', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Waar vind je vintage dameskleding?', score: 92, offering: 'primary', themeBoost: { audienceWomen: 4 } },
    { intent: 'pre_purchase', text: 'Hoe zie je of tweedehands kleding goede kwaliteit is?', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Is het veilig om tweedehands kleding online te kopen?', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'Waar vind je goedkope tweedehands dameskleding?', score: 90, offering: 'primary', themeBoost: { price: 5 } },
    { intent: 'commercial', text: 'Hoeveel mag goede tweedehands kleding kosten?', score: 88, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'Hoe bouw je een garderobe op met tweedehands kleding?', score: 87, offering: 'primary' },
    { intent: 'informational', text: 'Waar vind je tweedehands designerkleding?', score: 86, offering: 'primary' },
    { intent: 'local', text: 'Tweedehandswinkels in {{city}}', score: 88, offering: 'local', requiresCity: true, themeBoost: { audienceWomen: 3 } },
    { intent: 'brand', text: 'Is {{business}} een betrouwbare tweedehandswinkel?', score: 84, offering: 'secondary' },
  ],

  restaurant: [
    { intent: 'recommendation', text: 'Beste restaurants in {{city}}', score: 91, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'Waar eet je romantisch in {{city}}?', score: 85, offering: 'local', requiresCity: true },
    BRAND_REVIEW(),
  ],

  travel: [
    { intent: 'recommendation', text: 'Welke site is het beste om een verre reis te plannen?', score: 92, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Hoe plan je zelf een reis?', score: 90, offering: 'primary' },
    { intent: 'comparison', text: 'Is een pakketreis of zelf boeken slimmer?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'Wanneer zijn verre vluchten het goedkoopst?', score: 86, offering: 'primary' },
    { intent: 'commercial', text: 'Wat kost een pakketreis naar het buitenland?', score: 85, offering: 'secondary', themeBoost: { price: 4 } },
    BRAND_REVIEW(),
  ],

  healthcare: [
    { intent: 'recommendation', text: 'Beste privéklinieken in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  legal: [
    { intent: 'recommendation', text: 'Beste advocatenkantoren in {{country}}', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'Wat kost een eerste gesprek bij een advocaat in {{country}}?', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  real_estate: [
    { intent: 'recommendation', text: 'Beste makelaars in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  fitness: [
    { intent: 'recommendation', text: 'Beste sportscholen in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  beauty: [
    { intent: 'recommendation', text: 'Beste schoonheidssalons in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  education: [
    { intent: 'recommendation', text: 'Beste IT-opleidingen in {{country}}', score: 87, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  home_improvement_service: [
    { intent: 'recommendation', text: 'Welk bedrijf is het beste voor een keukenverbouwing in {{city}}?', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'Beste bedrijf voor een badkamerverbouwing in {{city}}', score: 92, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'Waar moet je op letten voordat je een verbouwbedrijf inschakelt?', score: 88, offering: 'primary' },
    { intent: 'recommendation', text: 'Welk bedrijf is het beste voor een volledige verbouwing in {{city}}?', score: 90, offering: 'primary', requiresCity: true },
    { intent: 'commercial', text: 'Wat kost het verbouwen van een huis in {{city}}?', score: 89, offering: 'secondary', requiresCity: true, themeBoost: { price: 4 } },
    { intent: 'transactional', text: 'Hoe kies je een betrouwbaar verbouwbedrijf?', score: 85, offering: 'primary' },
  ],

  local_service: [
    { intent: 'recommendation', text: 'Aanbevolen vakmensen in {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'Waar moet je op letten bij het kiezen van een vakman?', score: 81, offering: 'primary' },
    { intent: 'commercial', text: 'Wat kost een vakman in {{city}}?', score: 79, offering: 'secondary', requiresCity: true, themeBoost: { price: 3 } },
  ],

  generic: [
    { intent: 'recommendation', text: 'Wat doet {{business}} en waarbij helpt het?', score: 77, offering: 'primary' },
    BRAND_REVIEW(),
  ],
}

const SERVICE_LABELS: LangPack['serviceLabels'] = {
  agency: { one: 'een online marketingbureau', plural: 'online marketingbureaus', price: 'de SEO van een website' },
  cleaning: { one: 'een schoonmaakbedrijf', plural: 'schoonmaakbedrijven', price: 'het schoonmaken van een kantoor' },
  home_improvement_service: { one: 'een verbouwbedrijf', plural: 'verbouwbedrijven', price: 'het verbouwen van een huis' },
  local_service: { one: 'een vakman', plural: 'vakmensen', price: 'het werk' },
  legal: { one: 'een advocatenkantoor', plural: 'advocatenkantoren', price: 'een gesprek bij een advocaat' },
  real_estate: { one: 'een makelaar', plural: 'makelaars' },
  healthcare: { one: 'een privékliniek', plural: 'privéklinieken', price: 'een behandeling in een privékliniek' },
  education: { one: 'een opleider', plural: 'opleiders', price: 'een beroepsopleiding' },
  florist: { one: 'een bloemist', plural: 'bloemisten', price: 'een bloemenbezorging' },
  gifts: { one: 'een cadeauwinkel', plural: 'cadeauwinkels' },
  perfume: { one: 'een parfumerie', plural: 'parfumerieën', price: 'een goede parfum' },
  sports_store: { one: 'een sportwinkel', plural: 'sportwinkels' },
  appliance_store: { one: 'een witgoedwinkel', plural: 'witgoedwinkels' },
  second_hand_fashion: { one: 'een tweedehandswinkel', plural: 'tweedehandswinkels' },
  restaurant: { one: 'een restaurant', plural: 'restaurants' },
  travel: { one: 'een reisorganisatie', plural: 'reisorganisaties', price: 'het plannen van een reis' },
  fitness: { one: 'een sportschool', plural: 'sportscholen', price: 'een abonnement bij een sportschool' },
  beauty: { one: 'een schoonheidssalon', plural: 'schoonheidssalons', price: 'een schoonheidsbehandeling' },
  ecommerce: { one: 'een webshop', plural: 'webshops' },
  saas: { one: 'een softwareplatform', plural: 'softwareplatforms' },
}

export const NL_PACK: LangPack = {
  code: 'nl',

  intentLabel: {
    recommendation: 'Aanbeveling',
    comparison: 'Vergelijking',
    commercial: 'Prijs',
    pre_purchase: 'Voor de aankoop',
    transactional: 'Keuze',
    local: 'Lokaal',
    brand: 'Merk',
    informational: 'Informatie',
    alternatives: 'Alternatieven',
    gift: 'Cadeau',
  },

  categoryLabel: {
    agency: 'marketing- of SEO-bureau',
    ecommerce: 'webshop',
    perfume: 'parfumerie',
    sports_store: 'sportwinkel',
    gifts: 'cadeauwinkel',
    appliance_store: 'witgoedwinkel',
    saas: 'SaaS-product',
    product_brand: 'productmerk',
    local_service: 'lokale dienst',
    home_improvement_service: 'verbouwen en bouwen',
    cleaning: 'schoonmaakbedrijf',
    florist: 'bloemist',
    restaurant: 'restaurant',
    healthcare: 'zorgaanbieder',
    legal: 'advocatenkantoor',
    real_estate: 'vastgoed',
    fitness: 'fitness',
    beauty: 'beauty en wellness',
    education: 'opleiding en onderwijs',
    second_hand_fashion: 'tweedehands dameskleding',
    travel: 'reizen en toerisme',
    generic: 'bedrijf',
  },
  genericCategoryLabel: 'bedrijf',

  bank: BANK,

  countryNames: {
    IL: 'Israël',
    US: 'de Verenigde Staten',
    GB: 'het Verenigd Koninkrijk',
    DE: 'Duitsland',
    FR: 'Frankrijk',
    ES: 'Spanje',
    NL: 'Nederland',
    BE: 'België',
    AT: 'Oostenrijk',
    PL: 'Polen',
  },

  placeholder: { business: 'het bedrijf', city: 'jouw regio' },

  reason: {
    category: (v) => `Op basis van de categorie van het bedrijf: ${v}`,
    intent: (v) => `Zoekintentie: ${v}`,
    location: (v) => `Locatie: ${v}`,
    themes: {
      gift: 'Cadeau-intentie gevonden in de zoekwoorden',
      online: 'Online-aankoopintentie gevonden',
      price: 'Prijsgevoeligheid gevonden',
      audienceMen: 'Doelgroep gevonden: mannen',
      audienceWomen: 'Doelgroep gevonden: vrouwen',
      audienceKids: 'Doelgroep gevonden: kinderen',
      niche: 'Interesse in luxe- of nichemerken gevonden',
    },
  },

  keywordFrames: {
    price: (kw) => `Wat kost ${kw}?`,
    review: (kw) => `Ervaringen met ${kw}`,
    prePurchase: (kw) => `Waar moet je op letten bij ${kw}?`,
    recommendation: (kw) => `Welke aanbieder is aan te raden voor ${kw}?`,
    local: (kw, city) => `Welke aanbieder is aan te raden voor ${kw} in ${city}?`,
  },

  genCopy: {
    insufficient: 'Vul het AI-profiel van het bedrijf aan voor nauwkeurigere vragen.',
    review: 'Controle',
    insufficientReason: 'te weinig context',
    starter: 'start',
    default_: 'standaard',
    starterValue: 'Startvragen: vul het profiel aan voor nauwkeurigere suggesties',
  },

  intentWords: new Set([
    'kopen', 'bestellen', 'boeken', 'inhuren', 'kiezen', 'zoeken',
    'prijs', 'prijzen', 'kosten', 'kost', 'tarief', 'tarieven', 'aanbieding',
    'ervaringen', 'reviews', 'beoordelingen', 'beste', 'goedkoop', 'goedkope',
    'goedkoopste', 'korting', 'actie',
  ]),
  intentPhrases: ['in de aanbieding', 'beste prijs', 'goede prijs', 'goedkoop kopen'],

  serviceLabels: SERVICE_LABELS,

  intentQuestion: (intent, label, location) => {
    switch (intent) {
      case 'recommendation':
        return `Hoe kies je ${label.one}?`
      case 'decision':
        return `Waar moet je op letten voordat je ${label.one} kiest?`
      case 'trust':
        return `Hoe weet je of ${label.one} betrouwbaar is?`
      case 'price':
        return label.price ? `Wat kost ${label.price}?` : null
      case 'local':
        return location ? `Waar vind je ${label.one} in ${location}?` : null
      case 'comparison':
        return `Hoe vergelijk je ${label.plural}?`
      case 'alternatives':
        return `Welke alternatieven zijn er voor ${label.one}?`
      default:
        return null
    }
  },

  safeCurated: {
    price: (isService) => `Wat kost ${isService ? 'deze dienst' : 'zo\'n dienst'}?`,
    choose: (label) => `Hoe kies je ${label}?`,
    reviews: (name) => `Ervaringen met ${name}`,
    local: (label, city) => `Beste ${label} in ${city}`,
  },

  nameQuestions: (name, label) =>
    label
      ? [
          { prompt: `Wat zijn de ervaringen met ${name}?`, intent: 'brand' as const },
          { prompt: `Is ${name} betrouwbaar?`, intent: 'pre_purchase' as const },
          { prompt: `Hoe verhoudt ${name} zich tot andere ${label.plural}?`, intent: 'comparison' as const },
        ]
      : [
          { prompt: `Wat zijn de ervaringen met ${name}?`, intent: 'brand' as const },
          { prompt: `Wat zeggen klanten over ${name}?`, intent: 'recommendation' as const },
        ],

  difference: (a, b) => `Wat is het verschil tussen ${a} en ${b}?`,

  genericQuestions: [
    'Hoe kies je een betrouwbaar bedrijf in deze branche?',
    'Waar moet je op letten voordat je een aanbieder kiest?',
    'Hoe vergelijk je bedrijven in dezelfde branche?',
    'Wat is het belangrijkste voordat je met een aanbieder begint?',
  ],

  commercialPattern: /(prijs|prijzen|wat\s+kost|kosten|tarief|aanbieding|korting|goedko(?:op|pe|pst)|kopen|bestellen|inhuren|abonnement)/i,
  locationPattern: /(bij\s+mij\s+in\s+de\s+buurt|in\s+mijn\s+(?:stad|buurt|regio)|hier\s+in\s+de\s+buurt)/i,

  valueReason: {
    commercial: 'Wie dit zoekt, staat dicht bij een aankoop.',
    competitive: 'Hier komen concurrenten vaker naar voren dan het bedrijf.',
    local: 'Kans om de lokale vindbaarheid te verbeteren.',
    prePurchase: 'Een zoekopdracht met veel koopintentie.',
    recommendation: 'Goede kans om organisch meer klanten te krijgen.',
    frequent: 'Een vraag die vaak in AI-zoekmachines wordt gesteld.',
    rare: 'Het bedrijf komt bij dit soort vragen bijna niet naar voren.',
  },

  phrasingBuckets: [
    { bucket: 'nl_price', test: /^(?:wat\s+kost|hoeveel\s+(?:kost|mag)|wat\s+zijn\s+de\s+kosten)/i },
    { bucket: 'nl_recommendation_provider', test: /^(?:beste\s+|aanbevolen\s+|welk(?:e)?\s+\S+\s+is\s+het\s+beste)/i },
    { bucket: 'nl_pre_purchase', test: /^(?:hoe\s+(?:kies|weet|zie|plan|bouw|begin)|waar\s+moet\s+je\s+op\s+letten)/i },
    { bucket: 'nl_comparison', test: /^(?:wat\s+is\s+het\s+verschil|hoe\s+vergelijk|is\s+\S+\s+of\s+|kun\s+je\s+beter)/i },
    { bucket: 'nl_reviews', test: /^(?:ervaringen|wat\s+zijn\s+de\s+ervaringen|wat\s+zeggen\s+klanten|is\s+\S+\s+betrouwbaar)/i },
    { bucket: 'nl_local', test: /^(?:waar\s+(?:koop|vind|eet)|bloemen\s+dezelfde\s+dag|wanneer\s+zijn)/i },
  ],

  familyPrefix: /^(?:wat\s+kost\s+(?:het\s+|de\s+|een\s+)?|hoeveel\s+(?:kost|mag)\s+(?:het\s+|de\s+|een\s+)?|beste\s+|aanbevolen\s+|hoe\s+(?:kies|vergelijk|vind|plan)\s+je\s+(?:het\s+|de\s+|een\s+)?|hoe\s+(?:weet|zie)\s+je\s+of\s+(?:het\s+|de\s+|een\s+)?|waar\s+moet\s+je\s+op\s+letten\s+(?:bij|voordat\s+je)\s+(?:het\s+|de\s+|een\s+)?|waar\s+(?:koop|vind)\s+je\s+(?:het\s+|de\s+|een\s+)?|ervaringen\s+met\s+|wat\s+is\s+het\s+verschil\s+tussen\s+)/iu,

  priceFilter: {
    priceQuestion: /wat\s+kost|hoeveel\s+kost/i,
    businessEntity: /(bedrijf|winkel|merk|aanbieder|bureau|webshop|makelaar)/i,
  },

  filters: {
    doubledIntent: [
      /wat\s+kost[\s\S]*\bprijs\b|\bprijs\b[\s\S]*wat\s+kost|\btarief\b[\s\S]*wat\s+kost/i,
      /ervaringen[\s\S]*ervaringen|reviews[\s\S]*reviews/i,
      /\bbeste\b[\s\S]*\bbeste\b/i,
      /\bvergelijk\w*\b[\s\S]*\bvergelijk\w*\b/i,
      /\bgoedko\w*\b[\s\S]*\bgoedko\w*\b|\bkorting\b[\s\S]*\bkorting\b/i,
      /^(?:ervaringen\s+met|wat\s+kost)\s+(?:kopen|prijs|ervaringen|beste)\b/i,
    ],
    gift: /\bcadeau\w*\b|\bgeschenk\w*\b|\bkado\w*\b/i,
    stackedModifiers: ['beste', 'goedkoop', 'goedkope', 'kwaliteit', 'aanbevolen', 'in de aanbieding', 'met korting'],
    unnatural: [
      /\bof\s+(?:andere\s+alternatieven|andere\s+opties|andere\s+aanbieders)\b/i,
      /^wie\s+is\s+aan\s+te\s+raden\s+voor\b/i,
      /hoe\s+vind\s+je\s+\S+\s+in\s+mijn\s+stad/i,
    ],
    unnaturalForProducts: [
      /\baanbieder\s+voor\b/i,
      /\bexpert\s+voor\b|\bspecialist\s+voor\b/i,
      /\baanbevolen\s+bedrijf\s+voor\b/i,
    ],
  },
}

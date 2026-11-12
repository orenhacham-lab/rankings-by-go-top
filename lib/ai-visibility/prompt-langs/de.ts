/**
 * German AI-visibility questions.
 *
 * Germany first and neutral enough for Austria and Switzerland: no "ß"-free
 * Swiss spelling and no Austrian vocabulary, but nothing Germany-only either
 * ("Handwerker", not "Handwerksbetrieb aus der Innung"). Address is the formal
 * one a customer uses with a chatbot about their own purchase — first person
 * singular ("Wie finde ich…", "Was sollte ich prüfen…").
 *
 * German is the first pack whose grammar needs more than one case of the same
 * noun, so `ServiceLabelForms` is filled out properly here: `one` is the
 * ACCUSATIVE ("eine Reinigungsfirma" / "einen Anwalt"), `subject` the
 * NOMINATIVE, and `oblique` the DATIVE that "Alternativen zu …" governs. A
 * frame reads the form it needs rather than gluing an article on and hoping.
 */
import type { BusinessCategory, QueryDef } from '../prompt-templates'
import type { LangPack } from './index'

const BRAND_REVIEW = (score = 74): QueryDef => ({
  intent: 'brand', text: 'Erfahrungen mit {{business}}', score, offering: 'generic',
})

const BANK: Record<BusinessCategory, QueryDef[]> = {
  perfume: [
    { intent: 'recommendation', text: 'Welches Parfum schenkt man einer Frau?', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Welches Parfum schenkt man einem Mann?', score: 93, offering: 'primary', themeBoost: { audienceMen: 5 } },
    { intent: 'pre_purchase', text: 'Wie finde ich ein Parfum, das zu mir passt?', score: 87, offering: 'primary' },
    { intent: 'recommendation', text: 'Beste Parfümerien in {{country}}', score: 89, offering: 'primary' },
    { intent: 'comparison', text: 'Was ist der Unterschied zwischen Eau de Parfum und Eau de Toilette?', score: 85, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Wo kann ich Original-Parfum online kaufen?', score: 91, offering: 'primary', themeBoost: { online: 5 } },
    { intent: 'local', text: 'Welche Nischenparfum-Marken lohnen sich?', score: 83, offering: 'local', themeBoost: { niche: 4 } },
    { intent: 'gift', text: 'Welches Parfum eignet sich als Geschenk?', score: 85, offering: 'secondary', themeBoost: { gift: 5 } },
    { intent: 'commercial', text: 'Wo gibt es Parfum günstiger?', score: 81, offering: 'secondary', themeBoost: { price: 4 } },
    BRAND_REVIEW(),
  ],

  sports_store: [
    { intent: 'recommendation', text: 'Beste Sportgeschäfte in {{country}}', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Wie finde ich die richtigen Laufschuhe für mich?', score: 89, offering: 'primary' },
    { intent: 'recommendation', text: 'Welche Sportbekleidung hält täglichem Training stand?', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'Was ist der Unterschied zwischen Laufschuhen und Hallenschuhen?', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'Wo gibt es Sportartikel in {{country}} günstiger?', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  gifts: [
    { intent: 'gift', text: 'Geschenkideen zur Hochzeit', score: 89, offering: 'primary' },
    { intent: 'gift', text: 'Ausgefallene Geschenkideen zum Geburtstag', score: 87, offering: 'primary' },
    { intent: 'gift', text: 'Geschenkideen für Mitarbeiter', score: 85, offering: 'primary' },
    { intent: 'recommendation', text: 'Wo kann ich in {{country}} besondere Geschenke kaufen?', score: 85, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  appliance_store: [
    { intent: 'recommendation', text: 'Beste Elektrofachmärkte in {{country}}', score: 89, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Wie finde ich die richtige Waschmaschine?', score: 85, offering: 'primary' },
    { intent: 'local', text: 'Sind Haushaltsgeräte online oder im Laden günstiger?', score: 83, offering: 'local', themeBoost: { online: 3, price: 3 } },
    BRAND_REVIEW(),
  ],

  agency: [
    { intent: 'recommendation', text: 'Beste SEO-Agenturen in {{country}}', score: 93, offering: 'primary' },
    { intent: 'recommendation', text: 'Beste Online-Marketing-Agenturen in {{country}}', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Wie finde ich eine gute Online-Marketing-Agentur?', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'Lohnt sich SEO oder bezahlte Werbung mehr?', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'Was kostet SEO in {{country}}?', score: 89, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  cleaning: [
    { intent: 'recommendation', text: 'Beste Büroreinigung in {{city}}', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'Wie finde ich eine zuverlässige Reinigungsfirma?', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'Was kostet die Büroreinigung im Monat?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  ecommerce: [
    { intent: 'recommendation', text: 'Beste Onlineshops in {{country}}', score: 87, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Woran erkenne ich einen seriösen Onlineshop?', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'Wo kaufe ich online in {{country}} am günstigsten?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  saas: [
    { intent: 'pre_purchase', text: 'Ist {{business}} für kleine Unternehmen geeignet?', score: 92, offering: 'primary' },
    { intent: 'commercial', text: 'Was kostet {{business}}?', score: 90, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'pre_purchase', text: 'Was sind die Vor- und Nachteile von {{business}}?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'Ist {{business}} sein Geld wert?', score: 86, offering: 'primary', themeBoost: { price: 3 } },
    { intent: 'pre_purchase', text: 'Wie fange ich mit {{business}} an?', score: 84, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Für wen ist {{business}} gedacht?', score: 82, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  product_brand: [
    { intent: 'informational', text: 'Was sind die Vor- und Nachteile der Produkte von {{business}}?', score: 92, offering: 'primary' },
    { intent: 'local', text: 'Wo kann ich Produkte von {{business}} kaufen?', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Worauf sollte ich beim Kauf eines Produkts von {{business}} achten?', score: 88, offering: 'primary' },
    { intent: 'commercial', text: 'Wo sind Produkte von {{business}} am günstigsten?', score: 86, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'Lieber neu oder generalüberholt bei Produkten von {{business}}?', score: 84, offering: 'primary' },
    { intent: 'recommendation', text: 'Welche Produkte von {{business}} sind dieses Jahr die besten?', score: 83, offering: 'primary' },
    { intent: 'brand', text: 'Erfahrungen mit den Produkten von {{business}}', score: 74, offering: 'generic' },
  ],

  florist: [
    { intent: 'local', text: 'Blumen am selben Tag liefern lassen in {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'Bester Blumenladen in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  second_hand_fashion: [
    { intent: 'recommendation', text: 'Wo kann ich Damenmode aus zweiter Hand kaufen?', score: 94, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Beste Second-Hand-Läden für Damenmode', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Wo finde ich Vintage-Kleidung für Damen?', score: 92, offering: 'primary', themeBoost: { audienceWomen: 4 } },
    { intent: 'pre_purchase', text: 'Woran erkenne ich gute Qualität bei Second-Hand-Kleidung?', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Ist es sicher, getragene Kleidung online zu kaufen?', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'Wo finde ich günstige Damenmode aus zweiter Hand?', score: 90, offering: 'primary', themeBoost: { price: 5 } },
    { intent: 'commercial', text: 'Wie viel sollte gute Second-Hand-Kleidung kosten?', score: 88, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'Wie baue ich eine Garderobe aus Second-Hand-Teilen auf?', score: 87, offering: 'primary' },
    { intent: 'informational', text: 'Wo finde ich Designerstücke aus zweiter Hand?', score: 86, offering: 'primary' },
    { intent: 'local', text: 'Second-Hand-Läden in {{city}}', score: 88, offering: 'local', requiresCity: true, themeBoost: { audienceWomen: 3 } },
    { intent: 'brand', text: 'Ist {{business}} ein seriöser Second-Hand-Laden?', score: 84, offering: 'secondary' },
  ],

  restaurant: [
    { intent: 'recommendation', text: 'Beste Restaurants in {{city}}', score: 91, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'Wo essen für ein romantisches Abendessen in {{city}}?', score: 85, offering: 'local', requiresCity: true },
    BRAND_REVIEW(),
  ],

  travel: [
    { intent: 'recommendation', text: 'Welche Seite ist die beste, um eine Fernreise zu planen?', score: 92, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Wie plane ich eine Reise selbst?', score: 90, offering: 'primary' },
    { intent: 'comparison', text: 'Lohnt sich eine Pauschalreise oder selbst planen?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'Wann sind Fernflüge am günstigsten?', score: 86, offering: 'primary' },
    { intent: 'commercial', text: 'Was kostet eine Pauschalreise ins Ausland?', score: 85, offering: 'secondary', themeBoost: { price: 4 } },
    BRAND_REVIEW(),
  ],

  healthcare: [
    { intent: 'recommendation', text: 'Beste Privatkliniken in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  legal: [
    { intent: 'recommendation', text: 'Beste Anwaltskanzleien in {{country}}', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'Was kostet eine Erstberatung beim Anwalt in {{country}}?', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  real_estate: [
    { intent: 'recommendation', text: 'Beste Immobilienmakler in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  fitness: [
    { intent: 'recommendation', text: 'Beste Fitnessstudios in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  beauty: [
    { intent: 'recommendation', text: 'Beste Kosmetikstudios in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  education: [
    { intent: 'recommendation', text: 'Beste IT-Weiterbildungen in {{country}}', score: 87, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  home_improvement_service: [
    { intent: 'recommendation', text: 'Welche Firma ist die beste für eine Küchenrenovierung in {{city}}?', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'Beste Firma für eine Badrenovierung in {{city}}', score: 92, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'Worauf sollte ich achten, bevor ich eine Renovierungsfirma beauftrage?', score: 88, offering: 'primary' },
    { intent: 'recommendation', text: 'Welche Firma ist die beste für eine Komplettsanierung in {{city}}?', score: 90, offering: 'primary', requiresCity: true },
    { intent: 'commercial', text: 'Was kostet eine Haussanierung in {{city}}?', score: 89, offering: 'secondary', requiresCity: true, themeBoost: { price: 4 } },
    { intent: 'transactional', text: 'Wie finde ich eine zuverlässige Renovierungsfirma?', score: 85, offering: 'primary' },
  ],

  local_service: [
    { intent: 'recommendation', text: 'Empfehlenswerte Handwerker in {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'Worauf sollte ich bei der Auswahl eines Handwerkers achten?', score: 81, offering: 'primary' },
    { intent: 'commercial', text: 'Was kostet ein Handwerker in {{city}}?', score: 79, offering: 'secondary', requiresCity: true, themeBoost: { price: 3 } },
  ],

  generic: [
    { intent: 'recommendation', text: 'Was macht {{business}} und wobei hilft es?', score: 77, offering: 'primary' },
    BRAND_REVIEW(),
  ],
}

/**
 * `one` is ACCUSATIVE (the object of "Wie finde ich …?"), `subject` NOMINATIVE
 * (the subject of "… ist seriös"), `oblique` DATIVE (after "Alternativen zu").
 * Where the three coincide — every feminine and neuter noun here — only `one`
 * is given and the frames fall back to it.
 */
const SERVICE_LABELS: LangPack['serviceLabels'] = {
  agency: {
    one: 'eine Online-Marketing-Agentur', subject: 'eine Online-Marketing-Agentur',
    oblique: 'einer Online-Marketing-Agentur',
    plural: 'Online-Marketing-Agenturen', price: 'die Suchmaschinenoptimierung einer Website',
  },
  cleaning: {
    one: 'eine Reinigungsfirma', oblique: 'einer Reinigungsfirma',
    plural: 'Reinigungsfirmen', price: 'die Reinigung eines Büros',
  },
  home_improvement_service: {
    one: 'eine Renovierungsfirma', oblique: 'einer Renovierungsfirma',
    plural: 'Renovierungsfirmen', price: 'die Sanierung eines Hauses',
  },
  local_service: {
    one: 'einen Handwerker', subject: 'ein Handwerker', oblique: 'einem Handwerker',
    plural: 'Handwerker', price: 'der Einsatz eines Handwerkers',
  },
  legal: {
    one: 'eine Anwaltskanzlei', oblique: 'einer Anwaltskanzlei',
    plural: 'Anwaltskanzleien', price: 'eine Erstberatung beim Anwalt',
  },
  real_estate: {
    one: 'einen Immobilienmakler', subject: 'ein Immobilienmakler', oblique: 'einem Immobilienmakler',
    plural: 'Immobilienmakler',
  },
  healthcare: {
    one: 'eine Privatklinik', oblique: 'einer Privatklinik',
    plural: 'Privatkliniken', price: 'eine Behandlung in einer Privatklinik',
  },
  education: {
    one: 'einen Bildungsanbieter', subject: 'ein Bildungsanbieter', oblique: 'einem Bildungsanbieter',
    plural: 'Bildungsanbieter', price: 'eine berufliche Weiterbildung',
  },
  florist: {
    one: 'einen Blumenladen', subject: 'ein Blumenladen', oblique: 'einem Blumenladen',
    plural: 'Blumenläden', price: 'eine Blumenlieferung',
  },
  gifts: {
    one: 'einen Geschenkeladen', subject: 'ein Geschenkeladen', oblique: 'einem Geschenkeladen',
    plural: 'Geschenkeläden',
  },
  perfume: {
    one: 'eine Parfümerie', oblique: 'einer Parfümerie',
    plural: 'Parfümerien', price: 'ein gutes Parfum',
  },
  sports_store: {
    one: 'ein Sportgeschäft', oblique: 'einem Sportgeschäft',
    plural: 'Sportgeschäfte',
  },
  appliance_store: {
    one: 'einen Elektrofachmarkt', subject: 'ein Elektrofachmarkt', oblique: 'einem Elektrofachmarkt',
    plural: 'Elektrofachmärkte',
  },
  second_hand_fashion: {
    one: 'einen Second-Hand-Laden', subject: 'ein Second-Hand-Laden', oblique: 'einem Second-Hand-Laden',
    plural: 'Second-Hand-Läden',
  },
  restaurant: {
    one: 'ein Restaurant', oblique: 'einem Restaurant',
    plural: 'Restaurants',
  },
  travel: {
    one: 'einen Reiseveranstalter', subject: 'ein Reiseveranstalter', oblique: 'einem Reiseveranstalter',
    plural: 'Reiseveranstalter', price: 'die Planung einer Reise',
  },
  fitness: {
    one: 'ein Fitnessstudio', oblique: 'einem Fitnessstudio',
    plural: 'Fitnessstudios', price: 'eine Mitgliedschaft im Fitnessstudio',
  },
  beauty: {
    one: 'ein Kosmetikstudio', oblique: 'einem Kosmetikstudio',
    plural: 'Kosmetikstudios', price: 'eine Kosmetikbehandlung',
  },
  ecommerce: {
    one: 'einen Onlineshop', subject: 'ein Onlineshop', oblique: 'einem Onlineshop',
    plural: 'Onlineshops',
  },
  saas: {
    one: 'eine Softwarelösung', oblique: 'einer Softwarelösung',
    plural: 'Softwarelösungen',
  },
}

export const DE_PACK: LangPack = {
  code: 'de',

  intentLabel: {
    recommendation: 'Empfehlung',
    comparison: 'Vergleich',
    commercial: 'Preis',
    pre_purchase: 'Vor dem Kauf',
    transactional: 'Auswahl',
    local: 'Lokal',
    brand: 'Marke',
    informational: 'Information',
    alternatives: 'Alternativen',
    gift: 'Geschenk',
  },

  categoryLabel: {
    agency: 'Marketing- oder SEO-Agentur',
    ecommerce: 'Onlineshop',
    perfume: 'Parfümerie',
    sports_store: 'Sportgeschäft',
    gifts: 'Geschenkeladen',
    appliance_store: 'Elektrofachmarkt',
    saas: 'SaaS-Produkt',
    product_brand: 'Produktmarke',
    local_service: 'lokale Dienstleistung',
    home_improvement_service: 'Renovierung und Bau',
    cleaning: 'Reinigungsfirma',
    florist: 'Blumenladen',
    restaurant: 'Restaurant',
    healthcare: 'Gesundheitsdienstleistung',
    legal: 'Anwaltskanzlei',
    real_estate: 'Immobilien',
    fitness: 'Fitness',
    beauty: 'Beauty und Wellness',
    education: 'Aus- und Weiterbildung',
    second_hand_fashion: 'Damenmode aus zweiter Hand',
    travel: 'Reisen und Tourismus',
    generic: 'Unternehmen',
  },
  genericCategoryLabel: 'Unternehmen',

  bank: BANK,

  countryNames: {
    IL: 'Israel',
    US: 'den USA',
    GB: 'Großbritannien',
    DE: 'Deutschland',
    FR: 'Frankreich',
    ES: 'Spanien',
    AT: 'Österreich',
    CH: 'der Schweiz',
    NL: 'den Niederlanden',
    PL: 'Polen',
  },

  placeholder: { business: 'das Unternehmen', city: 'Ihrer Region' },

  reason: {
    category: (v) => `Auf Basis der Geschäftskategorie: ${v}`,
    intent: (v) => `Suchintention: ${v}`,
    location: (v) => `Standort: ${v}`,
    themes: {
      gift: 'Geschenkabsicht in den Keywords erkannt',
      online: 'Online-Kaufabsicht erkannt',
      price: 'Preissensibilität erkannt',
      audienceMen: 'Zielgruppe erkannt: Männer',
      audienceWomen: 'Zielgruppe erkannt: Frauen',
      audienceKids: 'Zielgruppe erkannt: Kinder',
      niche: 'Interesse an Luxus- oder Nischenmarken erkannt',
    },
  },

  keywordFrames: {
    price: (kw) => `Was kostet ${kw}?`,
    review: (kw) => `Erfahrungen mit ${kw}`,
    prePurchase: (kw) => `Worauf sollte ich bei ${kw} achten?`,
    recommendation: (kw) => `Welcher Anbieter ist für ${kw} empfehlenswert?`,
    local: (kw, city) => `Welcher Anbieter ist für ${kw} in ${city} empfehlenswert?`,
  },

  genCopy: {
    insufficient: 'Für genauere Fragen vervollständigen Sie bitte das KI-Profil des Unternehmens.',
    review: 'Prüfung',
    insufficientReason: 'Kontext fehlt',
    starter: 'Einstieg',
    default_: 'Standard',
    starterValue: 'Einstiegsfragen – vervollständigen Sie das Profil für genauere Vorschläge',
  },

  intentWords: new Set([
    'kaufen', 'bestellen', 'buchen', 'beauftragen', 'auswählen', 'suchen',
    'preis', 'preise', 'kosten', 'kostet', 'tarif', 'tarife', 'angebot', 'angebote',
    'erfahrungen', 'bewertungen', 'test', 'beste', 'bester', 'bestes', 'günstig',
    'günstige', 'günstiger', 'billig', 'rabatt', 'aktion',
  ]),
  intentPhrases: ['im angebot', 'bester preis', 'guter preis', 'günstig kaufen', 'auf rechnung'],

  serviceLabels: SERVICE_LABELS,

  intentQuestion: (intent, label, location) => {
    const acc = label.one
    const nom = label.subject ?? label.one
    const dat = label.oblique ?? label.one
    switch (intent) {
      case 'recommendation':
        return `Wie finde ich ${acc}?`
      case 'decision':
        return `Was sollte ich prüfen, bevor ich ${acc} auswähle?`
      case 'trust':
        return `Wie finde ich heraus, ob ${nom} seriös ist?`
      case 'price':
        return label.price ? `Was kostet ${label.price}?` : null
      case 'local':
        return location ? `Wo finde ich ${acc} in ${location}?` : null
      case 'comparison':
        return `Wie vergleiche ich ${label.plural}?`
      case 'alternatives':
        return `Welche Alternativen gibt es zu ${dat}?`
      default:
        return null
    }
  },

  safeCurated: {
    price: (isService) => `Was kostet ${isService ? 'diese Dienstleistung' : 'eine solche Dienstleistung'}?`,
    choose: (label) => `Wie finde ich ${label}?`,
    reviews: (name) => `Erfahrungen mit ${name}`,
    local: (label, city) => `Beste ${label} in ${city}`,
  },

  nameQuestions: (name, label) =>
    label
      ? [
          { prompt: `Welche Erfahrungen gibt es mit ${name}?`, intent: 'brand' as const },
          { prompt: `Ist ${name} seriös?`, intent: 'pre_purchase' as const },
          { prompt: `Wie schlägt sich ${name} im Vergleich zu anderen ${label.plural}?`, intent: 'comparison' as const },
        ]
      : [
          { prompt: `Welche Erfahrungen gibt es mit ${name}?`, intent: 'brand' as const },
          { prompt: `Was sagen Kunden über ${name}?`, intent: 'recommendation' as const },
        ],

  difference: (a, b) => `Was ist der Unterschied zwischen ${a} und ${b}?`,

  genericQuestions: [
    'Wie finde ich ein zuverlässiges Unternehmen in diesem Bereich?',
    'Was sollte ich prüfen, bevor ich einen Anbieter auswähle?',
    'Wie vergleiche ich Unternehmen aus derselben Branche?',
    'Was ist am wichtigsten, bevor ich einen Anbieter beauftrage?',
  ],

  commercialPattern: /(preis|preise|was\s+kostet|kosten|tarif|angebot|rabatt|g[üu]nstig|billig|kaufen|bestellen|beauftragen|mitgliedschaft)/i,
  locationPattern: /(in\s+meiner\s+(?:Stadt|N[äa]he|Region)|in\s+der\s+N[äa]he|hier\s+in\s+der\s+N[äa]he)/i,

  valueReason: {
    commercial: 'Wer das sucht, steht kurz vor dem Kauf.',
    competitive: 'Hier erscheinen Wettbewerber häufiger als das Unternehmen.',
    local: 'Gelegenheit, die lokale Sichtbarkeit zu verbessern.',
    prePurchase: 'Eine Suche mit hoher Kaufabsicht.',
    recommendation: 'Gute Gelegenheit, organisch mehr Kunden zu gewinnen.',
    frequent: 'Eine häufige Frage in KI-Suchmaschinen.',
    rare: 'Das Unternehmen erscheint bei solchen Fragen kaum.',
  },

  phrasingBuckets: [
    { bucket: 'de_price', test: /^(?:was\s+kostet|wie\s+(?:viel|teuer)|welche\s+Kosten)/i },
    { bucket: 'de_recommendation_provider', test: /^(?:beste[rsn]?\s+|welche[rs]?\s+\S+\s+ist\s+(?:die|der|das)\s+beste|empfehlenswerte\s+)/i },
    { bucket: 'de_pre_purchase', test: /^(?:wie\s+finde\s+ich|woran\s+erkenne\s+ich|was\s+sollte\s+ich|worauf\s+sollte\s+ich|wie\s+plane\s+ich|wie\s+baue\s+ich)/i },
    { bucket: 'de_comparison', test: /^(?:was\s+ist\s+der\s+Unterschied|wie\s+vergleiche\s+ich|lohnt\s+sich|lieber\s+)/i },
    { bucket: 'de_reviews', test: /^(?:erfahrungen|welche\s+Erfahrungen|was\s+sagen\s+Kunden|ist\s+\S+\s+seri[öo]s)/i },
    { bucket: 'de_local', test: /^(?:wo\s+(?:finde|kaufe|kann|gibt|essen)|blumen\s+am\s+selben\s+Tag)/i },
  ],

  familyPrefix: /^(?:was\s+kostet\s+(?:der|die|das|ein|eine|einen|einem|einer)?\s*|wie\s+(?:viel|teuer)\s+(?:ist|kostet)\s+(?:der|die|das|ein|eine|einen)?\s*|beste[rsn]?\s+|empfehlenswerte\s+|wie\s+(?:finde|vergleiche|plane)\s+ich\s+(?:der|die|das|ein|eine|einen|einem)?\s*|woran\s+erkenne\s+ich\s+(?:der|die|das|ein|eine|einen)?\s*|wor?auf\s+sollte\s+ich\s+(?:beim\s+Kauf\s+(?:von|eines|einer)?|bei)?\s*|was\s+sollte\s+ich\s+pr[üu]fen,?\s+bevor\s+ich\s+(?:ein|eine|einen|einem)?\s*|wo\s+(?:finde|kaufe|kann)\s+ich\s+(?:der|die|das|ein|eine|einen)?\s*|erfahrungen\s+mit\s+|was\s+ist\s+der\s+Unterschied\s+zwischen\s+)/iu,

  priceFilter: {
    priceQuestion: /was\s+kostet|wie\s+(?:viel|teuer)\s+(?:ist|kostet)/i,
    // No leading \b: a German company is usually a COMPOUND, and
    // "Reinigungsfirma" has to match where "firma" alone would not be found.
    businessEntity: /(firma|unternehmen|agentur|kanzlei|laden|gesch[äa]ft|marke|anbieter|shop)/i,
  },

  filters: {
    doubledIntent: [
      /was\s+kostet[\s\S]*\bpreis\b|\bpreis\b[\s\S]*was\s+kostet|\btarif\b[\s\S]*was\s+kostet/i,
      /erfahrungen[\s\S]*erfahrungen|bewertungen[\s\S]*bewertungen/i,
      /\bbeste[rsn]?\b[\s\S]*\bbeste[rsn]?\b/i,
      /\bvergleich\w*\b[\s\S]*\bvergleich\w*\b/i,
      /\bg[üu]nstig\w*\b[\s\S]*\bg[üu]nstig\w*\b|\brabatt\b[\s\S]*\brabatt\b/i,
      /^(?:erfahrungen\s+mit|was\s+kostet)\s+(?:kaufen|preis|erfahrungen|beste)\b/i,
    ],
    gift: /\bgeschenk\w*\b|\bschenk\w*\b|\bmitbringsel\b/i,
    stackedModifiers: ['beste', 'bester', 'günstig', 'billig', 'qualität', 'empfehlenswert', 'im angebot', 'mit rabatt'],
    unnatural: [
      /\boder\s+(?:andere\s+Alternativen|andere\s+Optionen|andere\s+Anbieter)\b/i,
      /^wer\s+ist\s+(?:empfehlenswert|zu\s+empfehlen)\s+f[üu]r\b/i,
      /wie\s+finde\s+ich\s+\S+\s+in\s+meiner\s+Stadt/i,
    ],
    unnaturalForProducts: [
      /\banbieter\s+f[üu]r\b/i,
      /\bexperte\s+f[üu]r\b|\bfachmann\s+f[üu]r\b/i,
      /\bempfehlenswerte\s+Firma\s+f[üu]r\b/i,
    ],
  },
}

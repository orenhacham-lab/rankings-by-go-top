/**
 * Polish AI-visibility questions.
 *
 * Polish inflects, and two of the things a question frame has to insert come
 * from outside this file, so the grammar is handled by choosing frames rather
 * than by guessing endings:
 *
 *  - The CITY arrives as the merchant typed it, in the nominative ("Warszawa"),
 *    and "w Warszawa" is wrong where "w Warszawie" is right. We cannot decline
 *    a user-supplied proper noun safely — the locative of Polish place names is
 *    regular enough to be tempting and irregular enough to embarrass us. So
 *    every city-bearing frame uses APPOSITION with a dash ("Najlepsze
 *    restauracje — {{city}}"), which needs no case and is exactly how a Polish
 *    search query is typed.
 *  - The COUNTRY comes from our own table, so there it is stored already in the
 *    LOCATIVE ("w Polsce", "w Niemczech") and the frames read "w {{country}}".
 *
 * `one` is the ACCUSATIVE (the object of "Jak wybrać …?") and `oblique` the
 * GENITIVE that "przed wyborem …" and "alternatywy dla …" govern; the trust
 * frame asks about "wiarygodność {gen}" so that no adjective has to agree with
 * a noun whose gender the frame does not know.
 */
import type { BusinessCategory, QueryDef } from '../prompt-templates'
import type { LangPack } from './index'

const BRAND_REVIEW = (score = 74): QueryDef => ({
  intent: 'brand', text: 'Opinie o {{business}}', score, offering: 'generic',
})

const BANK: Record<BusinessCategory, QueryDef[]> = {
  perfume: [
    { intent: 'recommendation', text: 'Jakie perfumy kupić w prezencie dla kobiety?', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Jakie perfumy kupić w prezencie dla mężczyzny?', score: 93, offering: 'primary', themeBoost: { audienceMen: 5 } },
    { intent: 'pre_purchase', text: 'Jak wybrać perfumy, które będą do mnie pasować?', score: 87, offering: 'primary' },
    { intent: 'recommendation', text: 'Najlepsze perfumerie w {{country}}', score: 89, offering: 'primary' },
    { intent: 'comparison', text: 'Czym różni się woda perfumowana od wody toaletowej?', score: 85, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Gdzie kupić oryginalne perfumy online?', score: 91, offering: 'primary', themeBoost: { online: 5 } },
    { intent: 'local', text: 'Które marki perfum niszowych są warte uwagi?', score: 83, offering: 'local', themeBoost: { niche: 4 } },
    { intent: 'gift', text: 'Jakie perfumy nadają się na prezent?', score: 85, offering: 'secondary', themeBoost: { gift: 5 } },
    { intent: 'commercial', text: 'Gdzie kupić perfumy taniej?', score: 81, offering: 'secondary', themeBoost: { price: 4 } },
    BRAND_REVIEW(),
  ],

  sports_store: [
    { intent: 'recommendation', text: 'Najlepsze sklepy sportowe w {{country}}', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Jak wybrać buty do biegania dla siebie?', score: 89, offering: 'primary' },
    { intent: 'recommendation', text: 'Która odzież sportowa wytrzymuje codzienne treningi?', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'Czym różnią się buty do biegania od butów na siłownię?', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'Gdzie kupić sprzęt sportowy taniej w {{country}}?', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  gifts: [
    { intent: 'gift', text: 'Pomysły na prezent na wesele', score: 89, offering: 'primary' },
    { intent: 'gift', text: 'Oryginalne pomysły na prezent urodzinowy', score: 87, offering: 'primary' },
    { intent: 'gift', text: 'Pomysły na upominki dla pracowników', score: 85, offering: 'primary' },
    { intent: 'recommendation', text: 'Gdzie kupić nietypowe prezenty w {{country}}?', score: 85, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  appliance_store: [
    { intent: 'recommendation', text: 'Najlepsze sklepy z AGD w {{country}}', score: 89, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Jak wybrać pralkę?', score: 85, offering: 'primary' },
    { intent: 'local', text: 'Sprzęt AGD taniej w internecie czy w sklepie?', score: 83, offering: 'local', themeBoost: { online: 3, price: 3 } },
    BRAND_REVIEW(),
  ],

  agency: [
    { intent: 'recommendation', text: 'Najlepsze agencje SEO w {{country}}', score: 93, offering: 'primary' },
    { intent: 'recommendation', text: 'Najlepsze agencje marketingu internetowego w {{country}}', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Jak wybrać agencję marketingu internetowego?', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'Co się bardziej opłaca: SEO czy reklama płatna?', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'Ile kosztuje pozycjonowanie strony w {{country}}?', score: 89, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  cleaning: [
    { intent: 'recommendation', text: 'Najlepsze firmy sprzątające biura — {{city}}', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'Jak wybrać solidną firmę sprzątającą?', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'Ile kosztuje miesięczne sprzątanie biura?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  ecommerce: [
    { intent: 'recommendation', text: 'Najlepsze sklepy internetowe w {{country}}', score: 87, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Jak sprawdzić, czy sklep internetowy jest wiarygodny?', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'Gdzie kupić najtaniej w internecie w {{country}}?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  saas: [
    { intent: 'pre_purchase', text: 'Czy {{business}} nadaje się dla małej firmy?', score: 92, offering: 'primary' },
    { intent: 'commercial', text: 'Ile kosztuje {{business}}?', score: 90, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'pre_purchase', text: 'Jakie są plusy i minusy {{business}}?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'Czy {{business}} jest wart swojej ceny?', score: 86, offering: 'primary', themeBoost: { price: 3 } },
    { intent: 'pre_purchase', text: 'Jak zacząć korzystać z {{business}}?', score: 84, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Dla kogo jest {{business}}?', score: 82, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  product_brand: [
    { intent: 'informational', text: 'Jakie są plusy i minusy produktów {{business}}?', score: 92, offering: 'primary' },
    { intent: 'local', text: 'Gdzie kupić produkty {{business}}?', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Na co zwrócić uwagę przy zakupie produktu {{business}}?', score: 88, offering: 'primary' },
    { intent: 'commercial', text: 'Gdzie produkty {{business}} są najtańsze?', score: 86, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'Produkty {{business}} nowe czy odnowione?', score: 84, offering: 'primary' },
    { intent: 'recommendation', text: 'Które produkty {{business}} są w tym roku najlepsze?', score: 83, offering: 'primary' },
    { intent: 'brand', text: 'Opinie o produktach {{business}}', score: 74, offering: 'generic' },
  ],

  florist: [
    { intent: 'local', text: 'Dostawa kwiatów tego samego dnia — {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'Najlepsza kwiaciarnia — {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  second_hand_fashion: [
    { intent: 'recommendation', text: 'Gdzie kupić damską odzież z drugiej ręki?', score: 94, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Najlepsze lumpeksy z damską odzieżą', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Gdzie znaleźć damską odzież vintage?', score: 92, offering: 'primary', themeBoost: { audienceWomen: 4 } },
    { intent: 'pre_purchase', text: 'Jak rozpoznać dobrą jakość w odzieży używanej?', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Czy kupowanie używanej odzieży online jest bezpieczne?', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'Gdzie znaleźć tanią damską odzież z drugiej ręki?', score: 90, offering: 'primary', themeBoost: { price: 5 } },
    { intent: 'commercial', text: 'Ile warto wydać na dobrą odzież używaną?', score: 88, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'Jak zbudować szafę z rzeczy z drugiej ręki?', score: 87, offering: 'primary' },
    { intent: 'informational', text: 'Gdzie znaleźć markową odzież z drugiej ręki?', score: 86, offering: 'primary' },
    { intent: 'local', text: 'Sklepy z odzieżą używaną — {{city}}', score: 88, offering: 'local', requiresCity: true, themeBoost: { audienceWomen: 3 } },
    { intent: 'brand', text: 'Czy {{business}} to wiarygodny sklep z odzieżą używaną?', score: 84, offering: 'secondary' },
  ],

  restaurant: [
    { intent: 'recommendation', text: 'Najlepsze restauracje — {{city}}', score: 91, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'Gdzie zjeść romantyczną kolację — {{city}}', score: 85, offering: 'local', requiresCity: true },
    BRAND_REVIEW(),
  ],

  travel: [
    { intent: 'recommendation', text: 'Który serwis jest najlepszy do zaplanowania zagranicznej podróży?', score: 92, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Jak samemu zaplanować podróż?', score: 90, offering: 'primary' },
    { intent: 'comparison', text: 'Co się bardziej opłaca: wycieczka zorganizowana czy wyjazd na własną rękę?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'Kiedy loty zagraniczne są najtańsze?', score: 86, offering: 'primary' },
    { intent: 'commercial', text: 'Ile kosztuje wycieczka zorganizowana za granicę?', score: 85, offering: 'secondary', themeBoost: { price: 4 } },
    BRAND_REVIEW(),
  ],

  healthcare: [
    { intent: 'recommendation', text: 'Najlepsze kliniki prywatne — {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  legal: [
    { intent: 'recommendation', text: 'Najlepsze kancelarie prawne w {{country}}', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'Ile kosztuje konsultacja u prawnika w {{country}}?', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  real_estate: [
    { intent: 'recommendation', text: 'Najlepsze biura nieruchomości — {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  fitness: [
    { intent: 'recommendation', text: 'Najlepsze siłownie — {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  beauty: [
    { intent: 'recommendation', text: 'Najlepsze salony kosmetyczne — {{city}}', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  education: [
    { intent: 'recommendation', text: 'Najlepsze kursy IT w {{country}}', score: 87, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  home_improvement_service: [
    { intent: 'recommendation', text: 'Która firma najlepiej wyremontuje kuchnię — {{city}}?', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'Najlepsza firma do remontu łazienki — {{city}}', score: 92, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'Co sprawdzić przed zleceniem remontu firmie budowlanej?', score: 88, offering: 'primary' },
    { intent: 'recommendation', text: 'Która firma najlepiej zrobi remont kompleksowy — {{city}}?', score: 90, offering: 'primary', requiresCity: true },
    { intent: 'commercial', text: 'Ile kosztuje remont domu — {{city}}?', score: 89, offering: 'secondary', requiresCity: true, themeBoost: { price: 4 } },
    { intent: 'transactional', text: 'Jak wybrać solidną firmę remontową?', score: 85, offering: 'primary' },
  ],

  local_service: [
    { intent: 'recommendation', text: 'Polecani fachowcy — {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'Na co zwrócić uwagę przy wyborze fachowca?', score: 81, offering: 'primary' },
    { intent: 'commercial', text: 'Ile kosztuje wynajęcie fachowca — {{city}}?', score: 79, offering: 'secondary', requiresCity: true, themeBoost: { price: 3 } },
  ],

  generic: [
    { intent: 'recommendation', text: 'Czym zajmuje się {{business}} i w czym pomaga?', score: 77, offering: 'primary' },
    BRAND_REVIEW(),
  ],
}

/** `one` accusative, `oblique` genitive — see the file header. */
const SERVICE_LABELS: LangPack['serviceLabels'] = {
  agency: {
    one: 'agencję marketingu internetowego', oblique: 'agencji marketingu internetowego',
    plural: 'agencje marketingu internetowego', price: 'pozycjonowanie strony',
  },
  cleaning: {
    one: 'firmę sprzątającą', oblique: 'firmy sprzątającej',
    plural: 'firmy sprzątające', price: 'sprzątanie biura',
  },
  home_improvement_service: {
    one: 'firmę remontową', oblique: 'firmy remontowej',
    plural: 'firmy remontowe', price: 'remont domu',
  },
  local_service: {
    one: 'fachowca', oblique: 'fachowca',
    plural: 'fachowców', price: 'usługa fachowca',
  },
  legal: {
    one: 'kancelarię prawną', oblique: 'kancelarii prawnej',
    plural: 'kancelarie prawne', price: 'konsultacja u prawnika',
  },
  real_estate: {
    one: 'biuro nieruchomości', oblique: 'biura nieruchomości',
    plural: 'biura nieruchomości',
  },
  healthcare: {
    one: 'klinikę prywatną', oblique: 'kliniki prywatnej',
    plural: 'kliniki prywatne', price: 'wizyta prywatna',
  },
  education: {
    one: 'szkołę kursów zawodowych', oblique: 'szkoły kursów zawodowych',
    plural: 'szkoły kursów zawodowych', price: 'kurs zawodowy',
  },
  florist: {
    one: 'kwiaciarnię', oblique: 'kwiaciarni',
    plural: 'kwiaciarnie', price: 'dostawa kwiatów',
  },
  gifts: {
    one: 'sklep z upominkami', oblique: 'sklepu z upominkami',
    plural: 'sklepy z upominkami',
  },
  perfume: {
    one: 'perfumerię', oblique: 'perfumerii',
    plural: 'perfumerie', price: 'dobre perfumy',
  },
  sports_store: {
    one: 'sklep sportowy', oblique: 'sklepu sportowego',
    plural: 'sklepy sportowe',
  },
  appliance_store: {
    one: 'sklep z AGD', oblique: 'sklepu z AGD',
    plural: 'sklepy z AGD',
  },
  second_hand_fashion: {
    one: 'sklep z odzieżą używaną', oblique: 'sklepu z odzieżą używaną',
    plural: 'sklepy z odzieżą używaną',
  },
  restaurant: {
    one: 'restaurację', oblique: 'restauracji',
    plural: 'restauracje',
  },
  travel: {
    one: 'biuro podróży', oblique: 'biura podróży',
    plural: 'biura podróży', price: 'organizacja wyjazdu',
  },
  fitness: {
    one: 'siłownię', oblique: 'siłowni',
    plural: 'siłownie', price: 'karnet na siłownię',
  },
  beauty: {
    one: 'salon kosmetyczny', oblique: 'salonu kosmetycznego',
    plural: 'salony kosmetyczne', price: 'zabieg kosmetyczny',
  },
  ecommerce: {
    one: 'sklep internetowy', oblique: 'sklepu internetowego',
    plural: 'sklepy internetowe',
  },
  saas: {
    one: 'platformę software', oblique: 'platformy software',
    plural: 'platformy software',
  },
}

export const PL_PACK: LangPack = {
  code: 'pl',

  intentLabel: {
    recommendation: 'Rekomendacja',
    comparison: 'Porównanie',
    commercial: 'Cena',
    pre_purchase: 'Przed zakupem',
    transactional: 'Wybór',
    local: 'Lokalnie',
    brand: 'Marka',
    informational: 'Informacja',
    alternatives: 'Alternatywy',
    gift: 'Prezent',
  },

  categoryLabel: {
    agency: 'agencja marketingowa lub SEO',
    ecommerce: 'sklep internetowy',
    perfume: 'perfumeria',
    sports_store: 'sklep sportowy',
    gifts: 'sklep z upominkami',
    appliance_store: 'sklep z AGD',
    saas: 'produkt SaaS',
    product_brand: 'marka produktów',
    local_service: 'usługa lokalna',
    home_improvement_service: 'remonty i budowa',
    cleaning: 'firma sprzątająca',
    florist: 'kwiaciarnia',
    restaurant: 'restauracja',
    healthcare: 'usługi medyczne',
    legal: 'kancelaria prawna',
    real_estate: 'nieruchomości',
    fitness: 'fitness',
    beauty: 'uroda i wellness',
    education: 'szkolenia i edukacja',
    second_hand_fashion: 'damska odzież z drugiej ręki',
    travel: 'podróże i turystyka',
    generic: 'firma',
  },
  genericCategoryLabel: 'firma',

  bank: BANK,

  /**
   * Stored in the LOCATIVE, because every frame that uses a country reads
   * "w {{country}}" — see the file header.
   */
  countryNames: {
    IL: 'Izraelu',
    US: 'USA',
    GB: 'Wielkiej Brytanii',
    DE: 'Niemczech',
    FR: 'Francji',
    ES: 'Hiszpanii',
    PL: 'Polsce',
    CZ: 'Czechach',
    NL: 'Holandii',
    AT: 'Austrii',
  },

  placeholder: { business: 'ta firma', city: 'Twojej okolicy' },

  reason: {
    category: (v) => `Na podstawie kategorii firmy: ${v}`,
    intent: (v) => `Intencja wyszukiwania: ${v}`,
    location: (v) => `Lokalizacja: ${v}`,
    themes: {
      gift: 'W słowach kluczowych wykryto intencję prezentową',
      online: 'Wykryto intencję zakupu online',
      price: 'Wykryto wrażliwość na cenę',
      audienceMen: 'Wykryta grupa odbiorców: mężczyźni',
      audienceWomen: 'Wykryta grupa odbiorców: kobiety',
      audienceKids: 'Wykryta grupa odbiorców: dzieci',
      niche: 'Wykryto zainteresowanie markami luksusowymi lub niszowymi',
    },
  },

  keywordFrames: {
    price: (kw) => `Ile kosztuje ${kw}?`,
    review: (kw) => `Opinie o ${kw}`,
    prePurchase: (kw) => `Na co zwrócić uwagę przy ${kw}?`,
    recommendation: (kw) => `Którego wykonawcę wybrać: ${kw}?`,
    local: (kw, city) => `Którego wykonawcę wybrać: ${kw} — ${city}?`,
  },

  genCopy: {
    insufficient: 'Aby pytania były dokładniejsze, uzupełnij profil AI firmy.',
    review: 'Weryfikacja',
    insufficientReason: 'brak kontekstu',
    starter: 'początkowe',
    default_: 'domyślne',
    starterValue: 'Pytania na start — uzupełnij profil, aby propozycje były dokładniejsze',
  },

  intentWords: new Set([
    'kupić', 'kupno', 'zamówić', 'zamawiać', 'wynająć', 'wybrać', 'szukam',
    'cena', 'ceny', 'cennik', 'koszt', 'koszty', 'ile', 'kosztuje',
    'opinie', 'opinia', 'recenzje', 'najlepszy', 'najlepsza', 'najlepsze',
    'tani', 'tania', 'tanie', 'najtaniej', 'promocja', 'rabat', 'zniżka',
  ]),
  intentPhrases: ['w promocji', 'najlepsza cena', 'dobra cena', 'tanio kupić'],

  serviceLabels: SERVICE_LABELS,

  intentQuestion: (intent, label, location) => {
    const acc = label.one
    const gen = label.oblique ?? label.one
    switch (intent) {
      case 'recommendation':
        return `Jak wybrać ${acc}?`
      case 'decision':
        return `Co sprawdzić przed wyborem ${gen}?`
      case 'trust':
        return `Jak sprawdzić wiarygodność ${gen}?`
      case 'price':
        return label.price ? `Ile kosztuje ${label.price}?` : null
      case 'local':
        // Apposition, not "w {city}": the city arrives in the nominative.
        return location ? `Gdzie znaleźć ${acc} — ${location}?` : null
      case 'comparison':
        return `Jak porównać ${label.plural}?`
      case 'alternatives':
        return `Jakie są alternatywy dla ${gen}?`
      default:
        return null
    }
  },

  safeCurated: {
    price: (isService) => `Ile kosztuje ${isService ? 'taka usługa' : 'usługa tego typu'}?`,
    choose: (label) => `Jak wybrać ${label}?`,
    reviews: (name) => `Opinie o ${name}`,
    local: (label, city) => `Najlepsze ${label} — ${city}`,
  },

  nameQuestions: (name, label) =>
    label
      ? [
          { prompt: `Jakie są opinie o ${name}?`, intent: 'brand' as const },
          { prompt: `Czy można zaufać firmie ${name}?`, intent: 'pre_purchase' as const },
          { prompt: `Jak ${name} wypada na tle innych firm z branży?`, intent: 'comparison' as const },
        ]
      : [
          { prompt: `Jakie są opinie o ${name}?`, intent: 'brand' as const },
          { prompt: `Co klienci mówią o firmie ${name}?`, intent: 'recommendation' as const },
        ],

  difference: (a, b) => `Czym różni się ${a} od ${b}?`,

  genericQuestions: [
    'Jak wybrać solidną firmę w tej branży?',
    'Co sprawdzić przed wyborem wykonawcy?',
    'Jak porównać firmy z tej samej branży?',
    'Co jest najważniejsze przed podpisaniem umowy z wykonawcą?',
  ],

  commercialPattern: /(cena|ceny|cennik|ile\s+kosztuje|koszt|koszty|promocja|rabat|zni[żz]ka|tani|tania|tanie|najtaniej|kupi[ćc]|zam[óo]wi[ćc]|karnet)/i,
  locationPattern: /(w\s+mojej\s+(?:okolicy|miejscowo[śs]ci)|blisko\s+mnie|w\s+moim\s+mie[śs]cie|w\s+okolicy)/i,

  valueReason: {
    commercial: 'Kto tego szuka, jest blisko zakupu.',
    competitive: 'Tutaj konkurencja pojawia się częściej niż ta firma.',
    local: 'Okazja, by poprawić widoczność lokalną.',
    prePurchase: 'To wyszukiwanie z wysoką intencją zakupową.',
    recommendation: 'Dobra okazja, by zdobyć więcej klientów organicznie.',
    frequent: 'To częste pytanie w wyszukiwarkach AI.',
    rare: 'Firma prawie nie pojawia się przy pytaniach tego typu.',
  },

  phrasingBuckets: [
    { bucket: 'pl_price', test: /^(?:ile\s+(?:kosztuje|kosztuj[ąa]|warto\s+wyda[ćc])|jaka\s+jest\s+cena)/i },
    { bucket: 'pl_recommendation_provider', test: /^(?:najlepsz[aeyi]\w*\s+|polecan[iy]\w*\s+|kt[óo]r[aey]\w*\s+(?:firma|serwis|marka|sklep))/i },
    { bucket: 'pl_pre_purchase', test: /^(?:jak\s+(?:wybra[ćc]|sprawdzi[ćc]|rozpozna[ćc]|zbudowa[ćc]|zaplanowa[ćc]|zacz[ąa][ćc])|na\s+co\s+zwr[óo]ci[ćc]\s+uwag[ęe]|co\s+sprawdzi[ćc])/i },
    { bucket: 'pl_comparison', test: /^(?:czym\s+r[óo][żz]ni|jak\s+por[óo]wna[ćc]|co\s+si[ęe]\s+bardziej\s+op[łl]aca)/i },
    { bucket: 'pl_reviews', test: /^(?:opinie|jakie\s+s[ąa]\s+opinie|co\s+klienci\s+m[óo]wi[ąa]|czy\s+mo[żz]na\s+zaufa[ćc])/i },
    { bucket: 'pl_local', test: /^(?:gdzie\s+(?:kupi[ćc]|znale[źz][ćc]|zje[śs][ćc])|dostawa\s+|kiedy\s+)/i },
  ],

  familyPrefix: /^(?:ile\s+(?:kosztuje|kosztuj[ąa]|warto\s+wyda[ćc]\s+na)\s*|jaka\s+jest\s+cena\s*|najlepsz[aeyi]\w*\s+|polecan[iy]\w*\s+|jak\s+(?:wybra[ćc]|por[óo]wna[ćc]|znale[źz][ćc]|sprawdzi[ćc]\s+wiarygodno[śs][ćc]|rozpozna[ćc])\s*|co\s+sprawdzi[ćc]\s+przed\s+(?:wyborem|zleceniem)\s*|na\s+co\s+zwr[óo]ci[ćc]\s+uwag[ęe]\s+(?:przy|przed)\s*|gdzie\s+(?:kupi[ćc]|znale[źz][ćc])\s*|opinie\s+o\s*|czym\s+r[óo][żz]ni\s+si[ęe]\s*)/iu,

  priceFilter: {
    priceQuestion: /ile\s+kosztuj(?:e|[ąa])|jaka\s+jest\s+cena/i,
    businessEntity: /(firm[aąęy]|sklep|mark[aąi]|wykonawc|kancelari|agencj)/i,
  },

  filters: {
    doubledIntent: [
      /ile\s+kosztuje[\s\S]*\bcena\b|\bcena\b[\s\S]*ile\s+kosztuje|\bcennik\b[\s\S]*ile\s+kosztuje/i,
      /\bopinie\b[\s\S]*\bopinie\b|\brecenzje\b[\s\S]*\brecenzje\b/i,
      /\bnajlepsz\w*\b[\s\S]*\bnajlepsz\w*\b/i,
      /\bpor[óo]wna\w*\b[\s\S]*\bpor[óo]wna\w*\b/i,
      /\btani\w*\b[\s\S]*\btani\w*\b|\bpromocj\w*\b[\s\S]*\bpromocj\w*\b/i,
      /^(?:opinie\s+o|ile\s+kosztuje)\s+(?:kupi[ćc]|cena|opinie|najlepsz\w*)\b/i,
    ],
    gift: /\bprezent\w*\b|\bupomin\w*\b|\bpodarun\w*\b/i,
    stackedModifiers: ['najlepszy', 'najlepsza', 'najlepsze', 'tani', 'tanie', 'jakość', 'polecany', 'w promocji', 'z rabatem'],
    unnatural: [
      /\blub\s+(?:inne\s+alternatywy|inne\s+opcje|inni\s+wykonawcy)\b/i,
      /^kogo\s+polecacie\s+do\b/i,
      /jak\s+znale[źz][ćc]\s+\S+\s+w\s+moim\s+mie[śs]cie/i,
    ],
    unnaturalForProducts: [
      /\bwykonawc[ęea]\s+(?:do|dla)\b/i,
      /\bspecjalist[ęea]\s+(?:do|dla)\b|\bekspert\w*\s+(?:do|dla)\b/i,
      /\bpolecana\s+firma\s+do\b/i,
    ],
  },
}

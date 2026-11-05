/**
 * The Dutch public site's shared words: navigation, footer, the About page,
 * the articles index, the cookie notice, the contact menu and the accessibility
 * menu. Same shape as `he`, `en`, `es`, `pt-BR`, `fr`, `it`, `ja` and `de`,
 * which is what the public-dictionary QA proves — a key present in Hebrew and
 * missing here is a failure, not a silent fall back to another language.
 *
 * Dutch in the formal register, consistently: the reader is addressed as "u",
 * never "jij" or "je", because every reader of these pages is a business. Dutch
 * B2B copy does use "je" freely, but it reads as a consumer brand, and the
 * German and Italian trees next to this one are formal; a visitor switching
 * languages should not find the vendor suddenly familiar. Buttons take the
 * infinitive ("Gratis starten", "Prijzen bekijken"), which is what Dutch
 * interfaces do.
 *
 * Established Dutch SEO vocabulary, taken from what Dutch searchers actually
 * type rather than calqued from the English. Keyword Planner's own Dutch list
 * is what settles it: **zoekwoorden**, not "keywords" ("zoekwoordplanner" 480/mo
 * and "zoekwoorden analyse" 170/mo are real Dutch queries), "zoekwoordenonderzoek",
 * "posities" and "rankings" both, "organische zoekresultaten",
 * "zichtbaarheid in AI-antwoorden", "backlinks" (`backlinks checken` is the
 * 4,400/mo term this locale was chosen for), "interne links",
 * "websiteanalyse", "dashboard". "Google Bedrijfsprofiel" is Google's own Dutch
 * name for what English calls a Business Profile.
 *
 * Dutch closes its compounds: "zoekwoordenonderzoek", "websiteanalyse",
 * "bedrijfsprofiel" — one word, no space, which is the most common mistake in
 * machine-translated Dutch. A hyphen appears only where one half is English or
 * an abbreviation ("AI-antwoorden", "SEO-rapporten").
 */
import type { PublicDictionary } from './he'

export const nl = {
  nav: {
    home: 'Home',
    pricing: 'Prijzen',
    features: 'Functies',
    articles: 'Artikelen',
    freeCheck: 'Gratis analyse',
    about: 'Over ons',
    contact: 'Contact',
    login: 'Inloggen',
    startFree: 'Gratis starten',
    toDashboard: 'Dashboard',
    menu: 'Menu',
    closeMenu: 'Menu sluiten',
    homeAria: 'Go Top SEO – startpagina',
    primaryAria: 'Hoofdnavigatie',
    featuresMenu: {
      contentPublishing: {
        label: 'Content schrijven, plannen en publiceren',
        description: 'SEO- en GEO-content rechtstreeks vanuit het platform schrijven, plannen en publiceren, naast het meten van posities en zichtbaarheid.',
      },
      googleOrganic: {
        label: 'Google-posities volgen',
        description: 'Posities in de organische zoekresultaten van Google. Elk zoekwoord per locatie, taal en apparaat, op pagina 1 en 2.',
      },
      googleMaps: {
        label: 'Posities in Google Maps volgen',
        description: 'Zien hoe zichtbaar uw bedrijf is in Google Maps. Posities per stad, per buurt en per zoekterm, met nauwkeurige locatietargeting.',
      },
      aiVisibility: {
        label: 'Zichtbaarheid in AI-antwoorden volgen',
        description: 'Ontdekken of uw bedrijf genoemd wordt in de antwoorden van ChatGPT, Gemini, Perplexity en Google AI.',
      },
      reports: {
        label: 'SEO- en GEO-rapporten',
        description: 'Rapporten in pdf en Excel voor uw klanten, met posities, ontwikkelingen en zichtbaarheidsdata.',
      },
      keywordResearch: {
        label: 'Zoekwoordenonderzoek',
        description: 'Zoekwoordideeën, zoekvolume en concurrentie, voordat u een zoekwoord in de monitoring opneemt',
      },
      siteFixes: {
        label: 'Verbeteringen aan de website',
        description: 'De website analyseren en titels, metabeschrijvingen, alt-teksten van afbeeldingen en links verbeteren. In WordPress met één klik, na uw goedkeuring.',
      },
      mapsPosts: {
        label: 'Berichten in uw Google Bedrijfsprofiel',
        description: 'Berichten met foto en knop in het Google Bedrijfsprofiel, direct of gepland, plus antwoorden op reviews. Met een eerste versie die u zelf kunt aanpassen.',
      },
      links: {
        label: 'Links naar uw website',
        description: 'De interne links tussen uw pagina’s, pagina’s die geen enkele link bereikt, en gratis vermeldingen waar uw bedrijf in thuishoort.',
      },
      competitors: {
        label: 'U en uw concurrenten',
        description: 'Bij hoeveel zoekwoorden elke concurrent in Google boven u staat, en wie de AI-diensten in uw plaats noemen.',
      },
      searchConsole: {
        label: 'Gegevens uit Search Console',
        description: 'Klikken, weergaven en gemiddelde positie in Google, vergeleken met de vorige periode.',
      },
    },
    featureGroups: {
      measure: 'Meten',
      act: 'Uitvoeren',
      prove: 'Resultaten laten zien',
    },
    solutions: 'Voor wie',
    solutionsMenu: {
      businesses: {
        label: 'Ondernemers',
        description: 'Eén systeem dat schrijft, publiceert en meet, zonder losse dienstverleners aan te sturen.',
      },
      agencies: {
        label: 'Bureaus',
        description: 'Alle websites van uw klanten op één plek, met pdf-rapporten voor de klant.',
      },
      shopify: {
        label: 'Shopify-webshops',
        description: 'Onze app in de Shopify App Store.',
      },
      wordpress: {
        label: 'WordPress-websites',
        description: 'Artikelen rechtstreeks op uw website publiceren en verbeteringen met één klik.',
      },
    },
  },
  footer: {
    tagline: 'Eén platform voor SEO- en GEO-content: content schrijven, plannen en publiceren, met monitoring van de zichtbaarheid in Google en in de antwoorden van ChatGPT, Gemini en de overige AI-diensten.',
    pages: 'Pagina’s',
    home: 'Home',
    pricing: 'Prijzen',
    articles: 'Artikelen',
    about: 'Over ons',
    affiliates: 'Partnerprogramma',
    sitemap: 'Sitemap',
    legal: 'Juridisch',
    privacy: 'Privacyverklaring',
    terms: 'Algemene voorwaarden',
    refundPolicy: 'Herroeping en terugbetaling',
    affiliateTerms: 'Partnervoorwaarden',
    accessibility: 'Toegankelijkheid',
    contact: 'Contact',
    copyright: '© 2026 Go Top SEO. Alle rechten voorbehouden.',
    agencyAria: 'Go Top – bureau voor digitale marketing',
    credit: 'Een product van GO TOP',
  },
  about: {
    breadcrumb: 'Over ons',
    heroTitle1: 'Dit is',
    heroTitle2: 'Go Top SEO',
    heroSubtitle: 'Ruim 11 jaar praktijkervaring in digitale marketing. En vandaag een platform voor Google-posities en zichtbaarheid in AI-antwoorden.',
    storyTitle: 'Het verhaal van Go Top',
    storyPara1: 'In een wereld vol kunstmatige intelligentie, vol automatisering en grote bedrijven die in abstracties praten, hebben wij bij Go Top een andere keuze gemaakt.',
    storyPara2: 'Iets menselijks, nauwkeurigs en op resultaat gerichts, gebouwd op ruim 11 jaar concreet werk in digitale marketing: organische zoekresultaten voor bedrijven, websites en online advertenties.',
    yearsLabel: 'Jaar ervaring',
    yearsSublabel: 'in digitale marketing',
    philosophyTitle: 'Waar wij voor staan',
    philosophyPara1: 'Wij kijken niet naar aantallen, alleen naar kwaliteit. Wij werken met bedrijven waar wij bij passen, en die krijgen dan onze volle aandacht, direct contact en nauwkeurige begeleiding.',
    philosophyPara2: 'Klikken en weergaven maken bij Go Top geen indruk. Wat indruk maakt, is de telefoon die begint te rinkelen. Want daar komt het uiteindelijk op aan.',
    qualityBadge: 'Kwaliteit boven aantallen',
    whyTitle: 'Waarom wij Go Top SEO gebouwd hebben',
    whyIntro: 'Terwijl veel bedrijven algemene monitoringtools gebruiken, kwam bij ons altijd hetzelfde probleem terug:',
    whyProblem1Title: 'Dure en ingewikkelde tools',
    whyProblem1Desc: 'Nooit gebouwd voor kleine bedrijven',
    whyProblem2Title: 'Rapporten die niemand begrijpt',
    whyProblem2Desc: 'Cijfers waar u niets mee kunt',
    whyProblem3Title: 'Geen echte begeleiding',
    whyProblem3Desc: 'Juist op het moment dat hulp het meest nodig is',
    whyConclusion1Prefix: 'Daarom hebben wij',
    whyConclusion1Suffix: ' gebouwd – een platform voor het volgen van rankings dat naar resultaat kijkt, net als wij.',
    whyAiPara1: 'De afgelopen jaren is zoeken daarna nog een keer veranderd. Klanten vertrouwen niet meer alleen op de bekende Google-resultaten: ze vragen het ChatGPT, Gemini, Perplexity en andere AI-diensten, en krijgen een rechtstreekse aanbeveling.',
    whyAiPara2: 'Daarom volgt Go Top SEO niet alleen posities in Google, maar ook hoe uw bedrijf in AI-antwoorden verschijnt. Want daar komt het echt op aan: gezien worden, overal waar gezocht wordt.',
    featuresTitle: 'Wat Go Top SEO voor u volgt',
    feature1Title: 'Posities in de zoekresultaten',
    feature1Desc: 'De posities in de organische zoekresultaten van Google, in de tijd',
    feature2Title: 'Monitoring in Google Maps',
    feature2Desc: 'Een uitgebreid rapport over de resultaten in de lokale zoekresultaten',
    feature3Title: 'Zichtbaarheid in AI-antwoorden',
    feature3Desc: 'Controleert of de AI-diensten uw bedrijf noemen, of ze uw domein noemen en welke bronnen daarnaast verschijnen',
    feature4Title: 'Rapporten en analyses',
    feature4Desc: 'Rapporten die laten zien wat echt telt: organisch Google, Google Maps en de zichtbaarheid in AI-antwoorden',
    valuesTitle: 'Waarom Go Top SEO',
    value1Title: 'Direct contact, zonder omwegen',
    value1Desc: 'Niet elke maand een nieuwe contactpersoon. U werkt met mensen die uw bedrijf kennen.',
    value2Title: 'Volledige transparantie',
    value2Desc: 'U weet op elk moment wat er in uw account gebeurt, wat gewerkt heeft en wat niet, en hoe het beter wordt.',
    value3Title: 'Vakmanschap dat resultaat oplevert',
    value3Desc: 'Bij Go Top strooien wij niet met modewoorden. Wij leveren echte resultaten.',
    value4Title: 'Wij zijn zelf een bedrijf',
    value4Desc: 'Daarom kennen wij de druk, het budget en de wens om resultaat te zien.',
    finalCtaTitle: 'Wilt u beginnen?',
    finalCtaSubtitle: 'Gratis starten en zelf zien wat het platform doet',
    finalCtaStartFree: 'Gratis proefperiode starten',
    finalCtaContact: 'Met het team praten',
    lastUpdated: 'Deze pagina is in april 2026 voor het laatst bijgewerkt',
  },
  articles: {
    breadcrumb: 'Artikelen',
    title: 'Artikelen',
    subtitle: 'Artikelen en tips over organische zoekresultaten, digitale marketing en techniek',
    loading: 'Wordt geladen …',
    noImage: 'Zonder afbeelding',
    readMore: 'Artikel lezen >>',
    promoBadge: 'Go Top SEO',
    promoTitle1: 'Uw posities in',
    promoTitle2: 'Google in de tijd',
    promoDesc: 'Een professioneel platform voor het volgen van posities in organisch Google en in Google Maps. Uitgebreide rapporten, ontwikkelingen in de tijd en direct contact.',
    promoCtaStart: 'Gratis proefperiode starten',
    promoCtaPricing: 'Prijzen bekijken',
    stat1: 'Zoekwoorden',
    stat2: 'Bronnen voor monitoring',
    stat3: 'Gebouwd voor SEO',
    stat4: 'Gratis proefperiode',
    statValueKeywords: '1000+',
    statValueTracking: '2',
    statValueHebrew: '100 %',
    statValueTrial: '7 dagen',
    promoFeature1Title: 'Organisch Google',
    promoFeature1Desc: 'Posities op pagina 1 en 2 van Google, met nauwkeurige resultaten',
    promoFeature2Title: 'Google Maps',
    promoFeature2Desc: 'Monitoring op een nauwkeurige locatie: stad, postcode of coördinaten',
    promoFeature3Title: 'Professionele rapporten',
    promoFeature3Desc: 'Rapporten exporteren als pdf en Excel, met ontwikkelingen, vergelijkingen en uitgebreide analyses',
  },
  breadcrumbs: {
    home: 'Home',
    aria: 'Kruimelpad',
  },
  languageSwitcher: {
    // Each language names ITSELF, in its own script: a reader looking for their
    // language scans for the word they would recognize, not for its translation.
    he: 'עברית',
    en: 'English',
    es: 'Español',
    'pt-BR': 'Português (Brasil)',
    fr: 'Français',
    it: 'Italiano',
    ja: '日本語',
    de: 'Deutsch',
    nl: 'Nederlands',
    pl: 'Polski',
    aria: 'Taal van de website wijzigen',
  },
  cookie: {
    aria: 'Privacymelding',
    title: 'Uw privacy is belangrijk voor ons',
    body: 'Wij gebruiken de cookies die nodig zijn om de website te laten werken. Cookies voor meting en marketing worden pas na uw toestemming geladen. Meer daarover in onze',
    short: 'Optionele cookies worden alleen met uw toestemming geladen. Zie onze',
    privacy: 'privacyverklaring',
    accept: 'Alles accepteren',
    rejectAll: 'Alles weigeren',
    customize: 'Zelf instellen',
    save: 'Keuze opslaan',
    back: 'Terug',
    settings: 'Cookie-instellingen',
    settingsTitle: 'Cookies kiezen',
    settingsIntro: 'Elke categorie kunt u afzonderlijk accepteren of weigeren, en uw keuze op elk moment wijzigen.',
    always: 'Altijd actief',
    withdrawHint: 'Om uw toestemming op elk moment te wijzigen of in te trekken, vindt u onderaan elke pagina de link «Cookie-instellingen».',
    gpcTitle: 'Toestemming automatisch geweigerd',
    gpcBody: 'Uw browser stuurt het Global Privacy Control-signaal, daarom zijn er geen cookies voor meting of marketing geladen. Uw keuze is vastgelegd.',
    categories: {
      necessary: {
        title: 'Strikt noodzakelijk',
        desc: 'Het inloggen op uw account, de taal van de interface, de beveiliging en de bescherming tegen misbruik. Zonder deze cookies kan de dienst niet werken, daarom zijn ze niet afhankelijk van toestemming.',
      },
      analytics: {
        title: 'Meting',
        desc: 'Hoeveel mensen de website bezocht hebben, welke pagina’s ze gelezen hebben en wat niet gewerkt heeft. Wij gebruiken dat om de website te verbeteren, nooit voor advertenties.',
      },
      marketing: {
        title: 'Marketing',
        desc: 'De prestaties van onze advertenties meten, passende advertenties tonen in de netwerken van Google en Meta, en een aankoop toekennen aan de partner die uw bezoek via de marktplaats JVZoo naar ons heeft gebracht. Weigeren kost u niets in de dienst.',
      },
    },
  },
  contact: {
    region: 'Contactgedeelte',
    whatsappAria: 'Contact via WhatsApp',
    whatsappTitle: 'Via WhatsApp schrijven',
    whatsapp: 'WhatsApp',
    callAria: 'Bellen',
    call: 'Bellen',
    whatsappLabel: 'WhatsApp',
    whatsappMessage: 'Goedendag, ik heb hulp nodig',
    phoneLabel: 'Bellen',
    emailLabel: 'E-mail',
    emailAria: 'Een e-mail schrijven',
    // The floating "free demo" button (w11), on the public site and in the app.
    demo: 'Gratis demo',
    demoAria: 'Een gratis demo aanvragen via WhatsApp',
    demoMessage: 'Goedendag, ik wil graag een gratis demo van Go Top SEO',
  },
  a11y: {
    open: 'Toegankelijkheidsmenu openen',
    title: 'Toegankelijkheidsmenu',
    close: 'Toegankelijkheidsmenu sluiten',
    noAlt: '(zonder alt-tekst)',
    statement: 'Toegankelijkheidsverklaring',
    reset: 'Toegankelijkheid uitschakelen / herstellen',
    fontUp: 'Tekst groter',
    fontDown: 'Tekst kleiner',
    readableFont: 'Goed leesbaar lettertype',
    persistentDesc: 'Afbeeldingsbeschrijvingen weergeven',
    showDescriptions: 'Beschrijving bij aanwijzen',
    highlightLinks: 'Links markeren',
    highlightHeadings: 'Koppen markeren',
    invertColors: 'Kleuren omkeren',
    blackYellow: 'Zwart en geel',
    highContrast: 'Hoog contrast',
    sepia: 'Sepia',
    grayscale: 'Grijstinten',
    stopAnimations: 'Animaties stoppen',
    keyboardNav: 'Navigeren met het toetsenbord',
    blackCursor: 'Zwarte aanwijzer',
    bigCursor: 'Grote aanwijzer',
    zoomOut: 'Uitzoomen',
    zoomIn: 'Inzoomen',
  },
}

/** The dictionary must carry every key the Hebrew one defines; nothing less. */
const _nlHasEveryKey: PublicDictionary = nl as unknown as PublicDictionary
void _nlHasEveryKey

/**
 * The Dutch home page's words (app/(public)/nl/page.tsx renders them through
 * components/public/LandingPage.tsx).
 *
 * Dutch in the formal register: "u", "uw website", never "jij" and never "je".
 * Buttons take the infinitive ("Gratis starten"), which is what a Dutch product
 * page actually prints.
 *
 * The SEO vocabulary is the one Dutch searchers type, which Keyword Planner
 * settles rather than taste: **zoekwoorden**, not "keywords" — "zoekwoordplanner"
 * and "zoekwoorden analyse" are real Dutch queries with volume, so calquing the
 * English back in would be writing past the reader. "Backlinks", "rankings" and
 * "content" stay English because the Dutch industry has no other word for them.
 * Compounds close up: "zoekwoordenonderzoek", "websiteanalyse", "bedrijfsprofiel".
 *
 * The demo's example business is in Amsterdam rather than in Berlin or Milan:
 * the Dutch site opens in the Netherlands, and a demo full of German cities
 * reads as a translated page rather than a Dutch one. Its names and figures are
 * illustrative and the caption under the demo says so, the same promise the
 * other locales make.
 *
 * `href` values stay unprefixed: components/public/LandingPage.tsx renders them
 * as `${prefix}${row.href}`, so writing '/nl/features/...' here would ship
 * '/nl/nl/features/...'. That is the bug the Spanish launch hit.
 *
 * Every claim is one the product keeps: no invented customers, totals, logos or
 * press, no percentage or ranking promise. Prices come from the plan catalogue,
 * so the page cannot drift from it, and they are quoted in USD — the Netherlands
 * is billed through Creem in dollars, so naming euros here would be a price we
 * do not charge.
 */
import type { LandingCopy } from '@/components/public/LandingPage'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'

/**
 * The lowest monthly price. The Netherlands has no price of its own, so the
 * Dutch page shows the USD price every market outside Israel is billed in
 * today, grouped the Dutch way (1.200, with the dot as the thousands separator).
 */
const FROM_USD = Math.min(...Object.values(PLAN_CATALOG).map((p) => p.priceUSD)).toLocaleString('nl-NL')
const TRIAL_DAYS = TRIAL_CATALOG.days

export const landingNl: LandingCopy = {
  hero: {
    eyebrow: 'Automatisch zichtbaar in Google en in AI-antwoorden, in één systeem',
    title: 'Uw volgende klanten zijn al aan het zoeken.',
    accent: 'Wij zorgen dat ze u vinden.',
    subtitle:
      'Go Top SEO schrijft en publiceert artikelen die precies antwoorden op wat uw klanten zoeken, en laat u daarna zien waar uw bedrijf opduikt in Google, Google Maps, ChatGPT en Gemini. Zonder contentteam. Zonder gokken.',
    signup: `${TRIAL_DAYS} dagen gratis proberen`,
    trialNote: 'Zonder creditcard, zonder verplichting. Opzegbaar wanneer u wilt.',
    checkLead: 'Nog geen account? Gratis websiteanalyse, zonder registratie:',
    dashboard: 'Mijn dashboard',
    trust: ['Publiceert op WordPress en Shopify', 'Ondersteuning door echte mensen'],
    climbChip: 'Positie 3 in Google',
    published: 'Artikel gepubliceerd op uw website',
  },
  demo: {
    label: 'Een echte demo van het platform',
    caption: 'Productdemo. Bedrijfsnamen en cijfers zijn voorbeelden.',
    tabs: ['De stijging in Google', 'Een nieuw artikel', 'Aanbevolen door de AI'],
    describe: [
      'Het zoekwoordenoverzicht: één zoekterm van positie 18 naar positie 3 in Google, en drie andere die stijgen.',
      'Het artikeloverzicht: een nieuw artikel wordt geschreven, komt door de kwaliteitscontrole en wacht op de geplande publicatie op de website.',
      'Het overzicht van de zichtbaarheid in AI-antwoorden: een antwoord van ChatGPT dat het bedrijf aanbeveelt, en de engines die het noemen.',
    ],
    address: 'app.gotopseo.com',
    rail: ['Dashboard', 'Zoekwoorden', 'Contentstrategie', 'Artikelen', 'Zichtbaarheid in AI', 'Rapporten'],
    rank: {
      heading: 'Zoekwoorden',
      keyword: 'airco laten installeren amsterdam',
      positionLabel: 'Positie in Google',
      period: 'In de afgelopen 8 weken',
      from: 18,
      to: 3,
      columns: ['Zoekwoord', 'Positie', 'Verandering'],
      rows: [
        { keyword: 'warmtepomp airco prijs', from: 24, to: 7 },
        { keyword: 'airco reparatie amsterdam west', from: 31, to: 9 },
        { keyword: 'airco schoonmaken', from: 15, to: 5 },
      ],
      mapsLabel: 'Google Maps, Amsterdam',
      mapsValue: 'Positie 2',
      toast: '15 posities gestegen in Google',
    },
    article: {
      heading: 'Nieuw artikel',
      title: 'Wat kost het installeren van een warmtepompairco, en wat u vooraf moet vragen',
      subheading: 'Wat bepaalt de prijs?',
      checksTitle: 'Kwaliteitscontrole',
      checks: ['Vragen en antwoorden', 'Structured data', 'Interne links', 'Uitgelichte afbeelding', 'Koppen uit echte zoekopdrachten'],
      draft: 'Wordt geschreven',
      scheduled: 'Gepland',
      when: 'di. 9:00',
      toast: 'Publicatie op WordPress',
    },
    ai: {
      heading: 'Zichtbaarheid in AI-antwoorden',
      question: 'Wie installeert in Amsterdam goede airco’s?',
      intro: 'Dit zijn een paar bedrijven die op dit gebied goed worden aanbevolen:',
      items: [
        { name: 'Klima Amstel', desc: 'Gecertificeerde monteurs, garantie op het werk en dezelfde dag antwoord.', you: true },
        { name: 'ClimaPoint', desc: 'Eerlijke prijzen voor schoonmaak en onderhoud.' },
        { name: 'Comfort Amsterdam', desc: 'Specialisten in kanaalsystemen.' },
      ],
      youTag: 'Uw bedrijf',
      mentionedIn: 'Genoemd in:',
      engines: [
        { name: 'ChatGPT', on: true },
        { name: 'Gemini', on: true },
        { name: 'Perplexity', on: true },
        { name: 'Copilot', on: false },
        { name: 'Grok', on: true },
        { name: 'Google AI', on: false },
      ],
      toast: 'ChatGPT beveelt u aan',
    },
  },
  worksWith: {
    label: 'Wij controleren en publiceren voor u op:',
    names: ['Google', 'Google Maps', 'ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'WordPress', 'Shopify'],
  },
  outcomes: {
    eyebrow: 'Wat u krijgt',
    title: 'Wat Go Top SEO doet terwijl u uw bedrijf runt',
    body: 'Niet alweer een tool die u eerst moet leren. Eén systeem dat het werk doet en daarna laat zien wat het heeft opgeleverd.',
    items: [
      {
        title: 'Content die klanten oplevert, niet alleen bezoeken',
        desc: 'Het platform vindt waar uw klanten naar zoeken en wat zij vragen, schrijft daar volledige artikelen over en publiceert ze in een vast ritme op uw website. U kiest alleen de onderwerpen.',
        chips: ['Publiceert zelf', 'Met afbeeldingen', 'Vragenblokken', 'Interne links'],
      },
      {
        title: 'Een plek in de antwoorden van ChatGPT en Gemini',
        desc: 'Steeds meer mensen vragen het een AI in plaats van te zoeken. U ziet of die uw bedrijf aanbeveelt, wie hij in plaats daarvan aanbeveelt en wat daarvoor te verbeteren is.',
        chips: ['6 AI-engines', 'Vergeleken met uw concurrenten'],
      },
      {
        title: 'Een helder beeld van wat werkt',
        desc: 'De posities in Google en in Maps, de vermeldingen in AI-antwoorden en de gepubliceerde artikelen op één scherm. Zonder spreadsheets en zonder gokken.',
        chips: ['Rapporten in pdf en Excel', 'Volledige historie'],
      },
    ],
    stats: [
      { value: 6, label: 'gecontroleerde AI-engines', detail: 'ChatGPT, Gemini, Perplexity, Copilot, Grok en Google AI' },
      { value: 3, label: 'kanalen in één rapport', detail: 'Google, Google Maps en de AI-antwoorden' },
      { value: 2, label: 'publicatieplatformen', detail: 'WordPress en Shopify, zonder kopiëren en plakken' },
      { value: TRIAL_DAYS, label: 'dagen gratis proberen', detail: 'Zonder creditcard' },
    ],
  },
  shift: {
    eyebrow: 'Zoeken is veranderd',
    title: 'Klanten gaan niet meer alleen via Google. Ze vragen het een AI en krijgen drie aanbevelingen.',
    body: 'Als uw website de vragen van uw klanten niet beantwoordt — niet in Google en niet in een antwoord van ChatGPT — gaat die aanbeveling naar een concurrent. Bijna geen bedrijf weet waar het daarin staat, omdat geen enkele tool die twee samen liet zien.',
    withoutTitle: 'Zonder Go Top SEO',
    without: [
      'Eén artikel per twee maanden, als iemand er tijd voor vindt',
      'Geen helder beeld van waarover te schrijven en welke zoekterm de moeite waard is',
      'Posities met de hand gecontroleerd, of helemaal niet',
      'Geen idee of ChatGPT u of een concurrent aanbeveelt',
    ],
    withTitle: 'Met Go Top SEO',
    with: [
      'Een vast contentplan dat publiceert wanneer u het vastlegt',
      'Onderwerpen die uit echte zoekopdrachten van uw klanten komen',
      'Automatische monitoring van de posities in Google en in Google Maps',
      'Automatische controles van wat ChatGPT, Gemini en Google AI over uw bedrijf zeggen, en nog drie engines als u dat wilt',
    ],
  },
  flow: {
    eyebrow: 'Hoe het werkt',
    title: 'Van een websiteadres naar content die werkt — in vier stappen',
    body: 'U beslist wat er geschreven wordt. Het platform doet de rest.',
    steps: [
      { tag: 'Gratis, zonder registratie', title: 'Websiteanalyse', desc: 'U voert een adres in. In minder dan een minuut zien wij wat het bedrijf doet, wie zijn klanten zijn en wat de website tegenhoudt in Google en in AI-antwoorden.' },
      { tag: 'Met uw goedkeuring', title: 'Er komt een plan', desc: 'De zoektermen, de vragen van uw klanten en een lijst artikelen die klaar zijn om geschreven te worden. U kiest wat erin komt.' },
      { tag: 'Automatisch', title: 'Artikelen worden geschreven en gepubliceerd', desc: 'Elk artikel komt met zijn afbeeldingen en zijn vragenblok en verschijnt op de geplande datum op uw website. Op WordPress-sites met de Go Top-plug-in komen ook de structured data erbij.' },
      { tag: 'Transparant', title: 'De resultaten blijven navolgbaar', desc: 'De posities in Google en in Maps, de vermeldingen in AI-antwoorden en rapporten die u aan iedereen kunt doorgeven.' },
    ],
    cta: 'Beginnen met een gratis analyse',
  },
  features: {
    eyebrow: 'Wat erin zit',
    title: 'Alles wat nodig is om te stijgen, op één plek',
    body: 'Vier onderdelen die samenwerken, zodat elk artikel gemeten wordt en elke meting het volgende artikel bepaalt.',
    more: 'Meer weten',
    note: 'De namen en cijfers in de overzichten zijn voorbeelden.',
    content: {
      overline: 'Content en publicatie',
      title: 'Artikelen die geschreven worden om gevonden te worden — niet om een blog te vullen',
      body: 'Elk artikel staat op echt onderzoek: koppen uit de vragen die mensen werkelijk stellen, een vraag-en-antwoordblok, interne links naar de pagina’s die verkopen, en op WordPress-sites met de Go Top-plug-in structured data die Google en de AI-engines lezen. U leest mee, past aan waar nodig, en het platform publiceert.',
      points: ['Een uitgelichte afbeelding en afbeeldingen in de tekst', 'Een kwaliteitscontrole voor elke publicatie', 'Planning en directe publicatie op WordPress en Shopify'],
      href: '/features/seo-geo-content-publishing',
      visual: {
        heading: 'Deze week op uw website',
        days: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
        items: [
          { day: 0, title: 'Hoe u de airco voor een slaapkamer kiest', status: 'published', label: 'Gepubliceerd' },
          { day: 2, title: 'Wat kost het installeren van een warmtepompairco', status: 'scheduled', label: 'Gepland' },
          { day: 4, title: 'Airco schoonmaken: hoe vaak is nodig?', status: 'writing', label: 'Wordt geschreven' },
        ],
        destinationLabel: 'Publicatie op',
        destinations: ['WordPress', 'Shopify'],
      },
    },
    ai: {
      overline: 'Zichtbaarheid in AI-antwoorden',
      title: 'Weten wanneer ChatGPT uw bedrijf aanbeveelt — en wanneer een concurrent',
      body: 'Wij stellen de AI-engines de vragen die uw klanten stellen, en controleren wie in het antwoord opduikt. U ziet bij welke vragen uw bedrijf wint, waar de aanbeveling naar een concurrent gaat en wat daarvoor op de website te verbeteren is.',
      points: ['ChatGPT, Gemini, Perplexity, Copilot, Grok en Google AI', 'Direct naast uw concurrenten', 'Aanwijzingen voor wat te wijzigen om in het antwoord te komen'],
      href: '/features/ai-visibility-tracking',
      visual: {
        heading: 'Wie in het antwoord opduikt',
        engines: ['ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'Google AI'],
        rows: [
          { question: 'Wie installeert in Amsterdam airco’s?', hits: [true, true, true, false, true, false] },
          { question: 'Wat kost het schoonmaken van een airco?', hits: [true, false, true, false, false, true] },
        ],
        shareTitle: 'Aandeel van de vermeldingen',
        you: { label: 'Uw bedrijf', value: 58 },
        rival: { label: 'Belangrijkste concurrent', value: 42 },
      },
    },
    rank: {
      overline: 'Posities in Google',
      title: 'Elke stijging zien, in Google en in Google Maps',
      body: 'Monitoring van elke zoekterm die telt — in de klassieke zoekresultaten en in Maps per stad of gebied, met een historie die laat zien of de artikelen hun werk doen.',
      points: ['Google organisch per land, taal en apparaat', 'Google Maps per stad of gebied', 'Zoekwoordenonderzoek met zoekvolume en concurrentie'],
      href: '/features/google-organic-rank-tracking',
      visual: {
        heading: 'Uw zoekwoorden',
        columns: ['Zoekwoord', 'Positie', 'Verandering'],
        rows: [
          { keyword: 'airco laten installeren amsterdam', pos: 3, up: 15 },
          { keyword: 'warmtepomp airco prijs', pos: 7, up: 17 },
          { keyword: 'airco reparatie amsterdam west', pos: 9, up: 22 },
          { keyword: 'airco schoonmaken', pos: 5, up: 10 },
        ],
        maps: { label: 'Google Maps', area: 'Amsterdam', value: 'Positie 2 van 20' },
      },
    },
    reports: {
      overline: 'Rapporten',
      title: 'Een rapport voor de klant of de directie, met één klik',
      body: 'Export van posities, ontwikkelingen en zichtbaarheid in AI-antwoorden als pdf en als Excel. Bureaus beheren de websites van meerdere klanten uit één account, elke website in zijn eigen project.',
      points: ['Pdf en Excel met één klik', 'Meerdere websites in één account', 'Alle gegevens op één plek, zonder rapporten met de hand samen te stellen'],
      href: '/features/seo-geo-reports',
      visual: {
        heading: 'Prestatierapport',
        period: 'September',
        stats: [
          { label: 'Zoekwoorden op pagina 1', value: '14', up: true },
          { label: 'Vermeldingen in AI-antwoorden', value: '9', up: true },
          { label: 'Gepubliceerde artikelen', value: '8' },
          { label: 'Gemiddelde positie', value: '6,2', up: true },
        ],
        clientsLabel: 'Projecten:',
        clients: ['klima-amstel.nl', 'studio-dana.nl', '+3'],
      },
    },
  },
  audience: {
    eyebrow: 'Voor wie',
    title: 'Voor iedereen wiens website klanten moet opleveren',
    body: 'U hoeft geen SEO te kennen. U moet weten wat u verkoopt.',
    items: [
      {
        title: 'Ondernemers',
        desc: 'Meer aanvragen via Google, zonder zoekmachineoptimalisatie te leren en zonder een redactie aan te nemen. U keurt de onderwerpen goed, de rest loopt van zelf.',
        gain: 'Een website die werkt terwijl u bezig bent',
      },
      {
        title: 'Zelfstandigen en bureaus',
        desc: 'Meerdere klanten uit één account beheren, sneller content maken en elke klant een helder rapport overhandigen.',
        gain: 'Meer klanten in dezelfde uren',
      },
      {
        title: 'Marketingteams',
        desc: 'Een vast publicatieritme, en op één plek wat de content doet in Google en in AI-antwoorden.',
        gain: 'Een helder antwoord op „werkt dit?"',
      },
    ],
  },
  check: {
    eyebrow: 'Gratis websiteanalyse',
    title: 'Nog niet overtuigd? Wij laten u zien wat wij zien',
    body: 'De analyse leest uw website echt en levert in minder dan een minuut een eerste samenvatting:',
    items: [
      'Wat wij over het bedrijf begrepen hebben en wie zijn klanten zijn',
      'Welke concurrenten naast het bedrijf opduiken',
      'Wat de website tegenhoudt in Google, met het bewijs van de website zelf',
      'Hoe goed de website voorbereid is op AI-antwoorden',
      'De lijst artikelen die wij zouden schrijven',
    ],
    cta: 'Mijn website analyseren',
    note: 'Gratis, zonder registratie en zonder creditcard.',
    preview: {
      domain: 'klima-amstel.nl',
      heading: 'Uw eerste analysesamenvatting',
      scoreLabel: 'Klaar voor AI-antwoorden',
      score: '3/4',
      findings: ['De afbeeldingen missen de alt-tekst', 'Geen vraag-en-antwoordblok', 'De metabeschrijving heeft niet de juiste lengte'],
      lockedLabel: 'Meer bevindingen en concurrenten worden vrijgegeven met een gratis account',
    },
  },
  faq: {
    eyebrow: 'Vragen',
    title: 'Wat voor de start het meest gevraagd wordt',
    body: 'Uw antwoord niet gevonden? Schrijf ons via WhatsApp.',
    items: [
      {
        q: 'Ik weet niets over SEO. Is het platform dan toch iets voor mij?',
        a: 'Ja. Het platform kiest de zoektermen, stelt de onderwerpen voor en schrijft de artikelen. U beslist alleen wat bij het bedrijf past, en keurt het goed.',
      },
      {
        q: 'Wordt er iets op mijn website gepubliceerd zonder dat ik het gezien heb?',
        a: 'Alleen goedgekeurde onderwerpen gaan naar de schrijffase, en elk artikel komt voor publicatie door een kwaliteitscontrole. Elk artikel kunt u nalezen en wijzigen, en de publicatiedatum legt u zelf vast.',
      },
      {
        q: 'Waarom niet alles zelf met ChatGPT schrijven?',
        a: 'Dat kan, maar dan kiest u zelf de onderwerpen, controleert u de zoektermen, bouwt u de vragen en antwoorden en de structured data, verbindt u de pagina’s onderling, zet u alles op de website en controleert u alleen of het gewerkt heeft. Go Top SEO neemt de hele keten over en meet het resultaat in Google en in AI-antwoorden.',
      },
      {
        q: 'Met welke websites werkt dit?',
        a: 'De directe publicatie werkt met WordPress en Shopify. De positiemonitoring, de zichtbaarheid in AI-antwoorden en het zoekwoordenonderzoek werken met elke website.',
      },
      {
        q: `Wat gebeurt er na de ${TRIAL_DAYS} proefdagen?`,
        a: 'U kiest een pakket en gaat precies verder waar u gebleven was. Kiest u er geen, dan wordt er niets afgeschreven, want de kaart is nooit gevraagd.',
      },
      {
        q: 'Kan ik opzeggen?',
        a: 'Ja, wanneer u wilt, rechtstreeks in het dashboard, zonder boete en zonder opzegkosten.',
      },
    ],
  },
  cta: {
    title: 'Uw volgende klant zoekt vandaag. Zorg dat hij u vindt.',
    body: `Gratis websiteanalyse of ${TRIAL_DAYS} dagen proberen: het eerste artikel kan vandaag nog geschreven worden.`,
    check: 'Mijn website gratis analyseren',
    signup: 'Gratis proberen',
    dashboard: 'Mijn dashboard',
    pricing: `Pakketten vanaf ${FROM_USD} USD per maand.`,
    pricingLink: 'Alle pakketten en prijzen bekijken',
  },
}

/**
 * Reports (Google rankings and AI visibility), the first-run onboarding tour,
 * the billing and plans screen (PayPal, Shopify billing, cancel renewal), the
 * trial bar, the "start here" checklist on the dashboard and the long-running
 * action messages, in DUTCH.
 *
 * Register as set out in chrome.ts.
 *
 * PRICES. Nothing here states an amount: every plan line comes from
 * PLAN_CATALOG through planLimitLines/trialLimitLines, so a Dutch card can
 * never promise more than the server grants — and it can never show a currency
 * the account is not billed in. Abroad the plans are sold in US DOLLARS plus
 * tax, there has never been a euro price, and this file must not invent one.
 * A Dutch consumer price has to be the total payable, so a euro figure here
 * would be a legal problem and not only a wrong translation. Card payments are
 * sold by Creem as merchant of record: Creem issues the invoice and applies the
 * tax on the billing address, which is what the Creem disclosure below says.
 */
import { planLimitLines, trialLimitLines, CHECKS_EXPLAINER } from '@/lib/plans/features'
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'

export const billingNl: DeepPartial<DashboardDictionary> = {
  reports: {
    title: 'Rapporten',
    subtitle: 'Uw posities bij Google en de zichtbaarheid in AI-antwoorden, in rapporten die te downloaden en door te geven zijn',
    onDemandTitle: 'Rapporten op aanvraag',
    onDemandBody: 'Kies een soort rapport, en het laadt met de meest actuele gegevens. Download het als pdf of exporteer het naar Excel.',
    googleReport: 'Rapport van de Google-posities',
    reportType: 'Soort rapport',
    googleReportType: 'Google-posities (organisch en Maps)',
    aiReportType: 'Zichtbaarheid in AI-antwoorden',
    loadingReportData: 'De gegevens van het rapport worden geladen...',
    loading: 'Wordt geladen...',
    exportExcel: 'Naar Excel exporteren',
    downloadReport: 'Rapport downloaden',
    nothingToDownload: 'Op dit moment is er niets te downloaden: het rapport vult zich na de eerste meting.',
    generatedOn: 'Gemaakt op',
    excelExportWorkInProgress: 'De Excel-export van het rapport over de zichtbaarheid in AI-antwoorden is nog niet beschikbaar',
    loadAIReportFirst: 'Laad eerst het rapport over de zichtbaarheid in AI-antwoorden',
    loadGoogleReportFirst: 'Laad eerst het rapport van de Google-posities',
    downloadError: 'Fout bij het downloaden van het rapport',
    reportFilename: 'Rapport',
    rankingsLabel: 'Posities',
    google: {
      totalKeywords: 'Zoekwoorden in totaal',
      found: 'Gevonden',
      notFound: 'Niet gevonden',
      coverage: 'Bij Google gevonden',
      currentRankings: 'Huidige posities',
      keyword: 'Zoekwoord',
      engine: 'Engine',
      ranking: 'Positie',
      change: 'Verandering',
      noKeywordsInReport: 'Geen zoekwoord in het rapport',
      emptyTitle: 'Dit rapport vult zich zodra er zoekwoorden gevolgd worden',
      emptyBody: 'Neem een paar zoekwoorden in de monitoring op, en na hun eerste meting verschijnen hier hun posities en hun veranderingen.',
      emptyAction: 'Zoekwoorden kiezen',
    },
    ai: {
      aiScans: 'Controles in AI-engines',
      aiQueries: 'Vragen aan de AI',
      mentions: 'Vermeldingen',
      mentionRate: 'Vermeldingspercentage',
      domainCited: 'Domein als bron genoemd',
      citationRate: 'Bronpercentage',
      activeEngines: 'Actieve engines',
      overallVisibility: 'Zichtbaarheid in totaal',
      performanceByEngine: 'Resultaten per engine',
      scans: 'Controles',
      citations: 'Bronnen',
      aiQueryResults: 'Resultaten van de vragen aan de AI',
      query: 'Vraag',
      engine: 'Engine',
      mentioned: 'Genoemd',
      domainCited2: 'Domein als bron genoemd',
      citations2: 'Bronnen',
      date: 'Datum',
      yes: 'Ja',
      no: 'Nee',
      noResultsInReport: 'Geen resultaat in het rapport',
      emptyTitle: 'Dit rapport vult zich na de eerste controle in de AI-engines',
      emptyBody: 'Start een controle van de zichtbaarheid in AI-antwoorden, en hier verschijnen uw vermeldingen en de bronnen in elke engine.',
      emptyAction: 'Zichtbaarheid in AI-antwoorden controleren',
      showingResults: (showing: number, total: number) => `Er worden ${showing} van de ${total} resultaten weergegeven`,
      aiVisibilityReport: 'Rapport over de zichtbaarheid in AI-antwoorden',
    },
  },
  onboarding: {
    title: 'Welkom! Wij beginnen',
    subtitle: 'Wij lopen de eerste stappen samen door',
    steps: {
      createProject: {
        title: 'Een nieuwe website toevoegen',
        description: 'Elke website is een eigen project. Met de keuzelijst bovenaan het overzicht wisselt u tussen websites en maakt u een nieuwe aan.',
        action: 'Website aanmaken',
      },
      keywordResearch: {
        title: 'Zoekwoordenonderzoek',
        description: 'Hier vindt u zoekwoordideeën, ziet u hun zoekvolume en hun ontwikkeling, en voegt u ze rechtstreeks aan een website toe.',
        action: 'Naar het zoekwoordenonderzoek',
      },
      generateReports: {
        title: 'Rapporten',
        description: 'Hier maakt u heldere SEO- en GEO-rapporten voor uw klanten, met de zichtbaarheid in AI-antwoorden, de posities, de concurrenten en de aanbevelingen.',
        action: 'Naar de rapporten',
      },
    },
    buttons: {
      next: 'Verder',
      skip: 'Overslaan',
      done: 'Klaar',
      skipAll: 'Alles overslaan',
    },
  },
  billing: {
    title: 'Abonnementspakketten',
    subtitle: 'Kies het pakket dat u nodig hebt',
    trialActive: 'De gratis proefperiode loopt.',
    validUntilPrefix: 'Geldig tot',
    onPlanPrefix: 'Op dit moment actief is het pakket',
    renewalPrefix: 'Verlenging op',
    recommended: 'Aanbevolen',
    currentPlan: 'Huidig pakket',
    perMonth: 'per maand',
    trialName: 'Gratis proefperiode',
    planLabels: {
      trial: 'Proef',
      regular: 'Basic',
      advanced: 'Advanced',
      premium: 'Premium',
      large_agency: 'Agency',
    },
    // Derived from PLAN_CATALOG, exactly as the Hebrew and English cards are, so
    // a Dutch card cannot promise more than the server grants.
    features: {
      trial: trialLimitLines('nl'),
      regular: planLimitLines('regular', 'nl'),
      advanced: planLimitLines('advanced', 'nl'),
      premium: planLimitLines('premium', 'nl'),
      large_agency: planLimitLines('large_agency', 'nl'),
    },
    keywordCheckNote: `${CHECKS_EXPLAINER['nl']} Het artikeltegoed wordt door alle websites van het account samen gebruikt, en alle tegoeden worden elke maand vernieuwd. Wat niet gebruikt wordt, gaat niet mee naar de volgende maand.`,
    trialNoChargeNotice: 'Er is geen betaalmiddel toegevoegd, en er wordt niets automatisch afgeschreven.',
    marketPrompt: {
      currencyName: { ILS: 'Israëlische shekel (₪)', USD: 'Amerikaanse dollar ($)' },
      byLocation: (currency: string) => `De prijzen zijn vermeld in ${currency}, naar uw locatie. De valuta wordt met de eerste betaling vastgelegd.`,
      locked: (currency: string) => `Dit account wordt afgerekend in ${currency}.`,
    },
    manage: {
      title: 'Abonnement beheren',
      description: 'Na het opzeggen van de verlenging blijft het pakket actief tot het einde van de al betaalde factuurperiode.',
      cancelButton: 'Verlenging opzeggen',
      cancelling: 'Wordt opgezegd...',
      confirmCancelTitle: 'Verlenging opzeggen?',
      confirmCancel: 'De toegang blijft actief tot het einde van de al betaalde factuurperiode, daarna wordt er niets afgeschreven.',
      confirmCancelAction: 'Verlenging opzeggen',
      keepRenewal: 'Pakket houden',
      cancelSuccess: 'De verlenging van het abonnement is opgezegd. De toegang blijft actief tot het einde van de factuurperiode.',
      cancelError: 'De verlenging kon niet opgezegd worden. Probeer het over een moment opnieuw, of schrijf ons, dan zeggen wij haar op.',
      contactToCancel: 'Voor het opzeggen van de verlenging schrijft u ons, dan sluiten wij het pakket af. Wordt het abonnement door een ander bedrijf afgerekend, dan zeggen wij u waar het opzeggen gebeurt en geven wij uw verzoek daar door.',
      cancelAtMarketplace: (seller: string) => `Dit pakket is bij ${seller} gekocht, en de facturatie loopt daar. De verlenging zegt u op in uw ${seller}-account; de toegang blijft actief tot het einde van de betaalde periode. Bereikt u ${seller} niet, schrijf ons dan, dan sluiten wij het pakket aan onze kant af. De afschrijving kan alleen ${seller} stoppen.`,
      marketplacePolicyLink: (seller: string) => `Voorwaarden en beleid van ${seller}`,
      renewalAlreadyCancelled: 'De verlenging is opgezegd. De toegang blijft actief tot',
    },
    paypal: {
      loading: 'PayPal wordt geladen...',
      notConfigured: 'Betalen met PayPal is op dit moment niet beschikbaar. Probeer het later opnieuw, of schrijf ons, dan helpen wij.',
      sdkLoadFailed: 'PayPal kon niet geladen worden. Controleer uw internetverbinding en laad de pagina opnieuw.',
      planUnavailable: 'Dit pakket laat zich op dit moment niet met PayPal betalen. Schrijf ons, dan helpen wij.',
      createSubscriptionError: 'Het abonnement kon in PayPal niet gestart worden. Probeer het over een moment opnieuw.',
      activateSubscriptionError: 'PayPal heeft de betaling vrijgegeven, maar het pakket kon aan onze kant niet geactiveerd worden. Schrijf ons, dan brengen wij dat in orde.',
      activatedSuccess: 'Het pakket is actief. Deze pagina werkt zich over een moment bij.',
      buttonError: 'Met PayPal was er een probleem. Probeer het over een moment opnieuw, of schrijf ons, dan helpen wij.',
    },
    withdrawal: {
      label:
        'Ik verzoek Go Top SEO het werk onmiddellijk te beginnen, vóór het einde van de herroepingstermijn van veertien dagen die het consumentenrecht van de Europese Unie en het Verenigd Koninkrijk een consument geeft, en ik verklaar dat mij is meegedeeld dat ik dat recht verlies zodra de dienst volledig is nagekomen.',
      requiredNote: 'De betaalmogelijkheden verschijnen zodra u de regel hierboven bevestigt. Daarvoor wordt niets afgeschreven.',
      policyLabel: 'Het herroepingsrecht volledig, in het opzeggings- en terugbetalingsbeleid',
    },
    creem: {
      payButton: 'Met kaart betalen',
      starting: 'De beveiligde betaalpagina wordt geopend...',
      error: 'De betaalpagina kon niet geopend worden. Probeer het over een moment opnieuw, of schrijf ons, dan helpen wij.',
      changePlanNote: 'Voor het wisselen naar een ander pakket schrijft u ons, wij nemen dat over.',
      disclosure:
        'De kaartbetaling loopt via Creem (Armitage Labs OÜ) als merchant of record: Creem stelt de factuur op, voegt de belasting toe naar het factuuradres, en de afschrijving verschijnt op het rekeningoverzicht onder de naam Creem. De dienst zelf blijft de onze.',
      buyerTermsLabel: 'Koopvoorwaarden van Creem',
      cancelNote: 'Creem verkoopt u dit pakket en rekent het af: het opzeggen gebeurt daarom bij Creem, met de abonnementsgegevens die Creem u bij de betaling gestuurd heeft. Als u dat makkelijker vindt, schrijf ons dan, dan geven wij het opzeggen aan Creem door; de afschrijving zelf kan alleen Creem stoppen. In elk geval blijft de toegang actief tot het einde van de betaalde periode.',
    },
    shopify: {
      title: 'De facturatie loopt via Shopify',
      description: 'Dit account wordt via Shopify App Pricing afgerekend, niet via PayPal. Een webshop verbinden om te publiceren verandert daar niets aan.',
      manageButton: 'Pakket beheren in Shopify',
      migrationPending: 'Wij maken de verbinding van uw facturatie met Shopify nog af. Dat kan een moment duren: laad deze pagina binnenkort opnieuw.',
      migrationNeedsAttention: 'Het Shopify-pakket is actief, maar wij ronden de vorige facturatie nog af. Lost dat zich niet van zelf op, schrijf ons dan.',
      storeConnectedTitle: 'Uw webshop wordt door Shopify afgerekend',
      storeConnectedDescription: 'Aan dit account is een Shopify-webshop verbonden: u betaalt daarom via Shopify, niet via PayPal. Het pakket kiest en wijzigt u in de app Go Top SEO, in het beheer van uw Shopify-webshop.',
      appStoreLink: 'Go Top SEO in de Shopify App Store',
      paidUntil: (date: string) => `Het pakket is op de website betaald tot ${date} en blijft tot dan actief.`,
      paidCurrentPeriod: 'Het pakket is op de website betaald voor de lopende periode en blijft actief tot het einde van die periode.',
      renewalOff: 'Via PayPal wordt er niet verlengd.',
      renewalStopping: 'Wij zetten uw verlenging via PayPal uit.',
      afterPaidPeriod: 'Kies daarna in de app Go Top SEO in het Shopify-beheer een pakket om verder te publiceren.',
    },
    unavailable: {
      title: 'De facturatiestatus is op dit moment niet beschikbaar',
      description: 'Wij konden niet bevestigen welke aanbieder de facturatie van dit account voert: pakketwijzigingen zijn daarom even opgeschort. Er is niets veranderd. Laad deze pagina binnenkort opnieuw.',
    },
    admin: {
      title: 'Beheerdersaccount: volledige toegang',
      description: 'Dit account heeft volledige toegang tot het systeem en heeft geen facturatiepakket nodig.',
    },
  },
  trialBar: {
    daysLeft: (n: number): readonly [string, string] => [n === 1 ? 'Er blijft' : 'Er blijven', n === 1 ? 'dag gratis proefperiode' : 'dagen gratis proefperiode'],
    lastDay: 'Vandaag is de laatste dag van de gratis proefperiode',
    expired: 'De gratis proefperiode is afgelopen',
    upgrade: 'Nu van pakket wisselen',
    dismiss: '24 uur verbergen',
    label: 'Gratis proefperiode',
  },
  dashboardStart: {
    title: 'Hier begint het',
    subtitle: (domain: string) => `Een paar korte stappen, en dit dashboard vult zich met gegevens over ${domain}.`,
    progress: (done: number, total: number) => `${done} van ${total} klaar`,
    stepLabel: (n: number) => `Stap ${n}`,
    done: 'Klaar',
    running: 'Loopt',
    // The step the card's main button is for (owner's report, 10 October 2026).
    next: 'Volgende stap',
    // On every screen of a project whose site is not connected yet (components/layout/ConnectSiteBanner.tsx).
    connectBanner: {
      title: 'De website is nog niet verbonden',
      body: 'Dat is de eerste stap. Zolang de website niet verbonden is, kunt u onderzoeken en schrijven, maar de artikelen kunnen daar niet gepubliceerd worden. Verbinden gebeurt maar één keer.',
    },
    steps: {
      scan: {
        title: 'Analyseer uw website',
        body: 'Wij zoeken uit wat het bedrijf aanbiedt en voor wie, zoeken zoekwoorden en concurrenten, en controleren wat de website tegenhoudt bij Google en in AI-antwoorden. Dat duurt enkele minuten.',
        runningBody: 'De analyse loopt. U kunt verder werken; dit dashboard werkt zich bij zodra de analyse klaar is.',
        cta: 'Website analyseren',
        retry: 'Opnieuw proberen',
        doneLink: 'Samenvatting van de analyse bekijken',
      },
      keywords: {
        title: 'Kies zoekwoorden',
        body: 'De termen waar uw klanten bij Google op zoeken. Wij meten waar de website bij elk daarvan opduikt.',
        cta: 'Zoekwoordenonderzoek openen',
        doneLink: 'Uw zoekwoorden bekijken',
      },
      connect: {
        title: 'Verbind uw website',
        body: 'Verbind WordPress, Wix, Shopify of een andere website, zodat de artikelen daar met één klik gepubliceerd worden.',
        cta: 'Website verbinden',
        doneLink: 'Instellingen van de verbinding',
      },
      article: {
        title: 'Schrijf uw eerste artikel',
        body: 'Kies een onderwerp uit de voorstellen, en wij schrijven een volledig artikel, klaar om na te lezen en te publiceren.',
        cta: 'Onderwerp kiezen',
        doneLink: 'Uw artikelen bekijken',
      },
    },
  },
  longActions: {
    reportPdf: {
      pending: 'De pdf wordt gemaakt. Dat kan tot een minuut duren.',
      done: 'Het rapport is klaar en is gedownload.',
      failed: 'Het rapport kon niet gemaakt worden. Probeer het over een moment opnieuw.',
    },
  },
}

export {}

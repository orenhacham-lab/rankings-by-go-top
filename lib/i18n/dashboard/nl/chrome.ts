/**
 * The CHROME in DUTCH: the rail, the workspace switcher, the contact menu, the
 * shared words every screen reuses, the "waiting for you" rows and the home
 * screen.
 *
 * Split out of one 400 KB file on purpose — the Spanish dictionary is a single
 * module and it is the hardest file in the repository to edit. Each part here
 * names whole sections of the dictionary, and nl/index.ts is the only place
 * that assembles them, so nothing is merged twice and a key cannot appear in
 * two parts without the compiler saying so.
 *
 * REGISTER (the whole nl tree follows it): the formal "u" throughout, and "uw
 * website", "uw account". Never "jij", never "je" or "jouw". Dutch B2B copy
 * does use "je" freely, but it reads as a consumer brand, and the German and
 * Italian trees beside this one are formal — a reader switching languages
 * should not find the vendor suddenly familiar. Buttons and menu entries take
 * the INFINITIVE — "Opslaan", "Annuleren", "Website verbinden" — which is what
 * a Dutch interface prints.
 *
 * TYPOGRAPHY: common nouns stay in LOWER CASE. That is the single most
 * important line here, because it is the opposite of the German file beside
 * this one and it is the first thing a translation gets wrong: "de website",
 * "de prijs", "het aanbod". Compounds close up with no space —
 * "zoekwoordenonderzoek", "websiteanalyse", "bedrijfsprofiel" — and take a
 * hyphen only where one half is English or an abbreviation ("AI-antwoorden",
 * "SEO-rapport"). Figures use the Dutch separators (1.200 and 6,2), and
 * quotations take „…".
 *
 * GLOSSARY. "Website", never "project", because the English copy itself says a
 * project is one site and a Dutch business owner reads "website".
 * **"Zoekwoorden", not "keywords"** — this is the one place the Dutch glossary
 * departs from the German one, and it is a measured decision, not taste:
 * "zoekwoordplanner" (480/mo, the most valuable clicks in the whole Dutch list)
 * and "zoekwoorden analyse" (170/mo) are real Dutch queries, so writing
 * "keywords" would be writing past the reader. The loanwords that genuinely
 * have no Dutch equivalent in use stay English — "backlinks", "rankings",
 * "content", "dashboard", "plug-in", "snippet". "Interne links" for internal
 * links. The brand stays "Go Top SEO". Google's own product names stay in
 * Google's words: Google Search Console, Google Maps, Google Bedrijfsprofiel, SEO.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'

export const chromeNl: DeepPartial<DashboardDictionary> = {
  sidebar: {
    logoAlt: 'Het logo van Go Top SEO',
    groupMain: 'Algemeen',
    groupResearch: 'Onderzoek en content',
    groupMonitoring: 'Monitoring en rapporten',
    groupAccount: 'Account',
    dashboard: 'Dashboard',
    clients: 'Klanten',
    projects: 'Websites',
    keywords: 'Zoekwoorden',
    keywordResearch: 'Zoekwoordenonderzoek',
    siteLinks: 'Links',
    mapsPosts: 'Berichten in Google Maps',
    aiVisibility: 'Zichtbaarheid in AI',
    projectSettings: 'Website-instellingen',
    reports: 'Rapporten',
    siteHealth: 'Websitegezondheid',
    affiliate: 'Partnerprogramma',
    billing: 'Betalingen',
    system: 'Systeem',
    articleManagement: 'Artikelen van de website',
    blogPlan: 'Artikelwachtrij',
    connectionStatus: 'Status van de verbinding',
    errorLogs: 'Foutenlogboek',
    support: 'WhatsApp-support',
    supportAria: 'WhatsApp-support (opent in een nieuw venster)',
    accessibility: 'Toegankelijkheidsverklaring',
    accessibilityAria: 'Onze toegankelijkheidsverklaring (opent in een nieuw venster)',
    logout: 'Uitloggen',
    navLabel: 'Hoofdnavigatie',
    skipToContent: 'Naar de inhoud',
    openMenu: 'Menu openen',
    closeMenu: 'Menu sluiten',
    themeLabel: 'Weergave',
    languageLabel: 'Taal',
  },
  workspace: {
    label: 'Website:',
    unnamed: 'Zonder naam',
    loading: 'Uw websites worden geladen…',
    loadError: 'Uw websites konden niet geladen worden. Opnieuw proberen',
    searchPlaceholder: 'Website zoeken…',
    noMatches: 'Geen website met deze naam',
    create: 'Nieuwe website',
    createFirst: 'Maak uw eerste website aan',
    manage: 'Websites beheren',
    projectsLoadError: 'Uw websites laten zich op dit moment niet laden. Dat is tijdelijk.',
    retry: 'Opnieuw proberen',
    loadingProject: 'Website wordt geladen…',
    noProjectTitle: 'Nog geen website',
    noProjectBody: 'Elke website heeft haar eigen dashboard, haar eigen zoekwoorden en haar eigen instellingen. Zodra er een aangemaakt is, tonen alle overzichten haar gegevens.',
    noProjectCta: 'Website aanmaken',
    projectLoadError: 'Deze website kon niet geladen worden',
    projectMissing: 'Deze website is niet te vinden. Kies hierboven een andere.',
    createLimitReached: (used: number, limit: number) =>
      limit === 0 ? 'Het huidige pakket bevat geen website.' : `Alle websites van het pakket zijn al in gebruik (${used} van ${limit}).`,
    createLimitCount: (used: number, limit: number) => `${used}/${limit}`,
    upgrade: 'Pakket wijzigen',
    listLabel: 'Uw websites',
  },
  contact: {
    label: 'Contact',
    menuLabel: 'Contact',
    whatsapp: 'WhatsApp',
    whatsappMessage: (domain: string) => (domain ? `Goedendag, ik heb hulp nodig bij ${domain}` : 'Goedendag, ik heb hulp nodig'),
    phone: (number: string) => `${number} bellen`,
    email: (address: string) => `E-mail naar ${address}`,
    opensNewTab: '(opent in een nieuw tabblad)',
    // The floating "free demo" button (w11).
    demo: 'Gratis demo',
    demoAria: 'Vraag via WhatsApp een gratis demo aan',
    demoMessage: (domain: string) => (domain ? `Goedendag, ik wil graag een gratis demo van Go Top SEO voor ${domain}` : 'Goedendag, ik wil graag een gratis demo van Go Top SEO'),
  },
  common: {
    close: 'Sluiten',
    menu: 'Menu',
    logout: 'Uitloggen',
    loading: 'Wordt geladen...',
    save: 'Opslaan',
    cancel: 'Annuleren',
    edit: 'Bewerken',
    delete: 'Verwijderen',
    activate: 'Activeren',
    deactivate: 'Deactiveren',
    active: 'Actief',
    inactive: 'Niet actief',
    actions: 'Acties',
    status: 'Status',
    saveError: 'Het opslaan is niet gelukt',
    back: 'Terug',
    notFound: 'Niet gevonden',
    notAvailable: 'Niet beschikbaar.',
    lightMode: 'Lichte weergave',
    darkMode: 'Donkere weergave',
    switchToDarkMode: 'Naar de donkere weergave',
    switchToLightMode: 'Naar de lichte weergave',
    // Google's own product names, left as Google writes them.
    engineGoogleSearch: 'Google Organic',
    engineGoogleMaps: 'Google Maps',
    searchTypeGoogleDesktop: 'Google Organic · Computer',
    searchTypeGoogleMobile: 'Google Organic · Mobiel',
    deviceDesktop: 'Computer',
    deviceMobile: 'Mobiel',
    deviceDefault: 'Standaard',
  },
  uiKit: {
    noticeMore: 'nog {n}',
  },
  connectionStatus: {
    loadFailed: 'Deze verbinding laat zich op dit moment niet controleren. Dat betekent niet dat zij verbroken is.',
    retry: 'Opnieuw proberen',
  },
  waitingCard: {
    title: 'Wacht op uw goedkeuring',
    connection: 'De verbinding met de website is verbroken: artikelen en verbeteringen kunnen niet gepubliceerd worden',
    connectionAction: 'Opnieuw verbinden',
    site: 'Verbind uw website — dat is het enige wat voor het eerste artikel nog ontbreekt',
    siteAction: 'Website verbinden',
    gsc: 'Verbind Google Search Console om hier de echte Google-gegevens over uw website te zien: zoekopdrachten, klikken en posities',
    gscAction: 'Search Console verbinden',
    articles: (n: number) => (n === 1 ? '1 artikel is klaar en wacht op uw goedkeuring' : `${n} artikelen zijn klaar en wachten op uw goedkeuring`),
    articlesAction: 'Artikelen bekijken',
    topics: (n: number) => (n === 1 ? '1 nieuw onderwerp wacht op uw goedkeuring' : `${n} nieuwe onderwerpen wachten op uw goedkeuring`),
    topicsAction: 'Onderwerpen bekijken',
    queueDry: (date: string) => `Zonder goedkeuring is de wachtrij vanaf ${date} leeg`,
    fixes: (n: number) => (n === 1 ? 'Eén veilige verbetering is klaar voor de website' : `${n} veilige verbeteringen zijn klaar voor de website`),
    fixesAction: 'Verbeteringen bekijken',
  },
  topBarActions: {
    settings: 'Website-instellingen',
    notifications: 'Meldingen',
    notificationsCount: (n: number) => (n === 0 ? 'Meldingen: er wacht niets' : n === 1 ? 'Meldingen: 1 ding wacht' : `Meldingen: ${n} dingen wachten`),
    title: 'Wacht op uw goedkeuring',
    empty: 'Er wacht op dit moment niets',
    emptyBody: 'Hier verschijnen de artikelen en onderwerpen die op uw goedkeuring wachten, de veilige verbeteringen die al klaar zijn, en onderbrekingen van de verbinding met de website. Ook een website of Search Console die nog niet verbonden is, verschijnt hier zolang die verbinding ontbreekt.',
  },
  railWaiting: {
    aria: (n: number) => `${n} wachten`,
  },
  home: {
    title: 'Dashboard',
    subtitle: 'Sinds uw laatste bezoek',
    keywords: 'Zoekwoorden',
    keywordsSource: 'Op deze website actief gevolgd',
    scansPerformed: 'Uitgevoerde metingen',
    scansSource: 'Sinds de website aangemaakt is',
    latestScans: 'Laatste metingen',
    viewAll: 'Alles bekijken',
    noScans: 'Nog geen meting',
    notStarted: 'Nog niet begonnen',
    quickLinks: 'Snelkoppelingen',
    researchSub: 'Nieuwe zoekwoorden vinden die de moeite waard zijn',
    keywordsSub: 'Posities en veranderingen',
    excelAndPdf: 'Excel en pdf',
    settingsSub: 'Verbindingen en gegevens van het bedrijf',
    majorImprovements: 'Grootste stijgingen',
    noRecentImprovements: 'Geen recente stijging',
    majorDrops: 'Grootste dalingen',
    noRecentDrops: 'Geen recente daling',
    targets: 'Doelen',
    loading: 'Dashboard wordt geladen...',
    loadError: 'De gegevens van deze website konden niet geladen worden.',
  },
}

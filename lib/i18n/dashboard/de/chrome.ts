/**
 * The CHROME in GERMAN: the rail, the workspace switcher, the contact menu, the
 * shared words every screen reuses, the "waiting for you" rows and the home
 * screen.
 *
 * Split out of one 400 KB file on purpose — the Spanish dictionary is a single
 * module and it is the hardest file in the repository to edit. Each part here
 * names whole sections of the dictionary, and de/index.ts is the only place
 * that assembles them, so nothing is merged twice and a key cannot appear in
 * two parts without the compiler saying so.
 *
 * REGISTER (the whole de tree follows it): the formal "Sie" throughout, and
 * "Ihre Website", "Ihr Konto". Never "du", never "dein". Buttons and menu
 * entries take the INFINITIVE — "Speichern", "Abbrechen", "Website verbinden" —
 * which is what a German interface prints; a Sie-imperative ("Speichern Sie")
 * belongs in a sentence, not on a button.
 *
 * TYPOGRAPHY: nouns are capitalized, umlauts and ß are written out (never
 * ae/oe/ue/ss), figures use the German separators (1.200 and 6,2), and
 * quotations take „…".
 *
 * GLOSSARY. "Website", never "Projekt", because the English copy itself says a
 * project is one site and a German business owner reads "Website". The
 * established industry loanwords stay as the industry writes them — "Keyword",
 * "Keyword-Recherche", "Ranking" and "Position", "Backlink", "Dashboard",
 * "Report"/"Bericht", "Plugin", "Link" — because translating those into
 * "Schlüsselwort" reads as a machine translation to exactly the reader we are
 * trying to win. "Interne Verlinkung" for internal links. The brand stays
 * "Go Top SEO". Google's own product names stay in Google's words: Google
 * Search Console, Google Maps, Google Unternehmensprofil, SEO.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'

export const chromeDe: DeepPartial<DashboardDictionary> = {
  sidebar: {
    logoAlt: 'Logo von Go Top SEO',
    groupMain: 'Allgemein',
    groupResearch: 'Recherche und Inhalte',
    groupMonitoring: 'Überwachung und Berichte',
    groupAccount: 'Konto',
    dashboard: 'Dashboard',
    clients: 'Kunden',
    projects: 'Websites',
    keywords: 'Keywords',
    keywordResearch: 'Keyword-Recherche',
    siteLinks: 'Links',
    mapsPosts: 'Beiträge in Google Maps',
    aiVisibility: 'Sichtbarkeit in KI',
    projectSettings: 'Website-Einstellungen',
    reports: 'Berichte',
    siteHealth: 'Website-Gesundheit',
    affiliate: 'Partnerprogramm',
    billing: 'Zahlungen',
    system: 'System',
    articleManagement: 'Artikel der Website',
    blogPlan: 'Artikel-Warteschlange',
    connectionStatus: 'Status der Verbindung',
    errorLogs: 'Fehlerprotokoll',
    support: 'WhatsApp-Support',
    supportAria: 'WhatsApp-Support (öffnet in einem neuen Fenster)',
    accessibility: 'Erklärung zur Barrierefreiheit',
    accessibilityAria: 'Unsere Erklärung zur Barrierefreiheit (öffnet in einem neuen Fenster)',
    logout: 'Abmelden',
    navLabel: 'Hauptnavigation',
    skipToContent: 'Zum Inhalt springen',
    openMenu: 'Menü öffnen',
    closeMenu: 'Menü schließen',
    themeLabel: 'Design',
    languageLabel: 'Sprache',
  },
  workspace: {
    label: 'Website:',
    unnamed: 'Ohne Namen',
    loading: 'Ihre Websites werden geladen…',
    loadError: 'Ihre Websites konnten nicht geladen werden. Erneut versuchen',
    searchPlaceholder: 'Website suchen…',
    noMatches: 'Keine Website mit diesem Namen',
    create: 'Neue Website',
    createFirst: 'Legen Sie Ihre erste Website an',
    manage: 'Websites verwalten',
    projectsLoadError: 'Ihre Websites lassen sich gerade nicht laden. Das ist vorübergehend.',
    retry: 'Erneut versuchen',
    loadingProject: 'Website wird geladen…',
    noProjectTitle: 'Noch keine Website',
    noProjectBody: 'Jede Website hat ihr eigenes Dashboard, ihre eigenen Keywords und ihre eigenen Einstellungen. Sobald eine angelegt ist, zeigen alle Ansichten deren Daten.',
    noProjectCta: 'Website anlegen',
    projectLoadError: 'Diese Website konnte nicht geladen werden',
    projectMissing: 'Diese Website ist nicht zu finden. Wählen Sie oben eine andere aus.',
    createLimitReached: (used: number, limit: number) =>
      limit === 0 ? 'Der aktuelle Tarif enthält keine Website.' : `Alle Websites des Tarifs sind schon belegt (${used} von ${limit}).`,
    createLimitCount: (used: number, limit: number) => `${used}/${limit}`,
    upgrade: 'Tarif wechseln',
    listLabel: 'Ihre Websites',
  },
  contact: {
    label: 'Kontakt',
    menuLabel: 'Kontakt',
    whatsapp: 'WhatsApp',
    whatsappMessage: (domain: string) => (domain ? `Guten Tag, ich brauche Hilfe bei ${domain}` : 'Guten Tag, ich brauche Hilfe'),
    phone: (number: string) => `${number} anrufen`,
    email: (address: string) => `E-Mail an ${address}`,
    opensNewTab: '(öffnet in einem neuen Tab)',
    // The floating "free demo" button (w11).
    demo: 'Kostenlose Demo',
    demoAria: 'Fragen Sie über WhatsApp eine kostenlose Demo an',
    demoMessage: (domain: string) => (domain ? `Guten Tag, ich möchte eine kostenlose Demo von Go Top SEO für ${domain}` : 'Guten Tag, ich möchte eine kostenlose Demo von Go Top SEO'),
  },
  common: {
    close: 'Schließen',
    menu: 'Menü',
    logout: 'Abmelden',
    loading: 'Wird geladen...',
    save: 'Speichern',
    cancel: 'Abbrechen',
    edit: 'Bearbeiten',
    delete: 'Löschen',
    activate: 'Aktivieren',
    deactivate: 'Deaktivieren',
    active: 'Aktiv',
    inactive: 'Nicht aktiv',
    actions: 'Aktionen',
    status: 'Status',
    saveError: 'Das Speichern ist nicht gelungen',
    back: 'Zurück',
    notFound: 'Nicht gefunden',
    notAvailable: 'Nicht verfügbar.',
    lightMode: 'Helles Design',
    darkMode: 'Dunkles Design',
    switchToDarkMode: 'Zum dunklen Design wechseln',
    switchToLightMode: 'Zum hellen Design wechseln',
    // Google's own product names, left as Google writes them.
    engineGoogleSearch: 'Google Organic',
    engineGoogleMaps: 'Google Maps',
    searchTypeGoogleDesktop: 'Google Organic · Computer',
    searchTypeGoogleMobile: 'Google Organic · Mobil',
    deviceDesktop: 'Computer',
    deviceMobile: 'Mobil',
    deviceDefault: 'Standard',
  },
  uiKit: {
    noticeMore: '{n} weitere',
  },
  connectionStatus: {
    loadFailed: 'Diese Verbindung lässt sich gerade nicht prüfen. Das heißt nicht, dass sie unterbrochen ist.',
    retry: 'Erneut versuchen',
  },
  waitingCard: {
    title: 'Wartet auf Ihre Freigabe',
    connection: 'Die Verbindung zur Website ist unterbrochen: Artikel und Korrekturen können nicht veröffentlicht werden',
    connectionAction: 'Neu verbinden',
    site: 'Verbinden Sie Ihre Website — das ist das Einzige, was für den ersten Artikel noch fehlt',
    siteAction: 'Website verbinden',
    gsc: 'Verbinden Sie Google Search Console, um hier die echten Google-Daten zu Ihrer Website zu sehen: Suchanfragen, Klicks und Positionen',
    gscAction: 'Search Console verbinden',
    articles: (n: number) => (n === 1 ? '1 Artikel ist fertig und wartet auf Ihre Freigabe' : `${n} Artikel sind fertig und warten auf Ihre Freigabe`),
    articlesAction: 'Artikel ansehen',
    topics: (n: number) => (n === 1 ? '1 neues Thema wartet auf Ihre Freigabe' : `${n} neue Themen warten auf Ihre Freigabe`),
    topicsAction: 'Themen ansehen',
    queueDry: (date: string) => `Ohne Freigabe ist die Warteschlange ab dem ${date} leer`,
    fixes: (n: number) => (n === 1 ? 'Eine sichere Korrektur ist für die Website bereit' : `${n} sichere Korrekturen sind für die Website bereit`),
    fixesAction: 'Korrekturen ansehen',
  },
  topBarActions: {
    settings: 'Website-Einstellungen',
    notifications: 'Benachrichtigungen',
    notificationsCount: (n: number) => (n === 0 ? 'Benachrichtigungen: nichts wartet' : n === 1 ? 'Benachrichtigungen: 1 Sache wartet' : `Benachrichtigungen: ${n} Sachen warten`),
    title: 'Wartet auf Ihre Freigabe',
    empty: 'Gerade wartet nichts',
    emptyBody: 'Hier erscheinen die Artikel und Themen, die auf Ihre Freigabe warten, die sicheren Korrekturen, die schon bereit sind, und Unterbrechungen der Verbindung zur Website. Auch eine noch nicht verbundene Website oder Search Console erscheint hier, solange sie nicht verbunden ist.',
  },
  railWaiting: {
    aria: (n: number) => `${n} warten`,
  },
  home: {
    title: 'Dashboard',
    subtitle: 'Seit Ihrem letzten Besuch',
    keywords: 'Keywords',
    keywordsSource: 'Auf dieser Website aktiv überwacht',
    scansPerformed: 'Durchgeführte Messungen',
    scansSource: 'Seit die Website angelegt wurde',
    latestScans: 'Letzte Messungen',
    viewAll: 'Alles ansehen',
    noScans: 'Noch keine Messung',
    notStarted: 'Noch nicht begonnen',
    quickLinks: 'Verknüpfungen',
    researchSub: 'Neue Keywords finden, die sich lohnen',
    keywordsSub: 'Positionen und Veränderungen',
    excelAndPdf: 'Excel und PDF',
    settingsSub: 'Verbindungen und Angaben zum Unternehmen',
    majorImprovements: 'Größte Aufstiege',
    noRecentImprovements: 'Kein aktueller Aufstieg',
    majorDrops: 'Größte Abstiege',
    noRecentDrops: 'Kein aktueller Abstieg',
    targets: 'Ziele',
    loading: 'Dashboard wird geladen...',
    loadError: 'Die Daten dieser Website konnten nicht geladen werden.',
  },
}

/**
 * The CHROME in ITALIAN: the rail, the workspace switcher, the contact menu, the
 * shared words every screen reuses, the "waiting for you" rows and the home
 * screen.
 *
 * Split out of one 400 KB file on purpose — the Spanish dictionary is a single
 * module and it is the hardest file in the repository to edit. Each part here
 * names whole sections of the dictionary, and it/index.ts is the only place
 * that assembles them, so nothing is merged twice and a key cannot appear in
 * two parts without the compiler saying so.
 *
 * REGISTER (the whole it tree follows it): Italy, and the IMPERSONAL form by
 * default — «È possibile…», «Per iniziare…», «Si apre…». Where the reader has
 * to be addressed, it is the formal courtesy form, third person singular —
 * «Scelga», «Aggiunga», «il suo sito» — never a `tu` imperative and never
 * `tuo`/`tua`/`tuoi`/`tue`.
 *
 * "Sito", never "progetto", because the English copy itself says a project is
 * one site and an Italian business owner reads "sito". "Parola chiave" for
 * keyword, "posizione" and "rilevamento delle posizioni" for rank and rank
 * tracking, "collegamenti interni" for internal links, "backlink" kept as the
 * Italian industry keeps it, and the established loanwords — dashboard, report,
 * plugin, link — kept as they are. The brand stays "Go Top SEO". Google's own
 * product names stay in Google's words: Google Search Console, Google Maps,
 * Google Business Profile, SEO.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'

export const chromeIt: DeepPartial<DashboardDictionary> = {
  sidebar: {
    logoAlt: 'Logo Go Top SEO',
    groupMain: 'Principale',
    groupResearch: 'Ricerca e contenuti',
    groupMonitoring: 'Monitoraggio e report',
    groupAccount: 'Account',
    dashboard: 'Dashboard',
    clients: 'Clienti',
    projects: 'Siti',
    keywords: 'Parole chiave',
    keywordResearch: 'Ricerca di parole chiave',
    siteLinks: 'Link',
    mapsPosts: 'Pubblicazioni su Google Maps',
    aiVisibility: 'Visibilità nelle IA',
    projectSettings: 'Impostazioni del sito',
    reports: 'Report',
    siteHealth: 'Salute del sito',
    affiliate: 'Programma partner',
    billing: 'Pagamenti',
    system: 'Sistema',
    articleManagement: 'Articoli del sito',
    blogPlan: 'Coda degli articoli',
    connectionStatus: 'Stato della connessione',
    errorLogs: 'Registro degli errori',
    support: 'Assistenza WhatsApp',
    supportAria: 'Assistenza WhatsApp (si apre in una nuova finestra)',
    accessibility: 'Dichiarazione di accessibilità',
    accessibilityAria: 'La nostra dichiarazione di accessibilità (si apre in una nuova finestra)',
    logout: 'Uscire',
    navLabel: 'Navigazione principale',
    skipToContent: 'Andare al contenuto',
    openMenu: 'Aprire il menu',
    closeMenu: 'Chiudere il menu',
    themeLabel: 'Tema',
    languageLabel: 'Lingua',
  },
  workspace: {
    label: 'Sito:',
    unnamed: 'Senza nome',
    loading: 'Caricamento dei suoi siti…',
    loadError: 'Impossibile caricare i suoi siti. Riprovare',
    searchPlaceholder: 'Cercare un sito…',
    noMatches: 'Nessun sito con questo nome',
    create: 'Nuovo sito',
    createFirst: 'Crei il suo primo sito',
    manage: 'Gestire i siti',
    projectsLoadError: 'Per il momento non è possibile caricare i suoi siti. È una cosa temporanea.',
    retry: 'Riprovare',
    loadingProject: 'Caricamento del sito…',
    noProjectTitle: 'Ancora nessun sito',
    noProjectBody: 'Ogni sito ha la sua dashboard, le sue parole chiave e le sue impostazioni. Appena ne viene creato uno, tutte le schermate mostrano i suoi dati.',
    noProjectCta: 'Creare un sito',
    projectLoadError: 'Impossibile caricare questo sito',
    projectMissing: 'Questo sito non si trova. Ne scelga un altro nel selettore qui sopra.',
    createLimitReached: (used: number, limit: number) =>
      limit === 0 ? 'Il piano attuale non comprende nessun sito.' : `Tutti i siti del piano sono già in uso (${used} su ${limit}).`,
    createLimitCount: (used: number, limit: number) => `${used}/${limit}`,
    upgrade: 'Cambiare piano',
    listLabel: 'I suoi siti',
  },
  contact: {
    label: 'Contattarci',
    menuLabel: 'Contatti',
    whatsapp: 'WhatsApp',
    whatsappMessage: (domain: string) => (domain ? `Buongiorno, mi serve aiuto per ${domain}` : 'Buongiorno, mi serve aiuto'),
    phone: (number: string) => `Chiamare ${number}`,
    email: (address: string) => `Scrivere a ${address}`,
    opensNewTab: '(si apre in una nuova scheda)',
    // The floating "free demo" button (w11).
    demo: 'Demo gratuita',
    demoAria: 'Richieda una demo gratuita su WhatsApp',
    demoMessage: (domain: string) => (domain ? `Buongiorno, vorrei una demo gratuita di Go Top SEO per ${domain}` : 'Buongiorno, vorrei una demo gratuita di Go Top SEO'),
  },
  common: {
    close: 'Chiudere',
    menu: 'Menu',
    logout: 'Uscire',
    loading: 'Caricamento...',
    save: 'Salvare',
    cancel: 'Annullare',
    edit: 'Modificare',
    delete: 'Eliminare',
    activate: 'Attivare',
    deactivate: 'Disattivare',
    active: 'Attivo',
    inactive: 'Non attivo',
    actions: 'Azioni',
    status: 'Stato',
    saveError: 'Salvataggio non riuscito',
    back: 'Indietro',
    notFound: 'Non trovato',
    notAvailable: 'Non disponibile.',
    lightMode: 'Tema chiaro',
    darkMode: 'Tema scuro',
    switchToDarkMode: 'Passare al tema scuro',
    switchToLightMode: 'Passare al tema chiaro',
    // Google's own product names, left as Google writes them.
    engineGoogleSearch: 'Google Organic',
    engineGoogleMaps: 'Google Maps',
    searchTypeGoogleDesktop: 'Google Organic · Computer',
    searchTypeGoogleMobile: 'Google Organic · Mobile',
    deviceDesktop: 'Computer',
    deviceMobile: 'Mobile',
    deviceDefault: 'Predefinito',
  },
  uiKit: {
    noticeMore: 'altri {n}',
  },
  connectionStatus: {
    loadFailed: 'Per il momento non è possibile verificare questa connessione. Non significa che sia interrotta.',
    retry: 'Riprovare',
  },
  waitingCard: {
    title: 'In attesa di una sua conferma',
    connection: 'La connessione al sito è interrotta: gli articoli e le correzioni non possono essere pubblicati',
    connectionAction: 'Ricollegare',
    site: 'Colleghi il sito: è l’unica cosa che manca per pubblicare il primo articolo',
    siteAction: 'Collegare il sito',
    gsc: 'Colleghi Google Search Console per vedere qui i dati reali di Google sul sito: ricerche, clic e posizioni',
    gscAction: 'Collegare Search Console',
    articles: (n: number) => (n === 1 ? '1 articolo è pronto e attende la sua approvazione' : `${n} articoli sono pronti e attendono la sua approvazione`),
    articlesAction: 'Rivedere gli articoli',
    topics: (n: number) => (n === 1 ? '1 nuovo argomento attende la sua approvazione' : `${n} nuovi argomenti attendono la sua approvazione`),
    topicsAction: 'Rivedere gli argomenti',
    queueDry: (date: string) => `Senza approvazione la coda resterà vuota dal ${date}`,
    fixes: (n: number) => (n === 1 ? 'Una correzione sicura è pronta per il sito' : `${n} correzioni sicure sono pronte per il sito`),
    fixesAction: 'Vedere le correzioni',
  },
  topBarActions: {
    settings: 'Impostazioni del sito',
    notifications: 'Notifiche',
    notificationsCount: (n: number) => (n === 0 ? 'Notifiche: non c’è nulla in attesa' : n === 1 ? 'Notifiche: 1 cosa in attesa' : `Notifiche: ${n} cose in attesa`),
    title: 'In attesa di una sua conferma',
    empty: 'Per il momento non c’è nulla in attesa',
    emptyBody: 'Qui compaiono gli articoli e gli argomenti che attendono la sua approvazione, le correzioni sicure già pronte e le interruzioni della connessione al sito. Compaiono qui anche un sito o una Search Console non ancora collegati, finché non vengono collegati.',
  },
  railWaiting: {
    aria: (n: number) => `${n} in attesa`,
  },
  home: {
    title: 'Dashboard',
    subtitle: 'Dall’ultima visita',
    keywords: 'Parole chiave',
    keywordsSource: 'Monitorate attivamente su questo sito',
    scansPerformed: 'Rilevamenti effettuati',
    scansSource: 'Dalla creazione del sito',
    latestScans: 'Ultimi rilevamenti',
    viewAll: 'Vedere tutto',
    noScans: 'Ancora nessun rilevamento',
    notStarted: 'Non ancora iniziato',
    quickLinks: 'Scorciatoie',
    researchSub: 'Trovare nuove parole chiave da puntare',
    keywordsSub: 'Posizioni e variazioni',
    excelAndPdf: 'Excel e PDF',
    settingsSub: 'Connessioni e dati dell’attività',
    majorImprovements: 'Principali salite',
    noRecentImprovements: 'Nessuna salita recente',
    majorDrops: 'Principali discese',
    noRecentDrops: 'Nessuna discesa recente',
    targets: 'obiettivi',
    loading: 'Caricamento della dashboard...',
    loadError: 'Impossibile caricare i dati di questo sito.',
  },
}

/**
 * The CHROME in FRENCH: the rail, the workspace switcher, the contact menu, the
 * shared words every screen reuses, the "waiting for you" rows and the home
 * screen.
 *
 * Split out of one 400 KB file on purpose — the Spanish dictionary is a single
 * module and it is the hardest file in the repository to edit. Each part here
 * names whole sections of the dictionary, and fr/index.ts is the only place
 * that assembles them, so nothing is merged twice and a key cannot appear in
 * two parts without the compiler saying so.
 *
 * REGISTER (the whole fr tree follows it): France, VOUVOIEMENT everywhere —
 * `vous`, never `tu`. "Site", never "projet", because the English copy itself
 * says a project is one site and a French business owner reads "site".
 * "Mot-clé" for keyword, "position" and "suivi de position" for rank and rank
 * tracking, "maillage interne" for internal links, "backlink" kept as the
 * French industry keeps it. Google's own product names stay in Google's words:
 * Google Search Console, Google Maps, Google Business Profile, SEO.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'

export const chromeFr: DeepPartial<DashboardDictionary> = {
  sidebar: {
    logoAlt: 'Logo Go Top SEO',
    groupMain: 'Principal',
    groupResearch: 'Recherche et contenu',
    groupMonitoring: 'Suivi et rapports',
    groupAccount: 'Compte',
    dashboard: 'Tableau de bord',
    clients: 'Clients',
    projects: 'Sites',
    keywords: 'Mots-clés',
    keywordResearch: 'Recherche de mots-clés',
    siteLinks: 'Liens',
    mapsPosts: 'Publications sur Google Maps',
    aiVisibility: 'Visibilité dans les IA',
    projectSettings: 'Réglages du site',
    reports: 'Rapports',
    siteHealth: 'Santé du site',
    affiliate: 'Programme partenaires',
    billing: 'Paiements',
    system: 'Système',
    articleManagement: 'Articles du site',
    blogPlan: "File d'articles",
    connectionStatus: 'État de la connexion',
    errorLogs: 'Journal des erreurs',
    support: 'Assistance WhatsApp',
    supportAria: 'Assistance WhatsApp (ouvre une nouvelle fenêtre)',
    accessibility: 'Déclaration d’accessibilité',
    accessibilityAria: 'Notre déclaration d’accessibilité (ouvre une nouvelle fenêtre)',
    logout: 'Se déconnecter',
    navLabel: 'Navigation principale',
    skipToContent: 'Aller au contenu',
    openMenu: 'Ouvrir le menu',
    closeMenu: 'Fermer le menu',
    themeLabel: 'Thème',
    languageLabel: 'Langue',
  },
  workspace: {
    label: 'Site :',
    unnamed: 'Sans titre',
    loading: 'Chargement de vos sites…',
    loadError: 'Impossible de charger vos sites. Réessayez',
    searchPlaceholder: 'Rechercher un site…',
    noMatches: 'Aucun site de ce nom',
    create: 'Nouveau site',
    createFirst: 'Créez votre premier site',
    manage: 'Gérer les sites',
    projectsLoadError: 'Impossible de charger vos sites pour le moment. C’est temporaire.',
    retry: 'Réessayer',
    loadingProject: 'Chargement du site…',
    noProjectTitle: 'Aucun site pour l’instant',
    noProjectBody: 'Un site a son propre tableau de bord, ses mots-clés et ses réglages. Dès que vous en créez un, tous les écrans affichent ses données.',
    noProjectCta: 'Créer un site',
    projectLoadError: 'Impossible de charger ce site',
    projectMissing: 'Ce site est introuvable. Choisissez-en un autre dans le sélecteur ci-dessus.',
    createLimitReached: (used: number, limit: number) =>
      limit === 0 ? 'Votre offre actuelle n’inclut aucun site.' : `Tous les sites de votre offre sont utilisés (${used} sur ${limit}).`,
    createLimitCount: (used: number, limit: number) => `${used}/${limit}`,
    upgrade: 'Changer d’offre',
    listLabel: 'Vos sites',
  },
  contact: {
    label: 'Nous contacter',
    menuLabel: 'Contact',
    whatsapp: 'WhatsApp',
    whatsappMessage: (domain: string) => (domain ? `Bonjour, j’ai besoin d’aide pour ${domain}` : 'Bonjour, j’ai besoin d’aide'),
    phone: (number: string) => `Appeler ${number}`,
    email: (address: string) => `Écrire à ${address}`,
    opensNewTab: '(ouvre un nouvel onglet)',
    // The floating "free demo" button (w11).
    demo: 'Démo gratuite',
    demoAria: 'Demandez une démo gratuite sur WhatsApp',
    demoMessage: (domain: string) => (domain ? `Bonjour, je souhaite une démo gratuite de Go Top SEO pour ${domain}` : 'Bonjour, je souhaite une démo gratuite de Go Top SEO'),
  },
  common: {
    close: 'Fermer',
    menu: 'Menu',
    logout: 'Se déconnecter',
    loading: 'Chargement...',
    save: 'Enregistrer',
    cancel: 'Annuler',
    edit: 'Modifier',
    delete: 'Supprimer',
    activate: 'Activer',
    deactivate: 'Désactiver',
    active: 'Actif',
    inactive: 'Inactif',
    actions: 'Actions',
    status: 'État',
    saveError: 'Échec de l’enregistrement',
    back: 'Retour',
    notFound: 'Introuvable',
    notAvailable: 'Non disponible.',
    lightMode: 'Mode clair',
    darkMode: 'Mode sombre',
    switchToDarkMode: 'Passer en mode sombre',
    switchToLightMode: 'Passer en mode clair',
    // Google's own product names, left as Google writes them.
    engineGoogleSearch: 'Google Organic',
    engineGoogleMaps: 'Google Maps',
    searchTypeGoogleDesktop: 'Google Organic · Ordinateur',
    searchTypeGoogleMobile: 'Google Organic · Mobile',
    deviceDesktop: 'Ordinateur',
    deviceMobile: 'Mobile',
    deviceDefault: 'Par défaut',
  },
  uiKit: {
    noticeMore: '{n} de plus',
  },
  connectionStatus: {
    loadFailed: 'Impossible de vérifier cette connexion pour le moment. Cela ne veut pas dire qu’elle est coupée.',
    retry: 'Réessayer',
  },
  waitingCard: {
    title: 'En attente de votre part',
    connection: 'La connexion au site est coupée : les articles et les corrections ne peuvent pas être publiés',
    connectionAction: 'Reconnecter',
    site: 'Connectez votre site : c’est ce qu’il manque pour publier votre premier article',
    siteAction: 'Connecter le site',
    gsc: 'Connectez Google Search Console pour voir ici les chiffres réels de Google pour votre site : recherches, clics et positions',
    gscAction: 'Connecter Search Console',
    articles: (n: number) => (n === 1 ? '1 article est rédigé et attend votre validation' : `${n} articles sont rédigés et attendent votre validation`),
    articlesAction: 'Revoir les articles',
    topics: (n: number) => (n === 1 ? '1 nouveau sujet attend votre validation' : `${n} nouveaux sujets attendent votre validation`),
    topicsAction: 'Revoir les sujets',
    queueDry: (date: string) => `Sans validation, la file sera vide le ${date}`,
    fixes: (n: number) => (n === 1 ? 'Une correction sûre est prête pour votre site' : `${n} corrections sûres sont prêtes pour votre site`),
    fixesAction: 'Voir les corrections',
  },
  topBarActions: {
    settings: 'Réglages du site',
    notifications: 'Notifications',
    notificationsCount: (n: number) => (n === 0 ? 'Notifications : rien ne vous attend' : n === 1 ? 'Notifications : 1 chose vous attend' : `Notifications : ${n} choses vous attendent`),
    title: 'En attente de votre part',
    empty: 'Rien ne vous attend pour le moment',
    emptyBody: 'Les articles et les sujets qui attendent votre validation, les corrections sûres déjà prêtes et les coupures de connexion au site apparaissent ici. Un site ou un Search Console pas encore connecté apparaît ici aussi, jusqu’à ce que vous le connectiez.',
  },
  railWaiting: {
    aria: (n: number) => `${n} en attente`,
  },
  home: {
    title: 'Tableau de bord',
    subtitle: 'Depuis votre dernière visite',
    keywords: 'Mots-clés',
    keywordsSource: 'Suivis activement sur ce site',
    scansPerformed: 'Relevés effectués',
    scansSource: 'Depuis la création du site',
    latestScans: 'Derniers relevés',
    viewAll: 'Tout voir',
    noScans: 'Aucun relevé pour l’instant',
    notStarted: 'Pas encore commencé',
    quickLinks: 'Raccourcis',
    researchSub: 'Trouvez de nouveaux mots-clés à viser',
    keywordsSub: 'Positions et évolutions',
    excelAndPdf: 'Excel et PDF',
    settingsSub: 'Connexions et informations sur l’activité',
    majorImprovements: 'Principales hausses',
    noRecentImprovements: 'Aucune hausse récente',
    majorDrops: 'Principales baisses',
    noRecentDrops: 'Aucune baisse récente',
    targets: 'cibles',
    loading: 'Chargement du tableau de bord...',
    loadError: 'Impossible de charger les données de ce site.',
  },
}

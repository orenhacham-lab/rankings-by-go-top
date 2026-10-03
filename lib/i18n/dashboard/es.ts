/**
 * The dashboard in SPANISH — partial on purpose, and growing section by section.
 *
 * Everything this file does not name yet falls back to the ENGLISH dictionary
 * (lib/i18n/dashboard/merge.ts says why English and not Hebrew). So the type is
 * a DeepPartial and the compiler still checks every key and every value it does
 * name: a typo in a section name or a string where a function belongs is an
 * error here, not a blank screen later.
 *
 * REGISTER. Spain is the first Spanish market, and SaaS in Spain addresses its
 * reader as `tú`, not `usted`; the words themselves stay neutral enough for Latin
 * America, which is why this says "web" rather than Spain's colloquial "página"
 * and avoids both `vosotros` and `ustedes`. The same choice the public site made.
 *
 * TERMS WE DO NOT TRANSLATE, because the reader looks for them in Google's own
 * words: "Google Search Console", "Google Maps", "SEO". "Keyword" is "palabra
 * clave", which every Spanish SEO tool uses.
 *
 * This wave translates the CHROME — the rail, the workspace switcher, the shared
 * buttons and the "waiting for you" rows — because those are on every screen, so
 * they are what makes a Spanish dashboard look Spanish at all.
 */
import type { DashboardDictionary } from './he'
import type { DeepPartial } from './merge'

export const dashboardEs: DeepPartial<DashboardDictionary> = {
  sidebar: {
    logoAlt: 'Logotipo de Go Top SEO',
    groupMain: 'Principal',
    groupResearch: 'Investigación y contenido',
    groupMonitoring: 'Seguimiento e informes',
    groupAccount: 'Cuenta',
    dashboard: 'Panel',
    clients: 'Clientes',
    projects: 'Webs',
    keywords: 'Palabras clave',
    keywordResearch: 'Investigación de palabras clave',
    siteLinks: 'Enlaces',
    mapsPosts: 'Publicaciones en Google Maps',
    aiVisibility: 'Visibilidad en IA',
    projectSettings: 'Ajustes de la web',
    reports: 'Informes',
    siteHealth: 'Salud de la web',
    billing: 'Facturación',
    system: 'Sistema',
    articleManagement: 'Artículos de la web',
    connectionStatus: 'Estado de la conexión',
    errorLogs: 'Registro de errores',
    support: 'Soporte por WhatsApp',
    supportAria: 'Soporte por WhatsApp (se abre en una ventana nueva)',
    logout: 'Cerrar sesión',
    navLabel: 'Navegación principal',
    skipToContent: 'Ir al contenido',
    openMenu: 'Abrir el menú',
    closeMenu: 'Cerrar el menú',
    themeLabel: 'Tema',
    languageLabel: 'Idioma',
  },
  workspace: {
    label: 'Web:',
    unnamed: 'Sin nombre',
    loading: 'Cargando tus webs…',
    loadError: 'No hemos podido cargar tus webs. Vuelve a intentarlo',
    searchPlaceholder: 'Buscar webs…',
    noMatches: 'Ninguna web con ese nombre',
    create: 'Nueva web',
    createFirst: 'Crea tu primera web',
    manage: 'Gestionar webs',
    projectsLoadError: 'Ahora mismo no hemos podido cargar tus webs. Es algo temporal.',
    retry: 'Volver a intentarlo',
    loadingProject: 'Cargando la web…',
    noProjectTitle: 'Todavía no hay ninguna web',
    noProjectBody: 'Una web tiene su propio panel, sus palabras clave y sus ajustes. En cuanto crees una, todas las pantallas muestran sus datos.',
    noProjectCta: 'Crear una web',
    projectLoadError: 'No hemos podido cargar esta web',
    projectMissing: 'No hemos encontrado esta web. Elige otra en el selector de arriba.',
    createLimitReached: (used: number, limit: number) =>
      limit === 0 ? 'Tu plan actual no incluye webs.' : `Estás usando todas las webs de tu plan (${used} de ${limit}).`,
    createLimitCount: (used: number, limit: number) => `${used}/${limit}`,
    upgrade: 'Mejorar el plan',
    listLabel: 'Tus webs',
  },
  contact: {
    label: 'Contacta con nosotros',
    menuLabel: 'Contacto',
    whatsapp: 'WhatsApp',
    whatsappMessage: (domain: string) => (domain ? `Hola, necesito ayuda con ${domain}` : 'Hola, necesito ayuda'),
    phone: (number: string) => `Llamar al ${number}`,
    email: (address: string) => `Escribir a ${address}`,
    opensNewTab: '(se abre en una pestaña nueva)',
  },
  // Only the three rail entries and the line under each of those screens. The
  // rest of contentHub is the content workspace itself, which is its own wave;
  // these three are here because they are the last English words left in the
  // rail, and a rail that is nine-tenths Spanish reads as broken rather than
  // as unfinished.
  contentHub: {
    screens: {
      strategy: 'Estrategia de contenidos',
      articles: 'Artículos',
      existing: 'Contenido existente',
    },
    screenSubtitles: {
      articles: 'Todos los artículos de esta web, del borrador a la publicación',
      strategy: 'Qué se escribe, cuándo y por qué precisamente eso',
      existing: 'Todas las páginas que ya tiene tu web, cuáles traen tráfico desde Google y dónde conviene actuar',
    },
  },
  common: {
    close: 'Cerrar',
    menu: 'Menú',
    logout: 'Cerrar sesión',
    loading: 'Cargando...',
    save: 'Guardar',
    cancel: 'Cancelar',
    edit: 'Editar',
    delete: 'Eliminar',
    activate: 'Activar',
    deactivate: 'Desactivar',
    active: 'Activa',
    inactive: 'Inactiva',
    actions: 'Acciones',
    status: 'Estado',
    saveError: 'No se ha podido guardar',
    back: 'Atrás',
    notFound: 'No encontrado',
    notAvailable: 'No disponible.',
    lightMode: 'Modo claro',
    darkMode: 'Modo oscuro',
    switchToDarkMode: 'Cambiar al modo oscuro',
    switchToLightMode: 'Cambiar al modo claro',
    // Google's own product names, left as Google writes them.
    engineGoogleSearch: 'Google Organic',
    engineGoogleMaps: 'Google Maps',
    searchTypeGoogleDesktop: 'Google Organic · Ordenador',
    searchTypeGoogleMobile: 'Google Organic · Móvil',
    deviceDesktop: 'Ordenador',
    deviceMobile: 'Móvil',
    deviceDefault: 'Predeterminado',
  },
  uiKit: {
    noticeMore: '{n} más',
  },
  connectionStatus: {
    loadFailed: 'Ahora mismo no hemos podido comprobar esta conexión. No significa que se haya desconectado.',
    retry: 'Volver a intentarlo',
  },
  waitingCard: {
    title: 'Te está esperando',
    connection: 'La conexión con la web se ha cortado, así que los artículos y las correcciones no pueden publicarse',
    connectionAction: 'Volver a conectar',
    site: 'Conecta tu web: es necesaria para publicar tu primer artículo',
    siteAction: 'Conectar la web',
    gsc: 'Conecta Google Search Console para ver aquí las cifras reales de Google para tu web: búsquedas, clics y posiciones',
    gscAction: 'Conectar Search Console',
    articles: (n: number) => (n === 1 ? 'Hay 1 artículo escrito esperando tu aprobación' : `Hay ${n} artículos escritos esperando tu aprobación`),
    articlesAction: 'Revisar los artículos',
    topics: (n: number) => (n === 1 ? 'Hay 1 tema nuevo esperando aprobación' : `Hay ${n} temas nuevos esperando aprobación`),
    topicsAction: 'Revisar los temas',
    queueDry: (date: string) => `Sin aprobación, la cola se queda vacía el ${date}`,
    fixes: (n: number) => (n === 1 ? 'Hay una corrección segura lista para tu web' : `Hay ${n} correcciones seguras listas para tu web`),
    fixesAction: 'Ver las correcciones',
  },
  topBarActions: {
    settings: 'Ajustes de la web',
    notifications: 'Notificaciones',
    notificationsCount: (n: number) => (n === 0 ? 'Notificaciones: no hay nada esperándote' : n === 1 ? 'Notificaciones: hay 1 cosa esperándote' : `Notificaciones: hay ${n} cosas esperándote`),
    title: 'Te está esperando',
    empty: 'Ahora mismo no hay nada esperándote',
    emptyBody: 'Aquí aparecen los artículos y los temas que esperan tu aprobación, las correcciones seguras que ya están listas y los cortes en la conexión con la web. También aparece aquí una web o un Search Console sin conectar, hasta que los conectes.',
  },
  railWaiting: {
    aria: (n: number) => `${n} esperando`,
  },
}

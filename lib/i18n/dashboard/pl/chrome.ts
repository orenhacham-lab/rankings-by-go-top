/**
 * The CHROME in POLISH: the rail, the workspace switcher, the contact menu, the
 * shared words every screen reuses, the "waiting for you" rows and the home
 * screen.
 *
 * Split out of one 400 KB file on purpose — the Spanish dictionary is a single
 * module and it is the hardest file in the repository to edit. Each part here
 * names whole sections of the dictionary, and pl/index.ts is the only place
 * that assembles them, so nothing is merged twice and a key cannot appear in
 * two parts without the compiler saying so.
 *
 * REGISTER (the whole pl tree follows it): the courtesy third person with
 * "Państwo" — "Państwa strona", "Państwa konto", "mogą Państwo". Never "ty",
 * never "twój". Polish has no single polite pronoun to swap in the way Dutch
 * has "u" and German "Sie": the courtesy form is a third-person construction,
 * so a sentence is rebuilt around it rather than having one word replaced, and
 * the agreeing verb moves with it. A polite request in prose is "prosimy" plus
 * the infinitive ("prosimy sprawdzić").
 *
 * BUTTONS ARE THE EXCEPTION, and a deliberate one: a Polish interface prints
 * the bare second-person imperative on a control — "Zapisz", "Anuluj",
 * "Podłącz stronę" — and the courtesy form there ("Prosimy zapisać") reads
 * like a letter, not a button. So controls take the imperative and prose keeps
 * Państwo. That split is the opposite of the Dutch and German files beside
 * this one, where the register is one form everywhere, and it is the first
 * thing a translation gets wrong in either direction.
 *
 * TYPOGRAPHY: common nouns stay in LOWER CASE, as in the Dutch file and unlike
 * the German one: "strona internetowa", "cena", "oferta". Polish does NOT weld
 * compounds together the way German and Dutch do — the genitive carries it:
 * "analiza słów kluczowych", never one joined word, and "optymalizacja stron
 * internetowych". Figures use the Polish separators (1 200 and 6,2) with the
 * currency after the number, and quotations take „…”. The diacritics (ą, ć, ę,
 * ł, ń, ó, ś, ź, ż) are never transliterated away.
 *
 * GLOSSARY. "Strona", never "projekt", because the English copy itself says a
 * project is one site and a Polish business owner reads "strona". "Słowa
 * kluczowe", never "keywords" — "słowa kluczowe" and "analiza słów kluczowych"
 * are what Polish searchers type, and "pozycjonowanie" is the word for the
 * work itself. "Pozycje" for rankings, "linki zwrotne" for backlinks, "linki
 * wewnętrzne" for internal links, "treści" for content, "wtyczka" for a
 * plug-in. The loanwords Polish industry really uses stay as they are:
 * "dashboard" is written "panel", but "snippet", "content marketing" and
 * "SEO" stay English. The brand stays "Go Top SEO". Google's own product names
 * stay in Google's words: Google Search Console, Google Maps, Profil Firmy w
 * Google, SEO.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { plPick } from './plural'

export const chromePl: DeepPartial<DashboardDictionary> = {
  sidebar: {
    logoAlt: 'Logo Go Top SEO',
    groupMain: 'Ogólne',
    groupResearch: 'Analiza i treści',
    groupMonitoring: 'Monitorowanie i raporty',
    groupAccount: 'Konto',
    dashboard: 'Panel',
    clients: 'Klienci',
    projects: 'Strony',
    keywords: 'Słowa kluczowe',
    keywordResearch: 'Analiza słów kluczowych',
    siteLinks: 'Linki',
    mapsPosts: 'Wpisy w Google Maps',
    aiVisibility: 'Widoczność w AI',
    projectSettings: 'Ustawienia strony',
    reports: 'Raporty',
    siteHealth: 'Kondycja witryny',
    affiliate: 'Program partnerski',
    billing: 'Płatności',
    system: 'System',
    articleManagement: 'Artykuły na stronie',
    blogPlan: 'Kolejka artykułów',
    connectionStatus: 'Stan połączenia',
    errorLogs: 'Dziennik błędów',
    support: 'Wsparcie na WhatsAppie',
    supportAria: 'Wsparcie na WhatsAppie (otwiera się w nowym oknie)',
    accessibility: 'Deklaracja dostępności',
    accessibilityAria: 'Nasza deklaracja dostępności (otwiera się w nowym oknie)',
    logout: 'Wyloguj się',
    navLabel: 'Nawigacja główna',
    skipToContent: 'Przejdź do treści',
    openMenu: 'Otwórz menu',
    closeMenu: 'Zamknij menu',
    themeLabel: 'Wygląd',
    languageLabel: 'Język',
  },
  workspace: {
    label: 'Strona:',
    unnamed: 'Bez nazwy',
    loading: 'Ładowanie Państwa stron…',
    loadError: 'Nie udało się załadować Państwa stron. Spróbuj ponownie',
    searchPlaceholder: 'Szukaj strony…',
    noMatches: 'Brak strony o tej nazwie',
    create: 'Nowa strona',
    createFirst: 'Proszę utworzyć pierwszą stronę',
    manage: 'Zarządzaj stronami',
    projectsLoadError: 'Państwa strony w tej chwili się nie ładują. To jest tymczasowe.',
    retry: 'Spróbuj ponownie',
    loadingProject: 'Ładowanie strony…',
    noProjectTitle: 'Jeszcze bez strony',
    noProjectBody: 'Każda strona ma własny panel, własne słowa kluczowe i własne ustawienia. Gdy jedna zostanie utworzona, wszystkie widoki pokażą jej dane.',
    noProjectCta: 'Utwórz stronę',
    projectLoadError: 'Nie udało się załadować tej strony',
    projectMissing: 'Nie można znaleźć tej strony. Prosimy wybrać inną powyżej.',
    createLimitReached: (used: number, limit: number) =>
      limit === 0 ? 'Obecny pakiet nie zawiera żadnej strony.' : `Wszystkie strony z pakietu są już w użyciu (${used} z ${limit}).`,
    createLimitCount: (used: number, limit: number) => `${used}/${limit}`,
    upgrade: 'Zmień pakiet',
    listLabel: 'Państwa strony',
  },
  contact: {
    label: 'Kontakt',
    menuLabel: 'Kontakt',
    whatsapp: 'WhatsApp',
    whatsappMessage: (domain: string) => (domain ? `Dzień dobry, potrzebuję pomocy przy ${domain}` : 'Dzień dobry, potrzebuję pomocy'),
    phone: (number: string) => `Zadzwoń: ${number}`,
    email: (address: string) => `E-mail na ${address}`,
    opensNewTab: '(otwiera się w nowej karcie)',
    // The floating "free demo" button (w11).
    demo: 'Bezpłatne demo',
    demoAria: 'Poproś o bezpłatne demo na WhatsAppie',
    demoMessage: (domain: string) => (domain ? `Dzień dobry, chciałbym bezpłatne demo Go Top SEO dla ${domain}` : 'Dzień dobry, chciałbym bezpłatne demo Go Top SEO'),
  },
  common: {
    close: 'Zamknij',
    menu: 'Menu',
    logout: 'Wyloguj się',
    loading: 'Ładowanie...',
    save: 'Zapisz',
    cancel: 'Anuluj',
    edit: 'Edytuj',
    delete: 'Usuń',
    activate: 'Włącz',
    deactivate: 'Wyłącz',
    active: 'Aktywne',
    inactive: 'Nieaktywne',
    actions: 'Działania',
    status: 'Status',
    saveError: 'Zapisanie nie udało się',
    back: 'Wróć',
    notFound: 'Nie znaleziono',
    notAvailable: 'Niedostępne.',
    lightMode: 'Wygląd jasny',
    darkMode: 'Wygląd ciemny',
    switchToDarkMode: 'Przełącz na wygląd ciemny',
    switchToLightMode: 'Przełącz na wygląd jasny',
    // Google's own product names, left as Google writes them.
    engineGoogleSearch: 'Google Organic',
    engineGoogleMaps: 'Google Maps',
    searchTypeGoogleDesktop: 'Google Organic · Komputer',
    searchTypeGoogleMobile: 'Google Organic · Telefon',
    deviceDesktop: 'Komputer',
    deviceMobile: 'Telefon',
    deviceDefault: 'Domyślne',
  },
  uiKit: {
    noticeMore: 'jeszcze {n}',
  },
  connectionStatus: {
    loadFailed: 'Tego połączenia nie da się teraz sprawdzić. To nie znaczy, że zostało zerwane.',
    retry: 'Spróbuj ponownie',
  },
  waitingCard: {
    title: 'Czeka na Państwa zatwierdzenie',
    connection: 'Połączenie ze stroną zostało zerwane: artykułów i poprawek nie da się opublikować',
    connectionAction: 'Połącz ponownie',
    site: 'Proszę podłączyć stronę — to jedyne, czego brakuje do pierwszego artykułu',
    siteAction: 'Podłącz stronę',
    gsc: 'Proszę podłączyć Google Search Console, aby widzieć tu prawdziwe dane Google o Państwa stronie: zapytania, kliknięcia i pozycje',
    gscAction: 'Podłącz Search Console',
    articles: (n: number) =>
      n === 1
        ? '1 artykuł jest gotowy i czeka na Państwa zatwierdzenie'
        : `${n} ${plPick(n, 'artykuł', 'artykuły', 'artykułów')} ${plPick(n, 'jest gotowy', 'są gotowe', 'jest gotowych')} i ${plPick(n, 'czeka', 'czekają', 'czeka')} na Państwa zatwierdzenie`,
    articlesAction: 'Zobacz artykuły',
    topics: (n: number) =>
      n === 1
        ? '1 nowy temat czeka na Państwa zatwierdzenie'
        : `${n} ${plPick(n, 'nowy temat', 'nowe tematy', 'nowych tematów')} ${plPick(n, 'czeka', 'czekają', 'czeka')} na Państwa zatwierdzenie`,
    topicsAction: 'Zobacz tematy',
    queueDry: (date: string) => `Bez zatwierdzenia kolejka jest pusta od ${date}`,
    fixes: (n: number) =>
      n === 1
        ? 'Jedna bezpieczna poprawka jest gotowa dla strony'
        : `${n} ${plPick(n, 'bezpieczna poprawka', 'bezpieczne poprawki', 'bezpiecznych poprawek')} ${plPick(n, 'jest gotowa', 'są gotowe', 'jest gotowych')} dla strony`,
    fixesAction: 'Zobacz poprawki',
  },
  topBarActions: {
    settings: 'Ustawienia strony',
    notifications: 'Powiadomienia',
    // "rzecz" is feminine, so the 2-4 form is "rzeczy" and the genitive plural
    // is also "rzeczy"; only the verb moves ("czeka" / "czekają").
    notificationsCount: (n: number) =>
      n === 0
        ? 'Powiadomienia: nic nie czeka'
        : n === 1
          ? 'Powiadomienia: czeka 1 rzecz'
          : `Powiadomienia: ${plPick(n, 'czeka', 'czekają', 'czeka')} ${n} rzeczy`,
    title: 'Czeka na Państwa zatwierdzenie',
    empty: 'W tej chwili nic nie czeka',
    emptyBody: 'Tutaj pojawiają się artykuły i tematy czekające na Państwa zatwierdzenie, bezpieczne poprawki, które są już gotowe, oraz przerwy w połączeniu ze stroną. Strona albo Search Console, które nie zostały jeszcze podłączone, też pojawiają się tutaj, dopóki tego połączenia brakuje.',
  },
  railWaiting: {
    aria: (n: number) => `${n} ${plPick(n, 'czeka', 'czekają', 'czeka')}`,
  },
  home: {
    title: 'Panel',
    subtitle: 'Od Państwa ostatniej wizyty',
    keywords: 'Słowa kluczowe',
    keywordsSource: 'Aktywnie monitorowane na tej stronie',
    scansPerformed: 'Wykonane pomiary',
    scansSource: 'Od utworzenia strony',
    latestScans: 'Ostatnie pomiary',
    viewAll: 'Zobacz wszystko',
    noScans: 'Jeszcze bez pomiaru',
    notStarted: 'Jeszcze nie rozpoczęto',
    quickLinks: 'Skróty',
    researchSub: 'Znajdź nowe słowa kluczowe, które są tego warte',
    keywordsSub: 'Pozycje i zmiany',
    excelAndPdf: 'Excel i pdf',
    settingsSub: 'Połączenia i dane firmy',
    majorImprovements: 'Największe wzrosty',
    noRecentImprovements: 'Brak niedawnego wzrostu',
    majorDrops: 'Największe spadki',
    noRecentDrops: 'Brak niedawnego spadku',
    targets: 'Cele',
    loading: 'Ładowanie panelu...',
    loadError: 'Nie udało się załadować danych tej strony.',
  },
}

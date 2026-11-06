/**
 * The Polish public site's shared words: navigation, footer, the About page,
 * the articles index, the cookie notice, the contact menu and the accessibility
 * menu. Same shape as `he`, `en`, `es`, `pt-BR`, `fr`, `it`, `ja`, `de` and
 * `nl`, which is what the public-dictionary QA proves — a key present in Hebrew
 * and missing here is a failure, not a silent fall back to another language.
 *
 * Polish in the formal register, consistently. That register is NOT a pronoun
 * swap the way "u" is in Dutch or "Sie" in German: Polish addresses a reader
 * formally in the THIRD person, through the noun "Państwo" and verbs agreeing
 * with it ("Państwa pozycje", "mają Państwo"), and the polite imperative is
 * built with "prosimy" plus an infinitive rather than with a bare command. A
 * sentence translated word for word from the Dutch therefore comes out either
 * familiar or robotic, and every sentence here was rebuilt rather than mapped.
 *
 * Interface LABELS are the one place Polish does not use that register, and
 * using it there is the tell of a machine translation. A Polish button says
 * "Zaloguj się", "Zacznij bezpłatnie", "Zobacz cennik" — the plain second-person
 * imperative — while the PROSE around it stays with Państwo. Both appear below,
 * deliberately, and that mixture is correct Polish rather than an inconsistency.
 *
 * Established Polish SEO vocabulary, taken from what Polish searchers type
 * rather than calqued from the English or the German:
 * **pozycjonowanie** is the category — the native word, literally
 * "positioning", used interchangeably with SEO by the Polish trade itself, and
 * "pozycjonowanie stron" is the standard name of the service;
 * **słowa kluczowe** for keywords and "analiza słów kluczowych" for the
 * research; **pozycje** for rankings; **wyniki organiczne** for the organic
 * results; **linki zwrotne** for backlinks, a native term where Dutch had to
 * borrow the English one; **linkowanie wewnętrzne** for internal links;
 * **widoczność w odpowiedziach AI**; **Profil Firmy w Google**, which is
 * Google's own Polish name (the phrase Polish users actually search for is
 * "wizytówka Google", and that one belongs in article copy, not in a product
 * label that has to match what the reader sees inside Google).
 *
 * Polish does not close compounds the way Dutch and German do: it builds them
 * with a genitive or an adjective ("analiza słów kluczowych", "monitorowanie
 * pozycji"), so a Dutch-style single word would be unreadable. Quotation marks
 * in running Polish prose are „low-high”, not «guillemets» and not "straight".
 */
import type { PublicDictionary } from './he'

export const pl = {
  nav: {
    home: 'Strona główna',
    pricing: 'Cennik',
    features: 'Funkcje',
    articles: 'Artykuły',
    freeCheck: 'Bezpłatna analiza',
    about: 'O nas',
    contact: 'Kontakt',
    login: 'Zaloguj się',
    startFree: 'Zacznij bezpłatnie',
    toDashboard: 'Panel',
    menu: 'Menu',
    closeMenu: 'Zamknij menu',
    homeAria: 'Go Top SEO – strona główna',
    primaryAria: 'Nawigacja główna',
    featuresMenu: {
      contentPublishing: {
        label: 'Pisanie, planowanie i publikowanie treści',
        description: 'Pisanie, planowanie i publikowanie treści SEO i GEO wprost z platformy, obok pomiaru pozycji i widoczności.',
      },
      googleOrganic: {
        label: 'Monitorowanie pozycji w Google',
        description: 'Pozycje w organicznych wynikach Google. Każde słowo kluczowe według lokalizacji, języka i urządzenia, na pierwszej i drugiej stronie.',
      },
      googleMaps: {
        label: 'Monitorowanie pozycji w Mapach Google',
        description: 'Widać, jak widoczna jest Państwa firma w Mapach Google. Pozycje według miasta, dzielnicy i frazy, z dokładnym wskazaniem lokalizacji.',
      },
      aiVisibility: {
        label: 'Monitorowanie widoczności w odpowiedziach AI',
        description: 'Sprawdzenie, czy Państwa firma jest wymieniana w odpowiedziach ChatGPT, Gemini, Perplexity i Google AI.',
      },
      reports: {
        label: 'Raporty SEO i GEO',
        description: 'Raporty w formacie PDF i Excel dla Państwa klientów, z pozycjami, przebiegiem i danymi o widoczności.',
      },
      keywordResearch: {
        label: 'Analiza słów kluczowych',
        description: 'Propozycje słów kluczowych, liczba wyszukiwań i konkurencja — przed włączeniem słowa do monitorowania',
      },
      siteFixes: {
        label: 'Poprawki na witrynie',
        description: 'Analiza witryny i poprawa tytułów, opisów meta, tekstów alternatywnych obrazów oraz linków. W WordPressie jednym kliknięciem, po Państwa zatwierdzeniu.',
      },
      mapsPosts: {
        label: 'Posty w Profilu Firmy w Google',
        description: 'Posty ze zdjęciem i przyciskiem w Profilu Firmy w Google, od razu albo zaplanowane, oraz odpowiedzi na opinie. Z pierwszą wersją, którą można samemu poprawić.',
      },
      links: {
        label: 'Linki do Państwa witryny',
        description: 'Linkowanie wewnętrzne między Państwa stronami, strony, do których nie prowadzi żaden link, oraz bezpłatne wizytówki, w których Państwa firma powinna się znaleźć.',
      },
      competitors: {
        label: 'Państwo i konkurenci',
        description: 'Przy ilu słowach kluczowych każdy konkurent stoi w Google wyżej, i kogo usługi AI wymieniają w Państwa miejsce.',
      },
      searchConsole: {
        label: 'Dane z Search Console',
        description: 'Kliknięcia, wyświetlenia i średnia pozycja w Google, w porównaniu z poprzednim okresem.',
      },
    },
    featureGroups: {
      measure: 'Pomiar',
      act: 'Działanie',
      prove: 'Pokazanie wyników',
    },
    solutions: 'Dla kogo',
    solutionsMenu: {
      businesses: {
        label: 'Przedsiębiorcy',
        description: 'Jeden system, który pisze, publikuje i mierzy, bez zarządzania osobnymi usługodawcami.',
      },
      agencies: {
        label: 'Agencje',
        description: 'Wszystkie witryny Państwa klientów w jednym miejscu, z raportami PDF dla klienta.',
      },
      shopify: {
        label: 'Sklepy Shopify',
        description: 'Nasza aplikacja w Shopify App Store.',
      },
      wordpress: {
        label: 'Witryny WordPress',
        description: 'Publikowanie artykułów wprost na Państwa witrynie i poprawki jednym kliknięciem.',
      },
    },
  },
  footer: {
    tagline: 'Jedna platforma do treści SEO i GEO: pisanie, planowanie i publikowanie treści, z monitorowaniem widoczności w Google oraz w odpowiedziach ChatGPT, Gemini i pozostałych usług AI.',
    pages: 'Strony',
    home: 'Strona główna',
    pricing: 'Cennik',
    articles: 'Artykuły',
    about: 'O nas',
    affiliates: 'Program partnerski',
    sitemap: 'Mapa witryny',
    legal: 'Informacje prawne',
    privacy: 'Polityka prywatności',
    terms: 'Regulamin',
    refundPolicy: 'Odstąpienie od umowy i zwroty',
    affiliateTerms: 'Regulamin programu partnerskiego',
    accessibility: 'Dostępność',
    contact: 'Kontakt',
    copyright: '© 2026 Go Top SEO. Wszelkie prawa zastrzeżone.',
    agencyAria: 'Go Top – agencja marketingu cyfrowego',
    credit: 'Produkt firmy GO TOP',
  },
  about: {
    breadcrumb: 'O nas',
    heroTitle1: 'To jest',
    heroTitle2: 'Go Top SEO',
    heroSubtitle: 'Ponad 11 lat praktyki w marketingu cyfrowym. A dziś platforma do pozycji w Google i widoczności w odpowiedziach AI.',
    storyTitle: 'Historia Go Top',
    storyPara1: 'W świecie pełnym sztucznej inteligencji, pełnym automatyzacji i wielkich firm mówiących abstrakcjami, w Go Top wybraliśmy inaczej.',
    storyPara2: 'Coś ludzkiego, dokładnego i nastawionego na wynik, zbudowanego na ponad 11 latach konkretnej pracy w marketingu cyfrowym: organiczne wyniki wyszukiwania dla firm, witryny i reklama w internecie.',
    yearsLabel: 'Lat doświadczenia',
    yearsSublabel: 'w marketingu cyfrowym',
    philosophyTitle: 'Za czym stoimy',
    philosophyPara1: 'Nie patrzymy na liczbę klientów, tylko na jakość. Pracujemy z firmami, do których pasujemy, a wtedy dostają całą naszą uwagę, bezpośredni kontakt i dokładne wsparcie.',
    philosophyPara2: 'Kliknięcia i wyświetlenia nie robią w Go Top wrażenia. Wrażenie robi telefon, który zaczyna dzwonić. Bo o to w końcu chodzi.',
    qualityBadge: 'Jakość ponad liczby',
    whyTitle: 'Dlaczego zbudowaliśmy Go Top SEO',
    whyIntro: 'Podczas gdy wiele firm korzysta z ogólnych narzędzi do monitorowania, u nas wracał zawsze ten sam problem:',
    whyProblem1Title: 'Drogie i skomplikowane narzędzia',
    whyProblem1Desc: 'Nigdy nie budowane dla małych firm',
    whyProblem2Title: 'Raporty, których nikt nie rozumie',
    whyProblem2Desc: 'Liczby, z którymi nie da się nic zrobić',
    whyProblem3Title: 'Brak prawdziwego wsparcia',
    whyProblem3Desc: 'Właśnie wtedy, gdy pomoc jest najbardziej potrzebna',
    whyConclusion1Prefix: 'Dlatego zbudowaliśmy',
    whyConclusion1Suffix: ' – platformę do monitorowania pozycji, która patrzy na wynik, tak jak my.',
    whyAiPara1: 'W ostatnich latach wyszukiwanie zmieniło się jeszcze raz. Klienci nie polegają już tylko na znanych wynikach Google: pytają ChatGPT, Gemini, Perplexity i inne usługi AI, i dostają rekomendację wprost.',
    whyAiPara2: 'Dlatego Go Top SEO monitoruje nie tylko pozycje w Google, lecz także to, jak Państwa firma pojawia się w odpowiedziach AI. Bo o to naprawdę chodzi: być widocznym wszędzie tam, gdzie ludzie szukają.',
    featuresTitle: 'Co Go Top SEO monitoruje dla Państwa',
    feature1Title: 'Pozycje w wynikach wyszukiwania',
    feature1Desc: 'Pozycje w organicznych wynikach Google, w czasie',
    feature2Title: 'Monitorowanie w Mapach Google',
    feature2Desc: 'Rozbudowany raport o wynikach w lokalnych wynikach wyszukiwania',
    feature3Title: 'Widoczność w odpowiedziach AI',
    feature3Desc: 'Sprawdza, czy usługi AI wymieniają Państwa firmę, czy podają Państwa domenę i jakie źródła pojawiają się obok',
    feature4Title: 'Raporty i analizy',
    feature4Desc: 'Raporty pokazujące to, co naprawdę się liczy: organiczne Google, Mapy Google i widoczność w odpowiedziach AI',
    valuesTitle: 'Dlaczego Go Top SEO',
    value1Title: 'Bezpośredni kontakt, bez pośredników',
    value1Desc: 'Nie co miesiąc nowa osoba kontaktowa. Pracują Państwo z ludźmi, którzy znają Państwa firmę.',
    value2Title: 'Pełna przejrzystość',
    value2Desc: 'W każdej chwili wiedzą Państwo, co dzieje się na koncie, co zadziałało, co nie, i w jaki sposób będzie lepiej.',
    value3Title: 'Rzemiosło, które daje wynik',
    value3Desc: 'W Go Top nie sypiemy modnymi słowami. Dostarczamy prawdziwe wyniki.',
    value4Title: 'Sami jesteśmy firmą',
    value4Desc: 'Dlatego znamy presję, budżet i potrzebę zobaczenia wyniku.',
    finalCtaTitle: 'Chcą Państwo zacząć?',
    finalCtaSubtitle: 'Zacznij bezpłatnie i zobacz sam, co robi ta platforma',
    finalCtaStartFree: 'Rozpocznij bezpłatny okres próbny',
    finalCtaContact: 'Porozmawiaj z zespołem',
    lastUpdated: 'Ta strona została ostatnio zaktualizowana w kwietniu 2026 roku',
  },
  articles: {
    breadcrumb: 'Artykuły',
    title: 'Artykuły',
    subtitle: 'Artykuły i wskazówki o organicznych wynikach wyszukiwania, marketingu cyfrowym i technice',
    loading: 'Wczytujemy …',
    noImage: 'Bez obrazu',
    readMore: 'Czytaj artykuł >>',
    promoBadge: 'Go Top SEO',
    promoTitle1: 'Państwa pozycje w',
    promoTitle2: 'Google w czasie',
    promoDesc: 'Profesjonalna platforma do monitorowania pozycji w organicznym Google i w Mapach Google. Rozbudowane raporty, przebieg w czasie i bezpośredni kontakt.',
    promoCtaStart: 'Rozpocznij bezpłatny okres próbny',
    promoCtaPricing: 'Zobacz cennik',
    stat1: 'Słowa kluczowe',
    stat2: 'Źródła monitorowania',
    stat3: 'Zbudowane pod SEO',
    stat4: 'Bezpłatny okres próbny',
    statValueKeywords: '1000+',
    statValueTracking: '2',
    statValueHebrew: '100 %',
    statValueTrial: '7 dni',
    promoFeature1Title: 'Organiczne Google',
    promoFeature1Desc: 'Pozycje na pierwszej i drugiej stronie Google, z dokładnymi wynikami',
    promoFeature2Title: 'Mapy Google',
    promoFeature2Desc: 'Monitorowanie w dokładnej lokalizacji: miasto, kod pocztowy albo współrzędne',
    promoFeature3Title: 'Profesjonalne raporty',
    promoFeature3Desc: 'Eksport raportów do PDF i Excela, z przebiegiem, porównaniami i rozbudowanymi analizami',
  },
  breadcrumbs: {
    home: 'Strona główna',
    aria: 'Ścieżka nawigacji',
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
    aria: 'Zmień język witryny',
  },
  cookie: {
    aria: 'Informacja o prywatności',
    title: 'Państwa prywatność jest dla nas ważna',
    body: 'Używamy plików cookie niezbędnych do działania witryny. Pliki cookie do pomiaru i do marketingu wczytują się dopiero po Państwa zgodzie. Więcej na ten temat w naszej',
    short: 'Opcjonalne pliki cookie wczytują się wyłącznie za Państwa zgodą. Zobacz naszą',
    privacy: 'polityce prywatności',
    accept: 'Zaakceptuj wszystkie',
    rejectAll: 'Odrzuć wszystkie',
    customize: 'Ustaw samodzielnie',
    save: 'Zapisz wybór',
    back: 'Wróć',
    settings: 'Ustawienia plików cookie',
    settingsTitle: 'Wybór plików cookie',
    settingsIntro: 'Każdą kategorię można zaakceptować albo odrzucić osobno, a wybór zmienić w dowolnej chwili.',
    always: 'Zawsze aktywne',
    withdrawHint: 'Aby w dowolnej chwili zmienić albo wycofać zgodę, na dole każdej strony znajduje się link „Ustawienia plików cookie”. Warunki przechowywania i odczytu na swoim urządzeniu mogą Państwo określić także samodzielnie, w ustawieniach swojej przeglądarki; sama blokada w przeglądarce nie zastępuje jednak wycofania zgody u nas.',
    gpcTitle: 'Zgoda odrzucona automatycznie',
    gpcBody: 'Państwa przeglądarka wysyła sygnał Global Privacy Control, dlatego nie wczytaliśmy żadnych plików cookie do pomiaru ani do marketingu. Państwa wybór został zapisany.',
    categories: {
      necessary: {
        title: 'Ściśle niezbędne',
        desc: 'Logowanie na konto, język interfejsu, bezpieczeństwo i ochrona przed nadużyciami. Bez tych plików cookie usługa nie może działać, dlatego nie zależą od zgody.',
      },
      analytics: {
        title: 'Pomiar',
        desc: 'Ile osób odwiedziło witrynę, które strony przeczytały i co nie zadziałało. Wykorzystujemy to do ulepszania witryny, nigdy do reklamy.',
      },
      marketing: {
        title: 'Marketing',
        desc: 'Pomiar skuteczności naszych reklam, pokazywanie dopasowanych reklam w sieciach Google i Meta oraz przypisanie zakupu partnerowi, który przyprowadził Państwa wizytę przez platformę JVZoo. Odrzucenie nie kosztuje Państwa niczego w samej usłudze.',
      },
    },
  },
  contact: {
    region: 'Sekcja kontaktu',
    whatsappAria: 'Kontakt przez WhatsApp',
    whatsappTitle: 'Napisz przez WhatsApp',
    whatsapp: 'WhatsApp',
    callAria: 'Zadzwoń',
    call: 'Zadzwoń',
    whatsappLabel: 'WhatsApp',
    whatsappMessage: 'Dzień dobry, potrzebuję pomocy',
    phoneLabel: 'Zadzwoń',
    emailLabel: 'E-mail',
    emailAria: 'Napisz e-mail',
    // The floating "free demo" button (w11), on the public site and in the app.
    demo: 'Bezpłatne demo',
    demoAria: 'Poproś o bezpłatne demo przez WhatsApp',
    demoMessage: 'Dzień dobry, chciałbym bezpłatne demo Go Top SEO',
  },
  a11y: {
    open: 'Otwórz menu dostępności',
    title: 'Menu dostępności',
    close: 'Zamknij menu dostępności',
    noAlt: '(bez tekstu alternatywnego)',
    statement: 'Deklaracja dostępności',
    reset: 'Wyłącz / przywróć dostępność',
    fontUp: 'Większy tekst',
    fontDown: 'Mniejszy tekst',
    readableFont: 'Czcionka łatwa do czytania',
    persistentDesc: 'Pokaż opisy obrazów',
    showDescriptions: 'Opis po wskazaniu',
    highlightLinks: 'Wyróżnij linki',
    highlightHeadings: 'Wyróżnij nagłówki',
    invertColors: 'Odwróć kolory',
    blackYellow: 'Czarny i żółty',
    highContrast: 'Wysoki kontrast',
    sepia: 'Sepia',
    grayscale: 'Odcienie szarości',
    stopAnimations: 'Zatrzymaj animacje',
    keyboardNav: 'Nawigacja klawiaturą',
    blackCursor: 'Czarny wskaźnik',
    bigCursor: 'Duży wskaźnik',
    zoomOut: 'Pomniejsz',
    zoomIn: 'Powiększ',
  },
}

/** The dictionary must carry every key the Hebrew one defines; nothing less. */
const _plHasEveryKey: PublicDictionary = pl as unknown as PublicDictionary
void _plHasEveryKey

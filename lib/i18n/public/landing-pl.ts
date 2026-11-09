/**
 * The Polish home page's words (app/(public)/pl/page.tsx renders them through
 * components/public/LandingPage.tsx).
 *
 * Polish in the formal register, which in Polish is the third person with
 * "Państwo" and not a pronoun swap: "Państwa witryna", "mają Państwo", and the
 * polite request built with "prosimy" rather than a bare imperative. Buttons
 * are the exception and take the plain imperative — "Zacznij bezpłatnie",
 * "Zobacz cennik" — because that is what a Polish product page prints, and
 * putting Państwo on a button is the tell of a machine translation.
 *
 * The SEO vocabulary is the one Polish searchers type, not a calque of the
 * English or the German: **pozycjonowanie** for the category (the native word
 * the Polish trade uses interchangeably with SEO), **słowa kluczowe** for
 * keywords, **pozycje** for rankings, **wyniki organiczne**, **linki zwrotne**
 * for backlinks — a native term, where Dutch had to borrow the English one —
 * and **linkowanie wewnętrzne**. "Content" stays English only where the
 * industry has no Polish word in use; everywhere a Polish word exists it wins.
 * Polish does not close its compounds the way Dutch and German do: it builds
 * them with a genitive ("analiza słów kluczowych", "monitorowanie pozycji"), so
 * a single-word compound here would be unreadable.
 *
 * The demo's example business is in Warsaw rather than in Amsterdam or Berlin:
 * the Polish site opens in Poland, and a demo full of Dutch cities reads as a
 * translated page rather than a Polish one. Its names and figures are
 * illustrative and the caption under the demo says so, the same promise the
 * other locales make.
 *
 * `href` values stay unprefixed: components/public/LandingPage.tsx renders them
 * as `${prefix}${row.href}`, so writing '/pl/features/...' here would ship
 * '/pl/pl/features/...'. That is the bug the Spanish launch hit.
 *
 * Every claim is one the product keeps: no invented customers, totals, logos or
 * press, no percentage or ranking promise. Prices come from the plan catalogue,
 * so the page cannot drift from it, and they are quoted in USD — Poland is
 * billed through Creem in dollars, so naming złoty or euros here would be a
 * price we do not charge. The tax sentence that Polish price law makes
 * mandatory lives in the pricing page and in the terms, where the figure is
 * actually presented as the amount payable.
 */
import type { LandingCopy } from '@/components/public/LandingPage'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'

/**
 * The lowest monthly price. Poland has no price of its own, so the Polish page
 * shows the USD price every market outside Israel is billed in today, grouped
 * the Polish way (1 200, with a space as the thousands separator).
 */
const FROM_USD = Math.min(...Object.values(PLAN_CATALOG).map((p) => p.priceUSD)).toLocaleString('pl-PL')
const TRIAL_DAYS = TRIAL_CATALOG.days

export const landingPl: LandingCopy = {
  hero: {
    eyebrow: 'Automatyczna widoczność w Google i w odpowiedziach AI, w jednym systemie',
    title: 'Państwa przyszli klienci już szukają.',
    accent: 'My sprawiamy, że Państwa znajdą.',
    subtitle:
      'Go Top SEO pisze i publikuje artykuły, które odpowiadają dokładnie na to, czego szukają Państwa klienci, a potem pokazuje, gdzie Państwa firma pojawia się w Google, w Mapach Google, w ChatGPT i w Gemini. Bez zespołu redakcyjnego. Bez zgadywania.',
    signup: `Wypróbuj ${TRIAL_DAYS} dni bezpłatnie`,
    trialNote: 'Bez karty kredytowej, bez zobowiązań. Rezygnacja w dowolnym momencie.',
    checkLead: 'Nie mają Państwo jeszcze konta? Bezpłatna analiza witryny, bez rejestracji:',
    dashboard: 'Mój panel',
    trust: ['Publikuje na WordPressie, w Shopify i w Wixie', 'Wsparcie prawdziwych ludzi'],
    climbChip: 'Pozycja 3 w Google',
    published: 'Artykuł opublikowany na Państwa witrynie',
  },
  demo: {
    label: 'Prawdziwe demo platformy',
    caption: 'Demo produktu. Nazwy firm i liczby są przykładowe.',
    tabs: ['Wzrost w Google', 'Nowy artykuł', 'Polecane przez AI'],
    describe: [
      'Widok słów kluczowych: jedna fraza z pozycji 18 na pozycję 3 w Google i trzy inne, które rosną.',
      'Widok artykułów: nowy artykuł jest pisany, przechodzi kontrolę jakości i czeka na zaplanowaną publikację na witrynie.',
      'Widok widoczności w odpowiedziach AI: odpowiedź ChatGPT polecająca tę firmę oraz silniki, które ją wymieniają.',
    ],
    address: 'app.gotopseo.com',
    rail: ['Panel', 'Słowa kluczowe', 'Strategia treści', 'Artykuły', 'Widoczność w AI', 'Raporty'],
    rank: {
      heading: 'Słowa kluczowe',
      keyword: 'montaż klimatyzacji warszawa',
      positionLabel: 'Pozycja w Google',
      period: 'W ostatnich 8 tygodniach',
      from: 18,
      to: 3,
      columns: ['Słowo kluczowe', 'Pozycja', 'Zmiana'],
      rows: [
        { keyword: 'pompa ciepła klimatyzacja cena', from: 24, to: 7 },
        { keyword: 'naprawa klimatyzacji warszawa mokotów', from: 31, to: 9 },
        { keyword: 'czyszczenie klimatyzacji', from: 15, to: 5 },
      ],
      mapsLabel: 'Mapy Google, Warszawa',
      mapsValue: 'Pozycja 2',
      toast: 'Wzrost o 15 pozycji w Google',
    },
    article: {
      heading: 'Nowy artykuł',
      title: 'Ile kosztuje montaż klimatyzacji z pompą ciepła i o co zapytać przed podpisaniem umowy',
      subheading: 'Co decyduje o cenie?',
      checksTitle: 'Kontrola jakości',
      checks: ['Pytania i odpowiedzi', 'Dane strukturalne', 'Linkowanie wewnętrzne', 'Obraz wyróżniający', 'Nagłówki z prawdziwych zapytań'],
      draft: 'W pisaniu',
      scheduled: 'Zaplanowany',
      when: 'wt. 9:00',
      toast: 'Publikacja na WordPressie',
    },
    ai: {
      heading: 'Widoczność w odpowiedziach AI',
      question: 'Kto montuje w Warszawie dobre klimatyzacje?',
      intro: 'Oto kilka firm, które są w tej dziedzinie dobrze oceniane:',
      items: [
        { name: 'Klima Wisła', desc: 'Certyfikowani monterzy, gwarancja na pracę i odpowiedź tego samego dnia.', you: true },
        { name: 'ClimaPoint', desc: 'Uczciwe ceny czyszczenia i przeglądów.' },
        { name: 'Comfort Warszawa', desc: 'Specjaliści od systemów kanałowych.' },
      ],
      youTag: 'Państwa firma',
      mentionedIn: 'Wymieniona w:',
      engines: [
        { name: 'ChatGPT', on: true },
        { name: 'Gemini', on: true },
        { name: 'Perplexity', on: true },
        { name: 'Copilot', on: false },
        { name: 'Grok', on: true },
        { name: 'Google AI', on: false },
      ],
      toast: 'ChatGPT poleca Państwa firmę',
    },
  },
  worksWith: {
    label: 'Sprawdzamy i publikujemy dla Państwa w:',
    names: ['Google', 'Mapy Google', 'ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'WordPress', 'Shopify', 'Wix'],
  },
  outcomes: {
    eyebrow: 'Co Państwo otrzymują',
    title: 'Co Go Top SEO robi, kiedy Państwo prowadzą firmę',
    body: 'Nie kolejne narzędzie, którego trzeba się najpierw nauczyć. Jeden system, który wykonuje pracę, a potem pokazuje, co z niej wyszło.',
    items: [
      {
        title: 'Treści, które przynoszą klientów, a nie tylko wejścia',
        desc: 'Platforma znajduje to, czego szukają Państwa klienci i o co pytają, pisze o tym pełne artykuły i publikuje je na Państwa witrynie w stałym rytmie. Państwo wybierają tylko tematy.',
        chips: ['Publikuje samodzielnie', 'Z obrazami', 'Bloki pytań', 'Linkowanie wewnętrzne'],
      },
      {
        title: 'Miejsce w odpowiedziach ChatGPT i Gemini',
        desc: 'Coraz więcej osób pyta AI, zamiast szukać. Widzą Państwo, czy poleca Państwa firmę, kogo poleca zamiast niej i co trzeba poprawić, żeby to zmienić.',
        chips: ['6 silników AI', 'W porównaniu z konkurentami'],
      },
      {
        title: 'Wyraźny obraz tego, co działa',
        desc: 'Pozycje w Google i w Mapach, wzmianki w odpowiedziach AI oraz opublikowane artykuły na jednym ekranie. Bez arkuszy i bez zgadywania.',
        chips: ['Raporty w PDF i Excelu', 'Pełna historia'],
      },
    ],
    stats: [
      { value: 6, label: 'sprawdzanych silników AI', detail: 'ChatGPT, Gemini, Perplexity, Copilot, Grok i Google AI' },
      { value: 3, label: 'kanały w jednym raporcie', detail: 'Google, Mapy Google i odpowiedzi AI' },
      { value: 3, label: 'platformy publikacji', detail: 'WordPress, Shopify i Wix, bez kopiowania i wklejania' },
      { value: TRIAL_DAYS, label: 'dni bezpłatnie', detail: 'Bez karty kredytowej' },
    ],
  },
  shift: {
    eyebrow: 'Wyszukiwanie się zmieniło',
    title: 'Klienci nie idą już tylko przez Google. Pytają AI i dostają trzy rekomendacje.',
    body: 'Jeśli Państwa witryna nie odpowiada na pytania klientów — ani w Google, ani w odpowiedzi ChatGPT — ta rekomendacja trafia do konkurenta. Prawie żadna firma nie wie, gdzie w tym stoi, bo żadne narzędzie nie pokazywało tych dwóch rzeczy razem.',
    withoutTitle: 'Bez Go Top SEO',
    without: [
      'Jeden artykuł na dwa miesiące, jeśli ktoś znajdzie na to czas',
      'Brak wyraźnego obrazu, o czym pisać i która fraza jest warta uwagi',
      'Pozycje sprawdzane ręcznie albo wcale',
      'Żadnego pojęcia, czy ChatGPT poleca Państwa, czy konkurenta',
    ],
    withTitle: 'Z Go Top SEO',
    with: [
      'Stały plan treści, który publikuje wtedy, kiedy Państwo ustalą',
      'Tematy wynikające z prawdziwych zapytań Państwa klientów',
      'Automatyczne monitorowanie pozycji w Google i w Mapach Google',
      'Automatyczne sprawdzanie, co ChatGPT, Gemini i Google AI mówią o Państwa firmie, a na życzenie jeszcze trzy silniki',
    ],
  },
  flow: {
    eyebrow: 'Jak to działa',
    title: 'Od adresu witryny do treści, która działa — w czterech krokach',
    body: 'Państwo decydują, co zostanie napisane. Platforma robi resztę.',
    steps: [
      { tag: 'Bezpłatnie, bez rejestracji', title: 'Analiza witryny', desc: 'Państwo podają adres. W mniej niż minutę widzimy, czym zajmuje się firma, kim są jej klienci i co powstrzymuje witrynę w Google oraz w odpowiedziach AI.' },
      { tag: 'Za Państwa zatwierdzeniem', title: 'Powstaje plan', desc: 'Frazy, pytania Państwa klientów i lista artykułów gotowych do napisania. Państwo wybierają, co do niej wejdzie.' },
      { tag: 'Automatycznie', title: 'Artykuły są pisane i publikowane', desc: 'Każdy artykuł przychodzi z obrazami i blokiem pytań, i pojawia się na Państwa witrynie w zaplanowanym terminie. Na witrynach WordPress z wtyczką Go Top dochodzą jeszcze dane strukturalne.' },
      { tag: 'Przejrzyście', title: 'Wyniki pozostają do sprawdzenia', desc: 'Pozycje w Google i w Mapach, wzmianki w odpowiedziach AI oraz raporty, które można przekazać komu trzeba.' },
    ],
    cta: 'Zacznij od bezpłatnej analizy',
  },
  features: {
    eyebrow: 'Co jest w środku',
    title: 'Wszystko, co potrzebne do wzrostu, w jednym miejscu',
    body: 'Cztery elementy, które pracują razem, żeby każdy artykuł był zmierzony, a każdy pomiar decydował o następnym artykule.',
    more: 'Dowiedz się więcej',
    note: 'Nazwy i liczby na podglądach są przykładowe.',
    content: {
      overline: 'Treści i publikacja',
      title: 'Artykuły pisane po to, żeby je znaleziono — nie po to, żeby zapełnić bloga',
      body: 'Każdy artykuł stoi na prawdziwym badaniu: nagłówki z pytań, które ludzie naprawdę zadają, blok pytań i odpowiedzi, linkowanie wewnętrzne do stron, które sprzedają, a na witrynach WordPress z wtyczką Go Top dane strukturalne, które czytają Google i silniki AI. Państwo czytają, poprawiają, gdzie trzeba, a platforma publikuje.',
      points: ['Obraz wyróżniający i obrazy w tekście', 'Kontrola jakości przed każdą publikacją', 'Planowanie i publikacja wprost na WordPressie, w Shopify i w Wixie'],
      href: '/features/seo-geo-content-publishing',
      visual: {
        heading: 'W tym tygodniu na Państwa witrynie',
        days: ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'],
        items: [
          { day: 0, title: 'Jak wybrać klimatyzację do sypialni', status: 'published', label: 'Opublikowany' },
          { day: 2, title: 'Ile kosztuje montaż klimatyzacji z pompą ciepła', status: 'scheduled', label: 'Zaplanowany' },
          { day: 4, title: 'Czyszczenie klimatyzacji: jak często jest potrzebne?', status: 'writing', label: 'W pisaniu' },
        ],
        destinationLabel: 'Publikacja na',
        destinations: ['WordPress', 'Shopify', 'Wix'],
      },
    },
    ai: {
      overline: 'Widoczność w odpowiedziach AI',
      title: 'Wiedzieć, kiedy ChatGPT poleca Państwa firmę — a kiedy konkurenta',
      body: 'Zadajemy silnikom AI pytania, które zadają Państwa klienci, i sprawdzamy, kto pojawia się w odpowiedzi. Widzą Państwo, przy których pytaniach Państwa firma wygrywa, gdzie rekomendacja idzie do konkurenta i co poprawić na witrynie, żeby to zmienić.',
      points: ['ChatGPT, Gemini, Perplexity, Copilot, Grok i Google AI', 'Wprost obok Państwa konkurentów', 'Wskazówki, co zmienić, żeby trafić do odpowiedzi'],
      href: '/features/ai-visibility-tracking',
      visual: {
        heading: 'Kto pojawia się w odpowiedzi',
        engines: ['ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'Google AI'],
        rows: [
          { question: 'Kto montuje klimatyzacje w Warszawie?', hits: [true, true, true, false, true, false] },
          { question: 'Ile kosztuje czyszczenie klimatyzacji?', hits: [true, false, true, false, false, true] },
        ],
        shareTitle: 'Udział we wzmiankach',
        you: { label: 'Państwa firma', value: 58 },
        rival: { label: 'Główny konkurent', value: 42 },
      },
    },
    rank: {
      overline: 'Pozycje w Google',
      title: 'Widzieć każdy wzrost, w Google i w Mapach Google',
      body: 'Monitorowanie każdej frazy, która się liczy — w klasycznych wynikach wyszukiwania i w Mapach według miasta lub obszaru, z historią pokazującą, czy artykuły robią swoje.',
      points: ['Google organiczne według kraju, języka i urządzenia', 'Mapy Google według miasta lub obszaru', 'Analiza słów kluczowych z liczbą wyszukiwań i konkurencją'],
      href: '/features/google-organic-rank-tracking',
      visual: {
        heading: 'Państwa słowa kluczowe',
        columns: ['Słowo kluczowe', 'Pozycja', 'Zmiana'],
        rows: [
          { keyword: 'montaż klimatyzacji warszawa', pos: 3, up: 15 },
          { keyword: 'pompa ciepła klimatyzacja cena', pos: 7, up: 17 },
          { keyword: 'naprawa klimatyzacji warszawa mokotów', pos: 9, up: 22 },
          { keyword: 'czyszczenie klimatyzacji', pos: 5, up: 10 },
        ],
        maps: { label: 'Mapy Google', area: 'Warszawa', value: 'Pozycja 2 z 20' },
      },
    },
    reports: {
      overline: 'Raporty',
      title: 'Raport dla klienta albo dla zarządu, jednym kliknięciem',
      body: 'Eksport pozycji, przebiegu i widoczności w odpowiedziach AI do PDF i do Excela. Agencje prowadzą witryny wielu klientów z jednego konta, każdą witrynę w jej własnym projekcie.',
      points: ['PDF i Excel jednym kliknięciem', 'Wiele witryn na jednym koncie', 'Wszystkie dane w jednym miejscu, bez składania raportów ręcznie'],
      href: '/features/seo-geo-reports',
      visual: {
        heading: 'Raport wyników',
        period: 'Wrzesień',
        stats: [
          { label: 'Słowa kluczowe na pierwszej stronie', value: '14', up: true },
          { label: 'Wzmianki w odpowiedziach AI', value: '9', up: true },
          { label: 'Opublikowane artykuły', value: '8' },
          { label: 'Średnia pozycja', value: '6,2', up: true },
        ],
        clientsLabel: 'Projekty:',
        clients: ['klima-wisla.pl', 'studio-dana.pl', '+3'],
      },
    },
  },
  audience: {
    eyebrow: 'Dla kogo',
    title: 'Dla każdego, czyja witryna ma przynosić klientów',
    body: 'Nie muszą Państwo znać SEO. Muszą Państwo wiedzieć, co sprzedają.',
    items: [
      {
        title: 'Przedsiębiorcy',
        desc: 'Więcej zapytań z Google, bez uczenia się pozycjonowania i bez zatrudniania redakcji. Państwo zatwierdzają tematy, reszta dzieje się sama.',
        gain: 'Witryna, która pracuje, kiedy Państwo są zajęci',
      },
      {
        title: 'Freelancerzy i agencje',
        desc: 'Prowadzenie wielu klientów z jednego konta, szybsze tworzenie treści i wyraźny raport dla każdego klienta.',
        gain: 'Więcej klientów w tych samych godzinach',
      },
      {
        title: 'Zespoły marketingu',
        desc: 'Stały rytm publikacji i w jednym miejscu to, co treści robią w Google i w odpowiedziach AI.',
        gain: 'Wyraźna odpowiedź na pytanie „czy to działa?”',
      },
    ],
  },
  check: {
    eyebrow: 'Bezpłatna analiza witryny',
    title: 'Nie są Państwo przekonani? Pokażemy, co widzimy',
    body: 'Analiza czyta Państwa witrynę naprawdę i w mniej niż minutę daje pierwsze podsumowanie:',
    items: [
      'Co zrozumieliśmy o firmie i kim są jej klienci',
      'Jacy konkurenci pojawiają się obok tej firmy',
      'Co powstrzymuje witrynę w Google, wraz z dowodem z samej witryny',
      'Jak dobrze witryna jest przygotowana na odpowiedzi AI',
      'Lista artykułów, które napisalibyśmy',
    ],
    cta: 'Przeanalizuj moją witrynę',
    note: 'Bezpłatnie, bez rejestracji i bez karty kredytowej.',
    preview: {
      domain: 'klima-wisla.pl',
      heading: 'Państwa pierwsze podsumowanie analizy',
      scoreLabel: 'Gotowość na odpowiedzi AI',
      score: '3/4',
      findings: ['Przy obrazach brakuje tekstu alternatywnego', 'Brak bloku pytań i odpowiedzi', 'Opis meta nie ma właściwej długości'],
      lockedLabel: 'Kolejne ustalenia i konkurenci odblokują się z bezpłatnym kontem',
    },
  },
  faq: {
    eyebrow: 'Pytania',
    title: 'O co pytają najczęściej przed startem',
    body: 'Nie znaleźli Państwo swojej odpowiedzi? Prosimy napisać do nas przez WhatsApp.',
    items: [
      {
        q: 'Nie znam się na SEO. Czy ta platforma jest i tak dla mnie?',
        a: 'Tak. Platforma wybiera frazy, proponuje tematy i pisze artykuły. Państwo decydują tylko, co pasuje do firmy, i zatwierdzają.',
      },
      {
        q: 'Czy na mojej witrynie zostanie opublikowane coś, czego nie widziałem?',
        a: 'Do pisania trafiają wyłącznie zatwierdzone tematy, a każdy artykuł przed publikacją przechodzi kontrolę jakości. Każdy artykuł można przeczytać i zmienić, a termin publikacji Państwo ustalają sami.',
      },
      {
        q: 'Dlaczego nie napisać wszystkiego samemu w ChatGPT?',
        a: 'Można, ale wtedy sami wybierają Państwo tematy, sprawdzają frazy, budują pytania i odpowiedzi oraz dane strukturalne, łączą strony między sobą, wstawiają wszystko na witrynę i sami sprawdzają, czy zadziałało. Go Top SEO bierze cały ten łańcuch na siebie i mierzy wynik w Google oraz w odpowiedziach AI.',
      },
      {
        q: 'Z jakimi witrynami to działa?',
        a: 'Publikacja wprost działa z WordPressem, z Shopify i z Wixem. Monitorowanie pozycji, widoczność w odpowiedziach AI i analiza słów kluczowych działają z każdą witryną.',
      },
      {
        q: `Co dzieje się po ${TRIAL_DAYS} dniach okresu próbnego?`,
        a: 'Państwo wybierają pakiet i kontynuują dokładnie tam, gdzie skończyli. Jeśli nie wybiorą żadnego, nic nie zostanie pobrane, bo o kartę nigdy nie pytaliśmy.',
      },
      {
        q: 'Czy mogę zrezygnować?',
        a: 'Tak, w dowolnej chwili, wprost w panelu, bez kar i bez kosztów rezygnacji.',
      },
    ],
  },
  cta: {
    title: 'Państwa następny klient szuka dzisiaj. Niech Państwa znajdzie.',
    body: `Bezpłatna analiza witryny albo ${TRIAL_DAYS} dni na próbę: pierwszy artykuł może zostać napisany jeszcze dziś.`,
    check: 'Przeanalizuj moją witrynę bezpłatnie',
    signup: 'Wypróbuj bezpłatnie',
    dashboard: 'Mój panel',
    pricing: `Pakiety od ${FROM_USD} USD miesięcznie.`,
    pricingLink: 'Zobacz wszystkie pakiety i ceny',
  },
}

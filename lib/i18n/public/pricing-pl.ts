/**
 * The Polish pricing page's words around the plan grid
 * (app/(public)/pl/pricing/page.tsx renders them through
 * components/public/pricing/PricingSections.tsx).
 *
 * Every figure is read from the plan and trial catalogs, so the page cannot
 * drift from what the server enforces. No customer, total, quote or logo is
 * claimed, and no percentage or ranking promise. The badge says what it is, a
 * recommendation, not a sales figure.
 *
 * THE PRICE ITSELF is not in this file. The grid reads it from the visitor's
 * billing market (lib/billing/server-market.ts), which is decided by country
 * and not by the page's language: a visitor in Poland sees the same dollar
 * price every market outside Israel is billed in today, because a Polish local
 * price is not set. Nothing here promises a currency, and the Polish page never
 * names złoty or euros — Creem charges dollars, and either figure would be a
 * price we do not take.
 *
 * THE TAX SENTENCE IS NOT COSMETIC IN POLISH, and that is the one way this page
 * differs from its Dutch twin rather than merely translating it. The legal
 * thread read the Polish price-information Act and found a provision the Dutch
 * and German ones have no equivalent of: where there is DOUBT about the price,
 * the consumer may demand the one more favourable to them, and the trade
 * inspector may fine the seller up to 20,000 PLN. So a dollar figure printed
 * without saying what it does and does not include is not an untidy page, it is
 * a priceable risk. The note therefore names the seller (Creem, as merchant of
 * record), says the listed figure is before tax, and says the exact amount
 * including tax appears before the visitor is bound — which is where the total
 * is actually stated.
 */
import type { PricingCopy } from '@/components/public/pricing/PricingSections'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'
import { CHECKS_EXPLAINER } from '@/lib/plans/features'

const DAYS = TRIAL_CATALOG.days
const BASIC_ARTICLES = PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide
const ADVANCED_ARTICLES = PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide

export const pricingPl: PricingCopy = {
  hero: {
    eyebrow: 'Cennik',
    title: 'Wszystko, co potrzebne, by Państwa znaleziono,',
    accent: 'w jednej cenie miesięcznie',
    subtitle: 'Artykuły pisane i publikowane na Państwa witrynie, monitorowanie pozycji w Google i w Mapach Google oraz sprawdzanie, co polecają ChatGPT i Gemini. Pakiet wybierają Państwo według swoich potrzeb, a zaczynają od bezpłatnego okresu próbnego.',
    trust: [`${DAYS} dni bezpłatnie`, 'Bez karty kredytowej', 'Rezygnacja w dowolnym momencie, w panelu'],
  },
  plans: {
    perMonth: '/miesiąc',
    popular: 'Nasza rekomendacja',
    cta: `Wypróbuj ${DAYS} dni bezpłatnie`,
    dashboard: 'Mój panel',
    noCard: 'Bez karty kredytowej',
    checksNote: CHECKS_EXPLAINER.pl,
    taxNote: {
      ILS: 'Ceny zawierają izraelski podatek VAT. To jest kwota do zapłaty, bez dopłat.',
      USD: 'Przy płatności kartą sprzedawcą jest Creem i działa jako merchant of record: Creem wylicza podatek na podstawie adresu rozliczeniowego i pokazuje kwotę końcową przed płatnością. Ceny podane tutaj są bez tego podatku, a dokładną kwotę wraz z podatkiem widzą Państwo przed zawarciem umowy.',
    },
    /* 전자상거래법 제21조 제1항 제1호 forbids inducing a consumer by withholding a
       material fact, and it binds any business carrying on electronic commerce,
       not only a mail-order seller, so it bites BEFORE any contract. Shown only
       to a visitor placed in Korea, on every language's page, because the duty
       follows the consumer and not the page. lib/billing/korea-sale.ts. */
    koreaTrialOnly: `W Korei Południowej dostępny jest na razie tylko bezpłatny okres próbny, a płatna subskrypcja nie jest tam sprzedawana. Okres próbny kończy się automatycznie po ${DAYS} dniach, a my nie pobieramy danych karty, więc nic nie zostanie obciążone.`,
    everyPlanLabel: 'We wszystkich pakietach',
    everyPlan: [
      'Automatyczna, zaplanowana publikacja na WordPressie, w Shopify i w Wixie',
      'Monitorowanie pozycji w Google i w Mapach Google',
      'Sprawdzenie, czy 6 silników AI, takich jak ChatGPT i Gemini, wymienia firmę',
      'Ocena stanu witryny wraz z listą potrzebnych poprawek',
      'Raporty w PDF i Excelu, gotowe do wysłania',
      'Osobiste wsparcie',
    ],
  },
  unsure: {
    text: 'Nie są Państwo przekonani? Prosimy zacząć od bezpłatnej analizy witryny.',
    cta: 'Przeanalizuj moją witrynę',
  },
  included: {
    eyebrow: 'We wszystkich pakietach',
    title: 'Żadnych dodatków. Wszystko w cenie od pierwszego dnia.',
    body: 'Pakiety różnią się wyłącznie skalą: ile witryn, ile artykułów i ile sprawdzeń miesięcznie. Funkcje we wszystkich pakietach są te same.',
    items: [
      {
        title: 'Artykuły pisane i publikowane',
        desc: 'Platforma pisze pełne artykuły na zatwierdzone tematy, z obrazami, blokiem pytań i odpowiedzi oraz linkowaniem wewnętrznym, i publikuje je na Państwa witrynie zgodnie z planem.',
      },
      {
        title: 'Monitorowanie w Google i w Mapach Google',
        desc: 'Na której pozycji stoi firma przy każdej frazie, która się liczy — w klasycznych wynikach i w Mapach — i jak to się zmienia w czasie.',
      },
      {
        title: 'Widoczność w silnikach AI',
        desc: 'Sprawdza, czy ChatGPT, Gemini, Perplexity, Copilot, Grok i Google AI wymieniają tę firmę, i kogo wymieniają zamiast niej.',
      },
      {
        title: 'Analiza słów kluczowych',
        desc: 'Platforma znajduje to, czego szukają Państwa klienci i o co pytają, i proponuje, od czego zacząć.',
      },
      {
        title: 'Raporty gotowe do wysłania',
        desc: 'Pozycje, przebieg i widoczność w odpowiedziach AI w jednym raporcie PDF albo Excel, utworzonym jednym kliknięciem i gotowym dla klienta albo dla zarządu.',
      },
      {
        title: 'Osobiste wsparcie',
        desc: 'Odpowiadają prawdziwi ludzie, przez WhatsApp i e-mailem.',
      },
    ],
  },
  value: {
    eyebrow: 'Dlaczego to się opłaca',
    title: 'Jedna subskrypcja zamiast trzech wykonawców',
    body: 'Zwykle potrzebny jest ktoś, kto wybierze tematy i napisze, ktoś, kto to wstawi na witrynę, i narzędzie, które sprawdzi, czy zadziałało. Tutaj wszystko dzieje się w tym samym miejscu.',
    items: [
      {
        title: 'Praca zostaje wykonana, a nie tylko zmierzona',
        desc: 'Nie kolejny raport, który czeka, aż ktoś zadziała. Platforma sama pisze i publikuje artykuły, i wyłącznie na zatwierdzone tematy.',
      },
      {
        title: 'Widzą Państwo dokładnie, za co płacą',
        desc: 'Opublikowane artykuły, zmiany pozycji i wzmianki w odpowiedziach AI w jednym panelu, oraz w raporcie, który można przekazać komu trzeba.',
      },
      {
        title: 'Bez zobowiązań',
        desc: `${DAYS} dni na próbę bez karty kredytowej, płatność miesięczna i rezygnacja w dowolnym momencie, w panelu.`,
      },
    ],
  },
  usage: {
    eyebrow: 'Jak liczy się zużycie',
    title: 'Bez drobnego druku',
    body: 'Trzy proste jednostki, a każda pula odnawia się co miesiąc.',
    items: [
      {
        title: 'Artykuły',
        desc: 'Utworzenie nowego artykułu zużywa jedną jednostkę z puli. Edycja, zaplanowanie albo publikacja istniejącego artykułu nie zużywa niczego.',
      },
      {
        title: 'Sprawdzenie pozycji w Google',
        desc: 'Sprawdzenie, na której pozycji stoi słowo kluczowe, w jednym miejscu: w Google albo w Mapach Google. To samo słowo w obu liczy się jako dwa sprawdzenia.',
      },
      {
        title: 'Sprawdzenie widoczności w odpowiedziach AI',
        desc: 'Zadanie pytania jednemu silnikowi AI i sprawdzenie, czy firma została wymieniona. To samo pytanie w ChatGPT i w Gemini liczy się jako dwa sprawdzenia.',
      },
    ],
    note: 'Pula artykułów obowiązuje na konto. W pakietach z wieloma witrynami korzystają z niej wszystkie witryny razem.',
  },
  faq: {
    eyebrow: 'Pytania',
    title: 'O co pytają przed wyborem pakietu',
    body: 'Nie znaleźli Państwo swojej odpowiedzi? Prosimy napisać do nas przez WhatsApp.',
    items: [
      {
        q: 'Który pakiet do nas pasuje?',
        a: `Basic i Advanced są przeznaczone dla jednej witryny, a zasadnicza różnica między nimi to liczba artykułów miesięcznie: ${BASIC_ARTICLES} wobec ${ADVANCED_ARTICLES}. Premium jest dla więcej niż jednej witryny, Agency do prowadzenia witryn klientów. Można zacząć od małego i zmienić pakiet w dowolnym momencie.`,
      },
      {
        q: 'Co jest w bezpłatnym okresie próbnym?',
        a: `${DAYS} dni bez karty kredytowej: jedna witryna, do ${TRIAL_CATALOG.maxKeywordsPerProject} słów kluczowych, do ${TRIAL_CATALOG.maxGoogleChecksLifetime} sprawdzeń pozycji w Google, do ${TRIAL_CATALOG.maxAIChecksLifetime} sprawdzeń widoczności w odpowiedziach AI i jeden artykuł, żeby zobaczyć cały przebieg, od początku do publikacji.`,
      },
      {
        q: `Co dzieje się po ${DAYS} dniach okresu próbnego?`,
        a: 'Państwo wybierają pakiet i kontynuują tam, gdzie skończyli. Jeśli nie wybiorą żadnego, nic nie zostanie pobrane, bo o kartę nigdy nie pytaliśmy.',
      },
      {
        q: 'Czy możemy zmienić pakiet albo zrezygnować?',
        a: 'Tak. Pakiet zmieniają Państwo w dowolnym momencie, a nowe pule obowiązują od tej chwili. Rezygnacja odbywa się w panelu, bez kar i bez kosztów rezygnacji.',
      },
      {
        q: 'Co dzieje się z artykułami, których nie wykorzystamy?',
        a: 'Pula odnawia się co miesiąc, a niewykorzystane artykuły nie przechodzą na następny miesiąc.',
      },
      {
        q: 'Czy analizy uruchamiają się same?',
        a: 'Analizę ręczną można uruchomić w dowolnej chwili albo włączyć automatyczną analizę miesięczną, która wykonuje się sama co miesiąc. Automatycznej analizy dziennej ani tygodniowej obecnie nie ma.',
      },
      {
        q: 'Czy artykuły można zaplanować i publikować automatycznie?',
        a: 'Tak. Artykuł planują Państwo na przyszłą datę albo publikują od razu na podłączonej witrynie: WordPress, Shopify lub Wix.',
      },
      {
        q: 'Jak chronione są nasze dane?',
        a: 'Cały ruch jest szyfrowany (SSL/TLS), hasła przechowywane są w postaci zaszyfrowanej, a każde konto widzi wyłącznie własne dane. Dane są przekazywane jedynie dostawcom usług, na których działa platforma — hosting, płatności i dane wyszukiwania — zgodnie z polityką prywatności.',
        // The privacy policy exists in this language (content/legal/pl, rendered
        // by app/(public)/pl/privacy), so the link stays inside the language the
        // reader chose. The French page learned this the hard way: its link
        // pointed at /en/privacy for months, which handed the reader an English
        // document — the one thing the site's language rule forbids.
        link: { label: 'Przeczytaj politykę prywatności', href: '/pl/privacy' },
      },
    ],
  },
  cta: {
    title: 'Chcą Państwo najpierw zobaczyć, co platforma znajdzie na Państwa witrynie?',
    body: `Bezpłatna analiza czyta Państwa witrynę i daje pierwsze podsumowanie, bez rejestracji. Albo zaczynają Państwo ${DAYS} dni próbnych i wypróbowują wszystko.`,
    check: 'Przeanalizuj moją witrynę bezpłatnie',
    trial: 'Wypróbuj bezpłatnie',
    dashboard: 'Mój panel',
  },
}

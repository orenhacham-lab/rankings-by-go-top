/**
 * Reports (Google rankings and AI visibility), the first-run onboarding tour,
 * the billing and plans screen (PayPal, Shopify billing, cancel renewal), the
 * trial bar, the "start here" checklist on the dashboard and the long-running
 * action messages, in POLISH.
 *
 * Register as set out in chrome.ts.
 *
 * PRICES. Nothing here states an amount: every plan line comes from
 * PLAN_CATALOG through planLimitLines/trialLimitLines, so a Polish card can
 * never promise more than the server grants — and it can never show a currency
 * the account is not billed in. Abroad the plans are sold in US DOLLARS plus
 * tax; there has never been a złoty or a euro price, and this file must not
 * invent one. Polish price-information law asks a consumer price to be the
 * total payable, and lets the buyer demand the more favourable price where
 * there is doubt, so a PLN figure here would be a legal problem and not only a
 * wrong translation. Card payments are sold by Creem as merchant of record:
 * Creem issues the invoice and applies the tax on the billing address, which is
 * what the Creem disclosure below says.
 */
import { planLimitLines, trialLimitLines, CHECKS_EXPLAINER } from '@/lib/plans/features'
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { plPick } from './plural'

export const billingPl: DeepPartial<DashboardDictionary> = {
  reports: {
    title: 'Raporty',
    subtitle: 'Państwa pozycje w Google i widoczność w odpowiedziach AI, w raportach do pobrania i przekazania',
    onDemandTitle: 'Raporty na żądanie',
    onDemandBody: 'Prosimy wybrać rodzaj raportu, a wczyta się z najświeższymi danymi. Można go pobrać jako pdf albo wyeksportować do Excela.',
    googleReport: 'Raport pozycji w Google',
    reportType: 'Rodzaj raportu',
    googleReportType: 'Pozycje w Google (organiczne i Maps)',
    aiReportType: 'Widoczność w odpowiedziach AI',
    loadingReportData: 'Ładowanie danych raportu...',
    loading: 'Ładowanie...',
    exportExcel: 'Eksportuj do Excela',
    downloadReport: 'Pobierz raport',
    nothingToDownload: 'W tej chwili nie ma czego pobierać: raport wypełni się po pierwszym pomiarze.',
    generatedOn: 'Utworzono',
    excelExportWorkInProgress: 'Eksport do Excela raportu o widoczności w odpowiedziach AI nie jest jeszcze dostępny',
    loadAIReportFirst: 'Prosimy najpierw wczytać raport o widoczności w odpowiedziach AI',
    loadGoogleReportFirst: 'Prosimy najpierw wczytać raport pozycji w Google',
    downloadError: 'Błąd przy pobieraniu raportu',
    reportFilename: 'Raport',
    rankingsLabel: 'Pozycje',
    google: {
      totalKeywords: 'Słowa kluczowe łącznie',
      found: 'Znalezione',
      notFound: 'Nieznalezione',
      coverage: 'Znalezione w Google',
      currentRankings: 'Obecne pozycje',
      keyword: 'Słowo kluczowe',
      engine: 'Silnik',
      ranking: 'Pozycja',
      change: 'Zmiana',
      noKeywordsInReport: 'Brak słowa kluczowego w raporcie',
      emptyTitle: 'Ten raport wypełni się, gdy będą monitorowane słowa kluczowe',
      emptyBody: 'Prosimy dodać kilka słów kluczowych do monitorowania, a po pierwszym pomiarze pojawią się tutaj ich pozycje i zmiany.',
      emptyAction: 'Wybierz słowa kluczowe',
    },
    ai: {
      aiScans: 'Sprawdzenia w silnikach AI',
      aiQueries: 'Pytania do AI',
      mentions: 'Wzmianki',
      mentionRate: 'Udział wzmianek',
      domainCited: 'Domena wskazana jako źródło',
      citationRate: 'Udział cytowań',
      activeEngines: 'Aktywne silniki',
      overallVisibility: 'Widoczność łącznie',
      performanceByEngine: 'Wyniki w podziale na silniki',
      scans: 'Sprawdzenia',
      citations: 'Źródła',
      aiQueryResults: 'Wyniki pytań do AI',
      query: 'Pytanie',
      engine: 'Silnik',
      mentioned: 'Wymieniono',
      domainCited2: 'Domena wskazana jako źródło',
      citations2: 'Źródła',
      date: 'Data',
      yes: 'Tak',
      no: 'Nie',
      noResultsInReport: 'Brak wyniku w raporcie',
      emptyTitle: 'Ten raport wypełni się po pierwszym sprawdzeniu w silnikach AI',
      emptyBody: 'Prosimy uruchomić sprawdzenie widoczności w odpowiedziach AI, a pojawią się tutaj wzmianki i źródła w każdym silniku.',
      emptyAction: 'Sprawdź widoczność w odpowiedziach AI',
      showingResults: (showing: number, total: number) => `Wyświetlane są ${showing} z ${total} wyników`,
      aiVisibilityReport: 'Raport o widoczności w odpowiedziach AI',
    },
  },
  onboarding: {
    title: 'Witamy, zaczynamy',
    subtitle: 'Przejdziemy pierwsze kroki razem',
    steps: {
      createProject: {
        title: 'Dodanie nowej strony',
        description: 'Każda strona to osobny projekt. Lista rozwijana na górze widoku służy do przełączania się między stronami i do utworzenia nowej.',
        action: 'Utwórz stronę',
      },
      keywordResearch: {
        title: 'Analiza słów kluczowych',
        description: 'Tutaj znajdą Państwo pomysły na słowa kluczowe, zobaczą liczbę wyszukiwań i jej przebieg, i dodadzą je wprost do strony.',
        action: 'Przejdź do analizy słów kluczowych',
      },
      generateReports: {
        title: 'Raporty',
        description: 'Tutaj tworzą Państwo przejrzyste raporty SEO i GEO dla klientów, z widocznością w odpowiedziach AI, pozycjami, konkurencją i zaleceniami.',
        action: 'Przejdź do raportów',
      },
    },
    buttons: {
      next: 'Dalej',
      skip: 'Pomiń',
      done: 'Gotowe',
      skipAll: 'Pomiń wszystko',
    },
  },
  billing: {
    title: 'Pakiety subskrypcji',
    subtitle: 'Proszę wybrać pakiet, który jest potrzebny',
    trialActive: 'Bezpłatny okres próbny trwa.',
    validUntilPrefix: 'Ważne do',
    onPlanPrefix: 'W tej chwili aktywny jest pakiet',
    renewalPrefix: 'Odnowienie',
    recommended: 'Polecany',
    currentPlan: 'Obecny pakiet',
    perMonth: 'miesięcznie',
    trialName: 'Bezpłatny okres próbny',
    planLabels: {
      trial: 'Próbny',
      regular: 'Basic',
      advanced: 'Advanced',
      premium: 'Premium',
      large_agency: 'Agency',
    },
    // Derived from PLAN_CATALOG, exactly as the Hebrew and English cards are, so
    // a Polish card cannot promise more than the server grants.
    features: {
      trial: trialLimitLines('pl'),
      regular: planLimitLines('regular', 'pl'),
      advanced: planLimitLines('advanced', 'pl'),
      premium: planLimitLines('premium', 'pl'),
      large_agency: planLimitLines('large_agency', 'pl'),
    },
    keywordCheckNote: `${CHECKS_EXPLAINER['pl']} Limit artykułów jest używany wspólnie przez wszystkie strony konta, a wszystkie limity odnawiają się co miesiąc. To, co nie zostanie wykorzystane, nie przechodzi na następny miesiąc.`,
    trialNoChargeNotice: 'Nie dodano żadnej metody płatności i nic nie zostanie automatycznie pobrane.',
    marketPrompt: {
      currencyName: { ILS: 'szekel izraelski (₪)', USD: 'dolar amerykański ($)' },
      byLocation: (currency: string) => `Ceny są podane w walucie: ${currency}, według Państwa lokalizacji. Waluta zostaje ustalona przy pierwszej płatności.`,
      locked: (currency: string) => `To konto jest rozliczane w walucie: ${currency}.`,
    },
    manage: {
      title: 'Zarządzanie subskrypcją',
      description: 'Po rezygnacji z odnowienia pakiet pozostaje aktywny do końca już opłaconego okresu rozliczeniowego.',
      cancelButton: 'Zrezygnuj z odnowienia',
      cancelling: 'Rezygnacja...',
      confirmCancelTitle: 'Zrezygnować z odnowienia?',
      confirmCancel: 'Dostęp pozostanie aktywny do końca już opłaconego okresu rozliczeniowego, a po nim nic nie zostanie pobrane.',
      confirmCancelAction: 'Zrezygnuj z odnowienia',
      keepRenewal: 'Zostaw pakiet',
      cancelSuccess: 'Odnowienie subskrypcji zostało odwołane. Dostęp pozostaje aktywny do końca okresu rozliczeniowego.',
      cancelError: 'Nie udało się zrezygnować z odnowienia. Prosimy spróbować za chwilę albo napisać do nas, a zrobimy to my.',
      contactToCancel: 'Aby zrezygnować z odnowienia, prosimy napisać do nas, a zamkniemy pakiet. Jeśli subskrypcję rozlicza inna firma, powiemy, gdzie następuje rezygnacja, i przekażemy tam Państwa zgłoszenie.',
      cancelAtMarketplace: (seller: string) => `Ten pakiet został kupiony u ${seller} i rozliczenie idzie tam. Z odnowienia rezygnują Państwo na swoim koncie ${seller}; dostęp pozostaje aktywny do końca opłaconego okresu. Jeśli nie da się dotrzeć do ${seller}, prosimy napisać do nas, a zamkniemy pakiet po naszej stronie. Pobranie płatności może zatrzymać tylko ${seller}.`,
      marketplacePolicyLink: (seller: string) => `Warunki i zasady ${seller}`,
      renewalAlreadyCancelled: 'Odnowienie zostało odwołane. Dostęp pozostaje aktywny do',
    },
    paypal: {
      loading: 'Ładowanie PayPala...',
      notConfigured: 'Płatność przez PayPal jest w tej chwili niedostępna. Prosimy spróbować później albo napisać do nas, a pomożemy.',
      sdkLoadFailed: 'Nie udało się załadować PayPala. Prosimy sprawdzić połączenie z internetem i odświeżyć stronę.',
      planUnavailable: 'Tego pakietu nie da się w tej chwili zapłacić przez PayPala. Prosimy napisać do nas, a pomożemy.',
      createSubscriptionError: 'Nie udało się rozpocząć subskrypcji w PayPalu. Prosimy spróbować za chwilę.',
      activateSubscriptionError: 'PayPal zwolnił płatność, ale pakietu nie udało się uruchomić po naszej stronie. Prosimy napisać do nas, a doprowadzimy to do porządku.',
      activatedSuccess: 'Pakiet jest aktywny. Ta strona odświeży się za moment.',
      buttonError: 'Z PayPalem był problem. Prosimy spróbować za chwilę albo napisać do nas, a pomożemy.',
    },
    withdrawal: {
      label:
        'Żądam od Go Top SEO rozpoczęcia świadczenia usługi natychmiast, przed upływem czternastodniowego terminu odstąpienia, który prawo konsumenckie Unii Europejskiej i Zjednoczonego Królestwa przyznaje konsumentowi, i potwierdzam, że zostałem poinformowany, że po wykonaniu usługi w pełni tracę to prawo.',
      requiredNote: 'Sposoby płatności pojawią się po potwierdzeniu powyższego wiersza. Wcześniej nie pobieramy żadnej opłaty.',
      policyLabel: 'Prawo odstąpienia w całości, w polityce rezygnacji i zwrotów',
    },
    creem: {
      payButton: 'Zapłać kartą',
      starting: 'Otwieranie bezpiecznej strony płatności...',
      error: 'Nie udało się otworzyć strony płatności. Prosimy spróbować za chwilę albo napisać do nas, a pomożemy.',
      changePlanNote: 'Aby przejść na inny pakiet, prosimy napisać do nas, a zajmiemy się tym.',
      disclosure:
        'Płatność kartą idzie przez Creem (Armitage Labs OÜ) jako merchant of record: Creem wystawia fakturę, dolicza podatek według adresu rozliczeniowego, a obciążenie pojawia się na wyciągu pod nazwą Creem. Sama usługa pozostaje nasza.',
      buyerTermsLabel: 'Warunki zakupu Creem',
      cancelNote: 'Creem sprzedaje Państwu ten pakiet i go rozlicza, dlatego rezygnacja następuje u Creem, na podstawie danych subskrypcji, które Creem przesłał przy płatności. Jeśli to wygodniejsze, prosimy napisać do nas, a przekażemy rezygnację do Creem; samo pobranie płatności może zatrzymać tylko Creem. W każdym przypadku dostęp pozostaje aktywny do końca opłaconego okresu.',
    },
    shopify: {
      title: 'Rozliczenie idzie przez Shopify',
      description: 'To konto jest rozliczane przez Shopify App Pricing, a nie przez PayPala. Podłączenie sklepu do publikacji nic w tym nie zmienia.',
      manageButton: 'Zarządzaj pakietem w Shopify',
      migrationPending: 'Wciąż kończymy łączenie Państwa rozliczenia ze Shopify. Może to chwilę potrwać: prosimy odświeżyć tę stronę wkrótce.',
      migrationNeedsAttention: 'Pakiet Shopify jest aktywny, ale wciąż domykamy poprzednie rozliczenie. Jeśli to nie rozwiąże się samo, prosimy napisać do nas.',
      storeConnectedTitle: 'Państwa sklep jest rozliczany przez Shopify',
      storeConnectedDescription: 'Do tego konta podłączony jest sklep Shopify, dlatego płatność idzie przez Shopify, a nie przez PayPala. Pakiet wybierają i zmieniają Państwo w aplikacji Go Top SEO, w panelu swojego sklepu Shopify.',
      appStoreLink: 'Go Top SEO w Shopify App Store',
      paidUntil: (date: string) => `Pakiet jest opłacony na stronie do ${date} i do tego dnia pozostaje aktywny.`,
      paidCurrentPeriod: 'Pakiet jest opłacony na stronie za bieżący okres i pozostaje aktywny do końca tego okresu.',
      renewalOff: 'Przez PayPala nie następuje odnowienie.',
      renewalStopping: 'Wyłączamy Państwa odnowienie przez PayPala.',
      afterPaidPeriod: 'Potem prosimy wybrać pakiet w aplikacji Go Top SEO w panelu Shopify, aby publikować dalej.',
    },
    unavailable: {
      title: 'Stan rozliczeń jest w tej chwili niedostępny',
      description: 'Nie udało się potwierdzić, który dostawca prowadzi rozliczenie tego konta, dlatego zmiany pakietu są chwilowo wstrzymane. Nic się nie zmieniło. Prosimy odświeżyć tę stronę wkrótce.',
    },
    admin: {
      title: 'Konto administratora: pełny dostęp',
      description: 'To konto ma pełny dostęp do systemu i nie potrzebuje pakietu rozliczeniowego.',
    },
  },
  trialBar: {
    // The bar prints [prefix, suffix] around the number, so both halves have to
    // agree with it: "Został 1 dzień", "Zostały 2 dni", "Zostało 5 dni".
    daysLeft: (n: number): readonly [string, string] => [
      plPick(n, 'Został', 'Zostały', 'Zostało'),
      plPick(n, 'dzień bezpłatnego okresu próbnego', 'dni bezpłatnego okresu próbnego', 'dni bezpłatnego okresu próbnego'),
    ],
    lastDay: 'Dziś jest ostatni dzień bezpłatnego okresu próbnego',
    expired: 'Bezpłatny okres próbny się skończył',
    upgrade: 'Zmień pakiet teraz',
    dismiss: 'Ukryj na 24 godziny',
    label: 'Bezpłatny okres próbny',
  },
  dashboardStart: {
    title: 'Tutaj się zaczyna',
    subtitle: (domain: string) => `Kilka krótkich kroków i ten panel wypełni się danymi o ${domain}.`,
    progress: (done: number, total: number) => `${done} z ${total} gotowe`,
    stepLabel: (n: number) => `Krok ${n}`,
    done: 'Gotowe',
    running: 'W toku',
    // The step the card's main button is for (owner's report, 10 October 2026).
    next: 'Następny krok',
    // On every screen of a project whose site is not connected yet (components/layout/ConnectSiteBanner.tsx).
    connectBanner: {
      title: 'Strona nie jest jeszcze podłączona',
      body: 'To pierwszy krok. Dopóki strona nie jest podłączona, można analizować i pisać, ale artykułów nie da się tam opublikować. Podłączenie następuje tylko raz.',
    },
    steps: {
      scan: {
        title: 'Analiza Państwa strony',
        body: 'Ustalamy, co firma oferuje i komu, szukamy słów kluczowych i konkurentów, i sprawdzamy, co zatrzymuje stronę w Google i w odpowiedziach AI. Zajmuje to kilka minut.',
        runningBody: 'Analiza trwa. Można pracować dalej; ten panel odświeży się, gdy analiza będzie gotowa.',
        cta: 'Przeanalizuj stronę',
        retry: 'Spróbuj ponownie',
        doneLink: 'Zobacz podsumowanie analizy',
      },
      keywords: {
        title: 'Wybór słów kluczowych',
        body: 'Frazy, których Państwa klienci szukają w Google. Mierzymy, gdzie strona pojawia się przy każdej z nich.',
        cta: 'Otwórz analizę słów kluczowych',
        doneLink: 'Zobacz swoje słowa kluczowe',
      },
      connect: {
        title: 'Podłączenie Państwa strony',
        body: 'Prosimy podłączyć WordPressa, Wix, Shopify albo inną stronę, aby artykuły publikowały się tam jednym kliknięciem.',
        cta: 'Podłącz stronę',
        doneLink: 'Ustawienia połączenia',
      },
      article: {
        title: 'Pierwszy artykuł',
        body: 'Prosimy wybrać temat z propozycji, a napiszemy pełny artykuł, gotowy do przeczytania i opublikowania.',
        cta: 'Wybierz temat',
        doneLink: 'Zobacz swoje artykuły',
      },
    },
  },
  longActions: {
    reportPdf: {
      pending: 'Pdf jest tworzony. Może to potrwać do minuty.',
      done: 'Raport jest gotowy i został pobrany.',
      failed: 'Nie udało się utworzyć raportu. Prosimy spróbować za chwilę.',
    },
  },
}

export {}

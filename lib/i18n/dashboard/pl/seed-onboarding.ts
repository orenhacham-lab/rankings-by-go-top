/**
 * The new-project onboarding in POLISH: the "which site do we start with"
 * screen, the live scan progress, the first-look summary of the site, the
 * free-check preview, the first-article button and every notice, action and
 * wait phrase those screens show.
 *
 * Register as set out in chrome.ts. The trial line keeps the English promise
 * exactly: seven days, no card.
 *
 * Every counted noun goes through plPick: Polish has three agreement classes
 * (1 / 2-4 / 0 and 5+), and 12, 13 and 14 take the last of them although they
 * end in 2, 3 and 4, so the Dutch two-branch ternaries cannot be carried over.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { plPick } from './plural'

export const seedOnboardingPl: DeepPartial<DashboardDictionary> = {
  seedOnboarding: {
    newProject: {
      eyebrow: 'Nowa witryna',
      title: 'Od której witryny zaczynamy?',
      subtitle: 'Wystarczy jeden adres. Przeczytamy witrynę, zrozumiemy firmę i zrobimy pierwszy bilans.',
      urlLabel: 'Adres witryny',
      urlPlaceholder: 'przyklad.pl',
      submit: 'Przeanalizuj witrynę',
      creating: 'Tworzenie witryny…',
      starting: 'Uruchamianie analizy…',
      promise: 'Około minuty. W tym czasie można pracować dalej',
      noConnection: 'Bez Search Console, bez połączenia z witryną',
      fromFreeCheck: (domain: string) => `Kontynuujemy Państwa darmową analizę ${domain}`,
      fromScanTitle: (domain: string) => `Przygotowujemy Państwa witrynę dla ${domain}`,
      fromScanBody: 'Tworzymy witrynę z analizy, którą Państwo uruchomili, ze wszystkim, czego dowiedzieliśmy się o firmie, jej słowach kluczowych i jej tematach, i otwieramy ją. To potrwa kilka sekund.',
      errorEmpty: 'Prosimy wpisać adres witryny',
      errorInvalid: 'To nie wygląda na adres witryny. Na przykład: przyklad.pl',
      planTitle: 'Co się teraz dzieje',
      afterTitle: 'A potem',
      afterBody: 'Państwo wybierają słowa kluczowe, które będą śledzone, a pełne badanie toczy się dalej w tle: słowa kluczowe z liczbą wyszukiwań, słowa kluczowe konkurentów i plan treści.',
    },
    progress: {
      eyebrow: 'Pierwszy bilans witryny',
      title: (domain: string) => `Analizujemy ${domain}`,
      fromFreeCheck: 'Kontynuujemy na podstawie wyników Państwa darmowej analizy',
      promise: 'Około minuty. W tym czasie można pracować dalej',
      stepOf: (n: number, total: number) => `Krok ${n} z ${total}`,
      nowLabel: 'W toku',
      stepsLabel: 'Kroki',
      finishingTitle: 'Składamy wnioski',
      finishingLine: 'Bilans jest prawie gotowy',
      steps: {
        a1: { title: 'Analizujemy strony', lines: ['Czytamy stronę główną', 'Sprawdzamy dostęp robotów AI', 'Liczymy adresy w mapie witryny'] },
        a2: { title: 'Usługi i obszar', lines: ['Ustalamy, co firma oferuje', 'Rozpoznajemy grupy odbiorców', 'Wybieramy pierwsze słowa kluczowe'] },
        a3: { title: 'Przeglądamy znaczniki i treści', lines: ['Przeglądamy tytuły, opisy i zdjęcia', 'Sprawdzamy cztery sygnały gotowości na AI'] },
        a4: { title: 'Konkurenci w Google', lines: ['Szukamy Państwa słów kluczowych w Google', 'Patrzymy, kto pojawia się obok Państwa'] },
      },
      claimLines: {
        a1: ['Otwieramy wyniki Państwa darmowej analizy'],
        a2: ['Przenosimy to, czego dowiedzieliśmy się o firmie'],
        a3: ['Przenosimy wnioski i kontrole AI'],
      },
      state: { done: 'Gotowe', running: 'Teraz', pending: 'Potem', skipped: 'Pominięte', failed: 'Nieukończone' },
      stalledTitle: 'To trwa dłużej niż zwykle',
      stalledBody: 'Analiza toczy się dalej w tle, także po opuszczeniu tej strony, a bilans będzie tu czekał.',
      reconnecting: 'Przywracanie połączenia…',
    },
    summary: {
      badge: 'Pierwszy bilans witryny',
      title: (name: string) => `${name}: czego dowiedzieliśmy się z witryny`,
      scannedJustNow: (domain: string) => `${domain} przeanalizowane właśnie teraz`,
      scannedHoursAgo: (domain: string, hours: number) =>
        hours === 1
          ? `${domain} przeanalizowane godzinę temu`
          : `${domain} przeanalizowane ${hours} ${plPick(hours, 'godzinę', 'godziny', 'godzin')} temu`,
      scannedDaysAgo: (domain: string, days: number) =>
        days === 1
          ? `${domain} przeanalizowane wczoraj`
          : `${domain} przeanalizowane ${days} ${plPick(days, 'dzień', 'dni', 'dni')} temu`,
      fromFreeCheck: 'Na podstawie Państwa darmowej analizy',
      fromSearchIndex: (domain: string) => `To badanie zbudowaliśmy na tym, co Google pokazuje z ${domain}`,
      firewall: {
        title: 'Witryna blokuje odczyt automatyczny',
        body: 'Zapora witryny blokuje automatycznych czytelników, takich jak nasz: dlatego to badanie zbudowaliśmy na tym, co Google pokazuje z witryny. Połączenie WordPressa albo Shopify, albo dopuszczenie naszego robota u dostawcy hostingu, umożliwi pełniejsze badanie.',
      },
      edit: 'Edytuj',
      editLabel: (section: string) => `Edytuj: ${section}`,
      tiles: {
        keywords: 'Zalecane słowa kluczowe',
        fixes: 'Punkty do naprawy na witrynie',
        geo: 'Gotowość na silniki AI',
        articles: 'Pomysły na artykuły',
        notChecked: 'Nie sprawdzone',
        pending: 'Czeka',
      },
      business: {
        title: 'Państwa firma, tak jak pokazuje ją witryna',
        niche: 'Nisza',
        commerceType: 'Rodzaj działalności',
        platform: 'Platforma',
        local: 'Firma lokalna',
        notLocal: 'Nielokalna',
        commerce: { product: 'Produkty', service: 'Usługi', content: 'Treści', other: 'Inne' },
        empty: 'Nie udało się odczytać z witryny, co firma oferuje. Można to wpisać w ustawieniach.',
        locked: 'Sklep jest chroniony hasłem: nie odczytaliśmy jeszcze, co oferuje.',
      },
      audiences: {
        title: 'Kogo Państwo obsługują',
        empty: 'Nie rozpoznaliśmy jeszcze grup odbiorców. Można je dodać w ustawieniach.',
      },
      competitors: {
        title: 'Kto stanowi dla Państwa konkurencję w Google',
        seenIn: (n: number) =>
          n === 1
            ? 'Pojawił się w jednym z naszych zapytań w Google'
            : `Pojawił się w ${n} ${plPick(n, 'naszym zapytaniu', 'naszych zapytaniach', 'naszych zapytaniach')} w Google`,
        suggested: 'Zaproponowany przez analizę witryny',
        empty: 'Tym razem nie znaleźliśmy konkurentów. Pełne badanie poszuka ponownie.',
      },
      findings: {
        title: 'Co powstrzymuje witrynę',
        clean: 'W naszych kontrolach nie zauważyliśmy żadnego problemu',
        locked: 'Nie sprawdzone: sklep jest chroniony hasłem',
        firewall: 'Nie sprawdzone: witryna blokuje odczyt automatyczny',
        failed: 'Tej kontroli nie udało się nam ukończyć',
        pending: 'Ta kontrola nie jest jeszcze gotowa',
        omitted: (n: number) =>
          n === 1
            ? 'Z darmowej analizy został jeszcze jeden wniosek. Nowa analiza witryny sprawi, że pojawi się na liście.'
            : `Z darmowej analizy ${plPick(n, 'został', 'zostały', 'zostało')} jeszcze ${n} ${plPick(n, 'wniosek', 'wnioski', 'wniosków')}. Nowa analiza witryny sprawi, że pojawią się wszystkie.`,
        severity: { blocker: 'Blokujące', warning: 'Do naprawy', info: 'Warto wiedzieć' },
      },
      keywords: {
        title: 'Słowa kluczowe, które są tego warte',
        hint: 'Wszystko jest zaznaczone. To, co zostanie zaznaczone, będzie śledzone i wlicza się do limitu słów kluczowych Państwa pakietu.',
        selected: (n: number, total: number) => `Zaznaczone: ${n} z ${total}`,
        limit: (max: number) => `Można zaznaczyć do ${max} ${plPick(max, 'słowa kluczowego', 'słów kluczowych', 'słów kluczowych')}`,
        empty: 'Nie znaleźliśmy jeszcze słów kluczowych. Pełne badanie zaproponuje kilka.',
        tracked: 'Pełne badanie już trwa. Więcej słów kluczowych pojawi się w analizie słów kluczowych.',
        reasons: {
          brand: 'Państwa własna nazwa: tak szukają ludzie, którzy już Państwa znają',
          question: 'Pytanie: artykuł, który na nie odpowiada, może pojawić się w Google i w odpowiedziach AI',
          local: 'Zapytanie lokalne: ludzie w Państwa okolicy szukają właśnie tego',
          buying: 'Blisko zakupu: kto tak szuka, jest gotów działać',
          niche: 'Wymienia Państwa niszę',
          specific: 'Precyzyjna fraza: mniej witryn walczy o to miejsce',
          core: 'Opisuje to, co Państwo oferują, słowami, których ludzie używają w wyszukiwaniu',
        },
      },
      geo: {
        title: 'Gotowość na silniki AI',
        intro: 'Silniki AI, takie jak ChatGPT i Perplexity, nie tworzą rankingu, tylko wymieniają źródła. Te cztery sygnały decydują o tym, jak łatwo mogą Państwa wymienić.',
        score: (passed: number, total: number) => `Zaliczone kontrole: ${passed} z ${total}`,
        locked: 'Nie sprawdzone: sklep jest chroniony hasłem',
        lockedBody: 'Sprawdzimy te sygnały, gdy sklep będzie publiczny.',
        firewall: 'Nie sprawdzone: witryna blokuje odczyt automatyczny',
        firewallBody: 'Ta kontrola musi odczytać samą witrynę. Sprawdzimy te sygnały, gdy witryna będzie połączona albo dopuści naszego robota.',
        notChecked: 'Nie sprawdzone',
        notCheckedBody: 'Ta kontrola nie została przeprowadzona na tej witrynie.',
        pending: 'Czeka na kontrolę',
        pendingBody: 'Ta kontrola nie została jeszcze przeprowadzona.',
        failed: 'Tej kontroli nie udało się nam ukończyć',
        pass: 'Obecne',
        fail: 'Brakuje',
      },
      articles: {
        title: 'Artykuły, które mogą przyprowadzić odwiedzających',
        empty: 'Jeszcze bez tematów. Pełne badanie przygotuje plan treści.',
      },
      start: {
        title: 'Gotowi zacząć?',
        body: (n: number) =>
          n === 0
            ? 'Pełne badanie toczy się dalej w tle: słowa kluczowe z liczbą wyszukiwań, słowa kluczowe konkurentów i plan treści.'
            : n === 1
              ? 'Śledzone jest jedno słowo kluczowe, a pełne badanie toczy się dalej w tle: słowa kluczowe z liczbą wyszukiwań, słowa kluczowe konkurentów i plan treści.'
              : `${plPick(n, 'Śledzone jest', 'Śledzone są', 'Śledzonych jest')} ${n} ${plPick(n, 'słowo kluczowe', 'słowa kluczowe', 'słów kluczowych')}, a pełne badanie toczy się dalej w tle: słowa kluczowe z liczbą wyszukiwań, słowa kluczowe konkurentów i plan treści.`,
        button: 'Zacznij',
        starting: 'Uruchamianie…',
        runningTitle: 'Pełne badanie toczy się w tle',
        runningBody: 'Każdy krok pojawi się w panelu, gdy będzie gotowy.',
        readyTitle: 'Pełne badanie jest gotowe',
        readyBody: 'Słowa kluczowe, konkurenci i plan treści czekają w panelu.',
        failedTitle: 'Pełne badanie nie zostało ukończone',
        failedBody: 'Kilka kroków nie przeszło. To, co już znaleziono, zostało zapisane i pojawi się w panelu.',
        openDashboard: 'Otwórz panel',
      },
    },
    preview: {
      badge: 'Darmowe badanie',
      competitorsLocked: (n: number) =>
        n === 1
          ? 'Jeszcze 1 konkurent w pełnym badaniu'
          : `Jeszcze ${n} ${plPick(n, 'konkurent', 'konkurenci', 'konkurentów')} w pełnym badaniu`,
      keywordsLocked: (n: number) =>
        n === 1
          ? 'Jeszcze 1 słowo kluczowe w pełnym badaniu'
          : `Jeszcze ${n} ${plPick(n, 'słowo kluczowe', 'słowa kluczowe', 'słów kluczowych')} w pełnym badaniu`,
      volumeLocked: 'Liczba wyszukiwań',
      volumeLockedLabel: 'Liczba wyszukiwań odblokowuje się w pełnym badaniu',
      keywordsHint: 'Liczby wyszukiwań wszystkich słów kluczowych i śledzenie pozycji odblokowują się w pełnym badaniu.',
      ctaTitle: 'Odblokujcie pełne badanie, bezpłatnie',
      ctaBody: 'Wszyscy konkurenci, liczba wyszukiwań każdego słowa kluczowego i śledzenie pozycji. Badanie już czeka na Państwa koncie, bez drugiej analizy.',
      cta: 'Odblokuj pełne badanie bezpłatnie',
      haveAccount: 'Mają już Państwo konto?',
      login: 'Zaloguj się',
      terms: '7 dni bezpłatnie, bez karty kredytowej.',
    },
    firstArticle: {
      button: 'Napisz pierwszy artykuł',
      hint: 'Wlicza się do liczby artykułów Państwa pakietu',
      writing: 'Piszemy pierwszy artykuł…',
      writingHint: 'To może potrwać kilka minut. Można zostać na tej stronie.',
      ready: 'Pierwszy artykuł jest gotowy',
      open: 'Otwórz artykuł',
      retry: 'Spróbuj ponownie',
      errors: {
        quota: 'Wykorzystali Państwo wszystkie artykuły z obecnego okresu rozliczeniowego.',
        billing: 'Do pisania artykułów potrzebny jest aktywny pakiet Shopify.',
        unavailable: 'Nie udało się sprawdzić liczby artykułów w Państwa pakiecie. Prosimy spróbować za minutę.',
        inProgress: 'Ten artykuł jest już pisany. Pojawi się na zakładce Treści.',
        quality: 'Artykuł nie przeszedł naszych kontroli jakości. Prosimy spróbować ponownie.',
        details: 'W wezwaniu do działania artykułu brakuje danych. Można je uzupełnić na zakładce Treści, przy temacie.',
        generic: 'Nie udało się napisać artykułu. Prosimy spróbować ponownie.',
        timeout: 'Pisanie trwa dłużej niż zwykle. Artykuł pojawi się na zakładce Treści, gdy będzie gotowy.',
      },
    },
    noRun: {
      title: 'Tej witryny jeszcze nie analizowaliśmy',
      body: 'Analiza odczyta witrynę i zrobi pierwszy bilans. To potrwa do minuty.',
      action: 'Przeanalizuj witrynę',
    },
    notices: {
      signedOut: { title: 'Państwa sesja została zakończona', body: 'Prosimy zalogować się ponownie, aby wrócić tam, gdzie Państwo skończyli.' },
      notAvailable: { title: 'Badanie nie jest dostępne dla tej witryny', body: 'Można pracować nad witryną dalej w panelu.' },
      planRequired: { title: 'Analiza należy do okresu próbnego albo do aktywnego pakietu', body: 'Prosimy wybrać pakiet, aby przeanalizować witrynę.' },
      planUnavailable: { title: 'Nie udało się sprawdzić Państwa pakietu', body: 'To tymczasowe. Prosimy spróbować za minutę.' },
      runInProgress: { title: 'Analiza tej witryny już trwa', body: 'Prosimy odświeżyć, aby zobaczyć, na jakim jest etapie.' },
      rescanTooSoon: { title: 'Ta witryna była analizowana w ostatnich 24 godzinach', body: (wait: string) => `Można ją przeanalizować ponownie ${wait}.` },
      userDailyCap: { title: 'Wykorzystali Państwo dzienną liczbę analiz', body: (wait: string) => `Nową analizę można uruchomić ${wait}.` },
      globalDailyCap: { title: 'Wykorzystaliśmy dzienny limit analiz', body: (wait: string) => `Prosimy spróbować ${wait}.` },
      claimExpired: { title: 'Wyniki Państwa darmowej analizy nie są już dostępne', body: 'Przeanalizujemy witrynę ponownie. To potrwa do minuty.' },
      busy: { title: 'Jest teraz duże zapotrzebowanie na usługę', body: 'Prosimy spróbować za minutę.' },
      failed: { title: 'Po naszej stronie coś się nie udało', body: 'Prosimy spróbować za chwilę.' },
      offline: { title: 'Nie osiągamy serwera', body: 'Prosimy sprawdzić połączenie internetowe i spróbować ponownie.' },
      projectQuota: { title: 'Wykorzystali Państwo liczbę witryn ze swojego pakietu', body: 'Prosimy zmienić pakiet, aby dodać kolejną witrynę.' },
      createFailed: { title: 'Nie udało się utworzyć witryny', body: 'Prosimy spróbować za chwilę.' },
      noClient: { title: 'Państwa konto nie jest jeszcze gotowe na nową witrynę', body: 'Prosimy dodać klienta, a potem utworzyć witrynę.' },
      notReady: { title: 'Badanie nie jest jeszcze gotowe, aby iść dalej', body: 'Prosimy odświeżyć, aby zobaczyć, na jakim jest etapie.' },
      keywordsChanged: { title: 'Lista słów kluczowych się zmieniła', body: 'Prosimy odświeżyć stronę i spróbować jeszcze raz.' },
      keywordQuota: { title: 'Pełne badanie się rozpoczęło, ale słowa kluczowe nie zostały dodane', body: 'Wykorzystali Państwo limit słów kluczowych swojego pakietu. Na zakładce Słowa kluczowe można zrobić miejsce.' },
      keywordsNotAdded: { title: 'Pełne badanie się rozpoczęło, ale słowa kluczowe nie zostały jeszcze dodane', body: 'Można je dodać na zakładce Słowa kluczowe.' },
      siteUnreachable: { title: 'Nie udało się osiągnąć witryny', body: 'Prosimy sprawdzić, czy witryna otwiera się w przeglądarce, i spróbować ponownie.' },
      siteBlocked: { title: 'Witryna zablokowała naszego czytelnika', body: 'Być może ustawienie bezpieczeństwa blokuje automatycznych czytelników. Można spróbować później.' },
      siteForbidden: {
        title: 'Zapora witryny blokuje odczyt automatyczny',
        body: 'Witryna blokuje automatycznych czytelników, takich jak nasz: dlatego nie udało się jej przeanalizować. Można połączyć witrynę przez jej platformę, pójść dalej bez analizy i wpisać dane firmy samodzielnie, albo porozmawiać o tym z nami.',
      },
      siteAddress: { title: 'Adres witryny nie prowadzi do witryny, którą możemy odczytać', body: 'Prosimy sprawdzić adres w ustawieniach witryny.' },
      scanStopped: { title: 'Analiza została przerwana przed końcem', body: 'Prosimy spróbować ponownie. To potrwa do minuty.' },
    },
    actions: {
      retry: 'Spróbuj ponownie',
      refresh: 'Odśwież',
      billing: 'Zobacz pakiety',
      signin: 'Zaloguj się',
      dashboard: 'Otwórz panel',
      settings: 'Otwórz ustawienia witryny',
      clients: 'Otwórz klientów',
      connectPlatform: 'Połącz platformę',
      continueWithoutScan: 'Idź dalej bez analizy',
      talkToUs: 'Porozmawiaj z nami',
    },
    wait: {
      minutes: (n: number) => (n === 1 ? 'za minutę' : `za ${n} ${plPick(n, 'minutę', 'minuty', 'minut')}`),
      hours: (n: number) => (n === 1 ? 'za godzinę' : `za ${n} ${plPick(n, 'godzinę', 'godziny', 'godzin')}`),
      later: 'później',
    },
  },
}

export {}

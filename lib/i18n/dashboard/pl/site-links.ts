/**
 * The LINKS screen in POLISH: free business directories, the Google Search
 * Console links report and CSV import, links between your own pages, the
 * paid-links policy, and the Go Top SEO link network (switch, consent,
 * readiness, placement log).
 *
 * Register as set out in chrome.ts. The Polish trade keeps "linki zwrotne" for
 * backlinks rather than the English word, and a link between your own pages is
 * "link wewnętrzny", the practice "linkowanie wewnętrzne".
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { plPick } from './plural'

export const siteLinksPl: DeepPartial<DashboardDictionary> = {
  siteLinks: {
    title: 'Linki',
    subtitle: 'Linki z innych witryn wzmacniają Państwa witrynę w Google. Tutaj znajdą Państwo sieć linków między klientami Go Top SEO, katalogi, w których można wpisać się bezpłatnie, oraz linki między własnymi stronami.',
    loading: 'Wczytywanie Państwa linków…',
    loadError: 'Nie udało się tego wczytać. Prosimy spróbować za chwilę.',
    retry: 'Spróbuj ponownie',
    opensNewTab: 'Otwiera nową kartę',
    listings: {
      title: 'Bezpłatne katalogi i profile firm',
      description: 'Witryny, w których można wpisać swoją firmę samodzielnie, nikogo nie pytając i nie płacąc: profil firmy, wpis w katalogu albo strona z opiniami. Każdy wpis daje Państwa witrynie link zwrotny z miejsca, które Google już zna.',
      open: 'Otwórz bezpłatny wpis',
      seen: 'Pojawia się w Państwa zapytaniach',
      seenHint: 'Ta witryna pojawia się w Google albo w odpowiedziach AI na to, czego szukają Państwa klienci: wpis tam jest więc wart więcej.',
      groups: { any: 'Dla każdej firmy', field: 'Według branży' },
      fit: {
        any: 'Każda firma',
        local: 'Firma lokalna',
        hospitality: 'Restauracje, noclegi i atrakcje',
        b2b: 'Usługi dla firm',
        software: 'Oprogramowanie i aplikacje',
      },
      items: {
        google: 'Państwa Profil Firmy w Google: pojawia się w wynikach wyszukiwania i w Mapach, razem z witryną, godzinami otwarcia i opiniami.',
        bing: 'Ten sam profil w wyszukiwarce Microsoftu, z której Copilot i inni asystenci AI biorą swoje odpowiedzi. Dane można zaimportować z Google.',
        apple: 'Państwa profil firmy w Mapach Apple i w Siri, dla osób szukających z iPhone’a.',
        dapei_zahav: 'Bezpłatny wpis podstawowy w najstarszym katalogu firm w Izraelu. Prosimy wyszukać na witrynie „dodaj firmę”.',
        b144: 'Bezpłatny wpis podstawowy w katalogu firm operatora Bezeq. Prosimy wyszukać na witrynie „dodaj firmę”.',
        easy: 'Bezpłatna strona firmy w izraelskiej aplikacji z rekomendacjami, z opiniami i linkiem do Państwa witryny.',
        yelp: 'Bezpłatna strona firmy z opiniami, w USA i w innych krajach.',
        trustpilot: 'Bezpłatna strona z opiniami. Po jej otwarciu prosimy poprosić zadowolonych klientów o opinię.',
        tripadvisor: 'Bezpłatny wpis dla restauracji, noclegów i atrakcji.',
        clutch: 'Bezpłatny profil firmy dla firm obsługujących firmy: marketing, development, design.',
        goodfirms: 'Bezpłatny profil firmy dla usługodawców i firm technologicznych.',
        capterra: 'Bezpłatny wpis podstawowy dla oprogramowania i aplikacji dla firm.',
      },
      tip: 'Prosimy używać na każdej witrynie dokładnie tej samej nazwy, tego samego adresu i tego samego numeru telefonu, co na własnej witrynie i w Profilu Firmy w Google. Jeśli zaproponowana zostanie opcja płatna: do samego linku nie jest potrzebna.',
    },
    gscLinks: {
      title: 'Linki, które Google już znalazło',
      body: 'Search Console udostępnia raport o tym, które witryny do Państwa prowadzą i do jakich stron. Google nikomu nie pozwala czytać tego raportu poza Search Console: nie pokazujemy więc liczby, której nie mamy. Przycisk otwiera raport bezpośrednio, dla witryny, którą Państwo połączyli.',
      open: 'Otwórz raport linków w Search Console',
      propertyLabel: 'Usługa Search Console:',
      import: {
        title: 'Import pliku z Search Console',
        optional: 'Opcjonalne',
        intro: 'Chcą Państwo widzieć te linki tutaj? Prosimy pobrać raport z Search Console jako CSV i przesłać pliki. Nie jest to obowiązkowe.',
        stepsLabel: 'Trzy kroki',
        steps: [
          'Prosimy otworzyć raport linków w Search Console (przycisk powyżej).',
          'Prosimy kliknąć „Eksportuj” i wybrać „Pobierz plik CSV”. Jeśli przyjdzie folder skompresowany, prosimy otworzyć go na swoim komputerze.',
          'Prosimy wybrać pliki CSV tutaj. Można wybrać kilka naraz (do 5).',
        ],
        choose: 'Wybierz pliki CSV',
        chooseNew: 'Zaimportuj nowy plik',
        formats: 'Tylko pliki CSV, do 4 MB',
        snapshotBadge: 'Zrzut',
        updatedFrom: (date: string) => `Ostatnia aktualizacja z pliku zaimportowanego ${date}`,
        notAuto: 'Lista nie aktualizuje się sama. Prosimy zaimportować nowy plik, aby ją odświeżyć.',
        fileLabel: 'Plik:',
        notAutoEmpty: 'Warto wiedzieć: lista jest zrzutem przesłanego pliku. Nie aktualizuje się sama; aby ją odświeżyć, prosimy zaimportować nowy plik.',
        uploading: 'Importowanie pliku…',
        done: 'Plik został zaimportowany. Listy, które tu widać, pochodzą z tego pliku.',
        unavailable: 'Import pliku nie jest tu jeszcze możliwy. Przycisk zostanie wkrótce włączony.',
        errors: {
          wrong_file: 'To nie wygląda na plik linków z Search Console. Można tu przesłać tylko pliki CSV z raportu linków.',
          empty: 'Plik jest pusty albo nie znaleźliśmy w nim żadnego linku. Prosimy spróbować wyeksportować go ponownie.',
          too_big: 'Pliki są za duże. Maksimum to 4 MB łącznie.',
          too_many_files: 'Za dużo plików. Na jeden import można wybrać do 5 plików CSV.',
          no_file: 'Nie wybrano pliku. Prosimy wybrać pliki CSV i spróbować ponownie.',
          unavailable: 'Import pliku nie jest tu jeszcze możliwy. Prosimy spróbować później.',
          generic: 'Nie udało się zaimportować pliku. Prosimy spróbować ponownie.',
        },
        sites: { title: 'Witryny, które do Państwa prowadzą', site: 'Witryna', linkingPages: 'Strony linkujące', targetPages: 'Strony docelowe' },
        pages: { title: 'Strony, do których najczęściej prowadzą linki', page: 'Strona', incomingLinks: 'Linki przychodzące', linkingSites: 'Witryny linkujące' },
        latest: { title: 'Najnowsze linki', linkingPage: 'Strona linkująca', lastCrawled: 'Ostatnio odczytane' },
        showAll: (n: number) => `Pokaż wszystko (${n})`,
        showLess: 'Pokaż mniej',
        shownOf: (shown: number, total: number) => `Pokazane: ${shown} z ${total} z pliku`,
        listEmpty: 'Plik nie zawiera tej listy.',
      },
    },
    internal: {
      title: 'Linki między Państwa stronami',
      description: 'Kiedy piszemy artykuł, planujemy w nim linki do odpowiednich stron i artykułów Państwa witryny. Tutaj widać, co już jest podlinkowane, a co jeszcze czeka.',
      linksBetween: 'Linki z artykułów do Państwa witryny',
      noIncoming: 'Artykuły, do których nie prowadzi żaden inny artykuł',
      pending: 'Linki czekające na wstawienie',
      orphanPages: 'Strony witryny bez żadnego linku wewnętrznego',
      fromArticles: 'Na podstawie artykułów, które napisaliśmy',
      fromScan: 'Na podstawie ostatniego odczytu Państwa witryny',
      notScanned: 'Państwa witryna nie została jeszcze odczytana',
      listTitle: 'Artykuły',
      linksOut: (n: number) =>
        n === 0
          ? 'Nie prowadzi do żadnej strony Państwa witryny'
          : n === 1
            ? 'Prowadzi do 1 strony'
            : `Prowadzi do ${n} ${plPick(n, 'strony', 'stron', 'stron')}`,
      linksIn: (n: number) =>
        n === 0
          ? 'Żaden artykuł tu nie prowadzi'
          : n === 1
            ? '1 artykuł tu prowadzi'
            : `${n} ${plPick(n, 'artykuł', 'artykuły', 'artykułów')} tu ${plPick(n, 'prowadzi', 'prowadzą', 'prowadzi')}`,
      notPublished: 'Jeszcze nieopublikowane',
      published: 'Opublikowane',
      draft: 'Szkic',
      pendingCount: (n: number) =>
        n === 1 ? '1 link czeka' : `${n} ${plPick(n, 'link czeka', 'linki czekają', 'linków czeka')}`,
      pendingItem: (title: string, anchor: string) => `Do „${title}”, na słowach „${anchor}”`,
      openArticle: 'Otwórz artykuł',
      openArticleHint: 'W edytorze artykułu każdy czekający link wstawia się jednym kliknięciem.',
      orphanTitle: 'Strony, do których nic nie prowadzi',
      orphanBody: 'Google trudno dociera do strony, do której nie prowadzi żadna inna strona witryny. Jeśli piszą Państwo o pokrewnym temacie, warto poświęcić jej link.',
      orphanMore: (n: number) => `i jeszcze ${n} ${plPick(n, 'strona', 'strony', 'stron')}`,
      moreArticles: (n: number) => `Pokazujemy pierwsze artykuły: ${n}`,
      empty: {
        title: 'Państwa pierwszy artykuł zaczyna mapę',
        body: 'Gdy napiszemy choć jeden artykuł, zobaczą Państwo tutaj, do jakich stron prowadzi, co prowadzi do niego i jakie linki jeszcze czekają.',
        cta: 'Przejdź do strategii treści',
      },
      error: 'Nie udało się wczytać linków między Państwa stronami.',
    },
    policy: {
      title: 'Linki płatne i wymiana linków',
      body: 'Prosimy nie płacić za linki i nie zaczynać „linku za link”. Google widzi w tym „system wymiany linków” i może obniżyć pozycję witryny. Link z katalogu, z artykułu albo od organizacji, którą Państwo sami wybrali, jest najbezpieczniejszy i najmocniejszy. W naszej sieci linków nie ma wymiany: ten, kto dostaje od Państwa link, nigdy nie prowadzi z powrotem do Państwa.',
      link: 'Zasady Google dotyczące spamu',
    },
    network: {
      loading: 'Wczytywanie sieci linków…',
      loadError: 'Nie udało się wczytać sieci linków. Prosimy spróbować za chwilę.',
      stats: {
        received: 'Linki otrzymane od klientów Go Top SEO',
        given: 'Linki dane klientom Go Top SEO',
        waiting: 'Czeka na publikację',
        sinceJoining: 'Od Państwa przystąpienia',
        countsStart: 'Liczenie zaczyna się w chwili włączenia',
      },
      hero: {
        overline: 'Sieć linków',
        badge: { on: 'Aktywna', notPlacing: 'Aktywna, wstawianie wstrzymane', off: 'Wyłączona', notAvailable: 'Jeszcze niedostępna' },
        title: {
          on: 'Sieć linków jest aktywna dla Państwa witryny',
          notPlacing: 'Państwa witryna jest w sieci, ale teraz nie wstawiamy żadnego nowego linku',
          off: 'Sieć linków jest dla tej witryny wyłączona',
          cannotJoin: 'Aby przystąpić do sieci, prosimy najpierw potwierdzić, że witryna naprawdę należy do Państwa',
        },
        body: {
          on: 'Firmy uzupełniające w sieci mogą prowadzić do Państwa ze swoich artykułów, a Państwo do nich. Nigdy w obu kierunkach, nigdy konkurent.',
          off: (members: string | null) => `Po włączeniu inni klienci Go Top SEO z uzupełniających branż (nigdy konkurenci) będą prowadzić do Państwa z prawdziwych artykułów, a Państwo będą prowadzić do innych członków sieci. ${members ? `Liczba witryn, które już przystąpiły do sieci: ${members}.` : 'Sieć jest w budowie.'}`,
          cannotJoin: 'Prosimy połączyć ją przez WordPressa (albo wtyczkę Go Top) lub przez Search Console, a potem włączyć sieć.',
          left: (date: string) => `Państwo wyszli z niej ${date}. Linki już opublikowane zostają w dzienniku.`,
        },
        turnOn: 'Włącz sieć linków',
        promisesLabel: 'Zasady sieci',
        promises: ['Bez linków wzajemnych: witryna, która dostaje od Państwa link, nigdy nie prowadzi z powrotem do Państwa', 'Słowa linku pochodzą z artykułu i pasują do treści', 'Nigdy konkurent, nigdy firma z Państwa własnej branży'],
        unavailable: {
          badge: 'Niedostępna',
          title: 'Sieć linków nie jest dostępna dla tej witryny',
          off: 'Nie udało się teraz wczytać sieci linków. Prosimy spróbować za chwilę.',
        },
        connect: 'Połącz witrynę',
        completeCategory: 'Prosimy uzupełnić branżę swojej firmy',
      },
      how: {
        title: 'Tak to działa',
        toggle: 'Tak to działa i jakie zasady Państwa chronią',
        steps: [
          'Kiedy piszemy artykuł dla uzupełniającej firmy z sieci, może on zawierać naturalny link do jednej z Państwa pasujących stron, w zdaniu, które już tam jest.',
          'Kiedy piszemy artykuł dla Państwa, może on zawierać link do strony uzupełniającej firmy. Państwo widzą go tutaj przed publikacją i mogą go usunąć.',
          'Bez wymiany linków: witryna, która dostaje od Państwa link, nie prowadzi z powrotem do Państwa, a konkurent nigdy nie dostaje od Państwa linku.',
        ],
      },
      rules: {
        title: 'Zasady, które Państwa chronią',
        items: [
          'Nigdy konkurent i nigdy firma z tej samej branży.',
          'Nigdy linki wzajemne i żadne krótkie kręgi między trzema witrynami.',
          'Nigdy między witrynami tego samego właściciela ani na tym samym serwerze.',
          'Najwyżej jeden link na artykuł, w akapicie w tekście głównym. Nigdy w stopce, na liście linków ani w bloku autora.',
          'Niewiele linków miesięcznie, ze stopniowym narastaniem w pierwszych miesiącach. Żadnego tekstu linku powtarzającego słowo kluczowe.',
          'Bez wstawiania przy słabym dopasowaniu i nigdy do witryn nowych albo o ubogiej treści.',
        ],
      },
      linkType: {
        follow: 'Linki z sieci są zwykłymi linkami (follow), które Google liczy jako rekomendację.',
        nofollow: 'Linki z sieci są oznaczone jako nofollow: Google nie liczy ich jako rekomendacji przy ustalaniu pozycji.',
      },
      switch: {
        label: 'Udział w sieci linków',
        on: 'Aktywny',
        off: 'Wyłączony',
        onDescription: (date: string) => `W sieci od ${date}. Zawsze można z niej wyjść.`,
        offDescription: 'Wyłączony. Włączy się dopiero po zaakceptowaniu warunków.',
        cannotJoinDescription: 'Można to włączyć, gdy witryna będzie połączona.',
      },
      consent: {
        title: 'Przed przystąpieniem do sieci',
        intro: 'Udział działa w dwie strony. Dopóki przełącznik jest włączony:',
        points: [
          'Artykuły, które piszemy dla Państwa, mogą zawierać link wychodzący do strony innej uzupełniającej firmy z sieci, w zdaniu, które już tam jest.',
          'Artykuły, które piszemy dla innych firm z sieci, mogą zawierać linki do stron Państwa witryny.',
          'Każdy link jest zapisywany dla obu stron. Link, który Państwo dali, pojawia się tutaj przed publikacją artykułu i można go usunąć.',
          'Zawsze można opuścić sieć. Wyjście zatrzymuje nowe linki; linki już opublikowane zostają na witrynach i w dzienniku.',
        ],
        risk: 'Warto wiedzieć: Google może uznać linki służące wpływaniu na pozycje za system wymiany linków, a zasady mogą się zmienić. To może kosztować witrynę widoczność, a nawet doprowadzić do ręcznego działania ze strony Google. Przystępując do sieci, Państwo potwierdzają, że rozumieją i przyjmują to ryzyko.',
        checkbox: 'Przeczytałem warunki sieci linków i zgadzam się z nimi',
        terms: 'Pełny tekst znajduje się w regulaminie',
        join: 'Przystąp do sieci',
        cancel: 'Nie teraz',
        error: 'Nie udało się tego zapisać. Prosimy spróbować za chwilę.',
      },
      leave: {
        title: 'Opuścić sieć linków?',
        body: 'Nie będziemy już wstawiać nowych linków z Państwa artykułów ani żadnych do Państwa witryny. Linki już opublikowane zostają na witrynach i w dzienniku.',
        confirm: 'Opuść sieć',
        error: 'Nie udało się wyprowadzić Państwa z sieci. Prosimy spróbować za chwilę.',
      },
      readiness: {
        thin_or_new: 'Do wstawiania nowych linków potrzebne są: co najmniej trzy opublikowane artykuły albo dziesięć przeanalizowanych stron, ukończona analiza i dwa tygodnie korzystania z aplikacji.',
        category_unknown: 'Państwa witryna jest w sieci, ale nie znamy jeszcze jej branży: dlatego nie wstawiamy linków ani z niej, ani do niej. Branżę można uzupełnić w ustawieniach witryny.',
        domain_unverified: 'Państwa witryna jest w sieci, ale nie bierze udziału we wstawianiu: brakuje jej połączenia (WordPress albo Search Console), więc nie możemy ustalić, że witryna należy do Państwa. Prosimy połączyć ją ponownie, aby wziąć udział.',
      },
      gap: {
        label: 'Brakuje jeszcze:',
        articles: (n: number) =>
          n === 1 ? 'jeszcze jednego opublikowanego artykułu' : `jeszcze ${n} ${plPick(n, 'opublikowanego artykułu', 'opublikowanych artykułów', 'opublikowanych artykułów')}`,
        scan: 'ukończonej analizy',
        days: (n: number) =>
          n === 1 ? 'jeszcze jednego dnia w aplikacji' : `jeszcze ${n} ${plPick(n, 'dnia', 'dni', 'dni')} w aplikacji`,
      },
      caps: (received: number, cap: number) => `W tym miesiącu otrzymali Państwo ${received} z ${cap} możliwych linków. Liczba narasta stopniowo w pierwszych miesiącach w sieci.`,
      log: {
        title: 'Dziennik wstawień',
        description: 'Wszystkie zapisane linki, dla obu stron: gdzie, na jakich słowach i kiedy.',
        segmentLabel: 'Która strona',
        received: 'Otrzymane',
        given: 'Dane',
        fromSite: (domain: string) => `Z ${domain}`,
        fromNetworkSite: 'Z witryny z sieci (jej adres stanie się widoczny po opublikowaniu artykułu)',
        inArticle: (title: string) => `W artykule „${title}”`,
        articleGone: 'Artykuł został usunięty',
        toPage: 'Do strony',
        anchor: 'Na słowach',
        placedOn: (date: string) => `Wstawione ${date}`,
        states: {
          waiting: 'Czeka na publikację',
          published: 'Opublikowane',
          rejected: 'Usunięte przed publikacją',
          removed: 'Nie ma go już w artykule',
        },
        openLive: 'Otwórz opublikowaną stronę',
        openArticle: 'Otwórz artykuł',
        remove: 'Usuń',
        removeConfirm: {
          title: 'Usunąć link z artykułu?',
          body: 'Link wyjdzie ze szkicu, a słowa zostaną dokładnie takie, jakie są. Żaden inny link nie wejdzie na jego miejsce.',
          confirm: 'Usuń link',
        },
        removed: 'Link został usunięty z artykułu.',
        removeError: 'Nie udało się usunąć linku. Prosimy spróbować za chwilę.',
        removePublished: 'Artykuł został już opublikowany: dlatego linku nie można usunąć z tego miejsca.',
        emptyReceived: {
          title: 'Nie otrzymali Państwo jeszcze żadnych linków',
          body: 'Kiedy napiszemy artykuł dla uzupełniającej firmy, do której pasuje jedna z Państwa stron, zobaczą tutaj, gdzie pojawił się link.',
        },
        emptyGiven: {
          title: 'Nie dali Państwo jeszcze żadnych linków',
          body: 'Kiedy wstawimy link w jednym z Państwa artykułów, pojawi się tutaj przed publikacją i będzie można go usunąć.',
        },
        notJoined: 'Po przystąpieniu do sieci pojawi się tutaj każdy otrzymany i każdy dany link.',
        history: (n: number) =>
          n === 1
            ? 'Jeden link, którego nie ma już w Państwa artykule'
            : `${n} ${plPick(n, 'link, którego nie ma już', 'linki, których nie ma już', 'linków, których nie ma już')} w swoich artykułach`,
      },
    },
  },
}

export {}

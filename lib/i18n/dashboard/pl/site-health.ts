/**
 * SITE HEALTH in Polish: the scan, the score, the findings, the one-click
 * fixes (preview, approval, fix queue, automatic fixes) and the step-by-step
 * guides per platform.
 *
 * Register as set out in chrome.ts: prose keeps Państwo, controls take the bare
 * imperative ("Zapisz", "Anuluj", "Zatwierdź").
 *
 * Vocabulary. The scan is "skanowanie", a finding is "ustalenie" and a fix is
 * "poprawka" ("naprawić" for the act). The discipline is "pozycjonowanie", the
 * search terms are "słowa kluczowe", and Polish does not weld compounds, so the
 * genitive chain is the correct form: "analiza strony", "opis dla Google",
 * "mapa witryny". A website is "witryna" or "strona"; "witryna" is used where
 * the whole site is meant and "strona" where one page is.
 *
 * Counting. Polish has three agreement classes (1 / 2-4 / 0 and 5+), and 12, 13
 * and 14 take the last of them although they end in 2, 3 and 4, so the Dutch
 * two-branch ternaries cannot be carried over. Every counted noun here goes
 * through plPick from ./plural. Where the figure arrives already formatted as a
 * string, the noun is put in front of it so it governs rather than agrees
 * ("Przeczytane strony: 7"), which is correct for every count.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'
import { plPick } from './plural'

export const siteHealthPl: DeepPartial<DashboardDictionary> = {
  siteHealth: {
    title: 'Stan witryny',
    subtitle: 'Jedna ocena całej witryny i lista, zwykłymi słowami, tego co warto poprawić. Część naprawiamy jednym kliknięciem, a dla pozostałych jest instrukcja krok po kroku.',
    scanAgain: 'Skanuj ponownie',
    scanFirst: 'Przeskanuj moją witrynę',
    scanning: 'Skanujemy witrynę',
    stage: {
      pages: (done: number, total: number) => `Czytamy strony · ${done} z ${total}`,
      links: (done: number, total: number) => `Sprawdzamy linki · ${done} z ${total}`,
      site: 'Sprawdzamy mapę witryny i ustawienia ogólne',
    },
    scanningNote: 'Zwykle zajmuje to pół minuty. Czytamy wyłącznie strony publiczne, dokładnie tak jak każdy odwiedzający.',
    checkedAt: (when: string) => `Przeskanowano ${when}`,
    pagesChecked: (n: number) => `${n} ${plPick(n, 'przeczytana strona', 'przeczytane strony', 'przeczytanych stron')}`,
    partial: 'Nie wszystkie strony, które chcieliśmy przeczytać, dały się przeczytać, więc ten obraz jest niepełny. Kolejne skanowanie go uzupełni.',
    score: {
      label: 'Ocena witryny',
      outOf: 'na 100',
      howTitle: 'Jak liczymy ocenę',
      how: 'Zaczynamy od 100. Każdy rodzaj pilnego problemu odejmuje do 15 punktów, problem ważny do 6, a drobne ulepszenie do 2. Każda naprawiona strona natychmiast oddaje swoją część punktów, a kolejne skanowanie potwierdza poprawkę na samej witrynie.',
      afterFixes: (points: number, pages: number) =>
        `${points > 0 ? `${points} ${plPick(points, 'punkt', 'punkty', 'punktów')} więcej` : 'poprawki uwzględnione w ocenie'} po ${pages} ${plPick(pages, 'poprawce', 'poprawkach', 'poprawkach')}. Kolejne skanowanie potwierdzi je na witrynie.`,
      band: {
        excellent: 'Witryna jest w doskonałym stanie',
        good: 'Witryna jest w dobrym stanie',
        fair: 'Kilka rzeczy do poprawienia',
        poor: 'Warto naprawić bez zwlekania',
      },
    },
    severity: {
      urgent: 'Pilne',
      important: 'Ważne',
      minor: 'Drobne ulepszenie',
    },
    counts: {
      findings: (n: number) => `${n} ${plPick(n, 'ustalenie', 'ustalenia', 'ustaleń')}`,
      fixable: (n: number) => `${n} z nich da się naprawić jednym kliknięciem`,
      urgent: (n: number) => `${n} ${plPick(n, 'pilne', 'pilne', 'pilnych')}`,
    },
    filters: {
      label: 'Pokaż',
      all: 'Wszystko',
      fixable: 'Naprawa jednym kliknięciem',
      guide: 'Instrukcja',
    },
    pages: (n: number) => `${n} ${plPick(n, 'strona', 'strony', 'stron')}`,
    links: (n: number) => `${n} ${plPick(n, 'link', 'linki', 'linków')}`,
    moreTitle: 'Więcej',
    more: (n: number) => `i jeszcze ${n}`,
    home: 'Strona główna',
    foundOn: 'Podlinkowane z',
    chars: (n: number) => `${n} ${plPick(n, 'znak', 'znaki', 'znaków')}`,
    imagesMissing: (n: number) => `${n} ${plPick(n, 'obraz bez opisu', 'obrazy bez opisu', 'obrazów bez opisu')}`,
    imagesInTheme: (n: number) => `jeszcze ${n} w motywie`,
    headings: (n: number) => `${n} ${plPick(n, 'nagłówek główny', 'nagłówki główne', 'nagłówków głównych')}`,
    sameAs: (n: number) => `Takie samo na ${n} ${plPick(n, 'stronie', 'stronach', 'stronach')}`,
    whyLabel: 'Dlaczego to ma znaczenie',
    fixForMe: 'Napraw to za mnie',
    fixForMeAria: (page: string) => `Napraw to za mnie: ${page}`,
    createText: 'Przygotuj tekst',
    createTextAria: (page: string) => `Przygotuj tekst pliku llms.txt: ${page}`,
    showSteps: 'Jak to naprawić',
    hideSteps: 'Ukryj instrukcję',
    openInShopify: 'Otwórz w Shopify',
    inTheme: 'Problem nie leży w treści tej strony, lecz w motywie sklepu, w menu albo w produkcie, dlatego nie ma tu automatycznej poprawki. Poniższe kroki pokazują, jak to naprawić.',
    inProduct: 'Chodzi o zdjęcia samego produktu: ich opisy zapisuje się przy produkcie, w jego mediach. Dostęp Go Top do sklepu obejmuje artykuły i strony, więc tę poprawkę wykonuje się w Shopify. Poniższe kroki pokazują, jak.',
    inBuilder: 'Ta strona została zbudowana w kreatorze stron (na przykład Elementor), który wyświetla ją z własnych danych. Zmiana w tekście strony nie pojawiłaby się na witrynie, dlatego nie ma tu automatycznej poprawki. Można to naprawić w kreatorze, według poniższych kroków.',
    productPage: 'To jest strona produktu. Dostęp Go Top do sklepu obejmuje artykuły i strony, więc tę poprawkę wykonuje się w Shopify. Poniższe kroki pokazują, jak.',
    collectionPage: 'To jest strona kolekcji. Dostęp Go Top do sklepu obejmuje artykuły i strony, więc tę poprawkę wykonuje się w Shopify. Poniższe kroki pokazują, jak.',
    schemaFromTheme: 'W sklepie Shopify dane strukturalne pochodzą z motywu (albo z aplikacji motywu), więc dodaje się je w ustawieniach motywu sklepu lub przez jego twórcę, a nie na tej stronie.',
    themeAltMedia: 'Część tych obrazów znajduje się w bibliotece mediów WordPressa. Opis wpisuje się tam, i to naprawia je na wszystkich stronach.',
    themeAlt: (pages: number, images: number) =>
      `Na ${pages} ${plPick(pages, 'stronie', 'stronach', 'stronach')} obrazy bez opisu leżą w motywie witryny (nagłówek, stopka, kafelki produktów), a nie w tekście strony${images > 0 ? ` (do ${images} na stronę)` : ''}. Wystarczy naprawić je raz w edytorze motywu i wszystkie strony są naprawione. Poniższe kroki pokazują, jak.`,
    openPage: 'Otwórz stronę',
    stepsTitle: 'Jak to naprawić',
    fixedBadge: 'Naprawione',
    queuedBadge: 'W kolejce poprawek',
    connectHint: {
      wordpress: 'Po podłączeniu witryny WordPress w ustawieniach tytuły, opisy, opisy obrazów i linki da się naprawić jednym kliknięciem, zawsze po tym, jak Państwo zobaczą i zatwierdzą każdą zmianę.',
      shopify: 'W sklepie Shopify naprawiamy artykuły i strony, wyłącznie po zatwierdzeniu każdej poprawki, i każdą poprawkę da się wycofać. Produktów i kolekcji nigdy nie ruszamy: przy każdym takim ustaleniu jest instrukcja krok po kroku, z bezpośrednim linkiem do strony w panelu sklepu.',
      wix: 'Na witrynach Wix poprawki wprowadza się w edytorze Wix. Przy każdym ustaleniu jest instrukcja krok po kroku.',
      other: 'Przy każdym ustaleniu jest instrukcja krok po kroku. Jeśli witryna została zbudowana na WordPressie, część naprawimy, gdy tylko podłączą ją Państwo w ustawieniach.',
    },
    connectCta: 'Podłącz witrynę',
    empty: {
      title: 'Witryna nie była jeszcze skanowana',
      body: 'Skanowanie czyta stronę główną i do 24 innych stron, sprawdza linki i mapę witryny, a potem podaje ocenę i czytelną listę tego, co warto poprawić. Na witrynie nic się nie zmienia.',
      points: [
        'Tytuły i opisy, które pojawiają się w Google',
        'Obrazy, linki i zapomniane strony',
        'Ustawienia, które blokują Google albo asystentów AI',
      ],
    },
    clean: {
      title: 'Nie ma nic do naprawienia',
      body: 'Na wszystkich przeczytanych stronach tytuły, opisy, obrazy i linki są w porządku. Prosimy przeskanować ponownie po dodaniu nowych stron.',
    },
    blocked: 'Witryna nie pozwala nam się czytać (robots.txt), dlatego sprawdziliśmy tylko ustawienia ogólne.',
    errors: {
      unauthorized: 'Aby kontynuować, trzeba zalogować się ponownie.',
      not_found: 'Nie znaleźliśmy tej witryny na koncie.',
      invalid_request: 'Coś było nie w porządku z żądaniem. Prosimy odświeżyć stronę i spróbować jeszcze raz.',
      site_unreachable: 'Witryna była nieosiągalna. Prosimy sprawdzić, czy adres w ustawieniach witryny jest poprawny i czy witryna działa.',
      site_blocked: 'Tego adresu nie da się przeskanować. Prosimy sprawdzić adres witryny w ustawieniach.',
      scan_failed: 'Skanowanie nie zostało ukończone. Prosimy spróbować za chwilę.',
      no_connection: 'Witryna nie jest teraz podłączona. Prosimy podłączyć WordPress w ustawieniach i spróbować ponownie.',
      not_in_wordpress: 'Nie znaleźliśmy tej strony w WordPressie, więc nie da się jej zmienić z tego miejsca. Można naprawić ją według instrukcji.',
      needs_seo_plugin: 'WordPress nie ma pola na opis dla Google. Prosimy zainstalować wtyczkę SEO, na przykład Yoast, i wtedy będziemy mogli go napisać.',
      needs_bridge: 'Aby zapisać to we wtyczce SEO, potrzebujemy wtyczki Go Top na witrynie. Można ją pobrać i zainstalować w sekcji „poprawki na witrynie” na górze tej strony albo naprawić to według instrukcji.',
      nothing_to_fix: 'Po ponownym sprawdzeniu strona jest już w porządku. Nie ma nic do zmiany.',
      no_safe_place: 'Nie znaleźliśmy istniejącego zdania, w którym kilka słów mogłoby stać się linkiem bez zmiany tekstu. Można samodzielnie dodać link według instrukcji.',
      changed_since_preview: 'Strona zmieniła się po podglądzie, więc nic nie zostało zapisane. Prosimy otworzyć poprawkę ponownie.',
      approval_required: 'Nic nie zostało zapisane: zmianę trzeba zatwierdzić w podglądzie.',
      use_fix_queue: 'Nic nie zostało zapisane. Prosimy odświeżyć stronę: poprawki idą teraz przez kolejkę poprawek, z zatwierdzaniem i wycofywaniem.',
      wordpress_permission: 'WordPress nie przyjął zmiany. Podłączony użytkownik może nie mieć uprawnień do edycji albo hasło aplikacji zostało unieważnione.',
      wordpress_unreachable: 'WordPress był w tej chwili nieosiągalny. Prosimy spróbować za moment.',
      write_not_confirmed: 'Zmiana została wysłana, ale WordPress nie zwrócił nowej wartości. Prosimy sprawdzić stronę w edytorze przed kolejną próbą.',
      value_invalid: 'Wartość jest pusta albo nieprawidłowa. Prosimy wpisać tekst i spróbować ponownie.',
      off_site: 'Naprawiać można tylko strony z witryny tego projektu.',
    },
    preview: {
      title: {
        title: 'Nowy tytuł dla Google',
        description: 'Nowy opis dla Google',
        alt: 'Opisy obrazów',
        link: 'Link do zapomnianej strony',
      },
      loading: 'Czytamy stronę z WordPressa …',
      page: 'Strona',
      before: 'Teraz',
      after: 'Po poprawce',
      empty: 'Puste',
      editHint: 'To nasza propozycja, napisana z tekstu samej strony. Można ją zmienić przed zatwierdzeniem.',
      editLabel: {
        title: 'Nowy tytuł',
        description: 'Nowy opis',
        alt: 'Opis obrazu',
      },
      length: (n: number, min: number, max: number) => `${n} ${plPick(n, 'znak', 'znaki', 'znaków')} · zalecane od ${min} do ${max}`,
      tooLong: 'Dłuższy niż zalecany, Google może go obciąć',
      tooShort: 'Krótszy niż zalecany',
      good: 'Dobra długość',
      googleLook: 'Tak wygląda to w Google',
      viaSeo: 'Zapisujemy to we wtyczce SEO witryny. Tekst strony się nie zmienia.',
      viaTitle: 'Zmieniamy nazwę strony w WordPressie. Jeśli we wtyczce SEO ustawiono własny tytuł, Google nadal będzie pokazywać tamten.',
      altNote: 'Dodajemy opis tylko do obrazów w treści strony, które go nie mają. Obrazy motywu (logo, nagłówek) pozostają bez zmian.',
      linkFrom: 'Na stronie',
      linkNote: 'Zamieniamy w link słowa, które już są na stronie. Żadne słowo nie zostaje dodane ani usunięte.',
      linkWords: 'Słowa, które staną się linkiem',
      noChange: 'Na witrynie nic się nie zmieni, dopóki nie potwierdzą tego Państwo przyciskiem zatwierdzenia.',
      approve: 'Zatwierdź i zapisz na witrynie',
      cancel: 'Anuluj',
      applied: 'Zapisane na witrynie',
      appliedBody: 'Zmiana jest już online. Google zobaczy ją, gdy następnym razem przeczyta stronę.',
      already: 'Na witrynie jest już aktualne',
      undo: 'Wycofaj zmianę',
      undoFailed: 'Nie udało się w tej chwili wycofać zmiany. Nowa wartość nadal jest na witrynie; prosimy spróbować za moment.',
      undone: 'Zmiana została wycofana i poprzednia wartość wróciła',
      close: 'Zamknij',
    },
    toast: {
      saved: 'Poprawka jest na witrynie',
      undone: 'Zmiana została wycofana',
    },
    autofix: {
      connection: {
        label: 'Poprawki na witrynie',
        none: {
          title: 'Możemy wykonać poprawki za Państwa',
          body: 'Po zainstalowaniu wtyczki Go Top w WordPressie od tego momentu zapisujemy na witrynie każdą zatwierdzoną poprawkę: tytuły, opisy, adres kanoniczny, główne słowo kluczowe, opisy obrazów, FAQ, dane strukturalne i linki. Każda poprawka jest zatwierdzana osobno i da się ją wycofać.',
        },
        appPassword: {
          title: 'Część poprawek jest już dostępna',
          body: 'Przy obecnym połączeniu z WordPressem możemy naprawiać tytuły, opisy, opisy obrazów, linki i FAQ. Adres kanoniczny, główne słowo kluczowe i dane strukturalne wymagają wtyczki Go Top.',
        },
        pending: {
          title: 'Czekamy na połączenie wtyczki',
          body: 'Gdy wtyczka będzie zainstalowana, a kod wklejony, prosimy kliknąć „sprawdź połączenie”.',
        },
        connected: {
          title: 'Wtyczka jest połączona',
          body: 'Każdą zatwierdzoną poprawkę wtyczka zapisuje na witrynie. Poprzednia wartość zostaje zachowana i każdą poprawkę da się wycofać.',
        },
        disconnected: {
          title: 'Wtyczka nie jest teraz połączona',
          body: 'Wtyczka na witrynie była nieosiągalna. Dopóki połączenie nie wróci, zatwierdzone poprawki oznaczamy do ręcznego wprowadzenia i nic nie zapisujemy na witrynie.',
        },
        rekey: {
          title: 'Połącz wtyczkę ponownie',
          body: 'Wtyczka jest na witrynie, ale jej połączenie trzeba odnowić. Wystarczy wygenerować nowy kod połączenia i wkleić go do wtyczki. W tym czasie zatwierdzone poprawki oznaczamy do ręcznego wprowadzenia i nic nie zapisujemy na witrynie.',
        },
        reconnect: 'Połącz ponownie',
        update: {
          title: 'Nowa wersja wtyczki jest gotowa',
          body: (v: string) => `Wersja ${v} jest na WordPress.org: publikuje artykuły bez hasła aplikacji i sama się tam aktualizuje. Wszystko, co działa teraz, działa dalej, dopóki nie przejdą Państwo na nową wersję.`,
          action: 'Zaktualizuj wtyczkę',
        },
        webhook: {
          title: 'Poprawki idą na serwer',
          body: 'Witryna jest połączona przez webhook. Każdą zatwierdzoną poprawkę wysyłamy na serwer razem z nową i starą wartością i oznaczamy jako „wysłaną”. Programista nakłada ją na witrynę.',
        },
        install: 'Zainstaluj wtyczkę',
        manage: 'Zarządzaj wtyczką',
        check: 'Sprawdź połączenie',
        seoPlugin: {
          yoast: 'Yoast SEO',
          rankmath: 'Rank Math',
          none: 'Brak wtyczki SEO',
        },
        version: (v: string) => `Wersja ${v}`,
        lastSeen: (when: string) => `Ostatnie połączenie ${when}`,
      },
      plugin: {
        title: 'Wtyczka Go Top',
        intro: 'Wtyczka publikuje na witrynie artykuły przesłane przez Go Top SEO i zapisuje wyłącznie zatwierdzone poprawki, jedną po drugiej. Nigdy nie usuwa treści i nigdy nie rusza cen ani produktów, motywu, wtyczek, ustawień czy użytkowników.',
        rekeyNotice: 'Połączenie wtyczki trzeba odnowić. Jeśli wtyczka już tam jest, można przejść do kroku 2 i wygenerować nowy kod połączenia.',
        step: (n: number) => `Krok ${n}`,
        install: {
          title: 'Zainstaluj wtyczkę z WordPress.org',
          body: 'W kokpicie: Wtyczki, Dodaj wtyczkę. Prosimy wyszukać „GO TOP SEO Bridge”, kliknąć „zainstaluj teraz”, a potem „włącz”. Nie ma żadnego pliku do pobierania.',
          action: 'Znajdź wtyczkę w WordPressie',
          page: 'Wtyczka na WordPress.org',
        },
        pair: {
          title: 'Połącz wtyczkę',
          auto: 'Witryna jest już z nami połączona hasłem aplikacji, więc wtyczka łączy się jednym kliknięciem.',
          code: 'W WordPressie: Ustawienia, a potem GO TOP SEO. Prosimy wkleić kod i kliknąć „połącz”.',
          autoAction: 'Połącz automatycznie',
          makeCode: 'Wygeneruj kod połączenia',
          newCode: 'Wygeneruj nowy kod',
          codeLabel: 'Kod połączenia',
          codeNote: 'Kod pokazujemy tylko raz. Nowy kod unieważnia poprzedni.',
          copy: 'Kopiuj kod',
          copied: 'Kod skopiowany',
          orCode: 'Albo połącz kodem',
        },
        checking: 'Sprawdzamy połączenie …',
        connected: 'Wtyczka jest połączona. Od teraz zatwierdzone poprawki zapisujemy na witrynie.',
        disconnect: 'Odłącz wtyczkę',
        disconnectConfirm: {
          title: 'Odłączyć wtyczkę?',
          body: 'Dopóki nie połączą się Państwo ponownie, nie możemy zapisywać na witrynie. Poprawki, które już zostały zapisane, pozostają na witrynie.',
          confirm: 'Odłącz',
        },
        disconnected: 'Wtyczka została odłączona',
        update: {
          title: 'Przejdź na wtyczkę z WordPress.org',
          notice: (installed: string, latest: string) => `Na witrynie jest wersja ${installed}, pobrana od nas. Wersja ${latest} pochodzi z WordPress.org: publikuje artykuły bez hasła aplikacji i sama się tam aktualizuje. Instaluje się jako nowa wtyczka, więc przejście ma trzy kroki, a na końcu łączą się Państwo ponownie. W tym czasie wszystko działa tak jak teraz.`,
          deactivate: {
            title: 'Wyłącz starą wtyczkę',
            body: 'W kokpicie: Wtyczki. Prosimy kliknąć „wyłącz” obok GO TOP SEO Bridge w starej wersji. WordPress nie włączy nowej wtyczki, dopóki stara jest aktywna. Prosimy teraz nie usuwać starej: jej usunięcie usuwa też połączenie. Jeśli chcą ją Państwo usunąć, prosimy zrobić to przed nowym połączeniem, nie po nim.',
            action: 'Otwórz stronę wtyczek',
          },
          install: {
            title: 'Zainstaluj i włącz nową',
            body: 'Wtyczki, Dodaj wtyczkę. Prosimy wyszukać „GO TOP SEO Bridge”, kliknąć „zainstaluj teraz”, a potem „włącz”.',
            action: 'Znajdź wtyczkę w WordPressie',
          },
          pair: {
            title: 'Połącz ponownie',
          },
          done: (v: string) => `Wersja ${v} jest połączona. Od teraz wtyczka publikuje artykuły i nakłada poprawki.`,
        },
        close: 'Zamknij',
      },
      approve: {
        title: {
          seo_title: 'Nowy tytuł dla Google',
          meta_description: 'Nowy opis dla Google',
          canonical: 'Oficjalny adres strony',
          focus_keyphrase: 'Główne słowo kluczowe strony',
          image_alt: 'Opisy obrazów',
          faq_block: 'FAQ na dole strony',
          schema_jsonld: 'Dane strukturalne dla Google',
          broken_link: 'Naprawa zepsutego linku',
          internal_link: 'Link do zapomnianej strony',
          h1_demote: 'Tylko jeden nagłówek główny na stronie',
          llms_txt: 'Plik llms.txt dla asystentów AI',
        },
        loading: 'Czytamy stronę …',
        page: 'Strona',
        before: 'Teraz',
        after: 'Po poprawce',
        empty: 'Puste',
        lead: {
          plugin: 'Po kliknięciu „zatwierdź poprawkę” zapiszemy na witrynie, tylko na tej stronie:',
          app_password: 'Po kliknięciu „zatwierdź poprawkę” zapiszemy na witrynie, tylko na tej stronie:',
          webhook: 'Po kliknięciu „zatwierdź poprawkę” wyślemy na serwer następującą zmianę, tylko dla tej strony:',
          manual: 'Wtyczka nie jest teraz połączona. Po kliknięciu „zatwierdź poprawkę” zapiszemy następującą zmianę do ręcznego wprowadzenia, a na witrynie nic nie zapiszemy:',
          shopify: 'Po kliknięciu „zatwierdź poprawkę” zapiszemy w sklepie Shopify, tylko w tym artykule albo na tej stronie:',
        },
        what: {
          seo_title: 'Tytuł SEO strony zmieni się na:',
          meta_description: 'Opis dla Google zmieni się na:',
          canonical: 'Oficjalny adres strony zmieni się na:',
          focus_keyphrase: 'Główne słowo kluczowe strony we wtyczce SEO zmieni się na:',
          image_alt: (n: number) =>
            n === 1
              ? 'Jeden obraz bez opisu otrzyma opis napisany tutaj. Obrazy, które już mają opis, nie zmieniają się.'
              : `Liczba obrazów bez opisu, które otrzymają napisane tutaj opisy: ${n}. Obrazy, które już mają opis, nie zmieniają się.`,
          faq_block: (n: number) =>
            n === 1
              ? 'Na dole strony pojawi się blok FAQ z jednym pytaniem, dokładnie tak jak zostało napisane. Istniejący tekst się nie zmienia.'
              : `Na dole strony pojawi się blok FAQ, a liczba pytań w nim wyniesie ${n}, dokładnie tak jak zostały napisane. Istniejący tekst się nie zmienia.`,
          schema_jsonld: (types: string) => `Do kodu strony dodamy dane strukturalne typu ${types}. To, co widzą odwiedzający, się nie zmienia.`,
          brokenReplace: 'Zepsuty link będzie wskazywać ten adres. Słowa na stronie się nie zmieniają:',
          brokenUnlink: 'Zepsuty link zostanie usunięty, a jego słowa zostaną na stronie jako zwykły tekst.',
          internal_link: 'Zaznaczone słowa, które już są na stronie, staną się linkiem do zapomnianej strony. Żadne słowo nie zostaje dodane ani usunięte.',
          h1_demote: (n: number) =>
            n === 1
              ? 'Jeden zbędny nagłówek główny w treści strony stanie się podnagłówkiem (H2). Słowa i wygląd pozostają takie same.'
              : `Liczba zbędnych nagłówków głównych w treści strony, które staną się podnagłówkami (H2): ${n}. Ich słowa i wygląd pozostają takie same.`,
          llms_txt: 'Witryna zacznie odpowiadać tym tekstem pod adresem podanym poniżej. Na serwerze nie powstaje żaden plik, a jeśli dodadzą Państwo własny llms.txt, to on będzie miał pierwszeństwo.',
        },
        keep: 'Poprzednią wartość zachowujemy, a poprawkę da się wycofać z kolejki poprawek.',
        keepSent: 'Poprzednią wartość wysyłamy razem ze zmianą, żeby dało się ją przywrócić.',
        keepManual: 'Witryna się nie zmienia. Poprawka zostaje w kolejce i zawsze da się ją tam wycofać.',
        record: 'Zatwierdzenie zapisujemy: kto zatwierdził, kiedy i z jakiego adresu IP.',
        button: 'Zatwierdź poprawkę',
        cancel: 'Anuluj',
        close: 'Zamknij',
        undo: 'Wycofaj poprawkę',
        labels: {
          canonical: 'Oficjalny adres strony',
          canonicalHint: 'Zwykle adres samej strony, bez parametrów. Tylko adres z tej witryny.',
          focus: 'Główne słowo kluczowe',
          focusHint: 'Słowa, które ludzie wpisują w Google, aby znaleźć tę stronę, zwykle od 2 do 4 słów.',
          faqHeading: 'Nagłówek nad pytaniami',
          faqHeadingDefault: 'Często zadawane pytania',
          faqHint: 'Prosimy pisać pytania, które klienci naprawdę zadają, z krótkimi i jasnymi odpowiedziami. Nigdy nie wymyślamy odpowiedzi za Państwa.',
          question: (n: number) => `Pytanie ${n}`,
          answer: 'Odpowiedź',
          addQuestion: 'Dodaj pytanie',
          removeQuestion: (n: number) => `Usuń pytanie ${n}`,
          brokenHref: 'Zepsuty link',
          brokenWords: 'Podlinkowane słowa',
          brokenMode: 'Co zrobić z linkiem',
          replaceMode: 'Skierować go na istniejącą stronę',
          unlinkMode: 'Usunąć link',
          replacement: 'Poprawny adres',
          schemaCurrent: 'Dane strukturalne, które już są na stronie',
          schemaNone: 'Brak',
          schemaCode: 'Kod, który dodamy do strony',
          linkWords: 'Słowa, które staną się linkiem',
          linkTarget: 'Prowadzi do',
          alt: 'Opis obrazu',
          editHint: 'To nasza propozycja. Można ją zmienić przed zatwierdzeniem.',
          faqGenerated: 'Te pytania i odpowiedzi napisaliśmy wyłącznie z tego, co mówi sama strona, w jej języku. Prosimy je przeczytać, zmienić co trzeba i usunąć to, co nie pasuje.',
          faqThin: 'Strona ma za mało tekstu, aby wyciągnąć z niej pytania, a my niczego nie wymyślamy. Prosimy napisać pytania, które klienci naprawdę zadają, albo najpierw uzupełnić treść strony.',
          faqNoSuggestion: 'Nie dało się napisać pytań, na które strona sama odpowiada. Prosimy napisać pytania, które klienci naprawdę zadają, z krótkimi odpowiedziami.',
          h1Keep: 'Zostaje nagłówkiem głównym',
          h1Theme: 'Pochodzi z motywu',
          h1Content: 'Pierwszy w treści',
          h1Demote: 'Stanie się podnagłówkiem (H2)',
          h1Note: 'Zmieniamy tylko nagłówki w treści strony i tylko z H1 na H2. Słowa, kolejność i wygląd pozostają takie same.',
          llmsText: 'Tekst pliku llms.txt',
          llmsLead: 'Po kliknięciu „zatwierdź poprawkę” wtyczka wystawi ten tekst pod adresem llms.txt witryny:',
          llmsHint: 'Nazwa witryny, jedna linia wprowadzenia i najważniejsze strony, każda z jedną linią, napisane z samych stron. Wszystko można zmienić.',
          llmsPages: (n: number) => `Zbudowane z ${n} ${plPick(n, 'strony witryny', 'stron witryny', 'stron witryny')}`,
          llmsAddress: 'Pojawi się pod tym adresem',
          llmsCopy: 'Kopiuj tekst',
          llmsCopied: 'Tekst skopiowany',
          llmsCopyTitle: 'Umieść samodzielnie na witrynie',
          llmsCopySteps: [
            'Prosimy skopiować tekst.',
            'Zapisać go w zwykłym pliku tekstowym o nazwie llms.txt (UTF-8).',
            'Umieścić ten plik w katalogu głównym witryny, obok robots.txt, menedżerem plików hostingu albo przez FTP.',
            'Otworzyć adres powyżej i sprawdzić, czy tekst się pojawia.',
          ],
          llmsCopyWp: 'Z wtyczką Go Top (wersja 2.1.0 lub nowsza) możemy umieścić go na witrynie za Państwa i w każdej chwili z niej zdjąć.',
          llmsUpdate: 'Po aktualizacji wtyczki będziemy mogli umieścić go na witrynie za Państwa.',
        },
        altNotInContent: 'Obrazy bez tekstu alternatywnego na tej stronie nie znajdują się w jej tekście, więc na stronie nie ma czego zmieniać. Pochodzą z motywu witryny (logo, menu, stopka) albo są obrazem głównym, który motyw pokazuje nad tekstem. Ich opis wpisuje się raz w bibliotece mediów albo w motywie, i to naprawia wszystkie strony, które je pokazują. Poniższe kroki wyjaśniają, jak.',
        h1Reasons: {
          builder: 'Ta strona została zbudowana w kreatorze stron. Kreator bierze nagłówki z własnych danych: zmiana w treści nie utrzymałaby się. Nagłówek zmienia się w samym kreatorze.',
          markup: 'Nagłówki w treści tej strony zostały zapisane w sposób, którego nie możemy zmienić bez ryzyka. Prosimy zmienić je w edytorze.',
          theme: 'Zbędne nagłówki główne pochodzą z motywu albo ze szablonu, a nie z treści strony. Zmiana odbywa się w motywie, nie na stronie.',
          unproven: 'Nie dało się wykazać, że nagłówki strony naprawdę pochodzą z jej treści, dlatego ich nie zmieniamy. Prosimy zmienić je w edytorze.',
        },
        via: {
          plugin_seo: 'Zapisujemy to we wtyczce SEO witryny, przez wtyczkę Go Top. Tekst strony się nie zmienia.',
          plugin_own: 'Witryna nie ma wtyczki SEO, dlatego wtyczka Go Top przechowuje te dane sama i dodaje je do kodu strony.',
          seo_plugin: 'Zapisujemy to we wtyczce SEO witryny. Tekst strony się nie zmienia.',
          wp_title: 'Zmieniamy tytuł strony w WordPressie. Jeśli we wtyczce SEO ustawiono własny tytuł, Google nadal będzie pokazywać tamten.',
          content: 'Zmianę zapisujemy w treści strony, wyłącznie tam, gdzie zostało to tutaj opisane.',
          webhook: 'Zmianę wysyłamy na serwer, a programista nakłada ją na witrynę.',
          manual: 'Poprawka czeka w kolejce. Gdy wtyczka znów będzie połączona, da się ją nałożyć jednym kliknięciem albo wykonać ręcznie według instrukcji.',
          shopify_seo: 'Zapisujemy to w karcie dla wyszukiwarek artykułu albo strony w Shopify. Tekst strony się nie zmienia.',
          media: 'Opis zapisujemy przy samym obrazie w bibliotece mediów WordPressa i pojawia się on na wszystkich stronach, które go używają. Plik i tekst strony pozostają bez zmian.',
        },
        result: {
          applied: {
            title: 'Poprawka jest na witrynie',
            body: 'Google zobaczy ją, gdy następnym razem przeczyta stronę.',
          },
          already: {
            title: 'Jest już aktualne',
            body: 'Nie było czego zmieniać.',
          },
          sent: {
            title: 'Poprawka została wysłana',
            body: 'Poszła na serwer. Pojawi się na witrynie, gdy programista ją nałoży.',
          },
          manual: {
            title: 'Oznaczone do ręcznego wprowadzenia',
            body: 'Wtyczka nie jest połączona: na witrynie nic nie zostało zapisane. Poprawka czeka w kolejce poprawek.',
          },
          failed: {
            title: 'Poprawka nie została nałożona',
            body: 'Na witrynie nic się nie zmieniło.',
          },
        },
        focusNext: 'Dodaj też główne słowo kluczowe',
      },
      queue: {
        title: 'Kolejka poprawek',
        subtitle: 'Wszystkie zatwierdzone poprawki: co zostało zapisane, gdzie i kiedy.',
        empty: 'Żadna poprawka nie została jeszcze zatwierdzona. Aby zacząć, wystarczy kliknąć „napraw to za mnie” obok któregoś ustalenia.',
        status: {
          pending: 'Czeka',
          applied: 'Nałożona',
          failed: 'Nie udała się',
          cancelled: 'Przerwana',
          sent: 'Wysłana',
          manual: 'Ręczne wprowadzenie',
          reverted: 'Wycofana',
        },
        channel: {
          plugin: 'Przez wtyczkę',
          app_password: 'Przez WordPress',
          webhook: 'Przez webhook',
          manual: 'Ręczne wprowadzenie',
          shopify: 'Przez Shopify',
        },
        approvedAt: (when: string) => `Zatwierdzona ${when}`,
        revertedAt: (when: string) => `Wycofana ${when}`,
        before: 'Było',
        after: 'Zapisano',
        undo: 'Wycofaj',
        cancel: 'Usuń z kolejki',
        retry: 'Spróbuj ponownie',
        showAll: (n: number) => `Zobacz wszystkie poprawki: ${n}`,
        showLess: 'Pokaż mniej',
        batch: (date: string, n: number) => `Grupa poprawek z ${date} (${n})`,
        undoBatch: 'Wycofaj całą grupę',
        confirmUndoBatch: {
          title: 'Wycofać całą grupę?',
          body: 'Każda strona wróci do stanu poprzedniego. Strony, które w tym czasie zostały zmienione, pozostaną bez zmian.',
          confirm: 'Wycofaj grupę',
        },
        batchUndone: (ok: number, n: number) => `Wycofane poprawki: ${ok} z ${n}.`,
        batchSkipped: (f: number) =>
          f === 1
            ? 'Jedna strona została w tym czasie zmieniona, dlatego zostawiliśmy ją bez zmian.'
            : `Liczba stron zmienionych w tym czasie, które zostawiliśmy bez zmian: ${f}.`,
        confirmUndo: {
          title: 'Wycofać tę poprawkę?',
          body: 'Przywrócimy to, co strona zawierała przed poprawką. Jeśli strona została w tym czasie zmieniona, nic nie zmieniamy i mówimy o tym Państwu.',
          confirm: 'Wycofaj poprawkę',
        },
        confirmCancel: {
          title: 'Usunąć tę poprawkę z kolejki?',
          body: 'Poprawka nie zostanie zapisana na witrynie. Ślad zatwierdzenia zostaje zachowany.',
          confirm: 'Usuń',
        },
        toast: {
          undone: 'Poprawka została wycofana i poprzednia wartość wróciła',
          cancelled: 'Poprawka została usunięta z kolejki',
          applied: 'Poprawka jest na witrynie',
          sent: 'Poprawka została wysłana',
          manual: 'Poprawka została oznaczona do ręcznego wprowadzenia',
          failed: 'Poprawka nie została nałożona',
          pluginConnected: 'Wtyczka jest połączona',
        },
      },
      errors: {
        unauthorized: 'Aby kontynuować, trzeba zalogować się ponownie.',
        not_found: 'Nie znaleźliśmy tej pozycji na koncie.',
        invalid_request: 'Coś było nie w porządku z żądaniem. Prosimy odświeżyć stronę i spróbować jeszcze raz.',
        queue_unavailable: 'Poprawki na witrynie nie są jeszcze dostępne na tym koncie.',
        not_allowed: 'To nie jest zmiana, którą wprowadzamy na witrynie. Można naprawić ją według instrukcji.',
        value_invalid: 'Jedna z wartości jest pusta, za długa albo zawiera znaki, których nie zapisujemy na witrynie. Prosimy ją poprawić i spróbować ponownie.',
        off_site: 'Naprawiać można tylko strony i adresy z witryny tego projektu.',
        shopify_readonly: 'Połączenie ze sklepem nie pozwala nam zmieniać artykułów i stron: w sklepie nic się nie zmieniło. Prosimy połączyć sklep ponownie albo naprawić to według instrukcji.',
        no_channel: 'Aby naprawić to za Państwa, potrzebujemy najpierw podłączonej witryny. W tym czasie można naprawić to samodzielnie według instrukcji.',
        needs_plugin: 'Ta poprawka wymaga wtyczki Go Top. Można ją zainstalować w sekcji „poprawki na witrynie” albo naprawić to według instrukcji.',
        plugin_not_connected: 'Wtyczka nie jest teraz połączona: poprawkę oznaczyliśmy do ręcznego wprowadzenia.',
        plugin_unreachable: 'Witryna była w tej chwili nieosiągalna. Prosimy spróbować za moment.',
        plugin_rejected: 'Witryna nie przyjęła zmiany. Można spróbować ponownie albo naprawić to według instrukcji.',
        plugin_outdated: 'Wtyczka na witrynie jest za stara. Prosimy pobrać nową wersję i zainstalować ją na obecnej.',
        not_in_wordpress: 'Nie znaleźliśmy tej strony w WordPressie, więc nie da się jej zmienić z tego miejsca. Można naprawić ją według instrukcji.',
        no_safe_place: 'Nie znaleźliśmy istniejącego zdania, w którym kilka słów mogłoby stać się linkiem bez zmiany tekstu. Można samodzielnie dodać link według instrukcji.',
        nothing_to_change: 'Nie znaleźliśmy tego, co miało się na stronie zmienić. Być może jest już dobrze.',
        nothing_to_fix: 'Po ponownym sprawdzeniu strona jest już w porządku. Nie ma nic do zmiany.',
        needs_seo_plugin: 'WordPress nie ma tu odpowiedniego pola. Prosimy zainstalować wtyczkę SEO albo wtyczkę Go Top, i wtedy będziemy mogli to zapisać.',
        wordpress_permission: 'WordPress nie pozwolił na zmianę. Podłączony użytkownik może nie mieć uprawnień albo połączenie zostało unieważnione.',
        changed_since_preview: 'Strona zmieniła się po przeczytaniu: nic nie zostało zmienione. Prosimy otworzyć poprawkę ponownie.',
        nothing_to_undo: 'Nie mamy tego, co strona zawierała przed tą poprawką, dlatego nie da się jej wycofać z tego miejsca.',
        wrong_state: 'Ta poprawka zmieniła się w tym czasie. Prosimy odświeżyć stronę.',
        already_fixed: 'Ta poprawka została już dla tej strony zatwierdzona i jest w kolejce poprawek. Nie wysłaliśmy jej ponownie.',
        write_not_confirmed: 'Zmiana została wysłana, ale witryna nie zwróciła nowej wartości. Prosimy sprawdzić stronę przed kolejną próbą.',
        webhook_failed: 'Serwer nie potwierdził odbioru poprawki. Prosimy sprawdzić połączenie webhook w ustawieniach i spróbować ponownie.',
        store_failed: 'U nas coś poszło nie tak. Prosimy spróbować za moment.',
        needs_update: 'Ta poprawka wymaga nowszej wersji wtyczki Go Top. Prosimy zaktualizować wtyczkę; wszystko inne działa w tym czasie dalej.',
        no_valid_suggestion: 'Nie dało się napisać propozycji naprawdę lepszej niż to, co strona ma dziś, dlatego nie proponujemy automatycznej poprawki. Można naprawić ją według instrukcji.',
        thin_content: 'Strona ma za mało tekstu, aby to napisać, a my niczego nie wymyślamy. Prosimy uzupełnić treść strony albo naprawić to według instrukcji.',
        h1_not_safe: 'Nie możemy wykazać, że ta zmiana na tej stronie jest bez ryzyka, dlatego jej nie wykonujemy. Można naprawić ją według instrukcji.',
        builder_page: 'Ta strona została zbudowana w kreatorze stron (na przykład Elementor), który wyświetla ją z własnych danych: zmiana w jej tekście nie pojawiłaby się. Nic nie zostało zmienione. Można naprawić ją w kreatorze, według instrukcji.',
        llms_exists: 'Witryna ma już plik llms.txt. Nigdy go nie nadpisujemy.',
        not_bulk_safe: 'Ta poprawka nie należy do bezpiecznych, dlatego zostawiliśmy ją do osobnego zatwierdzenia.',
        not_in_store: 'W sklepie naprawiamy tylko artykuły i strony. Produkty i kolekcje naprawia się według instrukcji w panelu sklepu.',
        store_permission: 'Połączenie z Shopify nie pozwala nam zmienić tej strony. Prosimy połączyć sklep ponownie i spróbować jeszcze raz. W sklepie nic się nie zmieniło.',
        store_unreachable: 'Sklep był w tej chwili nieosiągalny. Prosimy spróbować za moment. W sklepie nic się nie zmieniło.',
        store_rejected: 'Sklep nie przyjął zmiany i nic w nim się nie zmieniło. Można spróbować ponownie albo naprawić to według instrukcji.',
      },
      bulk: {
        button: (n: number) => `Napraw za mnie ${n} ${plPick(n, 'bezpieczny punkt', 'bezpieczne punkty', 'bezpiecznych punktów')}`,
        none: 'Nie czeka żadna bezpieczna poprawka. Pozostałe zatwierdza się poniżej, jedna po drugiej.',
        preparing: 'Przygotowujemy bezpieczne poprawki …',
        confirmTitle: (n: number) => `Nałożyć na witrynę ${n} ${plPick(n, 'poprawkę', 'poprawki', 'poprawek')} jednym kliknięciem?`,
        confirmBody: (a: number, b: number, c: number) => `Zapisujemy wyłącznie bezpieczne zmiany: tytuły dla Google (${a}), opisy dla Google (${b}) i opisy obrazów (${c}). Tekst, który czytają odwiedzający, wygląd, ceny i produkty pozostają bez zmian. Poprzednią wartość zachowujemy, a każdą poprawkę da się wycofać.`,
        showAll: 'Zobacz wszystkie zmiany',
        hideAll: 'Ukryj zmiany',
        excluded: 'Strona główna i poprawki, które zmieniają treść strony (FAQ, linki, dane strukturalne, adres kanoniczny) nie są objęte; te zatwierdza się jedna po drugiej.',
        confirm: (n: number) => `Tak, napraw ${n}`,
        cancel: 'Anuluj',
        field: {
          seo_title: 'Tytuł dla Google',
          meta_description: 'Opis dla Google',
          image_alt: 'Opisy obrazów',
        },
        images: (n: number) => `${n} ${plPick(n, 'obraz', 'obrazy', 'obrazów')}`,
        progress: (done: number, n: number) => `Naprawiamy … ${done} z ${n}`,
        fixedRow: 'Naprawione ✓',
        summary: (ok: number, n: number) => `Naprawione: ${ok} z ${n}.`,
        failed: (f: number) => `Nie udały się: ${f}. Czekają w kolejce poprawek na kolejną próbę.`,
        nothingReady: 'Sprawdziliśmy strony ponownie i w tej chwili żadna z bezpiecznych poprawek nie jest potrzebna.',
        recheck: 'Przeskanuj witrynę ponownie',
        openQueue: 'Otwórz kolejkę poprawek',
        leftOut: (n: number) =>
          n === 1
            ? 'Jedna poprawka nie jest tu objęta. Po naprawie pokażemy dokładnie która i dlaczego.'
            : `Liczba poprawek nieobjętych tutaj: ${n}. Po naprawie pokażemy dokładnie które i dlaczego.`,
        showLeft: (n: number) => `Co nie zostało naprawione i dlaczego (${n})`,
        hideLeft: 'Ukryj listę',
        reasons: {
          review: 'Ta poprawka zmienia to, co odwiedzający widzą na stronie, dlatego zatwierdza się ją osobno na liście poniżej.',
          home: 'Strony głównej nigdy nie zmieniamy jednym kliknięciem. Jej poprawkę zatwierdza się osobno na liście poniżej.',
          recent: 'Poprawka tego samego rodzaju została na tej stronie wykonana w ostatnich 30 dniach albo nadal czeka w kolejce.',
          batch_full: 'Każde kliknięcie naprawia do 25 stron. Ta strona przyjdzie przy następnym kliknięciu.',
          not_safe: 'Napisana przez nas propozycja nie przeszła kontroli bezpieczeństwa (długość albo identyczność z obecną treścią): nic nie zostało zmienione.',
          failed: 'Poprawka została wysłana, ale witryna jej nie potwierdziła. Czeka w kolejce poprawek na kolejną próbę.',
        },
      },
      auto: {
        title: 'Automatyczne poprawki',
        description: 'Raz w tygodniu skanujemy witrynę i sami naprawiamy trzy proste rzeczy, bez czekania na zatwierdzenie.',
        label: 'Automatyczne poprawki',
        on: 'Włączone',
        off: 'Wyłączone',
        coversTitle: 'Co naprawiamy z własnej inicjatywy',
        types: {
          image_alt: 'Opis dla obrazów, które go nie mają',
          broken_link: 'Usunięcie zepsutego linku. Jego słowa zostają na stronie',
          meta_description: 'Opis dla Google dla stron, które go nie mają',
        },
        neverTitle: 'Czego nigdy nie robimy z własnej inicjatywy',
        never: 'Tytuły, adres kanoniczny, główne słowo kluczowe, FAQ, dane strukturalne, linki wewnętrzne, nagłówki główne i llms.txt. Wszystko to zawsze czeka na zatwierdzenie.',
        log: 'Każdą poprawkę zapisujemy w kolejce poprawek: kiedy i na jakiej stronie, a także kto włączył automatyczne poprawki i z jakiego adresu IP. Każdą poprawkę da się wycofać.',
        homeNote: 'Strony głównej nigdy nie zmieniamy z własnej inicjatywy.',
        confirm: {
          title: 'Włączyć automatyczne poprawki?',
          body: 'Raz w tygodniu skanujemy witrynę i z własnej inicjatywy naprawiamy wyłącznie te punkty:',
          confirm: 'Tak, włącz',
        },
        shopify: 'Automatyczne poprawki nie są dostępne dla sklepów Shopify. Każda poprawka czeka na kliknięcie.',
        needsPlugin: 'Aby włączyć tę funkcję, wtyczka Go Top musi być połączona z witryną.',
        needsUpdate: 'Aby włączyć tę funkcję, wtyczkę Go Top trzeba zaktualizować do najnowszej wersji.',
        toSiteHealth: 'Do stanu witryny',
        enabledAt: (when: string) => `Włączone od ${when}`,
        lastRun: (when: string) => `Ostatnie skanowanie: ${when}`,
        noRunYet: 'Pierwsze skanowanie odbędzie się w najbliższych dniach.',
        saved: 'Zapisano',
        failed: 'Zapis się nie udał. Prosimy spróbować ponownie.',
        panel: {
          title: 'Automatyczne poprawki',
          on: 'Włączone',
          off: 'Wyłączone',
          offBody: 'Włącza się je w ustawieniach witryny.',
          fixed: (n: number) =>
            n === 0
              ? 'W ostatnich 14 dniach nic nie zostało naprawione automatycznie.'
              : `Liczba automatycznych poprawek wykonanych w ostatnich 14 dniach: ${n}.`,
          toQueue: 'Do kolejki poprawek',
          toSettings: 'Ustawienia',
        },
        batch: (date: string, n: number) => `Naprawione automatycznie ${date} (${n})`,
        badge: 'Automatycznie',
      },
    },
    findings: {
      home_unreachable: {
        title: 'Strona główna się nie otwiera',
        why: 'Próbowaliśmy otworzyć stronę główną i nie dostaliśmy odpowiedzi. Jeśli to samo dzieje się u Google, witryna nie pojawia się w wynikach.',
      },
      robots_blocks_all: {
        title: 'Witryna blokuje Google',
        why: 'Plik ustawień robots.txt zabrania wyszukiwarkom czytać strony. Dopóki tak jest, witryna nie pojawia się w Google.',
      },
      noindex: {
        title: 'Strony, które proszą Google, żeby ich nie pokazywał',
        why: 'Te strony zawierają instrukcję (noindex), która mówi Google, żeby je pominął. Czasem jest to zamierzone, częściej zapomniane ustawienie.',
      },
      broken_links: {
        title: 'Linki prowadzące do strony, która nie istnieje',
        why: 'Odwiedzający, którzy klikną, trafiają na stronę błędu i odchodzą, a Google marnuje swoją wizytę na martwe adresy.',
      },
      title_missing: {
        title: 'Strony bez tytułu dla Google',
        why: 'Tytuł to wyróżniony wiersz w wynikach wyszukiwania. Bez niego Google wymyśla go sam, nie zawsze dobrze.',
      },
      title_long: {
        title: 'Za długie tytuły',
        why: 'Google pokazuje około 60 znaków. To, co dalej, zostaje obcięte, a czasem jest to właśnie ta część, która zachęca do kliknięcia.',
      },
      title_short: {
        title: 'Za krótkie tytuły',
        why: 'Krótki tytuł zostawia niewykorzystane miejsce na słowa, których ludzie szukają, i na nazwę firmy.',
      },
      title_duplicate: {
        title: 'Kilka stron z tym samym tytułem',
        why: 'Gdy dwie strony mają wspólny tytuł, Google trudno wybrać, którą pokazać, i tracą na tym obie.',
      },
      description_missing: {
        title: 'Strony bez opisu dla Google',
        why: 'Opis to dwa wiersze pod tytułem w Google. Bez niego Google bierze dowolne zdanie ze strony.',
      },
      description_length: {
        title: 'Za krótkie albo za długie opisy',
        why: 'Opis poniżej 70 znaków marnuje miejsce, a powyżej 165 znaków zostaje obcięty w środku zdania.',
      },
      description_duplicate: {
        title: 'Ten sam opis na kilku stronach',
        why: 'Powtórzony opis nie pomaga odwiedzającym zrozumieć, czym ta strona różni się od pozostałych.',
      },
      images_alt: {
        title: 'Obrazy bez opisu tekstowego',
        why: 'Google nie widzi obrazów, lecz czyta ich opis (alt). Opis pomaga pojawić się w wynikach graficznych i służy odwiedzającym, którzy korzystają z czytnika ekranu.',
      },
      h1_missing: {
        title: 'Strony bez nagłówka głównego',
        why: 'Nagłówek główny (H1) mówi Google i odwiedzającym, o czym jest strona.',
      },
      h1_multiple: {
        title: 'Strony z więcej niż jednym nagłówkiem głównym',
        why: 'Kilka nagłówków głównych zaciera temat strony. Lepiej jeden, a pozostałe powinny stać się podnagłówkami.',
      },
      robots_blocks_ai: {
        title: 'Witryna blokuje asystentów AI',
        why: 'robots.txt blokuje boty ChatGPT i podobnych asystentów, dlatego nie mogą polecać witryny w swoich odpowiedziach.',
      },
      sitemap_missing: {
        title: 'Nie znaleźliśmy mapy witryny',
        why: 'Mapa witryny wymienia Google wszystkie strony. Bez niej nowe strony są odkrywane wolniej.',
      },
      orphan_page: {
        title: 'Strony, do których nie prowadzi żadna inna strona',
        why: 'Strona bez ani jednego linku z wnętrza witryny jest dla Google trudno dostępna i traktowana jako mniej ważna.',
      },
      no_viewport: {
        title: 'Strony nieprzygotowane na telefony',
        why: 'Bez ustawienia widoku mobilnego strona pojawia się na telefonie w miniaturowej skali, a Google ocenia wersję mobilną.',
      },
      canonical_missing: {
        title: 'Strony bez oficjalnego adresu',
        why: 'Oficjalny adres strony (kanoniczny) mówi Google, który adres jest tym właściwym. Bez tego Google może policzyć kilka wersji tej samej strony jako różne strony.',
      },
      schema_missing: {
        title: 'Strony bez danych strukturalnych',
        why: 'Dane strukturalne (schema) mówią Google i asystentom AI, czym jest strona: firmą, artykułem czy usługą. To pomaga pojawić się w wynikach rozszerzonych i w odpowiedziach usług AI.',
      },
      faq_missing: {
        title: 'Strony bez FAQ',
        why: 'Krótkie pytania i odpowiedzi odpowiadają dokładnie temu, co ludzie wpisują, a asystenci AI chętnie je cytują. To uzupełnienie, które warto dodać, a nie błąd.',
      },
      llms_missing: {
        title: 'Brak pliku llms.txt dla asystentów AI',
        why: 'llms.txt to krótki plik tekstowy, który mówi asystentom AI, czym jest witryna i które strony się liczą. Jest nowy i pozostaje dobrowolny, ale pomaga asystentom takim jak ChatGPT dobrze opisać witrynę.',
      },
    },
    guides: {
      title: {
        wordpress: [
          'W kokpicie WordPressa prosimy otworzyć stronę do edycji (Strony albo Wpisy).',
          'Przewinąć do bloku wtyczki SEO (Yoast albo Rank Math) i kliknąć „tytuł SEO”.',
          'Napisać tytuł od 30 do 60 znaków z tym, co strona oferuje, i z nazwą firmy.',
          'Kliknąć „zaktualizuj”. Bez wtyczki SEO zmienia się tytuł samej strony.',
        ],
        shopify: [
          'Prosimy otworzyć pozycję w panelu sklepu: Produkty dla produktu, Sklep internetowy, a potem Strony dla strony, Sklep internetowy, a potem Wpisy blogowe dla artykułu, Produkty, a potem Kolekcje dla kolekcji.',
          'Przewinąć w dół do „podgląd wpisu w wyszukiwarce” i kliknąć ołówek.',
          'W polu „tytuł strony” napisać tytuł od 30 do 60 znaków.',
          'Kliknąć Zapisz.',
        ],
        wix: [
          'W edytorze Wix prosimy otworzyć „strony i menu”.',
          'Kliknąć trzy kropki obok strony, a potem „podstawy SEO”.',
          'W polu „title tag” napisać tytuł od 30 do 60 znaków.',
          'Opublikować witrynę, żeby zmiana weszła w życie.',
        ],
        other: [
          'Prosimy otworzyć stronę w systemie, na którym zbudowano witrynę.',
          'Znaleźć pole o nazwie „tytuł SEO”, „meta title” albo „title tag”.',
          'Napisać tytuł od 30 do 60 znaków, na każdej stronie inny.',
          'Zapisać i opublikować.',
        ],
      },
      description: {
        wordpress: [
          'Prosimy otworzyć stronę w WordPressie do edycji.',
          'W bloku wtyczki SEO wypełnić „meta opis”.',
          'Napisać od 70 do 160 znaków, które mówią, co strona zawiera i dlaczego warto ją odwiedzić.',
          'Brak wtyczki SEO? Wtyczki, Dodaj wtyczkę, wyszukać Yoast SEO, zainstalować i włączyć.',
        ],
        shopify: [
          'Prosimy otworzyć pozycję w panelu sklepu (produkt, stronę, wpis blogowy albo kolekcję).',
          'Przewinąć do „podgląd wpisu w wyszukiwarce” i kliknąć ołówek.',
          'W polu „meta opis” napisać od 70 do 160 znaków.',
          'Kliknąć Zapisz.',
        ],
        wix: [
          'W „stronach i menu” prosimy kliknąć trzy kropki obok strony, a potem „podstawy SEO”.',
          'W polu „meta opis” napisać od 70 do 160 znaków.',
          'Opublikować witrynę.',
        ],
        other: [
          'Prosimy otworzyć stronę w systemie, na którym zbudowano witrynę.',
          'Znaleźć pole o nazwie „meta opis” albo „opis dla wyszukiwarek”.',
          'Napisać od 70 do 160 znaków, na każdej stronie inne, i zapisać.',
        ],
      },
      alt: {
        wordpress: [
          'Prosimy otworzyć stronę do edycji i kliknąć obraz.',
          'W panelu bocznym, w ustawieniach bloku, wypełnić „tekst alternatywny”.',
          'Opisać w jednym krótkim zdaniu, co obraz przedstawia.',
          'Dla obrazów używanych na całej witrynie (logo, baner): Media, Biblioteka mediów, wybrać obraz i wypełnić „tekst alternatywny”.',
        ],
        shopify: [
          'Prosimy otworzyć produkt albo artykuł w panelu sklepu.',
          'Kliknąć obraz, a w otwartym okienku „dodaj tekst alternatywny”.',
          'Opisać w jednym krótkim zdaniu, co obraz przedstawia, i kliknąć Zapisz.',
        ],
        wix: [
          'W edytorze prosimy kliknąć obraz, a potem ikonę ustawień.',
          'W polu „co przedstawia obraz?” opisać, co na nim jest.',
          'Opublikować witrynę.',
        ],
        other: [
          'Prosimy otworzyć stronę w systemie, na którym zbudowano witrynę, i kliknąć obraz.',
          'Wypełnić pole „alt” albo „tekst alternatywny” krótkim opisem.',
          'Zapisać i opublikować.',
        ],
      },
      h1: {
        wordpress: [
          'Prosimy otworzyć stronę do edycji.',
          'Sprawdzić, czy ma tylko jeden nagłówek ustawiony jako „nagłówek 1” (H1), zwykle nazwę strony.',
          'Wszystkie inne nagłówki tego rodzaju ustawić na „nagłówek 2” albo „nagłówek 3”.',
          'Jeśli nagłówka głównego brakuje na wszystkich stronach, to ustawienie motywu: prosimy zapytać osobę, która zbudowała witrynę.',
        ],
        shopify: [
          'W większości motywów Shopify nagłówkiem głównym jest nazwa produktu albo strony.',
          'Jeśli w opisie dodano jeszcze jeden nagłówek, prosimy go zaznaczyć i ustawić na „nagłówek 2”.',
          'Jeśli nagłówka głównego brakuje na wszystkich stronach, to ustawienie motywu: prosimy zapytać jego twórcę.',
        ],
        wix: [
          'W edytorze prosimy kliknąć nagłówek główny strony.',
          'W ustawieniach tekstu wybrać „nagłówek 1” dla jednego nagłówka i „nagłówek 2” dla pozostałych.',
          'Opublikować witrynę.',
        ],
        other: [
          'Prosimy sprawdzić, czy każda strona ma dokładnie jeden nagłówek główny (H1).',
          'Pozostałe ustawić jako podnagłówki (H2, H3).',
          'Zapisać i opublikować.',
        ],
      },
      noindex: {
        wordpress: [
          'Ustawienia, a potem Czytanie: prosimy sprawdzić, czy opcja prosząca wyszukiwarki, by nie indeksowały witryny, jest wyłączona.',
          'Na samej stronie, w bloku Yoast, w sekcji „zaawansowane”, przy „pozwolić wyszukiwarkom pokazywać tę stronę” wybrać „tak”.',
          'Zapisać i poprosić Google w Search Console o ponowne przeczytanie strony.',
        ],
        shopify: [
          'Shopify nie ustawia noindex na zwykłych stronach: zwykle robi to aplikacja albo kod motywu.',
          'Prosimy sprawdzić niedawno zainstalowane aplikacje SEO i ich ustawienia wykluczeń.',
          'Jeśli pochodzi to z motywu: Sklep internetowy, Motywy, Edytuj kod, i poszukać „noindex” w theme.liquid. W razie wątpliwości prosimy zapytać programistę.',
        ],
        wix: [
          'W „stronach i menu” prosimy kliknąć trzy kropki obok strony, a potem „podstawy SEO”.',
          'Włączyć „pozwolić wyszukiwarkom indeksować tę stronę”.',
          'Opublikować witrynę.',
        ],
        other: [
          'Prosimy znaleźć w systemie witryny ustawienie o nazwie „noindex”, „ukryj przed wyszukiwarkami” albo „widoczność dla wyszukiwarek” i je wyłączyć.',
          'Zapisać i opublikować, a potem poprosić Google w Search Console o ponowne przeczytanie strony.',
        ],
      },
      robots: {
        wordpress: [
          'Ustawienia, a potem Czytanie: prosimy wyłączyć opcję proszącą wyszukiwarki, by nie indeksowały witryny, i zapisać.',
          'Jeśli wiersz Disallow: / nadal tam jest, prosimy otworzyć robots.txt we wtyczce SEO (w Yoast: Narzędzia, Edytor plików) i go usunąć.',
          'Po zapisaniu przeskanować tu witrynę ponownie.',
        ],
        shopify: [
          'Shopify tworzy robots.txt automatycznie. Pełna blokada wynika zwykle ze zmienionego w motywie szablonu robots.txt.liquid.',
          'Sklep internetowy, Motywy, trzy kropki, Edytuj kod, a potem otworzyć robots.txt.liquid w sekcji Templates.',
          'Usunąć wiersz Disallow: / albo usunąć plik, żeby wrócić do domyślnego, i zapisać. W razie wątpliwości prosimy zapytać programistę.',
        ],
        wix: [
          'Marketing i SEO, potem SEO, potem „przejdź do edytora robots.txt”.',
          'Usunąć wiersz Disallow: / albo kliknąć „przywróć domyślne”.',
          'Zapisać.',
        ],
        other: [
          'Prosimy otworzyć plik robots.txt w katalogu głównym witryny (albo poprosić o niego osobę, która ją zbudowała).',
          'Usunąć wiersz Disallow: / pod User-agent: *.',
          'Zapisać i przeskanować tu witrynę ponownie.',
        ],
      },
      robots_ai: {
        wordpress: [
          'Prosimy otworzyć robots.txt we wtyczce SEO (w Yoast: Narzędzia, Edytor plików).',
          'Usunąć grupy blokujące GPTBot, ClaudeBot, PerplexityBot i pozostałe (wiersze Disallow: / pod ich nazwami).',
          'Jeśli wtyczka bezpieczeństwa blokuje „boty AI”, prosimy wyłączyć tę opcję w jej ustawieniach.',
        ],
        shopify: [
          'Sklep internetowy, Motywy, Edytuj kod, a potem otworzyć robots.txt.liquid.',
          'Usunąć grupy blokujące GPTBot, ClaudeBot, PerplexityBot i pozostałe, i zapisać.',
          'W razie wątpliwości prosimy zapytać twórcę motywu.',
        ],
        wix: [
          'Marketing i SEO, potem SEO, potem „przejdź do edytora robots.txt”.',
          'Usunąć wiersze blokujące GPTBot, ClaudeBot, PerplexityBot i pozostałe, i zapisać.',
        ],
        other: [
          'Prosimy otworzyć robots.txt w katalogu głównym witryny.',
          'Usunąć grupy blokujące GPTBot, ClaudeBot, PerplexityBot i pozostałe, i zapisać.',
        ],
      },
      broken: {
        wordpress: [
          'Prosimy otworzyć do edycji stronę z linkiem.',
          'Kliknąć link i skierować go na istniejący adres albo go usunąć.',
          'Jeśli stara strona się przeniosła: zainstalować wtyczkę Redirection i przekierować stary adres na nowy.',
        ],
        shopify: [
          'Prosimy zaktualizować link na stronie, na której się znajduje, albo przekierować stary adres.',
          'Przekierowanie: Sklep internetowy, Nawigacja, potem „pokaż przekierowania URL” i „utwórz przekierowanie URL”.',
          'Najpierw wpisać zepsuty adres, potem właściwą stronę, i kliknąć Zapisz.',
        ],
        wix: [
          'Prosimy zaktualizować link na stronie, na której się znajduje, albo przekierować stary adres.',
          'Przekierowanie: Marketing i SEO, potem SEO, potem „menedżer przekierowań URL”, i kliknąć „nowe przekierowanie”.',
          'Wpisać zepsuty adres i właściwą stronę, i zapisać.',
        ],
        other: [
          'Prosimy otworzyć stronę z linkiem i skierować go na istniejący adres.',
          'Jeśli stara strona się przeniosła, ustawić stałe przekierowanie (301) ze starego adresu na nowy.',
        ],
      },
      sitemap: {
        wordpress: [
          'WordPress tworzy mapę witryny pod /wp-sitemap.xml, a Yoast pod /sitemap_index.xml.',
          'Jeśli żadna się nie otwiera, prosimy włączyć „mapy witryny XML” w Yoast, w SEO, Ustawienia.',
          'Przesłać adres do Google w Search Console, w sekcji „Mapy witryn”.',
        ],
        shopify: [
          'Shopify sam tworzy mapę witryny pod /sitemap.xml.',
          'Jeśli sklep jest zabezpieczony hasłem, Google nie może z niej korzystać: Sklep internetowy, Ustawienia, i prosimy usunąć hasło, gdy sklep będzie gotowy.',
          'Przesłać adres do Google w Search Console.',
        ],
        wix: [
          'Wix sam tworzy mapę witryny, gdy witryna zostanie opublikowana i połączona z domeną.',
          'Marketing i SEO, potem SEO: prosimy sprawdzić, czy witryna jest ustawiona jako widoczna dla wyszukiwarek.',
          'Przesłać /sitemap.xml do Google w Search Console.',
        ],
        other: [
          'Prosimy utworzyć mapę witryny pod /sitemap.xml (większość systemów robi to jednym ustawieniem).',
          'Dodać w robots.txt wiersz: Sitemap: i pełny adres.',
          'Przesłać ją do Google w Search Console.',
        ],
      },
      orphan: {
        wordpress: [
          'Prosimy otworzyć wpis albo stronę o pokrewnym temacie.',
          'Zaznaczyć istniejące słowa, które opisują zapomnianą stronę, i kliknąć ikonę linku.',
          'Wybrać stronę i zapisać. Linki z kilku stron są lepsze.',
        ],
        shopify: [
          'Prosimy dodać link do strony z wpisu blogowego albo z opisu pokrewnego produktu.',
          'Albo dodać ją do menu: Sklep internetowy, Nawigacja.',
        ],
        wix: [
          'Prosimy dodać link do strony z pokrewnej strony albo dodać ją do menu w „stronach i menu”.',
        ],
        other: [
          'Prosimy dodać linki do strony z pokrewnych stron albo z menu.',
        ],
      },
      viewport: {
        wordpress: [
          'Większość nowszych motywów jest przygotowana na telefony. Jeśli strona pojawia się na telefonie w miniaturowej skali, motyw jest stary.',
          'Prosimy zaktualizować motyw do najnowszej wersji albo przejść na motyw przygotowany na urządzenia mobilne.',
          'Jeśli zdarza się to tylko na jednej stronie, kreator stron mógł usunąć to ustawienie: prosimy zapytać osobę, która ją zbudowała.',
        ],
        shopify: [
          'Wszystkie oficjalne motywy Shopify są przygotowane na urządzenia mobilne. Zwykle wynika to ze zmiany w kodzie motywu.',
          'Sklep internetowy, Motywy, Edytuj kod, i prosimy sprawdzić w theme.liquid, czy jest wiersz meta name="viewport".',
          'W razie wątpliwości prosimy zapytać twórcę motywu.',
        ],
        wix: [
          'Wix ma własny edytor mobilny: prosimy przejść w edytorze do widoku mobilnego i przejrzeć stronę.',
          'Ustawić elementy na nowo i opublikować witrynę.',
        ],
        other: [
          'Prosimy sprawdzić, czy nagłówek każdej strony zawiera meta name="viewport" content="width=device-width, initial-scale=1".',
          'W razie wątpliwości prosimy zapytać osobę, która zbudowała witrynę.',
        ],
      },
      unreachable: {
        wordpress: [
          'Prosimy otworzyć witrynę w przeglądarce i sprawdzić, czy się wczytuje.',
          'Jeśli się nie wczytuje: prosimy skontaktować się z hostingiem. Jeśli się wczytuje: wtyczka bezpieczeństwa może blokować odwiedzających, którzy nie są zwykłą przeglądarką; prosimy sprawdzić jej ustawienia.',
          'Sprawdzić, czy adres witryny w ustawieniach jest poprawny.',
        ],
        shopify: [
          'Prosimy otworzyć sklep w przeglądarce.',
          'Jeśli jest zabezpieczony hasłem, Google do niego nie wejdzie: Sklep internetowy, Ustawienia, i prosimy usunąć hasło, gdy sklep będzie gotowy.',
        ],
        wix: [
          'Prosimy sprawdzić, czy witryna jest opublikowana i połączona z domeną.',
          'Otworzyć ją w przeglądarce i sprawdzić, czy się wczytuje.',
        ],
        other: [
          'Prosimy otworzyć witrynę w przeglądarce i sprawdzić, czy się wczytuje.',
          'Jeśli się nie wczytuje, prosimy skontaktować się z hostingiem. Sprawdzić, czy adres witryny w ustawieniach jest poprawny.',
        ],
      },
      canonical: {
        wordpress: [
          'Prosimy otworzyć stronę w WordPressie do edycji.',
          'W bloku wtyczki SEO otworzyć „zaawansowane” i wpisać adres samej strony w „kanoniczny URL”.',
          'Kliknąć „zaktualizuj”. Bez wtyczki SEO adres kanoniczny doda wtyczka Go Top.',
        ],
        shopify: [
          'Oficjalne motywy Shopify ustawiają adres kanoniczny na każdej stronie.',
          'Jeśli go brakuje, motyw został zmieniony: Sklep internetowy, Motywy, Edytuj kod, i prosimy sprawdzić, czy theme.liquid zawiera wiersz link rel="canonical".',
          'W razie wątpliwości prosimy skontaktować się z twórcą motywu.',
        ],
        wix: [
          'Wix dodaje adres kanoniczny na każdej stronie.',
          'W „stronach i menu”, trzy kropki obok strony, „podstawy SEO”, a potem „zaawansowane SEO”: prosimy sprawdzić, czy „kanoniczny URL” nie wskazuje innej strony.',
          'Opublikować witrynę.',
        ],
        other: [
          'Prosimy dodać na górze strony wiersz link rel="canonical" z pełnym adresem samej strony.',
          'Większość kreatorów ma na to pole w ustawieniach SEO strony. Zapisać i opublikować.',
        ],
      },
      schema: {
        wordpress: [
          'Wtyczki SEO, takie jak Yoast i Rank Math, dodają podstawowe dane strukturalne, gdy tylko są włączone.',
          'W Yoast: SEO, Ustawienia, „wygląd witryny”, i prosimy wpisać nazwę oraz logo firmy.',
          'Sprawdzić to, wpisując adres strony w „test wyników z elementami rozszerzonymi” Google.',
        ],
        shopify: [
          'Większość motywów Shopify zawiera dane strukturalne dla produktów, ale nie zawsze dla stron i bloga.',
          'Dodaje się je aplikacją SEO albo przez twórcę motywu.',
          'Sprawdzić to, wpisując adres strony w „test wyników z elementami rozszerzonymi” Google.',
        ],
        wix: [
          'W „stronach i menu”, trzy kropki obok strony, „podstawy SEO”, a potem „zaawansowane SEO”.',
          'W polu „znaczniki danych strukturalnych” dodać znacznik odpowiedni dla strony.',
          'Opublikować i sprawdzić „testem wyników z elementami rozszerzonymi” Google.',
        ],
        other: [
          'Prosimy dodać na stronie blok JSON-LD odpowiedniego typu: Organization dla strony głównej, Article dla artykułu.',
          'Sprawdzić to „testem wyników z elementami rozszerzonymi” Google, zapisać i opublikować.',
        ],
      },
      faq: {
        wordpress: [
          'Prosimy otworzyć stronę do edycji i dodać na dole nagłówek „często zadawane pytania”.',
          'Pod nim napisać od 3 do 5 pytań, które klienci naprawdę zadają, każde z krótką odpowiedzią.',
          'Yoast ma gotowy blok „FAQ”. Prosimy kliknąć „zaktualizuj”.',
        ],
        shopify: [
          'Prosimy otworzyć stronę albo wpis blogowy w panelu sklepu.',
          'Na końcu treści dodać nagłówek „często zadawane pytania”, a pod nim od 3 do 5 pytań z krótkimi odpowiedziami.',
          'Kliknąć Zapisz.',
        ],
        wix: [
          'W edytorze prosimy dodać do strony element FAQ.',
          'Napisać od 3 do 5 pytań, które zadają klienci, z krótkimi odpowiedziami.',
          'Opublikować witrynę.',
        ],
        other: [
          'Prosimy dodać na końcu strony sekcję „często zadawane pytania”, z 3 do 5 pytaniami i krótkimi odpowiedziami.',
          'Zapisać i opublikować.',
        ],
      },
      llms: {
        wordpress: [
          'Z wtyczką Go Top (wersja 2.1.0 lub nowsza) wystarczy kliknąć „napraw to za mnie”: zbudujemy tekst ze stron, Państwo go przeczytają, a wtyczka go wystawi.',
          'Bez wtyczki: prosimy napisać zwykły plik tekstowy o nazwie llms.txt z nazwą witryny, jedną linią o firmie i najważniejszymi stronami, każda z jedną linią.',
          'Umieścić go w katalogu głównym witryny, obok robots.txt (menedżer plików hostingu albo FTP), i otworzyć twojawitryna/llms.txt, żeby sprawdzić.',
        ],
        shopify: [
          'Shopify nie pozwala ani aplikacjom, ani sprzedawcom umieścić pliku w katalogu głównym adresu sklepu, dlatego pliku llms.txt nie da się automatycznie dodać do sklepu Shopify, ani nam, ani sprzedawcy.',
          'Co w Shopify pomaga asystentom AI: jasne opisy produktów i stron, strona „o nas” oraz FAQ.',
          'Jeśli Shopify otworzy drogę do publikowania llms.txt, dodamy to tutaj.',
        ],
        wix: [
          'Wix dziś nie pozwala umieścić pliku w katalogu głównym witryny, dlatego pliku llms.txt nie da się umieścić na witrynie Wix.',
          'Prosimy utrzymywać stronę „o nas” i opisy stron w jasnej formie; to właśnie czytają asystenci AI.',
        ],
        other: [
          'Prosimy napisać zwykły plik tekstowy o nazwie llms.txt: nazwa witryny jako nagłówek „#”, jedna linia o firmie, a potem najważniejsze strony jako lista linków, każda z jedną linią.',
          'Umieścić go w katalogu głównym witryny, obok robots.txt.',
          'Otworzyć twojawitryna/llms.txt w przeglądarce, żeby sprawdzić, czy się pojawia.',
        ],
      },
    },
  },
}

export {}

/**
 * Copy for the three pages a visitor sees when something is missing or broken:
 * app/not-found.tsx, app/(dashboard)/error.tsx and app/global-error.tsx. Our
 * own words only: an error's message, stack or provider text is never shown.
 * Kept small and dependency-free because global-error ships it to the client
 * without the rest of the app.
 */
import { normalizePublicLocale, type PublicLocale } from './locales'

export const ERROR_PAGES_UI = {
  he: {
    logoAlt: 'הלוגו של Go Top SEO',
    notFound: {
      code: '404',
      title: 'לא מצאנו את העמוד הזה',
      body: 'ייתכן שהקישור שגוי, או שהעמוד הועבר למקום אחר.',
      home: 'לדף הבית',
      dashboard: 'ללוח הבקרה',
      homeHref: '/',
    },
    screenError: {
      title: 'המסך הזה לא נטען',
      body: 'שום דבר לא נמחק. נסו שוב, ואם זה חוזר על עצמו, חזרו ללוח הבקרה.',
      retry: 'נסו שוב',
      dashboard: 'ללוח הבקרה',
      reference: 'מזהה לפנייה לתמיכה:',
    },
    globalError: {
      title: 'משהו השתבש',
      body: 'האתר נתקל בתקלה לא צפויה. נסו לטעון את העמוד מחדש.',
      retry: 'טעינה מחדש',
      home: 'לדף הבית',
      homeHref: '/',
    },
  },
  en: {
    logoAlt: 'Go Top SEO logo',
    notFound: {
      code: '404',
      title: "We couldn't find this page",
      body: 'The link may be wrong, or the page has moved.',
      home: 'Go to the home page',
      dashboard: 'Go to the dashboard',
      homeHref: '/en',
    },
    screenError: {
      title: "This screen didn't load",
      body: "Nothing was deleted. Try again, and if it keeps happening, go back to the dashboard.",
      retry: 'Try again',
      dashboard: 'Go to the dashboard',
      reference: 'Reference for support:',
    },
    globalError: {
      title: 'Something went wrong',
      body: 'The site ran into an unexpected problem. Try reloading the page.',
      retry: 'Reload',
      home: 'Go to the home page',
      homeHref: '/en',
    },
  },
  es: {
    logoAlt: 'Logotipo de Go Top SEO',
    notFound: {
      code: '404',
      title: 'No encontramos esta página',
      body: 'Puede que el enlace sea incorrecto o que la página se haya movido.',
      home: 'Ir a la página de inicio',
      dashboard: 'Ir al panel',
      homeHref: '/es',
    },
    screenError: {
      title: 'Esta pantalla no se cargó',
      body: 'No se borró nada. Inténtalo de nuevo y, si vuelve a ocurrir, regresa al panel.',
      retry: 'Inténtalo de nuevo',
      dashboard: 'Ir al panel',
      reference: 'Referencia para soporte:',
    },
    globalError: {
      title: 'Algo salió mal',
      body: 'El sitio tuvo un problema inesperado. Prueba a recargar la página.',
      retry: 'Recargar',
      home: 'Ir a la página de inicio',
      homeHref: '/es',
    },
  },
  'pt-BR': {
    logoAlt: 'Logotipo da Go Top SEO',
    notFound: {
      code: '404',
      title: 'Não encontramos esta página',
      body: 'O link pode estar incorreto ou a página pode ter sido movida.',
      home: 'Ir para a página inicial',
      dashboard: 'Ir para o painel',
      homeHref: '/pt-BR',
    },
    screenError: {
      title: 'Esta tela não carregou',
      body: 'Nada foi apagado. Tente de novo e, se acontecer outra vez, volte ao painel.',
      retry: 'Tentar de novo',
      dashboard: 'Ir para o painel',
      reference: 'Referência para o suporte:',
    },
    globalError: {
      title: 'Algo deu errado',
      body: 'O site teve um problema inesperado. Tente recarregar a página.',
      retry: 'Recarregar',
      home: 'Ir para a página inicial',
      homeHref: '/pt-BR',
    },
  },
  fr: {
    logoAlt: 'Logo Go Top SEO',
    notFound: {
      code: '404',
      title: "Nous n'avons pas trouvé cette page",
      body: 'Le lien est peut-être incorrect, ou la page a été déplacée.',
      home: "Aller à la page d'accueil",
      dashboard: 'Aller au tableau de bord',
      homeHref: '/fr',
    },
    screenError: {
      title: "Cet écran ne s'est pas chargé",
      body: "Rien n'a été supprimé. Réessayez et, si cela se reproduit, revenez au tableau de bord.",
      retry: 'Réessayer',
      dashboard: 'Aller au tableau de bord',
      reference: 'Référence à donner au support :',
    },
    globalError: {
      title: "Une erreur s'est produite",
      body: 'Le site a rencontré un problème inattendu. Essayez de recharger la page.',
      retry: 'Recharger',
      home: "Aller à la page d'accueil",
      homeHref: '/fr',
    },
  },
  it: {
    logoAlt: 'Logo Go Top SEO',
    notFound: {
      code: '404',
      title: 'Questa pagina non è stata trovata',
      body: 'Il link potrebbe essere errato, oppure la pagina è stata spostata.',
      home: 'Vai alla home page',
      dashboard: 'Vai al pannello',
      homeHref: '/it',
    },
    screenError: {
      title: 'Questa schermata non è stata caricata',
      body: 'Nulla è stato eliminato. Si consiglia di riprovare e, se il problema si ripete, di tornare al pannello.',
      retry: 'Riprova',
      dashboard: 'Vai al pannello',
      reference: 'Riferimento da comunicare all\u2019assistenza:',
    },
    globalError: {
      title: 'Si è verificato un errore',
      body: 'Il sito ha riscontrato un problema inatteso. Si consiglia di ricaricare la pagina.',
      retry: 'Ricarica',
      home: 'Vai alla home page',
      homeHref: '/it',
    },
  },
  ja: {
    logoAlt: 'Go Top SEO のロゴ',
    notFound: {
      code: '404',
      title: 'このページは見つかりませんでした',
      body: 'リンクが間違っているか、ページが移動した可能性があります。',
      home: 'トップページへ',
      dashboard: '管理画面へ',
      homeHref: '/ja',
    },
    screenError: {
      title: 'この画面を読み込めませんでした',
      body: 'データが消えたわけではありません。もう一度お試しいただき、繰り返し発生する場合は管理画面にお戻りください。',
      retry: '再試行',
      dashboard: '管理画面へ',
      reference: 'サポートにお伝えいただく参照番号：',
    },
    globalError: {
      title: 'エラーが発生しました',
      body: '予期しない問題が発生しました。ページを再読み込みしてください。',
      retry: '再読み込み',
      home: 'トップページへ',
      homeHref: '/ja',
    },
  },
  pl: {
    logoAlt: 'Logo Go Top SEO',
    notFound: {
      code: '404',
      title: 'Nie znaleźliśmy tej strony',
      body: 'Być może link jest nieprawidłowy albo strona została przeniesiona.',
      home: 'Na stronę główną',
      dashboard: 'Do panelu',
      homeHref: '/pl',
    },
    screenError: {
      title: 'Ten ekran się nie wczytał',
      body: 'Nic nie zostało usunięte. Prosimy spróbować ponownie, a jeśli to się powtórzy — wrócić do panelu.',
      retry: 'Spróbuj ponownie',
      dashboard: 'Do panelu',
      reference: 'Numer referencyjny dla pomocy technicznej:',
    },
    globalError: {
      title: 'Coś poszło nie tak',
      body: 'W serwisie wystąpił nieoczekiwany problem. Prosimy wczytać stronę ponownie.',
      retry: 'Wczytaj ponownie',
      home: 'Na stronę główną',
      homeHref: '/pl',
    },
  },
  ko: {
    logoAlt: 'Go Top SEO 로고',
    notFound: {
      code: '404',
      title: '이 페이지를 찾지 못했습니다',
      body: '주소가 잘못되었거나 페이지가 옮겨졌을 수 있습니다.',
      home: '홈으로',
      dashboard: '대시보드로',
      homeHref: '/ko',
    },
    screenError: {
      title: '이 화면을 불러오지 못했습니다',
      body: '삭제된 것은 없습니다. 다시 시도해 보시고, 같은 일이 반복되면 대시보드로 돌아가 주십시오.',
      retry: '다시 시도',
      dashboard: '대시보드로',
      reference: '고객 지원에 전달할 참조 번호:',
    },
    globalError: {
      title: '문제가 생겼습니다',
      body: '예기치 않은 오류가 발생했습니다. 페이지를 다시 불러와 주십시오.',
      retry: '다시 불러오기',
      home: '홈으로',
      homeHref: '/ko',
    },
  },
  nl: {
    logoAlt: 'Het logo van Go Top SEO',
    notFound: {
      code: '404',
      title: 'Deze pagina hebben wij niet kunnen vinden',
      body: 'De link is mogelijk onjuist, of de pagina is verplaatst.',
      home: 'Naar de startpagina',
      dashboard: 'Naar het dashboard',
      homeHref: '/nl',
    },
    screenError: {
      title: 'Dit overzicht is niet geladen',
      body: 'Er is niets verwijderd. Probeer het opnieuw; gebeurt het weer, ga dan terug naar het dashboard.',
      retry: 'Opnieuw proberen',
      dashboard: 'Naar het dashboard',
      reference: 'Referentie voor de support:',
    },
    globalError: {
      title: 'Er is iets misgegaan',
      body: 'Op de website is een onverwacht probleem opgetreden. Laad de pagina opnieuw.',
      retry: 'Opnieuw laden',
      home: 'Naar de startpagina',
      homeHref: '/nl',
    },
  },
  de: {
    logoAlt: 'Logo von Go Top SEO',
    notFound: {
      code: '404',
      title: 'Diese Seite konnten wir nicht finden',
      body: 'Der Link ist möglicherweise falsch, oder die Seite wurde verschoben.',
      home: 'Zur Startseite',
      dashboard: 'Zum Dashboard',
      homeHref: '/de',
    },
    screenError: {
      title: 'Diese Ansicht wurde nicht geladen',
      body: 'Es wurde nichts gelöscht. Bitte versuchen Sie es erneut; wenn es wieder auftritt, kehren Sie zum Dashboard zurück.',
      retry: 'Erneut versuchen',
      dashboard: 'Zum Dashboard',
      reference: 'Referenz für den Support:',
    },
    globalError: {
      title: 'Etwas ist schiefgelaufen',
      body: 'Auf der Website ist ein unerwartetes Problem aufgetreten. Bitte laden Sie die Seite neu.',
      retry: 'Neu laden',
      home: 'Zur Startseite',
      homeHref: '/de',
    },
  },
} as const

/**
 * A 404 on `/es/…` is answered in Spanish: an error page is still a page of the
 * site the visitor is on, and the home link it offers has to lead back into
 * their own language tree, not into Hebrew.
 */
export function errorPagesUi(locale: PublicLocale | string | null | undefined) {
  return ERROR_PAGES_UI[normalizePublicLocale(locale) ?? 'he']
}

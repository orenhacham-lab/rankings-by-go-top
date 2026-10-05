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
} as const

/**
 * A 404 on `/es/…` is answered in Spanish: an error page is still a page of the
 * site the visitor is on, and the home link it offers has to lead back into
 * their own language tree, not into Hebrew.
 */
export function errorPagesUi(locale: PublicLocale | string | null | undefined) {
  return ERROR_PAGES_UI[normalizePublicLocale(locale) ?? 'he']
}

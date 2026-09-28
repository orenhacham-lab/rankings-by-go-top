/**
 * Copy for the three pages a visitor sees when something is missing or broken:
 * app/not-found.tsx, app/(dashboard)/error.tsx and app/global-error.tsx. Our
 * own words only: an error's message, stack or provider text is never shown.
 * Kept small and dependency-free because global-error ships it to the client
 * without the rest of the app.
 */
import type { Locale } from './locales'

export const ERROR_PAGES_UI = {
  he: {
    logoAlt: 'הלוגו של Go Top',
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
    logoAlt: 'Go Top logo',
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
} as const

export function errorPagesUi(locale: Locale) {
  return ERROR_PAGES_UI[locale === 'en' ? 'en' : 'he']
}

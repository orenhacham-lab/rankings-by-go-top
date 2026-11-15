/**
 * The browser-tab title of each auth page, in every public locale.
 *
 * The four auth pages are client components ('use client'), so none of them can
 * export `metadata`, and their one shared layout cannot tell /signup from
 * /login. The result, measured on production on 15.11.2026: `/signup`,
 * `/login` and `/en/login` all served the ROOT layout's title — the English
 * home-page one — so a Hebrew sign-up page opened a tab reading "Create,
 * schedule and publish SEO & GEO content | Go Top SEO". The layout now reads
 * the path from PATHNAME_HEADER and titles the page from this table.
 *
 * SIGN-UP AND SIGN-IN ARE COPIED FROM THE PAGES' OWN HEADINGS, deliberately:
 * the tab and the <h1> a visitor reads must say the same thing, and the pages'
 * dictionaries live inside client files that a server layout cannot import.
 * `auth-titles.qa.ts` reads those files and fails if the two ever drift apart.
 * Forgot and reset need no copy here at all — PASSWORD_UI is already a lib
 * module, so their headings are read from it directly.
 */
import { PASSWORD_UI } from './auth-password'
import type { PublicLocale } from './locales'

export type AuthPage = 'signup' | 'login' | 'forgot-password' | 'reset-password'

/** The brand suffix the public pages already use ("מחירים - Go Top SEO"). */
const SUFFIX = ' - Go Top SEO'

const SIGNUP: Record<PublicLocale, string> = {
  he: 'פותחים חשבון בחינם',
  en: 'Create your free account',
  es: 'Crea tu cuenta gratis',
  'pt-BR': 'Crie sua conta de graça',
  fr: 'Créez votre compte gratuitement',
  it: 'Crei il suo account gratuito',
  ja: '無料アカウントを作成',
  de: 'Kostenloses Konto erstellen',
  nl: 'Een gratis account aanmaken',
  pl: 'Utwórz bezpłatne konto',
  ko: '무료 계정 만들기',
}

const LOGIN: Record<PublicLocale, string> = {
  he: 'כניסה',
  en: 'Sign in',
  es: 'Iniciar sesión',
  'pt-BR': 'Entrar',
  fr: 'Connexion',
  it: 'Accesso',
  ja: 'ログイン',
  de: 'Anmelden',
  nl: 'Inloggen',
  pl: 'Zaloguj się',
  ko: '로그인',
}

/** The auth page a path names, or null when the path is not one of them. */
export function authPageForPath(pathname: string | null): AuthPage | null {
  if (!pathname) return null
  const last = pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  return last === 'signup' || last === 'login' || last === 'forgot-password' || last === 'reset-password'
    ? last
    : null
}

/** The heading each page shows, which is also what its tab says. */
export function authHeading(page: AuthPage, locale: PublicLocale): string {
  if (page === 'signup') return SIGNUP[locale]
  if (page === 'login') return LOGIN[locale]
  const ui = PASSWORD_UI[locale] ?? PASSWORD_UI.en
  return page === 'forgot-password' ? ui.forgot.heading : ui.reset.heading
}

export function authPageTitle(page: AuthPage, locale: PublicLocale): string {
  return `${authHeading(page, locale)}${SUFFIX}`
}

/**
 * Links INTO the auth surface (sign-in, sign-up) from a page whose language is
 * already known, and the way OUT of it into the app.
 *
 * THE DEFECT. The Hebrew site linked to a bare `/signup` and `/login`. Those
 * routes have no language of their own (the Shopify handoff reuses them in
 * English), so the request contract answered: cookie, then the browser's
 * Accept-Language. A visitor reading the Hebrew site in a browser set to
 * English — most Israeli browsers — clicked "התחילו ניסיון חינם" and got an
 * English form, and then an English dashboard.
 *
 * THE FIX keeps the contract and states the language on the link instead:
 *   English site → `/en/signup`, `/en/login`   (routes fixed to English)
 *   Hebrew site  → `/signup?lang=he`, `/login?lang=he`
 * An explicit `?lang` is the contract's own tool for "the page that sent you
 * here already chose" (lib/i18n/request-locale.ts): the proxy honours it and
 * persists it, so the choice survives the form, the email confirmation and the
 * first dashboard load.
 *
 * Shopify links do not come through here: the embedded app builds its own with
 * authUrlWithLocale (lib/shopify/handoff-url.ts), always in English.
 */
import { LOCALE_PREFIX, type PublicLocale } from './locales'
import { LANGUAGE_PARAM } from './request-locale'

export type AuthPage = 'login' | 'signup' | 'forgot-password'

/** The sign-in or sign-up page in `locale`, with any extra query (e.g. a plan or a claim token). */
export function authHref(page: AuthPage, locale: PublicLocale, query: Record<string, string | null | undefined> = {}): string {
  const params = new URLSearchParams()
  if (locale === 'he') params.set(LANGUAGE_PARAM, 'he')
  for (const [k, v] of Object.entries(query)) if (typeof v === 'string' && v.length > 0) params.set(k, v)
  const qs = params.toString()
  // Each language's own route, from the one prefix table: '' · '/en' · '/es'.
  const path = `${LOCALE_PREFIX[locale]}/${page}`
  return qs ? `${path}?${qs}` : path
}

/**
 * A same-origin path with the auth page's language added, so the page after
 * sign-in or sign-up opens in the language the form was shown in. A `lang` the
 * path already carries (the Shopify handoff's) is kept as it is. `path` must
 * already be sanitized (sanitizeNextPath): this only appends a parameter.
 */
export function withLocaleParam(path: string, locale: PublicLocale): string {
  const hashAt = path.indexOf('#')
  const base = hashAt >= 0 ? path.slice(0, hashAt) : path
  const hash = hashAt >= 0 ? path.slice(hashAt) : ''
  const qAt = base.indexOf('?')
  const pathname = qAt >= 0 ? base.slice(0, qAt) : base
  const params = new URLSearchParams(qAt >= 0 ? base.slice(qAt + 1) : '')
  if (params.has(LANGUAGE_PARAM)) return path
  params.set(LANGUAGE_PARAM, locale)
  return `${pathname}?${params.toString()}${hash}`
}

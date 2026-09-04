/**
 * THE language contract — one authoritative value, readable by the server.
 *
 * The document's lang/dir used to be hard-coded `he`/`rtl` in the root layout
 * and corrected by a client effect after hydration. That is not a language
 * contract: the initial server response — what a crawler, a screen reader and
 * the browser's own text handling see first — was always Hebrew/RTL, even for
 * an English page. The preference now lives in a cookie, which the server reads
 * before it renders anything.
 *
 * Precedence, deliberately in this order:
 *   1. an /en URL prefix — the route IS English, whatever the cookie says;
 *   2. the `dashboard-language` cookie — the user's explicit choice;
 *   3. a seed (auth metadata) for a first visit on a fresh device;
 *   4. Hebrew, the product default.
 *
 * PURE — no React, no DOM, no Next imports — so the middleware, the server
 * layouts and the client provider all decide identically and cannot drift.
 */

import type { Locale } from './locales'
import { normalizeLocale } from './dashboard/locale'

/** Readable by the browser too: the client writes it when the switcher changes. */
export const LANGUAGE_COOKIE = 'dashboard-language'

/** How the proxy hands the resolved locale to the server layouts. */
export const LOCALE_HEADER = 'x-gotop-locale'

export const DEFAULT_LOCALE: Locale = 'he'

/** True when a path is served by the English public tree. */
export function isEnglishPath(pathname: string | null | undefined): boolean {
  const p = pathname || ''
  return p === '/en' || p.startsWith('/en/')
}

export function resolveRequestLocale(input: {
  pathname?: string | null
  cookieValue?: string | null
  /** Seed for a first visit (e.g. signup language in auth metadata). */
  seed?: string | null
}): Locale {
  if (isEnglishPath(input.pathname)) return 'en'
  return normalizeLocale(input.cookieValue) ?? normalizeLocale(input.seed) ?? DEFAULT_LOCALE
}

/**
 * The locale THIS REQUEST decides on its own — an /en route or an explicit
 * cookie — or null when it does not decide and a seed should still apply.
 * Separate from resolveRequestLocale, which always answers with a default.
 */
export function explicitRequestLocale(input: { pathname?: string | null; cookieValue?: string | null }): Locale | null {
  if (isEnglishPath(input.pathname)) return 'en'
  return normalizeLocale(input.cookieValue)
}

/**
 * The cookie the client writes when the switcher changes.
 *
 * Path-wide so every route sees it, `SameSite=Lax` so a normal top-level
 * navigation carries it, and NOT httpOnly because the client provider reads the
 * same value the server did — that is what keeps the two in agreement. The
 * value is a UI preference, never a credential, so it carries no secret and
 * grants nothing.
 */
export const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function languageCookieString(locale: Locale, secure: boolean): string {
  const parts = [
    `${LANGUAGE_COOKIE}=${locale}`,
    'Path=/',
    `Max-Age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/** Read one cookie out of a raw Cookie header. PURE. */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const s = part.trim()
    if (s.startsWith(`${name}=`)) return decodeURIComponent(s.slice(name.length + 1))
  }
  return null
}

/**
 * MIGRATION — deterministic, and it never overrides an explicit cookie.
 *
 * The preference used to live only in localStorage. On the first load after
 * this change the cookie is absent while localStorage may hold a real choice,
 * and the server has already rendered from the cookie (i.e. from the seed or
 * the default). This decides, once, what the client should do:
 *
 *   cookie present            → the cookie wins; mirror it into localStorage
 *   cookie absent, stored set → adopt the stored value and WRITE the cookie
 *   neither                   → keep the server's locale and write it, so the
 *                               next request is already decided server-side
 */
export interface LocaleMigration {
  /** The locale the client should hold after migration. */
  locale: Locale
  /** Write this to the cookie (always set — the point is to become server-readable). */
  writeCookie: true
  /** Mirror into localStorage when it disagrees, so the two stay in step. */
  writeStorage: boolean
  reason: 'cookie' | 'migrated_from_storage' | 'server_default'
}

export function migrateLocalePreference(input: {
  cookieValue?: string | null
  storedValue?: string | null
  serverLocale: Locale
}): LocaleMigration {
  const cookie = normalizeLocale(input.cookieValue)
  if (cookie) {
    return { locale: cookie, writeCookie: true, writeStorage: normalizeLocale(input.storedValue) !== cookie, reason: 'cookie' }
  }
  const stored = normalizeLocale(input.storedValue)
  if (stored) return { locale: stored, writeCookie: true, writeStorage: false, reason: 'migrated_from_storage' }
  return { locale: input.serverLocale, writeCookie: true, writeStorage: true, reason: 'server_default' }
}

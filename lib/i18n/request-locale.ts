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
 *   1. the ROUTE's own content language, where the route HAS one — `/en/…` is
 *      English, `/` and the Hebrew public tree are Hebrew. Nothing overrides it;
 *   2. the `dashboard-language` cookie — the user's explicit choice;
 *   3. a seed (auth metadata) for a first visit on a fresh device;
 *   4. the browser's own Accept-Language, parsed with q-values;
 *   5. English.
 *
 * Steps 2-5 apply ONLY to the genuinely bilingual surfaces: the dashboard, auth
 * and the Shopify entry points, whose text follows the reader.
 *
 * WHY STEPS 5 AND 6 EXIST. The chain used to end at Hebrew, so a visitor with no
 * /en URL, no cookie and no stored preference — every first-time reviewer
 * opening the dashboard — received a Hebrew RTL document regardless of what
 * their browser asked for. Their browser HAD already said what they read, in the
 * header the spec provides for exactly this; nothing consulted it. Step 5 reads
 * it, so a Hebrew browser still lands on Hebrew and an English (or any other
 * non-Hebrew) browser lands on English. Step 6 applies only when the request
 * carries no signal at all — a missing or unparseable header — where English is
 * the safer answer for an unknown audience than an RTL document.
 *
 * WHY STEP 1 IS FIRST, ABOVE THE COOKIE. The public pages are not bilingual:
 * `/privacy` renders Hebrew copy and `/en/privacy` renders English copy, and
 * which one you get is decided by the URL. A LABEL that disagrees with the COPY
 * is a lie to a crawler and a screen reader whatever put it there — a browser
 * header, an auth seed, or a cookie the reader set while using the dashboard in
 * English. An earlier revision of this contract ranked the cookie above the
 * route, which meant a reviewer who switched the dashboard to English then
 * served every Hebrew legal and marketing page as `lang="en"`. The route's own
 * language is therefore not one signal among several: on those URLs it is the
 * only fact, and the preference chain does not run at all.
 *
 * Switching language on such a page is a NAVIGATION, not a relabel — the public
 * switcher links to the counterpart URL (components/LanguageSwitcher.tsx), which
 * is what actually changes the copy.
 *
 * PURE — no React, no DOM, no Next imports — so the middleware, the server
 * layouts and the client provider all decide identically and cannot drift.
 */

import type { Locale } from './locales'
import { normalizeLocale } from './dashboard/locale'
import { localeFromAcceptLanguage } from './accept-language'

/** Readable by the browser too: the client writes it when the switcher changes. */
export const LANGUAGE_COOKIE = 'dashboard-language'

/** How the proxy hands the resolved locale to the server layouts. */
export const LOCALE_HEADER = 'x-gotop-locale'

/**
 * The end of the chain, reached ONLY when the request carries no /en route, no
 * cookie, no seed and no usable Accept-Language. Distinct from
 * lib/i18n/locales.DEFAULT_LOCALE, which is the PUBLIC SITE's canonical locale
 * (Hebrew at `/`, English at `/en`) and is a routing fact, not a per-request
 * preference. Naming them apart is deliberate: they answer different questions
 * and giving them the same value once produced the Hebrew-for-everyone bug.
 */
export const REQUEST_FALLBACK_LOCALE: Locale = 'en'

/** True when a path is served by the English public tree. */
export function isEnglishPath(pathname: string | null | undefined): boolean {
  const p = pathname || ''
  return p === '/en' || p.startsWith('/en/')
}

/**
 * First path segments of the HEBREW public tree — the `app/(public)` and
 * `app/(legal)` route groups plus the root. These pages contain Hebrew copy
 * written into the components; there is no dictionary lookup and no English
 * variant except the separate /en tree, so their content language is a property
 * of the URL.
 *
 * A closed list is the point: it is short, it changes only when a public section
 * is added, and the language QA fails if a directory in EITHER group is missing
 * from it, so it cannot drift silently.
 */
const PUBLIC_MARKETING_SEGMENTS = new Set([
  'about', 'accessibility', 'articles', 'features', 'pricing', 'privacy', 'sitemap', 'terms',
])

/**
 * The language THE ROUTE ITSELF serves, or null when the route is bilingual and
 * the user's preference decides.
 */
export function routeContentLocale(pathname: string | null | undefined): Locale | null {
  const p = pathname || ''
  if (isEnglishPath(p)) return 'en'
  if (p === '/') return 'he'
  const segment = p.split('/')[1] ?? ''
  return PUBLIC_MARKETING_SEGMENTS.has(segment) ? 'he' : null
}

/** Exposed so the QA can prove the list covers the real route group. */
export function publicMarketingSegments(): string[] {
  return Array.from(PUBLIC_MARKETING_SEGMENTS).sort()
}

export function resolveRequestLocale(input: {
  pathname?: string | null
  cookieValue?: string | null
  /** Seed for a first visit (e.g. signup language in auth metadata). */
  seed?: string | null
  /** The raw Accept-Language header, parsed with q-values (never substring-matched). */
  acceptLanguage?: string | null
}): Locale {
  // The route decides FIRST and alone where it has a language of its own; no
  // cookie, seed or header may relabel content it did not write.
  const fixed = routeContentLocale(input.pathname)
  if (fixed) return fixed
  return normalizeLocale(input.cookieValue)
    ?? normalizeLocale(input.seed)
    ?? localeFromAcceptLanguage(input.acceptLanguage)
    ?? REQUEST_FALLBACK_LOCALE
}

/**
 * The locale THIS REQUEST decides on its own — a route that serves one fixed
 * language, or an explicit cookie on a bilingual route — or null when it does
 * not decide and the seed / the browser's header should still apply. Same
 * precedence as resolveRequestLocale: the route first, then the cookie.
 * Separate from resolveRequestLocale, which always answers with a default.
 */
export function explicitRequestLocale(input: { pathname?: string | null; cookieValue?: string | null }): Locale | null {
  return routeContentLocale(input.pathname) ?? normalizeLocale(input.cookieValue)
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

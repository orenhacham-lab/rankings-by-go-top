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

import { normalizeStoredLocale, toBilingualLocale, type Locale, type PublicLocale } from './locales'
import { normalizeLocale } from './dashboard/locale'
import { localeFromAcceptLanguage } from './accept-language'
import { spanishSiteEnabled } from './spanish-site'
import { portugueseSiteEnabled } from './portuguese-site'

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
 * True when a path is served by the SPANISH public tree — and only while the
 * Spanish site is on. With the flag off those URLs are not a locale at all:
 * they 404, so claiming them as Spanish here would label an error page `es`.
 */
export function isSpanishPath(pathname: string | null | undefined, enabled = spanishSiteEnabled()): boolean {
  if (!enabled) return false
  const p = pathname || ''
  return p === '/es' || p.startsWith('/es/')
}

/** The same, for the Brazilian Portuguese tree and its own flag. */
export function isPortuguesePath(pathname: string | null | undefined, enabled = portugueseSiteEnabled()): boolean {
  if (!enabled) return false
  const p = pathname || ''
  return p === '/pt-BR' || p.startsWith('/pt-BR/')
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
  'about', 'accessibility', 'affiliates', 'affiliate-terms', 'articles', 'features', 'free-check', 'pricing',
  'privacy', 'refund-policy', 'sitemap', 'terms',
])

/**
 * Sections whose copy is ENGLISH-ONLY, for the same reason the list above is
 * Hebrew-only: the language is written into the components, not looked up.
 *
 * The embedded Shopify surface (`/shopify/app`, `/shopify/link`) contains zero
 * Hebrew characters — it is an English page displayed inside Shopify Admin. So
 * its language is a property of the URL, exactly like `/en/*`, and saying so
 * here is what lets the rest of the contract carry that fact outward instead of
 * inventing a second mechanism for it.
 */
const ENGLISH_ONLY_SEGMENTS = new Set(['shopify'])

/** Exposed so the QA can prove the list matches the real route tree. */
export function englishOnlySegments(): string[] {
  return Array.from(ENGLISH_ONLY_SEGMENTS).sort()
}

/**
 * The language THE ROUTE ITSELF serves, across every public locale, or null
 * when the route is bilingual and the user's preference decides.
 *
 * This is the answer a DOCUMENT needs: `/es/*` is a Spanish document, and
 * <html lang/dir> and the page metadata have to say so.
 */
export function routePublicLocale(pathname: string | null | undefined): PublicLocale | null {
  const p = pathname || ''
  if (isEnglishPath(p)) return 'en'
  if (isSpanishPath(p)) return 'es'
  if (isPortuguesePath(p)) return 'pt-BR'
  if (p === '/') return 'he'
  const segment = p.split('/')[1] ?? ''
  if (ENGLISH_ONLY_SEGMENTS.has(segment)) return 'en'
  return PUBLIC_MARKETING_SEGMENTS.has(segment) ? 'he' : null
}

/**
 * The same question asked by a BILINGUAL surface, which has Hebrew and English
 * strings and nothing else: the dashboard, the auth pages, the embedded Shopify
 * app. A Spanish route answers ENGLISH here, not Hebrew — the two share a
 * script and a direction, so it is the variant a Spanish speaker can read.
 *
 * Kept under its original name and its original `Locale` return type on
 * purpose: every existing caller is one of those bilingual surfaces, so adding
 * a language changed none of them.
 */
export function routeContentLocale(pathname: string | null | undefined): Locale | null {
  const locale = routePublicLocale(pathname)
  return locale === null ? null : toBilingualLocale(locale)
}

/**
 * The locale a CLIENT widget that floats over the whole public site should
 * speak: the cookie notice, the WhatsApp button, the mobile contact bar and the
 * accessibility panel. They are mounted once in the root layout and know only
 * the pathname, so each one used to carry its own
 * `pathname.startsWith('/en') ? 'en' : 'he'` — which answered HEBREW on a
 * Spanish page, putting a Hebrew cookie notice over a Spanish document.
 *
 * Hebrew is the fallback because that is what these widgets have always shown
 * on a route that states no language of its own (the auth screens, where they
 * are mostly suppressed anyway).
 */
export function publicUiLocale(pathname: string | null | undefined): PublicLocale {
  return routePublicLocale(pathname) ?? 'he'
}

/** Exposed so the QA can prove the list covers the real route group. */
export function publicMarketingSegments(): string[] {
  return Array.from(PUBLIC_MARKETING_SEGMENTS).sort()
}

export function resolveRequestLocale(input: {
  pathname?: string | null
  /**
   * An explicit `?lang=` on THIS request.
   *
   * It ranks above the cookie because it is a deliberate act by whatever
   * initiated the navigation, and the cookie is a remembered default. That
   * distinction is what the Shopify journey needed: the embedded English app
   * hands off to the external dashboard, and a `dashboard-language` cookie left
   * behind by an earlier visit must not relabel the journey the merchant is
   * standing in. The proxy persists it, so it survives the login redirect, the
   * `next` destination and a refresh — after which it IS the remembered
   * default, and the switcher can change it like any other.
   */
  langParam?: string | null
  cookieValue?: string | null
  /** Seed for a first visit (e.g. signup language in auth metadata). */
  seed?: string | null
  /** The raw Accept-Language header, parsed with q-values (never substring-matched). */
  acceptLanguage?: string | null
}): PublicLocale {
  // The route decides FIRST and alone where it has a language of its own; no
  // cookie, seed, parameter or header may relabel content it did not write.
  const fixed = routePublicLocale(input.pathname)
  if (fixed) return fixed
  // The cookie, the `?lang=` hand-off and the signup seed all accept Spanish
  // now. They used to stay bilingual on the grounds that there was no Spanish
  // form to hand off FROM — true until 4 October 2026, when the owner's rule
  // ("a customer comes in on the Spanish site, signs up, signs in, and
  // everything is in Spanish") gave /es its own auth routes. With the param
  // still bilingual, `/dashboard?lang=es` — the stamp the Spanish sign-in puts
  // on its destination — was dropped, and the first dashboard after signing up
  // in Spanish came back Hebrew. Each of the three is read with
  // normalizeStoredLocale, so Spanish is accepted only while the flag is on.
  return normalizeStoredLocale(input.langParam)
    ?? normalizeStoredLocale(input.cookieValue)
    ?? normalizeStoredLocale(input.seed)
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
export function explicitRequestLocale(input: {
  pathname?: string | null
  langParam?: string | null
  cookieValue?: string | null
}): PublicLocale | null {
  return routePublicLocale(input.pathname)
    ?? normalizeStoredLocale(input.langParam)
    ?? normalizeStoredLocale(input.cookieValue)
}

/**
 * Whether a `?lang=` should be REMEMBERED as the account's preference, given
 * what is already stored. Returns the value to write, or null to leave the
 * stored choice alone.
 *
 * THE BUG THIS FIXES, found by screenshotting the dashboard in Spanish. The auth
 * pages are bilingual, so signing in stamps `?lang=he|en` on the destination
 * (withLocaleParam) and the proxy persisted it. For a reader whose stored choice
 * was SPANISH, the auth surface resolved the nearest language it has — English —
 * and the stamp overwrote the cookie: logging in silently reset a Spanish
 * dashboard to English, and the Spanish dictionary was never read.
 *
 * So a parameter that merely RESTATES the stored choice, once narrowed to the
 * two languages the auth pages have, is not a choice and is not written. One
 * that genuinely differs still is, because then something asked for it: an
 * `/en/*` route, the OAuth callback, a link from the English sitemap.
 */
export function localeParamToPersist(storedValue: string | null | undefined, langParam: PublicLocale | null): PublicLocale | null {
  if (!langParam) return null
  const stored = normalizeStoredLocale(storedValue)
  // A parameter that merely restates the stored choice, once narrowed to the
  // language the sending surface had, is not a choice. A Spanish parameter is
  // never a narrowing, so it is always written.
  return stored && toBilingualLocale(stored) === langParam ? null : langParam
}

/** The query parameter that carries an explicit locale across a navigation. */
export const LANGUAGE_PARAM = 'lang'

/**
 * A `next` destination that is safe to send a browser to after authentication.
 *
 * ONLY a same-origin path. `//evil.com` and `/\evil.com` are protocol-relative
 * URLs that browsers resolve to another origin, and `https://evil.com` needs no
 * explanation; all three are rejected rather than sanitised into something
 * adjacent. Anything unusable becomes the caller's default, so a hostile value
 * degrades to a safe internal page rather than to an error.
 */
export function sanitizeNextPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  let value = raw
  // A double-encoded value is still an attempt at the same thing.
  try { value = decodeURIComponent(raw) } catch { /* keep the raw form */ }
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback
  // A control character can smuggle a scheme past a naive prefix check.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback
  return value
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

export function languageCookieString(locale: PublicLocale, secure: boolean): string {
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
export interface LocaleMigration<L extends PublicLocale = Locale> {
  /** The locale the client should hold after migration. */
  locale: L
  /** Write this to the cookie (always set — the point is to become server-readable). */
  writeCookie: true
  /** Mirror into localStorage when it disagrees, so the two stay in step. */
  writeStorage: boolean
  reason: 'cookie' | 'migrated_from_storage' | 'server_default'
}

/**
 * `normalize` is a parameter rather than a hard-coded `normalizeLocale` because
 * ONE surface reads a wider set than the rest: the dashboard's words can be
 * Spanish while everything around them is still Hebrew or English, so its
 * provider passes a normalizer that accepts 'es'. The rule the function
 * implements — cookie beats storage beats the server's value — is the same
 * whichever set it is given, and duplicating it per set is how the two would
 * drift. It defaults to the bilingual normalizer, so every existing caller reads
 * and behaves exactly as before.
 */
export function migrateLocalePreference<L extends PublicLocale = Locale>(input: {
  cookieValue?: string | null
  storedValue?: string | null
  serverLocale: NoInfer<L>
  normalize?: (value: unknown) => L | null
}): LocaleMigration<L> {
  const normalize = input.normalize ?? (normalizeLocale as unknown as (value: unknown) => L | null)
  const cookie = normalize(input.cookieValue)
  if (cookie) {
    return { locale: cookie, writeCookie: true, writeStorage: normalize(input.storedValue) !== cookie, reason: 'cookie' }
  }
  const stored = normalize(input.storedValue)
  if (stored) return { locale: stored, writeCookie: true, writeStorage: false, reason: 'migrated_from_storage' }
  return { locale: input.serverLocale, writeCookie: true, writeStorage: true, reason: 'server_default' }
}

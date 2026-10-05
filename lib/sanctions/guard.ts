/**
 * REFUSING A RESTRICTED COUNTRY — the decision, and where it is strict.
 *
 * The list and the law behind it are in `./countries.ts`. This module is only
 * about HOW a request is judged, because the two signals we can have are not
 * equally trustworthy and must not be treated the same way:
 *
 *   WHERE THE REQUEST APPEARS TO COME FROM (the CDN's geo header) is a hint.
 *   It is absent in local development, absent on any path that does not go
 *   through the CDN, and defeated by any VPN. So it FAILS OPEN: no header, no
 *   block. The alternative — refusing everyone we cannot place — turns one
 *   missing header into a site-wide outage, and an outage is a worse outcome
 *   than a geo-block that a determined user can route around anyway. Geo is
 *   here to stop the ordinary case, not to be a border.
 *
 *   WHAT THE CUSTOMER DECLARES (a billing country, a payer country on a
 *   verified payment) is a statement of fact we are entitled to act on, and it
 *   arrives at the moment money moves. So it FAILS CLOSED: a declared
 *   restricted country is refused, and the refusal is final.
 *
 * Neither of these is sanctions screening. Nothing here checks a NAME against
 * the SDN or EU consolidated lists, and a company in a permitted country can
 * still be a restricted party. `./countries.ts` says what this does not cover.
 *
 * WHAT IS DELIBERATELY NOT BLOCKED. Signing in to an existing account, and
 * reading the public site, including the price list. The Ordinance and the
 * sanctions programmes are about DEALINGS — forming a relationship and taking
 * money. A customer of ours who travels through a listed country is not a new
 * dealing, and locking them out of an account they already pay for would be a
 * self-inflicted support incident with no legal benefit. What is refused is
 * the two things that are dealings: creating an account, and paying.
 */

import { normalizeCountry } from '@/lib/billing/market'
import { LOCALE_PREFIX, PUBLIC_LOCALES, normalizePublicLocale, type PublicLocale } from '@/lib/i18n/locales'
import { countryRestriction, type CountryRestriction, type RestrictionReason } from './countries'

export type { CountryRestriction, RestrictionReason }

/**
 * The geo header, and the one reason it is spelled out here instead of
 * imported.
 *
 * Billing already reads this exact header through `countryFromHeaders` in
 * `lib/billing/server-market.ts`, and importing that would be the obvious way
 * to keep one source of truth. It cannot be done: `server-market.ts` imports
 * `next/headers` at module scope, this module is used from `proxy.ts`, and
 * middleware runs in the edge runtime where `next/headers` is not available —
 * so the import would break the middleware build, not just this check.
 *
 * So the name is repeated, and `lib/sanctions/__qa__/sanctions.qa.ts` asserts
 * it is byte-identical to `COUNTRY_HEADER` in `server-market.ts`. If one is
 * ever changed without the other, that guard fails rather than this check
 * silently reading a header nobody sets — which would fail open, i.e. stop
 * blocking anything, which is the one failure mode worth a guard of its own.
 */
export const SANCTIONS_COUNTRY_HEADER = 'x-vercel-ip-country'

/**
 * The restriction implied by where the request appears to come from, or null.
 *
 * FAILS OPEN by construction: a missing or malformed header normalises to
 * null, and a null country has no restriction.
 */
export function restrictionForRequest(h: { get(name: string): string | null }): CountryRestriction | null {
  return countryRestriction(normalizeCountry(h.get(SANCTIONS_COUNTRY_HEADER)))
}

/**
 * The restriction on a country the customer or the payment provider stated.
 *
 * FAILS CLOSED on a value that IS a restricted country. An absent or
 * unreadable value returns null, because "we were told nothing" is not the
 * same claim as "we were told Iran" — the caller decides whether it can
 * proceed without knowing, and at the payment points below we only ever get
 * this value from a payment the provider has already verified.
 */
export function restrictionForDeclaredCountry(value: unknown): CountryRestriction | null {
  return countryRestriction(value)
}

/**
 * What a person is told. Never the law, never the country, never a provider's
 * error: a visitor is told the service is not available where they are and
 * given a way to reach a human, which is all they can act on. The detail goes
 * to our own logs, where it is useful and where it cannot be mined.
 */
const NOTICE: Record<PublicLocale, string> = {
  he: 'השירות אינו זמין במדינה שממנה בוצעה הפנייה, מטעמי ציות לדין. אם לדעתך מדובר בטעות, אפשר לכתוב לנו.',
  en: 'The service is not available in the country this request came from, for legal compliance reasons. If you believe this is a mistake, please contact us.',
  es: 'El servicio no está disponible en el país desde el que se realizó esta solicitud, por motivos de cumplimiento legal. Si cree que es un error, escríbanos.',
  'pt-BR': 'O serviço não está disponível no país de onde esta solicitação foi feita, por motivos de conformidade legal. Se você acredita que isso é um erro, escreva para nós.',
}

/**
 * Typed `Record<PublicLocale, …>` on purpose: a new language cannot be added to
 * the site without the compiler asking for this sentence too. The read below
 * goes through `normalizePublicLocale` for the same reason — a hand-written
 * list of languages here was how /pt-BR visitors were shown Hebrew.
 */
export function sanctionsNotice(locale: unknown): string {
  return NOTICE[normalizePublicLocale(locale) ?? 'he']
}

/**
 * The public pages where a refusal has to happen in the middleware rather than
 * in a route handler.
 *
 * Why these and not a blanket block: `proxy.ts`'s matcher excludes `/api/*`,
 * so the middleware can only see PAGES — and one of the pages matters more
 * than any route does. Email signup calls `supabase.auth.signUp` from the
 * BROWSER, straight to Supabase (app/(auth)/signup/page.tsx), so no server
 * code of ours is on that path and there is nothing else to hook: the page is
 * the only place we can refuse it.
 *
 * `/billing` is here for a different and sharper reason. Refusing only at
 * `/api/paypal/activate` would let someone reach the PayPal buttons, be
 * charged by PayPal, and only then be refused activation — money taken and no
 * service, which is worse than either outcome. The page block is what makes
 * sure the buttons are never offered in the first place.
 *
 * `/login` is deliberately absent: see the note at the top of this file.
 */
/*
 * DERIVED FROM THE LANGUAGE LIST, never written out by hand.
 *
 * It used to be written out, and on 5 October 2026 /pt-BR went live with
 * `/pt-BR/signup` missing from it. That page is the one the comment above calls
 * the only place email signup can be refused at all, because it calls
 * `supabase.auth.signUp` from the browser — so for as long as it was missing, a
 * visitor from a restricted country could create an account through the
 * Portuguese signup page and nothing in our code would have seen the attempt.
 *
 * So the prefixes are built from PUBLIC_LOCALES: a fifth language is covered
 * the day it joins that list.
 */
const RESTRICTED_LOCALE_PATHS = ['/signup', '/free-check'] as const

const RESTRICTED_PATH_PREFIXES: readonly string[] = [
  ...PUBLIC_LOCALES.flatMap((locale) => RESTRICTED_LOCALE_PATHS.map((path) => `${LOCALE_PREFIX[locale]}${path}`)),
  '/billing',
]

export function isRestrictedPath(pathname: string): boolean {
  return RESTRICTED_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * The language to answer a refused page in, from the path alone (no cookie, no
 * session). Read off LOCALE_PREFIX rather than listed, so it cannot fall behind
 * the languages the site actually serves; Hebrew is the bare root, so it is the
 * answer when no prefix matches.
 */
export function noticeLocaleForPath(pathname: string): PublicLocale {
  const match = PUBLIC_LOCALES.filter((locale) => LOCALE_PREFIX[locale] !== '')
    .find((locale) => pathname === LOCALE_PREFIX[locale] || pathname.startsWith(`${LOCALE_PREFIX[locale]}/`))
  return match ?? 'he'
}

/**
 * The single line a refusal writes to the server log. One shape, so the
 * refusals can be found and counted later; the country and the reason are in
 * it because we may have to show a regulator that the block exists and works.
 */
export function logRestrictedAttempt(where: string, restriction: CountryRestriction): void {
  console.warn('[sanctions] refused', {
    where,
    country: restriction.code,
    reason: restriction.reason,
  })
}

/**
 * THE COUNTRY BLOCK — that it refuses what it must, admits everyone else, and
 * is actually wired into every path where a dealing can start.
 *
 * Two kinds of check here, and the second kind is the one that matters most.
 *
 * BEHAVIOUR (A–D): the decision itself, called directly. Cheap and exact.
 *
 * WIRING (E–G): that the decision is REACHED. A country list nothing calls is
 * worse than no list at all, because it reads like protection. So the source
 * of each hook site is asserted to contain the call, and part F asserts the
 * geo header name is identical to the one billing already reads — if those
 * two ever drift, this check reads a header nobody sets, finds no country, and
 * silently stops blocking anything. That failure is invisible in production,
 * which is exactly why it is pinned here.
 *
 * Every guard has a mutation control: the same assertion is re-run against
 * deliberately broken input or source text, and must FAIL. A guard that cannot
 * fail is not evidence.
 */

import { readFileSync } from 'node:fs'
import {
  RESTRICTED_COUNTRIES, countryRestriction, isRestrictedCountry, normalizeCountryCode,
} from '../countries'
import {
  SANCTIONS_COUNTRY_HEADER, isRestrictedPath, noticeLocaleForPath,
  restrictionForDeclaredCountry, restrictionForRequest, sanctionsNotice,
} from '../guard'
import { LOCALE_PREFIX, PUBLIC_LOCALES } from '@/lib/i18n/locales'

let passed = 0
let failed = 0

function chk(name: string, ok: boolean, detail?: string): void {
  if (ok) { passed++; return }
  failed++
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Source with comments stripped, per the repo convention: a promise in a comment is not an implementation. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const headersWith = (country: string | null) => ({
  get: (name: string) => (name === SANCTIONS_COUNTRY_HEADER && country !== null ? country : null),
})

// ───────────────────────────────────────────────────────────────────────────
// A. The four enemy states, which are the criminal exposure, are refused.
// ───────────────────────────────────────────────────────────────────────────
for (const cc of ['IR', 'IQ', 'SY', 'LB']) {
  chk(`A1 ${cc} is refused`, isRestrictedCountry(cc))
  chk(`A2 ${cc} is refused for the Israeli reason, not a softer one`,
    countryRestriction(cc)?.reason === 'enemy_state')
}
// Mutation control: the same assertion against a country that is NOT listed
// must fail, or A1 would pass for anything at all.
chk('A3 CONTROL: an unlisted country is not treated as refused', !isRestrictedCountry('IL'))

// ───────────────────────────────────────────────────────────────────────────
// B. Everyone else is admitted. A block that catches a paying customer is a
//    revenue bug, so the markets we actually sell to are named explicitly.
// ───────────────────────────────────────────────────────────────────────────
for (const cc of ['IL', 'US', 'GB', 'DE', 'ES', 'FR', 'MX', 'BR', 'JP', 'AU', 'CA', 'IN']) {
  chk(`B1 ${cc} is admitted`, !isRestrictedCountry(cc))
}

// ───────────────────────────────────────────────────────────────────────────
// C. The failure directions, which are opposite on purpose.
// ───────────────────────────────────────────────────────────────────────────
chk('C1 no geo header does not block (fails open)', restrictionForRequest(headersWith(null)) === null)
chk('C2 a malformed geo header does not block', restrictionForRequest(headersWith('xx-not-a-code')) === null)
chk('C3 a restricted geo header blocks', restrictionForRequest(headersWith('IR'))?.code === 'IR')
chk('C4 the header is read case-insensitively', restrictionForRequest(headersWith('ir'))?.code === 'IR')
chk('C5 a declared restricted country blocks (fails closed)', restrictionForDeclaredCountry('sy')?.code === 'SY')
chk('C6 a declared permitted country does not block', restrictionForDeclaredCountry('IL') === null)
chk('C7 a non-string country is not a block', restrictionForDeclaredCountry({ code: 'IR' }) === null)
chk('C8 normalisation trims and upper-cases', normalizeCountryCode('  lb ') === 'LB')
chk('C9 CONTROL: a three-letter code is not accepted as alpha-2', normalizeCountryCode('IRN') === null)

// ───────────────────────────────────────────────────────────────────────────
// D. What a refused person is told: no country, no law, no provider error.
// ───────────────────────────────────────────────────────────────────────────
const notices = PUBLIC_LOCALES.map((locale) => sanctionsNotice(locale))
chk('D1 every published language has its own notice, and none repeats another',
  new Set(notices).size === PUBLIC_LOCALES.length, `${new Set(notices).size} distinct of ${PUBLIC_LOCALES.length}`)
chk('D2 an unknown language still gets a notice', sanctionsNotice('fr').length > 0)
for (const n of notices) {
  chk('D3 the notice names no country', !/Iran|Iraq|Syria|Lebanon|Cuba|Korea|איראן|עיראק|סוריה|לבנון/i.test(n))
  chk('D4 the notice names no statute or sanctions programme', !/Ordinance|OFAC|sanction|פקודת|סנקצ/i.test(n))
  chk('D5 the notice offers a way to reach a person', /contact|escríbanos|escreva para nós|לכתוב לנו/i.test(n))
}
/*
 * D6 reads the language list rather than naming languages, because naming them
 * is what went wrong. On 5 October 2026 /pt-BR went live while the restricted
 * prefixes still said he, en and es, so `/pt-BR/signup` — the one page where
 * email signup can be refused at all, since it calls supabase.auth.signUp from
 * the browser — was open to a visitor from a restricted country. The guard that
 * stood here named the same three languages, so it passed throughout.
 */
for (const locale of PUBLIC_LOCALES) {
  const prefix = LOCALE_PREFIX[locale]
  chk(`D6 ${locale}: signup is restricted`, isRestrictedPath(`${prefix}/signup`), `${prefix}/signup`)
  chk(`D6 ${locale}: the free check is restricted`, isRestrictedPath(`${prefix}/free-check`), `${prefix}/free-check`)
  chk(`D6 ${locale}: login is NOT restricted`, !isRestrictedPath(`${prefix}/login`), `${prefix}/login`)
}
chk('D6 billing is restricted whatever the language', isRestrictedPath('/billing'))
// Signing in to an account that already exists is not a new dealing, and
// browsing the public site is not one either. Blocking them buys no legal
// protection and locks out customers who travel, so it must not happen.
chk('D7 login and the public site are NOT blocked',
  !isRestrictedPath('/login') && !isRestrictedPath('/') && !isRestrictedPath('/pricing') && !isRestrictedPath('/terms'))
chk('D8 a path that merely starts with the same letters is not blocked', !isRestrictedPath('/signup-help'))
for (const locale of PUBLIC_LOCALES) {
  chk(`D9 ${locale}: the notice language follows the path`,
    noticeLocaleForPath(`${LOCALE_PREFIX[locale]}/signup`) === locale,
    `${LOCALE_PREFIX[locale]}/signup → ${noticeLocaleForPath(`${LOCALE_PREFIX[locale]}/signup`)}`)
}
chk('D9 a path under no language prefix is answered in Hebrew', noticeLocaleForPath('/signup') === 'he')
// Mutation controls for the two rules above: both are derived from the language
// list, so the thing to prove is that dropping a language from the derivation
// really does fail. Simulated here rather than by editing the source, because
// the source builds the list in one expression.
const handWritten = ['/signup', '/en/signup', '/es/signup', '/free-check', '/en/free-check', '/es/free-check', '/billing']
const handWrittenRestricted = (pathname: string) => handWritten.some((q) => pathname === q || pathname.startsWith(`${q}/`))
chk('D10 mutation control: the hand-written list leaves a published language open',
  PUBLIC_LOCALES.some((locale) => !handWrittenRestricted(`${LOCALE_PREFIX[locale]}/signup`)))
const handWrittenLocale = (pathname: string) =>
  pathname === '/en' || pathname.startsWith('/en/') ? 'en' : pathname === '/es' || pathname.startsWith('/es/') ? 'es' : 'he'
chk('D11 mutation control: the hand-written language read answers Hebrew to a published language',
  PUBLIC_LOCALES.some((locale) => handWrittenLocale(`${LOCALE_PREFIX[locale]}/signup`) !== locale))

// ───────────────────────────────────────────────────────────────────────────
// E. The hooks exist. One per path where an account or a payment can start.
// ───────────────────────────────────────────────────────────────────────────
const HOOKS: Array<[string, string]> = [
  ['proxy.ts', 'proxy.ts'],
  ['the account-creation funnel', 'app/api/auth/callback/route.ts'],
  ['the PayPal payment confirm', 'app/api/paypal/activate/route.ts'],
  ['the Shopify payment start', 'app/api/shopify/billing/start-intent/route.ts'],
  ['the Shopify payment resume', 'app/api/shopify/billing/resume/route.ts'],
  ['the free check', 'app/api/free-check/route.ts'],
]
for (const [label, path] of HOOKS) {
  const src = code(path)
  // Not just "the name appears": the result has to be ASSIGNED and then acted
  // on. An earlier version of this check matched the bare call, and so it
  // stayed green when the whole block was wrapped in `if (false && ...)` —
  // which is the one mutation that matters, since it is what a careless
  // refactor or a bad merge actually produces.
  chk(`E1 ${label} consults the country block and keeps the answer`,
    /(const|let)\s+\w+\s*=\s*restrictionForRequest\s*\(/.test(src))
  chk(`E2 ${label} records the refusal`, /logRestrictedAttempt\s*\(/.test(src))
  chk(`E3 ${label} imports it from the one module`, /@\/lib\/sanctions\/guard/.test(src))
  // And it has to REFUSE: the refusal status appears in the file. 451 is the
  // status for this and nothing else in this codebase uses it, so its
  // presence is specific to a sanctions refusal.
  chk(`E4 ${label} answers 451 rather than carrying on`, /\b451\b/.test(src))
  // Nothing may be behind a disabled or inverted condition.
  chk(`E5 ${label} does not gate the block on a dead condition`,
    !/if\s*\(\s*(false|0)\b/.test(src))
}
// The /signup page block is load-bearing in a way no route check can replace:
// email signup calls supabase.auth.signUp from the BROWSER, so no server code
// of ours is on that path at all.
chk('E6 email signup still has no server hop, so the page block is required',
  /supabase\.auth\.signUp/.test(code('app/(auth)/signup/page.tsx')))

// The middleware is the only thing in front of email signup and of the PayPal
// buttons, so its guard is pinned by SHAPE, not by the presence of a name.
const proxySrc = code('proxy.ts')
chk('E7 the middleware gates on the restricted-path test itself',
  /if\s*\(\s*isRestrictedPath\s*\(\s*pathname\s*\)\s*\)/.test(proxySrc))
chk('E8 the middleware refuses before it builds a Supabase client',
  proxySrc.indexOf('isRestrictedPath') < proxySrc.indexOf('createServerClient('))
chk('E9 the middleware answers 451', /status:\s*451/.test(proxySrc))

// Mutation control for part E: the same assertions against source text with
// the call removed must fail. Without this, E1 could be matching anything.
const gutted = code('app/api/paypal/activate/route.ts').replace(/restrictionForRequest\s*\(/g, 'noop(')
chk('E10 CONTROL: a hook with the call removed is detected',
  !/(const|let)\s+\w+\s*=\s*restrictionForRequest\s*\(/.test(gutted))
chk('E11 CONTROL: a guard disabled with `if (false &&` is detected',
  /if\s*\(\s*(false|0)\b/.test('if (false && isRestrictedPath(pathname)) {'))

// ───────────────────────────────────────────────────────────────────────────
// F. The geo header name, pinned against the copy billing reads.
//
//    These are two string literals in two files that MUST stay identical.
//    `lib/sanctions/guard.ts` explains why it cannot simply import the other
//    one: billing's module pulls in `next/headers`, and proxy.ts runs in the
//    edge runtime where that is unavailable. So the duplication is deliberate
//    and this is the check that makes it safe.
// ───────────────────────────────────────────────────────────────────────────
const billingHeader = /COUNTRY_HEADER\s*=\s*'([^']+)'/.exec(code('lib/billing/server-market.ts'))?.[1]
chk('F1 billing still declares a geo header', typeof billingHeader === 'string' && billingHeader.length > 0)
chk('F2 the block reads the SAME header billing reads', billingHeader === SANCTIONS_COUNTRY_HEADER)
chk('F3 CONTROL: a different header would be caught', billingHeader !== 'cf-ipcountry')

// ───────────────────────────────────────────────────────────────────────────
// G. The list stays honest: shape, and the limits it admits to.
// ───────────────────────────────────────────────────────────────────────────
for (const [key, entry] of Object.entries(RESTRICTED_COUNTRIES)) {
  chk(`G1 ${key} is keyed by its own alpha-2 code`, key === entry.code && /^[A-Z]{2}$/.test(key))
  chk(`G2 ${key} names a reason we recognise`,
    entry.reason === 'enemy_state' || entry.reason === 'comprehensive_sanctions')
  chk(`G3 ${key} carries an operator-readable name`, entry.name.length > 2)
}
chk('G4 the list cannot be mutated at runtime', Object.isFrozen(RESTRICTED_COUNTRIES))
// The module must keep saying what it does NOT do. A list that silently grows
// a reputation as "our sanctions screening" is the actual risk here: it checks
// countries, never named parties, and cannot see sub-national regions.
const countriesSrc = readFileSync('lib/sanctions/countries.ts', 'utf8')
chk('G5 the module still states that it is not party screening', /SDN|restricted PARTIES|Restricted PARTIES/i.test(countriesSrc))
chk('G6 the module still states it cannot see sub-national regions', /Crimea/i.test(countriesSrc))
chk('G7 the module still names the law behind the enemy-state entries', /Trading with the Enemy Ordinance/i.test(countriesSrc))

console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1

export {}

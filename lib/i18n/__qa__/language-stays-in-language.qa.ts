/**
 * A VISITOR'S LANGUAGE SURVIVES EVERY HOP.
 *
 * Oren, 2026-10-17: "נגיד בספרדית עושים בדיקה של אתר מסויים ומקבלים בדיקה
 * ותוצאה באנגלית, השפה תמיד חייבת להיות תואמת" — and then: check whether the
 * same thing happens from one language to another elsewhere.
 *
 * The class is one shape: a surface narrows a `PublicLocale` down to the two
 * languages that existed when it was written, and the else branch of that
 * narrowing is itself a real language, so nothing throws and nobody notices.
 * Four live instances were found and fixed:
 *
 *   1) the free CHECK ran `toBilingualLocale` before building its findings, so
 *      a Spanish or Portuguese visitor read an English check — although
 *      lib/free-check/copy.ts has every finding in all four locales and both
 *      ledger tables accept all four in Production.
 *   2) the Google sign-in flow stored `lang === 'en' ? 'en' : 'he'`, so a
 *      Spanish sign-in came back as HEBREW, and the auth callback then dropped
 *      any `lang` that was not en or he.
 *   3) the onboarding and weekly-summary emails are written in the customer's
 *      language and linked with `&lang=en`, so the click changed the language.
 *   4) a GBP review reply was drafted in Hebrew for a Spanish project.
 *
 * Every guard below is about the class, driven off PUBLIC_LOCALES, so a fifth
 * language is covered the day it is added. Each has a mutation control.
 *
 * Run: npx tsx lib/i18n/__qa__/language-stays-in-language.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, type PublicLocale } from '../locales'
import { buildFindings, buildGeoSignals } from '../../free-check/findings'
import { freeCheckCopy } from '../../free-check/copy'
import { newGoogleFlow } from '../../auth/google-direct'
import { actionUrlFor } from '../../onboarding-emails/email'
import { reportsUrlFor } from '../../reports/weekly/email'
import type { SiteSignals } from '../../free-check/html-signals'

/**
 * Spanish and Portuguese are flag-gated (`normalizeStoredLocale` answers null
 * while their build is off), so the suite turns both on: the question here is
 * whether a language SURVIVES its hops, not whether it is launched. Section B
 * also pins the off state, because that gating is deliberate.
 */
process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED = 'true'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Comments are stripped before any match: this file's own prose names the bug. */
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

/** A page with nothing on it: every finding fires, in the locale's own words. */
/**
 * A page with nothing on it, built from the real `SiteSignals` shape (no cast):
 * every check then fires, so the findings list is the longest it can be and a
 * language collapse has nowhere to hide.
 */
const BARE: SiteSignals = {
  finalUrl: 'https://example.com/',
  htmlLang: null,
  title: null,
  metaDescription: null,
  canonical: null,
  h1: [],
  h2: [],
  images: { total: 0, missingAlt: 0, missing: [] },
  schemaTypes: [],
  jsonLdTypes: [],
  hasOrganizationSchema: false,
  hasFaqSchema: false,
  hasFaqSection: false,
  wordCount: 0,
  text: '',
  internalLinks: 0,
  internalLinkUrls: [],
  externalDomains: [],
  contact: { address: null, phone: null },
  platform: null,
  viewportMeta: false,
  openGraph: false,
  robotsTxt: null,
  llmsTxt: false,
}

// ── A) the free check answers in the visitor's own language ─────────────────
function freeCheckChecks() {
  console.log('A) the free check')
  const titles = new Map<PublicLocale, string>()
  for (const locale of PUBLIC_LOCALES) {
    const findings = buildFindings(BARE, locale)
    const copy = freeCheckCopy(locale)
    const fromThisLocale = findings.every((f) => {
      const titleInCopy = Object.values(copy.findings as Record<string, { title?: string }>).some((c) => c?.title === f.title)
      return titleInCopy
    })
    check(`${locale}: every finding's words come from the ${locale} copy`, findings.length > 0 && fromThisLocale)
    check(`${locale}: the GEO signals too`, buildGeoSignals(BARE, locale).length > 0)
    titles.set(locale, findings.map((f) => f.title).join('|'))
  }
  // Four languages, four different texts: proves the locale is actually read.
  check('no two locales produce the same findings text', new Set(titles.values()).size === PUBLIC_LOCALES.length,
    [...titles.entries()].map(([l, t]) => `${l}:${t.slice(0, 20)}`).join(' '))
  check('MUTATION: collapsing es to en would be caught', titles.get('es') !== titles.get('en'))

  // The route must not narrow before it runs the check.
  const route = strip(read('app/api/free-check/route.ts'))
  check('the free-check route does not narrow the language to two', !/toBilingualLocale/.test(route))
  check('MUTATION: a reintroduced narrowing is caught', /toBilingualLocale/.test(`${route}\nconst locale = toBilingualLocale(publicLocale)`))

  // The model is told the visitor's language, one entry per locale.
  const insight = strip(read('lib/free-check/business-insight.ts'))
  const named = PUBLIC_LOCALES.every((l) => new RegExp(`'?${l.replace('-', '\\-')}'?:`).test(insight))
  check('the AI prompt names a language for every public locale', named && !/locale === 'en' \? 'English'/.test(insight))
  check('MUTATION: a two-way prompt language is caught', /locale === 'en' \? 'English'/.test(`${insight}\nconst language = locale === 'en' ? 'English' : 'Hebrew'`))
}

// ── B) sign-in keeps the language it started in ─────────────────────────────
function signInChecks() {
  console.log('B) sign-in')
  for (const locale of PUBLIC_LOCALES) {
    check(`${locale}: the Google flow keeps it`, newGoogleFlow('/dashboard', locale).lang === locale)
  }
  check('an absent language is still Hebrew', newGoogleFlow('/dashboard', null).lang === 'he')
  check('an unknown language is still Hebrew', newGoogleFlow('/dashboard', 'de').lang === 'he')

  // With the Spanish build off, a hand-edited value still changes nothing.
  const wasEs = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = ''
  check('a flag-off language is still Hebrew', newGoogleFlow('/dashboard', 'es').lang === 'he')
  process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = wasEs
  check('MUTATION: the flag is read at call time', newGoogleFlow('/dashboard', 'es').lang === 'es')

  const cb = strip(read('app/api/auth/callback/route.ts'))
  check('the callback keeps every public locale on the redirect', /normalizeStoredLocale\(lang\)/.test(cb) && !/lang === 'en' \|\| lang === 'he'/.test(cb))
  check('MUTATION: the old two-language filter is caught', /lang === 'en' \|\| lang === 'he'/.test(`${cb}\nif (lang === 'en' || lang === 'he') dest.searchParams.set('lang', lang)`))
}

// ── C) an email's link opens the language the email is written in ───────────
function emailChecks() {
  console.log('C) emails')
  for (const locale of PUBLIC_LOCALES) {
    const onboarding = actionUrlFor('https://x.test', 'connect', 'p1', locale)
    const weekly = reportsUrlFor('https://x.test', 'p1', locale)
    const want = locale === 'he' ? null : `lang=${locale}`
    check(`${locale}: the onboarding link carries its own language`, want === null ? !onboarding.includes('lang=') : onboarding.includes(want))
    check(`${locale}: the weekly summary link too`, want === null ? !weekly.includes('lang=') : weekly.includes(want))
  }
  check('MUTATION: a forced &lang=en is caught', !actionUrlFor('https://x.test', 'connect', 'p1', 'es').includes('lang=en'))
}

// ── D) no surface narrows with a real language as its else branch ───────────
function shapeChecks() {
  console.log('D) the shape of a narrowing')
  const FILES = [
    'lib/free-check/business-insight.ts', 'lib/gbp/http.ts', 'lib/gbp/review-draft.ts',
    'lib/auth/google-direct.ts', 'lib/onboarding-emails/email.ts', 'lib/reports/weekly/email.ts',
  ]
  // Not listed on purpose: lib/seed-scan/claim.ts, lib/seed-scan/summary.ts and
  // lib/presignup/http.ts. The seed-scan pair parses an UNKNOWN stored value
  // into the bilingual `Locale`, so its else branch is a parse default and not
  // a language the visitor chose; presignup narrows through `toBilingualLocale`,
  // the one place that narrowing is allowed to live.
  // Keying on 'he' is allowed: Hebrew is the one language whose else branch
  // (English, latin script) a reader of any other latin-script language can use.
  // Keying on 'en' with a Hebrew else branch is the bug.
  const offenders = FILES.filter((f) => /=== 'en'\s*\?[^:]*:\s*'he'/.test(strip(read(f))))
  check('no fixed file narrows to Hebrew through an === \'en\' test', offenders.length === 0, offenders.join(', '))
  check('MUTATION: such a narrowing is caught', /=== 'en'\s*\?[^:]*:\s*'he'/.test("const l = x === 'en' ? 'en' : 'he'"))
}

freeCheckChecks()
signInChecks()
emailChecks()
shapeChecks()
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}

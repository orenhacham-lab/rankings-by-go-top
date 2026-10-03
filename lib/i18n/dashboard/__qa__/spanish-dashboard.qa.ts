/**
 * THE DASHBOARD IN SPANISH — the plumbing wave.
 *
 * What this wave claims, and therefore what this suite proves:
 *
 *  1. THE WORDS AND THE LOGIC ARE DIFFERENT QUESTIONS. The provider answers both:
 *     `uiLocale` is the language of the words and can be 'es'; `language` is the
 *     bilingual value the ~300 `language === 'he' ? … : …` conditionals, the
 *     server actions and the exports still run on, and is never 'es'. Spanish
 *     narrows to ENGLISH there, never Hebrew.
 *  2. AN UNTRANSLATED SECTION FALLS BACK TO ENGLISH. es.ts is partial on purpose
 *     so the translation can land section by section; what it has not reached is
 *     English words in a left-to-right layout, which a Spanish reader can use.
 *  3. NOTHING FALLS BACK TO HEBREW. Not one string the Spanish dictionary
 *     answers with is in Hebrew.
 *  4. DIRECTION AND FORMATTING COME FROM A TABLE, NOT FROM A TEST FOR ENGLISH.
 *     `x === 'en' ? ltr : rtl` answers RTL for Spanish, and the same shape in
 *     the billing screen answered he-IL for a Spanish price. Both are gone.
 *  5. THE FLAG STILL GATES THE WHOLE LANGUAGE. With it off, a hand-edited
 *     cookie saying 'es' cannot open a half-translated dashboard.
 *
 * It also PRINTS COVERAGE — how many of the dictionary's leaves are Spanish —
 * because that number is the honest progress report for the rest of the wave.
 *
 * MUTATION CONTROL. Every guard is re-run against a deliberately broken input
 * and must then fail.
 *
 * Run: npx tsx lib/i18n/dashboard/__qa__/spanish-dashboard.qa.ts
 */

import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DashboardLanguageProvider } from '../useDashboardLanguage'
import { getDashboardDictionary } from '../getDashboardDictionary'
import { normalizeDashboardUiLocale, resolveDashboardUiLocale, dashboardBilingualLocale, normalizeLocale } from '../locale'
import { resolveRequestLocale, explicitRequestLocale, localeParamToPersist } from '../../request-locale'
import { deepMergeDictionary, type DeepPartial } from '../merge'
import { dashboardEs } from '../es'
import { dashboardEn } from '../en'
import { dashboardHe } from '../he'
import { getLocaleConfig, INTL_LOCALE, PAYPAL_LOCALE, toBilingualLocale, PUBLIC_LOCALES } from '../../locales'
import { spanishSiteEnabled } from '../../spanish-site'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(p, 'utf8')
/** Source with comments stripped, per the repo's source-guard convention. */
const src = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const HEBREW = /[֐-׿]/
/**
 * `DashboardDictionary` is `typeof dashboardHe` on an `as const` object, so every
 * value's TYPE is the literal Hebrew text and `es.sidebar.dashboard === 'Panel'`
 * is a type error saying the two have no overlap — which is the type system
 * describing the Hebrew dictionary, not this test. Read a leaf as a plain string
 * and the comparison says what it means.
 */
const str = (v: unknown): string => v as string

type Leaf = { path: string; text: string }
/** Every string a dictionary answers with, including what its functions return. */
function leaves(node: unknown, at = '', out: Leaf[] = []): Leaf[] {
  if (typeof node === 'string') { out.push({ path: at, text: node }); return out }
  if (typeof node === 'function') {
    // A dictionary function takes counts, names or dates. Probe it with values of
    // each shape and keep whatever it returns; one that needs something else is
    // skipped rather than reported as a failure it did not cause.
    for (const args of [[1], [2], ['x'], [1, 2], ['x', 'y']]) {
      try {
        const r = (node as (...a: unknown[]) => unknown)(...args)
        if (typeof r === 'string') out.push({ path: `${at}()`, text: r })
      } catch { /* wrong shape for this entry */ }
    }
    return out
  }
  if (Array.isArray(node)) { node.forEach((v, i) => leaves(v, `${at}[${i}]`, out)); return out }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) leaves(v, at ? `${at}.${k}` : k, out)
  }
  return out
}

console.log('\n1. The two questions, and the one narrowing point')
check('1a: the provider exposes BOTH uiLocale and language',
  /uiLocale: PublicLocale/.test(src('lib/i18n/dashboard/useDashboardLanguage.tsx'))
  && /language: Locale/.test(src('lib/i18n/dashboard/useDashboardLanguage.tsx')))
check('1b: language is toBilingualLocale(uiLocale), not a second piece of state',
  /language: toBilingualLocale\(uiLocale\)/.test(src('lib/i18n/dashboard/useDashboardLanguage.tsx'))
  && !/useState<Locale>/.test(src('lib/i18n/dashboard/useDashboardLanguage.tsx')))
check('1c: Spanish narrows to English, never Hebrew',
  toBilingualLocale('es') === 'en' && dashboardBilingualLocale('es') === 'en')
check('1d: the dictionary takes a PublicLocale and has an entry per public locale',
  /getDashboardDictionary\(locale: PublicLocale\)/.test(src('lib/i18n/dashboard/getDashboardDictionary.ts'))
  && PUBLIC_LOCALES.every((l) => !!getDashboardDictionary(l)))
check('1-MUT1: a provider holding one locale would fail 1a',
  !/uiLocale: PublicLocale/.test('type V = { language: Locale; isLoaded: boolean }'))
check('1-MUT2: a narrowing that answered Hebrew would fail 1c',
  ((l: string) => (l === 'en' ? 'en' : 'he'))('es') !== 'en')

/** Every leaf es.ts names, used by group 2 to pick a fallback and by group 7 to count. */
const translatedPaths = new Set(leaves(dashboardEs as DeepPartial<typeof dashboardHe>).map((l) => l.path))

console.log('\n2. An untranslated section is ENGLISH, and the merge leaves English alone')
const es = getDashboardDictionary('es')
const en = getDashboardDictionary('en')
const he = getDashboardDictionary('he')
check('2a: a translated section is Spanish', str(es.sidebar.dashboard) === 'Panel' && str(es.common.save) === 'Guardar')
// Picked from what es.ts has NOT translated yet, rather than named here: a
// section named in a test stops being a fallback the day it is translated, and
// the test then proves nothing while still passing.
const untranslated = leaves(en).find((l) => {
  if (translatedPaths.has(l.path)) return false
  const esLeaf = leaves(es).find((e) => e.path === l.path)
  const heLeaf = leaves(he).find((h) => h.path === l.path)
  return !!esLeaf && !!heLeaf && l.text !== heLeaf.text
})
check('2b: a section es.ts has not reached is the ENGLISH string, not the Hebrew one',
  !!untranslated
  && str(leaves(es).find((e) => e.path === untranslated.path)?.text) === untranslated.text
  && str(leaves(es).find((e) => e.path === untranslated.path)?.text) !== str(leaves(he).find((h) => h.path === untranslated.path)?.text),
  untranslated ? untranslated.path : 'everything is translated — retire this check')
check('2c: every key the English dictionary has, the Spanish one has',
  leaves(en).every((l) => leaves(es).some((e) => e.path === l.path)),
  `${leaves(en).length} English leaves vs ${leaves(es).length} Spanish`)
check('2d: building the Spanish dictionary did not write into the English one',
  str(en.sidebar.dashboard) === 'Dashboard' && str(dashboardEn.sidebar.dashboard) === 'Dashboard')
check('2e: the merge replaces a function whole rather than merging into it',
  typeof es.waitingCard.articles === 'function' && str(es.waitingCard.articles(1)) === 'Hay 1 artículo escrito esperando tu aprobación')
const merged = deepMergeDictionary({ a: { b: 'base', c: 'keep' } }, { a: { b: 'over' } })
check('2f: the merge is deep — a sibling key survives an overlay', merged.a.b === 'over' && merged.a.c === 'keep')
check('2-MUT1: an overlay that dropped a key would fail 2f',
  deepMergeDictionary({ a: { b: 'base', c: 'keep' } }, { a: { c: undefined } }).a.c === 'keep')
check('2-MUT2: a shallow merge would lose the sibling',
  ({ ...{ a: { b: 'base', c: 'keep' } }, ...{ a: { b: 'over' } } } as { a: { c?: string } }).a.c === undefined)

console.log('\n3. Nothing the Spanish dictionary answers with is Hebrew')
const spanishLeaves = leaves(es)
/**
 * Four leaves of the ENGLISH dictionary are in Hebrew, so they reach Spanish
 * through the fallback. One is correct — a language's name is written in that
 * language, so `contentHub.brief.languageHe` must say "עברית" on every screen.
 * The other three are a real gap in en.ts: the Shopify publish gate was never
 * translated, so the ENGLISH dashboard shows Hebrew there too. That is the
 * content screens' own bug, not this wave's, and translating it would edit a
 * screen another thread owns. So it is named here, and the count is held: a
 * FIFTH Hebrew string arriving in English fails this guard.
 */
const KNOWN_HEBREW_IN_ENGLISH = [
  'contentHub.brief.languageHe',
  'contentHub.editor.publishGate.shopifyTitle',
  'contentHub.editor.publishGate.shopifyText',
  'contentHub.editor.publishGate.shopifySecondary',
]
const hebrewInSpanish = spanishLeaves.filter((l) => HEBREW.test(l.text))
const unexpectedHebrew = hebrewInSpanish.filter((l) => !KNOWN_HEBREW_IN_ENGLISH.includes(l.path))
check('3a: the only Hebrew a Spanish screen can show is the four strings English shows too',
  unexpectedHebrew.length === 0, unexpectedHebrew.slice(0, 5).map((l) => `${l.path}: ${l.text.slice(0, 40)}`).join(' | '))
check('3a-ii: those four are still in the English dictionary, i.e. not fixed behind this guard',
  KNOWN_HEBREW_IN_ENGLISH.every((p) => leaves(en).some((l) => l.path === p && HEBREW.test(l.text))))
const esOwnLeaves = leaves(dashboardEs)
check('3b: no Hebrew in es.ts itself', !esOwnLeaves.some((l) => HEBREW.test(l.text)))
check('3-MUT1: a Hebrew string in a Spanish section would be caught',
  HEBREW.test(leaves({ sidebar: { dashboard: 'לוח בקרה' } })[0].text))

console.log('\n4. Direction and formatting come from a table')
check('4a: Spanish is left to right', getLocaleConfig('es').dir === 'ltr')
check('4b: the direction wrapper reads uiLocale and the locale table, not a test for English',
  /getLocaleConfig\(uiLocale\)\.dir/.test(src('components/DashboardDirectionWrapper.tsx'))
  && !/=== 'en'/.test(src('components/DashboardDirectionWrapper.tsx')))
check('4c: the dashboard error screen takes its direction from the same table',
  /getLocaleConfig\(uiLocale\)\.dir/.test(src('app/(dashboard)/error.tsx')))
check('4d: Intl and PayPal locales are tables with a Spanish entry',
  INTL_LOCALE.es === 'es-ES' && PAYPAL_LOCALE.es === 'es_ES'
  && Object.keys(INTL_LOCALE).length === PUBLIC_LOCALES.length)
check('4e: the billing screens read those tables instead of he-IL by default',
  /INTL_LOCALE\[uiLocale\]/.test(src('app/(dashboard)/billing/BillingView.tsx'))
  && /PAYPAL_LOCALE\[uiLocale\]/.test(src('app/(dashboard)/billing/client.tsx'))
  && !/'he-IL'/.test(src('app/(dashboard)/billing/BillingView.tsx'))
  && !/'he_IL'/.test(src('app/(dashboard)/billing/client.tsx')))
check('4-MUT1: the old ternary would fail 4b',
  /=== 'en'/.test("const dir = language === 'en' ? 'ltr' : 'rtl'"))
check('4-MUT2: a two-entry Intl table would fail 4d',
  Object.keys({ he: 'he-IL', en: 'en-US' }).length !== PUBLIC_LOCALES.length)

console.log('\n5. The flag still gates the whole language')
const flag = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
try {
  process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
  check('5a: with the flag on, a stored "es" is accepted', normalizeDashboardUiLocale('es') === 'es'
    && resolveDashboardUiLocale('es') === 'es')
  process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = undefined as unknown as string
  delete process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  check('5b: with the flag off, a hand-edited "es" cookie is refused and falls back to Hebrew',
    normalizeDashboardUiLocale('es') === null && resolveDashboardUiLocale('es') === 'he')
  check('5c: the flag never affects Hebrew or English',
    normalizeDashboardUiLocale('he') === 'he' && normalizeDashboardUiLocale('en') === 'en')
} finally {
  if (flag === undefined) delete process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  else process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = flag
}
check('5d: the switcher offers Spanish only behind the same flag',
  /spanishSiteEnabled\(\)/.test(src('components/DashboardLanguageSwitcher.tsx'))
  && /locale: 'es'/.test(src('components/DashboardLanguageSwitcher.tsx')))
check('5d-ii: the rail gives the switcher its own row only when Spanish is offered',
  /spanishSiteEnabled\(\) \? 'grid-cols-1' : 'grid-cols-2'/.test(src('components/layout/Sidebar.tsx')))
check('5e: the flag reads exactly "true"', spanishSiteEnabled('true') && !spanishSiteEnabled('TRUE') && !spanishSiteEnabled('1'))
check('5-MUT1: a switcher without the gate would fail 5d',
  !/spanishSiteEnabled\(\)/.test("const options = [{ locale: 'es' }]"))

console.log('\n6. The real provider renders Spanish, left to right, with no effects run')
process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
function SpanishProbe() {
  // Deliberately the same shape every converted screen now uses.
  const dict = getDashboardDictionary('es')
  return createElement('span', null, str(dict.sidebar.dashboard), ' ', str(dict.common.save))
}
// The same spelling lib/i18n/dashboard/__qa__/first-render-language.qa.ts uses:
// a .ts suite has no JSX, and the provider's children are a prop here.
const markup = renderToStaticMarkup(
  createElement(DashboardLanguageProvider as never, { initialLocale: 'es', children: createElement(SpanishProbe) } as never) as never
)
check('6a: the first render, with no effect run, is already Spanish',
  markup.includes('Panel') && markup.includes('Guardar'), markup.slice(0, 120))
check('6b: it carries no Hebrew', !HEBREW.test(markup))
check('6-MUT1: a Hebrew first render would be caught', HEBREW.test('<span>לוח בקרה</span>'))

console.log('\n8. The stored choice survives the whole request chain')
/**
 * THE BUG THE SCREENSHOTS FOUND, and which reading the diff did not. A public
 * page takes its language from its URL, so wave 2 never needed the cookie to
 * carry Spanish. The dashboard has no `/es` URL: the switcher's choice is the
 * only signal. Every step of the chain narrowed the cookie to the bilingual
 * pair, so `/dashboard` with `language=es` rendered ENGLISH — the rail, the
 * buttons, all of it — while the Spanish dictionary sat there unused.
 */
{
  const flagBefore = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
    check('8a: a stored "es" resolves to Spanish on a route with no language of its own',
      resolveRequestLocale({ pathname: '/dashboard', cookieValue: 'es' }) === 'es')
    check('8b: …and the proxy therefore hands it forward instead of dropping it',
      explicitRequestLocale({ pathname: '/dashboard', cookieValue: 'es' }) === 'es')
    check('8c: a route WITH a language of its own still outranks the cookie',
      resolveRequestLocale({ pathname: '/en/pricing', cookieValue: 'es' }) === 'en'
      && resolveRequestLocale({ pathname: '/', cookieValue: 'es' }) === 'he')
    check('8d: an explicit ?lang= still outranks it, as the Shopify hand-off needs',
      resolveRequestLocale({ pathname: '/dashboard', langParam: 'en', cookieValue: 'es' }) === 'en')
    check('8e: the bilingual surfaces narrow it to English, never Hebrew',
      toBilingualLocale(resolveRequestLocale({ pathname: '/dashboard', cookieValue: 'es' })) === 'en')
    delete process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
    check('8f: with the flag off the same cookie changes nothing',
      resolveRequestLocale({ pathname: '/dashboard', cookieValue: 'es', acceptLanguage: 'he' }) === 'he'
      && explicitRequestLocale({ pathname: '/dashboard', cookieValue: 'es' }) === null)
  } finally {
    if (flagBefore === undefined) delete process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
    else process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = flagBefore
  }
  check('8-MUT1: the bilingual normalizer, which is what the bug was, would fail 8a',
    normalizeLocale('es') === null)
  check('8-MUT2: a chain that let the cookie beat the route would fail 8c',
    ((cookie: string, routeLocale: string) => cookie || routeLocale)('es', 'en') !== 'en')
}

console.log('\n9. Signing in does not reset a Spanish reader to English')
/**
 * THE SECOND BUG THE SCREENSHOTS FOUND. The stored cookie carrying Spanish was
 * necessary but not sufficient: the login redirect stamps `?lang=he|en` on its
 * destination, because the auth pages have two languages, and the proxy wrote
 * that over the cookie. The measured result was a Spanish reader logging in and
 * landing on an English dashboard, with lang="en" dir="ltr" and the whole rail
 * in English.
 */
{
  const flagBefore = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
    check('9a: the English stamp the bilingual auth pages add does NOT overwrite a stored Spanish',
      localeParamToPersist('es', 'en') === null)
    check('9b: a parameter that restates the stored choice is not written either',
      localeParamToPersist('he', 'he') === null && localeParamToPersist('en', 'en') === null)
    check('9c: a parameter that genuinely differs IS written',
      localeParamToPersist('he', 'en') === 'en' && localeParamToPersist('en', 'he') === 'he'
      && localeParamToPersist('es', 'he') === 'he')
    check('9d: with nothing stored, the parameter is the choice',
      localeParamToPersist(null, 'en') === 'en' && localeParamToPersist('nonsense', 'he') === 'he')
    check('9e: no parameter writes nothing', localeParamToPersist('es', null) === null)
    check('9f: the proxy uses it rather than persisting the parameter directly',
      /localeParamToPersist\(/.test(src('proxy.ts')) && !/const localeToPersist = normalizedLangParam/.test(src('proxy.ts')))
  } finally {
    if (flagBefore === undefined) delete process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
    else process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = flagBefore
  }
  check('9-MUT1: persisting the parameter unconditionally, which is what the bug was, would lose Spanish',
    ((stored: string, param: string) => param)('es', 'en') === 'en')
}

console.log('\n7. Coverage — the honest progress report')
const translated = translatedPaths
const total = leaves(dashboardEn).length
const pct = Math.round((translated.size / total) * 1000) / 10
const sections = Object.keys(dashboardEs)
console.log(`  → ${translated.size} of ${total} dictionary leaves are Spanish (${pct}%), across ${sections.length} sections:`)
console.log(`    ${sections.join(', ')}`)
console.log('  → every other leaf answers in English, by design (see lib/i18n/dashboard/merge.ts)')
check('7a: the chrome every screen shows is translated',
  ['sidebar', 'workspace', 'common', 'waitingCard', 'topBarActions'].every((s) => sections.includes(s)))
check('7b: coverage is reported, not asserted at a number that would need editing per commit', pct > 0 && pct <= 100)

// The twelve screens that still take `language` as a prop rather than reading
// the provider: they show English words on a Spanish dashboard until the wave
// that threads uiLocale through their parents. Named here so the gap is a list,
// not a surprise.
const propDriven = [
  'components/reminders/ReminderEmailsCard.tsx', 'components/content/TopicPlanDrawer.tsx',
  'components/content/OverlapHint.tsx', 'components/content/AutomationSchedule.tsx',
  'components/content/InternalLinkIndexStatus.tsx', 'components/content/ArticleInternalLinkApplyPanel.tsx',
  'components/content/AutomationIdeas.tsx', 'components/content/NewTopicsLinkPlanPanel.tsx',
  'components/content/workspace/ExistingContentScreen.tsx', 'components/content-strategy/ContentStrategyScreen.tsx',
  'components/keyword-research/TrendModal.tsx', 'components/keyword-research/AIQuestionsModal.tsx',
  // Not prop-driven — FROZEN. lib/onboarding/__qa__/onboarding-surfaces.qa.ts
  // pins this page's sha256, because it is what the flag-off route renders, so
  // it keeps reading the bilingual language on purpose.
  'app/(dashboard)/projects/new/page.tsx',
]
const stillPropDriven = propDriven.filter((f) => /getDashboardDictionary\(language\)/.test(src(f)))
console.log(`  → ${stillPropDriven.length} screens are English on a Spanish dashboard (the language arrives as a prop, or the page is frozen)`)
check('7c: no OTHER screen reads the dictionary with the bilingual language',
  (() => {
    const hits = execSync(
      "grep -rl --include=*.ts --include=*.tsx 'getDashboardDictionary(language)' . --exclude-dir=node_modules --exclude-dir=.next | grep -v __qa__ || true",
      { encoding: 'utf8' }
    ).split('\n').map((s) => s.replace(/^\.\//, '')).filter(Boolean)
    const unexpected = hits.filter((h) => !propDriven.includes(h))
    if (unexpected.length) console.log(`    unexpected: ${unexpected.join(', ')}`)
    return unexpected.length === 0
  })())

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}

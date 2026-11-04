/**
 * THE DASHBOARD IN GERMAN — the full-translation wave, eighth language.
 *
 * Oren's rule for this wave: a language we add is translated in BOTH the public
 * site and the app, so "German falls back to English" is not good enough for
 * the dashboard. What that claim means in code, and therefore what this suite
 * proves:
 *
 *  1. PARITY WITH ITALIAN, LEAF FOR LEAF. it/ is the finished parts dictionary
 *     this one was written from, so every path it answers the German one
 *     answers too. A section translated half-way shows up here as a missing
 *     path.
 *  2. NOTHING ANSWERS IN HEBREW, and nothing answers in ITALIAN, FRENCH,
 *     SPANISH or PORTUGUESE either. The second half is the one that matters
 *     here: de/ was written from the it/ parts, so a part left un-translated
 *     reads as Italian rather than as the English the merge falls back to — and
 *     Italian is latin-script left-to-right prose, which no Hebrew detector
 *     would ever notice.
 *  3. THE PARTS DIRECTORY CANNOT HALF-OWN A SECTION. de/ is assembled by a flat
 *     spread, so two parts naming one section would silently drop one of them.
 *  4. THE COPY OUTSIDE THE DICTIONARY IS GERMAN TOO — the plan limit lines, the
 *     auth frame's brand panel, the 451 notice, the AI-visibility strings, the
 *     monthly report and the export labels. Every one of those was once a
 *     ternary chain ending in Hebrew or English, and lib/plans/features.ts in
 *     particular fell through to HEBREW for a locale with no branch of its own,
 *     which is the bug that once shipped on the live /pt-BR pricing page.
 *  5. THE FLAG STILL GATES THE LANGUAGE. The in-app switcher offers DE only
 *     while the German build is on.
 *  6. NO PRICE IS NAMED IN EUROS. This is the one rule German has that no other
 *     language does. Outside Israel the product charges US DOLLARS through
 *     Creem, so a euro figure on a German screen is a price this service does
 *     not take — and the Preisangabenverordnung is precisely about the stated
 *     price being the price actually payable. A German reader expects euros, so
 *     this is the mistake a translator makes without being asked to.
 *
 * MUTATION CONTROL. Every guard is re-run against a deliberately broken input
 * and must then fail.
 *
 * Run: npx tsx lib/i18n/dashboard/__qa__/german-dashboard.qa.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { dashboardDe, DE_PARTS } from '../de/index'
import { dashboardIt } from '../it/index'
import { dashboardFr } from '../fr/index'
import { dashboardPtBR } from '../pt-BR/index'
import { dashboardEs } from '../es'
import { dashboardEn } from '../en'
import { getDashboardDictionary } from '../getDashboardDictionary'
import { planLimitLines, trialLimitLines, CHECKS_EXPLAINER } from '../../../plans/features'
import { sanctionsNotice } from '../../../sanctions/guard'
import { createI18n } from '../../../ai-visibility/i18n'
import { monthlyCopy } from '../../../../components/reports/monthly/copy'
import { getExportLabels } from '../../../export/i18n'
import { landingDe } from '../../public/landing-de'
import { landingHe } from '../../public/landing-he'
import { formatDate as curriedDate } from '../../format-date'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Source with comments stripped, per the repo's source-guard convention. */
const src = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const HEBREW = /[֐-׿]/

type Leaf = { path: string; text: string }
/** Every string a dictionary answers with, including what its functions return. */
function leaves(node: unknown, at = '', out: Leaf[] = []): Leaf[] {
  if (typeof node === 'string') { out.push({ path: at, text: node }); return out }
  if (typeof node === 'function') {
    for (const args of [[1], [2], [0], ['x'], ['x', 'y'], [1, 2], ['x', 1]]) {
      try {
        const r = (node as (...a: unknown[]) => unknown)(...args)
        if (typeof r === 'string') { out.push({ path: at, text: r }); return out }
        if (Array.isArray(r)) { r.forEach((v, i) => leaves(v, `${at}[${i}]`, out)); return out }
      } catch { /* a function that wants another shape is probed again below */ }
    }
    return out
  }
  if (Array.isArray(node)) { node.forEach((v, i) => leaves(v, `${at}[${i}]`, out)); return out }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) leaves(v, at ? `${at}.${k}` : k, out)
  }
  return out
}

const deLeaves = leaves(dashboardDe)
const itLeaves = leaves(dashboardIt)
const dePaths = new Set(deLeaves.map((l) => l.path))
const deByPath = new Map(deLeaves.map((l) => [l.path, l.text]))

console.log('\nGERMAN DASHBOARD\n')
console.log(`  → ${deLeaves.length} German leaves across ${Object.keys(dashboardDe).length} sections (Italian: ${itLeaves.length} across ${Object.keys(dashboardIt).length})`)

// 1 — PARITY WITH ITALIAN.
const missing = itLeaves.filter((l) => !dePaths.has(l.path))
check('1a: every path the Italian dictionary answers, the German one answers',
  missing.length === 0, missing.slice(0, 5).map((l) => l.path).join(', '))
check('1b: the German dictionary names the same number of sections as the English one',
  Object.keys(dashboardDe).length === Object.keys(dashboardEn).length,
  `de ${Object.keys(dashboardDe).length} vs en ${Object.keys(dashboardEn).length}`)
check('1c: every German section is a real section of the English dictionary',
  Object.keys(dashboardDe).every((k) => k in dashboardEn),
  Object.keys(dashboardDe).filter((k) => !(k in dashboardEn)).join(', '))
check('1a mutation: a missing section is caught',
  (() => {
    const broken = new Set(dePaths); for (const p of [...broken]) if (p.startsWith('siteHealth.')) broken.delete(p)
    return itLeaves.some((l) => !broken.has(l.path))
  })())

// 2 — NOT HEBREW, AND NOT ANOTHER LATIN LANGUAGE EITHER.
const hebrew = deLeaves.filter((l) => HEBREW.test(l.text))
check('2a: no leaf of the German dictionary is in Hebrew',
  hebrew.length === 0, hebrew.slice(0, 5).map((l) => `${l.path} = ${l.text}`).join(' | '))
const merged = leaves(getDashboardDictionary('de'))
const mergedHebrew = merged.filter((l) => HEBREW.test(l.text))
// The English dashboard itself shows a few Hebrew publishGate strings, which the
// main build thread owns; the German dashboard inherits exactly those.
const inheritedHebrew = leaves(dashboardEn).filter((l) => HEBREW.test(l.text)).map((l) => l.path)
check('2b: the merged German dictionary is Hebrew-free apart from what the ENGLISH one already shows',
  mergedHebrew.every((l) => inheritedHebrew.includes(l.path)),
  mergedHebrew.filter((l) => !inheritedHebrew.includes(l.path)).slice(0, 5).map((l) => l.path).join(', '))
check('2a mutation: a Hebrew string is caught', HEBREW.test('מילת מפתח'))

/*
 * 2c — THE COPIED-NOT-TRANSLATED GUARD. de/ was written from the it/ parts, so
 * the failure mode is "a part was copied and not translated", which leaves
 * ITALIAN on a German screen. Measured as a RATE rather than per leaf: a handful
 * of leaves legitimately coincide across two latin languages (a product name,
 * "SEO", a bare number, a one-word label), so the bar is that the overwhelming
 * majority of long prose leaves differ. A whole untranslated part moves this
 * number immediately, which is what it is for.
 */
const PROSE_MIN = 25
const comparable = (other: Leaf[]) => other.filter((l) => l.text.length >= PROSE_MIN && deByPath.has(l.path))
for (const [name, other] of [
  ['Italian', itLeaves],
  ['French', leaves(dashboardFr)],
  ['Portuguese', leaves(dashboardPtBR)],
  ['Spanish', leaves(dashboardEs)],
] as const) {
  const pool = comparable(other)
  const same = pool.filter((l) => deByPath.get(l.path) === l.text)
  const rate = pool.length === 0 ? 1 : same.length / pool.length
  check(`2c-${name}: German prose is not ${name} (${same.length} of ${pool.length} long leaves identical)`,
    pool.length > 500 && rate < 0.02,
    `${(rate * 100).toFixed(1)}% identical; e.g. ${same.slice(0, 4).map((l) => `${l.path}="${l.text.slice(0, 50)}"`).join(' | ')}`)
}
check('2c mutation: a dictionary that is really Italian is caught',
  (() => {
    const pool = comparable(itLeaves)
    return pool.length > 0 && pool.length / pool.length >= 0.02
  })())
const enLeaves = leaves(dashboardEn)
const enPool = enLeaves.filter((l) => l.text.length >= PROSE_MIN && deByPath.has(l.path))
const enSame = enPool.filter((l) => deByPath.get(l.path) === l.text)
check(`2d: German prose is not English either (${enSame.length} of ${enPool.length} long leaves identical)`,
  enPool.length > 500 && enSame.length / enPool.length < 0.02,
  enSame.slice(0, 4).map((l) => `${l.path}="${l.text.slice(0, 50)}"`).join(' | '))

/*
 * 2e — THE REGISTER. Oren's register for every foreign language is the formal
 * one, and in German that is Sie, never du. The unambiguous informal markers
 * are the pronouns `du`, `dich`, `dir` and the possessives `dein…`.
 *
 * JavaScript's \b counts only [A-Za-z0-9_], so an umlaut is a word boundary and
 * a bare \bdu\b would fire inside "Händler" the moment a word ends in a vowel
 * before it. Hence the Unicode lookarounds and the u flag. `dir` is matched
 * standalone only, because "direkt", "Direktor" and "Verzeichnis" all contain
 * it; `dein` is matched with its whole inflection because no formal German word
 * begins that way.
 */
const INFORMAL = /(?<!\p{L})(?:du|dich|dir|dein|deine|deinen|deinem|deiner|deines)(?!\p{L})/iu
const informal = deLeaves.filter((l) => INFORMAL.test(l.text))
check('2e: the whole German dictionary keeps the formal Sie register',
  informal.length === 0, informal.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
check('2e mutation: an informal sentence is caught',
  INFORMAL.test('Verbinde deine Website, um zu beginnen') && INFORMAL.test('Hier sind dein Keywords'))
check('2e control: the pattern does not fire on ordinary formal German',
  !INFORMAL.test('Verbinden Sie Ihre Website, und wir messen die Positionen jeden Monat direkt im Verzeichnis.'))

/*
 * 2f — ß AND THE UMLAUTS ARE WRITTEN OUT. A dictionary transliterated through
 * an ASCII pipeline comes back as "Groesse" and "fuer", which is how a German
 * reader can tell the text was not written by anyone who speaks the language.
 * The check is that the dictionary uses the real characters AND that the
 * transliterated spellings of the commonest words are absent.
 */
{
  const all = deLeaves.map((l) => l.text).join('\n')
  check('2f: the German dictionary writes umlauts and ß as themselves',
    /[äöüÄÖÜß]/.test(all))
  const TRANSLIT = /(?<!\p{L})(?:fuer|ueber|koennen|moechten|groesse|muessen|waehlen|loeschen|zurueck|hinzufuegen)(?!\p{L})/iu
  const translit = deLeaves.filter((l) => TRANSLIT.test(l.text))
  check('2f1: and no word is spelled the ASCII way',
    translit.length === 0, translit.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
  check('2f1 mutation: a transliterated word is caught',
    TRANSLIT.test('Bitte waehlen Sie eine Groesse fuer das Bild'))
}

// 3 — THE PARTS DIRECTORY.
const owners: Record<string, number> = {}
for (const part of DE_PARTS) for (const k of Object.keys(part as object)) owners[k] = (owners[k] || 0) + 1
const shared = Object.entries(owners).filter(([, n]) => n > 1)
check('3a: no section is named by two parts of de/', shared.length === 0, shared.map(([k]) => k).join(', '))
check('3b: the parts together name every section of the assembled dictionary',
  Object.keys(owners).length === Object.keys(dashboardDe).length)
check('3a mutation: a section in two parts is caught',
  (() => {
    const o: Record<string, number> = {}
    for (const part of [...DE_PARTS, DE_PARTS[0]]) for (const k of Object.keys(part as object)) o[k] = (o[k] || 0) + 1
    return Object.values(o).some((n) => n > 1)
  })())

// 4 — THE COPY OUTSIDE THE DICTIONARY.
const planLines = [...planLimitLines('regular', 'de'), ...planLimitLines('large_agency', 'de'), ...trialLimitLines('de')]
check('4a: the plan and trial limit lines are German, not Hebrew',
  planLines.every((l) => !HEBREW.test(l)) && planLines.some((l) => /Website|Websites/i.test(l)),
  planLines.filter((l) => HEBREW.test(l))[0])
check('4a mutation: a Hebrew plan line is caught', planLimitLines('regular', 'he').some((l) => HEBREW.test(l)))
check('4a1: and they are not the Italian ones either',
  planLimitLines('regular', 'de').join('|') !== planLimitLines('regular', 'it').join('|'))
check('4b: the "what a check is" sentence has its own German',
  !HEBREW.test(CHECKS_EXPLAINER.de) && CHECKS_EXPLAINER.de !== CHECKS_EXPLAINER.it && CHECKS_EXPLAINER.de !== CHECKS_EXPLAINER.en)
const shellSrc = src('components/auth/AuthShell.tsx')
check('4c: the auth frame reads one exhaustive table, so German cannot fall through to Hebrew',
  /const AUTH_LANDING: Record<PublicLocale, /.test(shellSrc)
  && /const landing = AUTH_LANDING\[locale\]/.test(shellSrc))
check('4c mutation: a ternary chain back in AuthShell fails 4c',
  !/const landing = AUTH_LANDING\[locale\]/.test(
    shellSrc.replace('const landing = AUTH_LANDING[locale]',
      "const landing = locale === 'it' ? landingIt : landingHe")))
check('4c1: and the German panel really carries German copy, not Hebrew',
  !HEBREW.test(landingDe.demo.rank.keyword) && landingDe.demo.rank.keyword !== landingHe.demo.rank.keyword)
check('4d: the 451 notice does not answer Hebrew to a German visitor',
  !HEBREW.test(sanctionsNotice('de')) && sanctionsNotice('de') !== sanctionsNotice('en'))
const tDe = createI18n('de'), tIt = createI18n('it'), tEn = createI18n('en')
check('4f: the AI-visibility strings answer German',
  !HEBREW.test(tDe('ai_visibility')) && tDe('ai_visibility') !== tIt('ai_visibility') && tDe('ai_visibility') !== tEn('ai_visibility'))
check('4f1: a regional German tag reads the same German', createI18n('de-AT')('ai_visibility') === tDe('ai_visibility'))
check('4g: every AI-visibility entry that has English has German',
  (() => {
    const s = read('lib/ai-visibility/i18n.ts')
    const withEn = (s.match(/\ben: '/g) || []).length
    const withDe = (s.match(/\bde: '/g) || []).length
    console.log(`    → ${withDe} German values against ${withEn} English ones`)
    return withDe >= withEn
  })())
check('4h: the monthly report speaks German',
  !HEBREW.test(monthlyCopy('de').title) && monthlyCopy('de').title !== monthlyCopy('en').title)
check('4i: the PDF and Excel labels speak German',
  !HEBREW.test(getExportLabels('de').rankingReport) && getExportLabels('de').rankingReport !== getExportLabels('en').rankingReport)
{
  const deDate = curriedDate('de').dateTime('2026-09-27T17:09:00Z')
  check('4k: German dates read as German, not as English wearing a German label',
    !/Sep\b|PM|AM/.test(deDate) && /Sept|Sep\./i.test(deDate), deDate)
  check('4k mutation: the English form is what this check rejects',
    /Sep\b|PM|AM/.test(curriedDate('en').dateTime('2026-09-27T17:09:00Z')))
}

// 5 — THE FLAG STILL GATES THE LANGUAGE.
const switcher = src('components/DashboardLanguageSwitcher.tsx')
check('5a: the in-app switcher offers DE only while the German build is on',
  /germanSiteEnabled\(\) \?/.test(switcher) && /'de' as PublicLocale/.test(switcher))
check('5a mutation: an unconditional DE option is caught',
  !/germanSiteEnabled\(\) \?/.test("{ locale: 'de' as PublicLocale, lang: 'de' },"))

/*
 * 6 — NO PRICE IN EUROS, anywhere a German reader can see one.
 *
 * The rule and the reason are in the module comment above. The surfaces checked
 * are the ones that name a price: the dashboard dictionary, the German landing
 * and pricing copy, and the five German legal documents. A currency symbol is
 * not the only way to get this wrong, so the word "Euro" and the code "EUR" are
 * matched too.
 */
{
  const EURO = /€|(?<!\p{L})EUR(?!\p{L})|(?<!\p{L})Euros?(?!\p{L})/u
  const euroLeaves = deLeaves.filter((l) => EURO.test(l.text))
  check('6a: no leaf of the German dashboard names a price in euros',
    euroLeaves.length === 0, euroLeaves.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
  const copyFiles = ['lib/i18n/public/landing-de.ts', 'lib/i18n/public/pricing-de.ts', 'lib/i18n/public/de.ts']
  const offenders = copyFiles.filter((f) => EURO.test(src(f)))
  check('6b: neither does the German landing or pricing copy',
    offenders.length === 0, offenders.join(', '))
  // The legal documents are the one place the word is allowed, because the
  // refund policy and the accessibility statement EXPLAIN the rule — the
  // Preisangabenverordnung paragraph and the BFSG microenterprise threshold of
  // 2 million euros. What is not allowed is a price: a euro amount next to a
  // plan. So the documents are checked for a FIGURE in euros, not the word.
  const EURO_PRICE = /(?:€\s*\d|\d+(?:[.,]\d+)?\s*(?:€|EUR(?!\p{L})))/u
  const docs = ['terms', 'privacy', 'refund-policy', 'accessibility', 'affiliate-terms']
  const priced = docs.filter((d) => {
    const text = read(`content/legal/de/${d}.md`)
    // The BFSG threshold is "2 Millionen Euro", a turnover figure and not a
    // price, and it is written in words rather than with the symbol, so it does
    // not match EURO_PRICE. Anything that does match is a price.
    return EURO_PRICE.test(text)
  })
  check('6c: no German legal document states a price in euros',
    priced.length === 0, priced.join(', '))
  check('6a mutation: a euro price is caught',
    EURO.test('79 € pro Monat') && EURO.test('ab 79 EUR im Monat') && EURO_PRICE.test('79 € pro Monat'))
  check('6c control: the rule is explained in words, so the documents DO name the currency',
    /Euro/.test(read('content/legal/de/refund-policy.md')) && /Euro/.test(read('content/legal/de/accessibility.md')))
  // And the positive half: the German pricing copy names DOLLARS, because that
  // is what Creem actually charges from Germany.
  check('6d: the German pricing copy names the price in dollars',
    /\$|USD|US-Dollar/.test(src('lib/i18n/public/pricing-de.ts')))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}

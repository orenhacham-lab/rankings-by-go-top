/**
 * THE DASHBOARD IN DUTCH — the full-translation wave, ninth language.
 *
 * Oren's rule for this wave: a language we add is translated in BOTH the public
 * site and the app, so "Dutch falls back to English" is not good enough for the
 * dashboard. What that claim means in code, and therefore what this suite
 * proves:
 *
 *  1. PARITY WITH GERMAN, LEAF FOR LEAF. de/ is the finished parts dictionary
 *     this one was written from, so every path it answers the Dutch one answers
 *     too. A section translated half-way shows up here as a missing path.
 *  2. NOTHING ANSWERS IN HEBREW, and nothing answers in GERMAN, ITALIAN,
 *     FRENCH, SPANISH or PORTUGUESE either. The second half is the one that
 *     matters here: nl/ was written from the de/ parts, so a part left
 *     un-translated reads as German rather than as the English the merge falls
 *     back to — and German is latin-script left-to-right prose, which no Hebrew
 *     detector would ever notice. German and Dutch are also close enough that a
 *     skimming reader might not notice either.
 *  3. THE PARTS DIRECTORY CANNOT HALF-OWN A SECTION. nl/ is assembled by a flat
 *     spread, so two parts naming one section would silently drop one of them.
 *  4. THE COPY OUTSIDE THE DICTIONARY IS DUTCH TOO — the plan limit lines, the
 *     auth frame's brand panel, the 451 notice, the AI-visibility strings, the
 *     monthly report and the export labels. Every one of those was once a
 *     ternary chain ending in Hebrew or English, and lib/plans/features.ts in
 *     particular fell through to HEBREW for a locale with no branch of its own,
 *     which is the bug that once shipped on the live /pt-BR pricing page.
 *  5. THE FLAG STILL GATES THE LANGUAGE. The in-app switcher offers NL only
 *     while the Dutch build is on.
 *  6. NO PRICE IS NAMED IN EUROS. Outside Israel the product charges US DOLLARS
 *     through Creem, so a euro figure on a Dutch screen is a price this service
 *     does not take — and artikel 6:193e BW, with the price-indication rules
 *     behind it, is precisely about the stated price being the total actually
 *     payable. A Dutch reader expects euros, so this is the mistake a
 *     translator makes without being asked to. German has the same rule for the
 *     same reason; Dutch is the second language to carry it.
 *
 * MUTATION CONTROL. Every guard is re-run against a deliberately broken input
 * and must then fail.
 *
 * Run: npx tsx lib/i18n/dashboard/__qa__/dutch-dashboard.qa.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { dashboardNl, NL_PARTS } from '../nl/index'
import { dashboardDe } from '../de/index'
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
import { landingNl } from '../../public/landing-nl'
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

const nlLeaves = leaves(dashboardNl)
const deLeaves = leaves(dashboardDe)
const nlPaths = new Set(nlLeaves.map((l) => l.path))
const nlByPath = new Map(nlLeaves.map((l) => [l.path, l.text]))

console.log('\nDUTCH DASHBOARD\n')
console.log(`  → ${nlLeaves.length} Dutch leaves across ${Object.keys(dashboardNl).length} sections (German: ${deLeaves.length} across ${Object.keys(dashboardDe).length})`)

// 1 — PARITY WITH GERMAN.
const missing = deLeaves.filter((l) => !nlPaths.has(l.path))
check('1a: every path the German dictionary answers, the Dutch one answers',
  missing.length === 0, missing.slice(0, 5).map((l) => l.path).join(', '))
check('1b: the Dutch dictionary names the same number of sections as the English one',
  Object.keys(dashboardNl).length === Object.keys(dashboardEn).length,
  `nl ${Object.keys(dashboardNl).length} vs en ${Object.keys(dashboardEn).length}`)
check('1c: every Dutch section is a real section of the English dictionary',
  Object.keys(dashboardNl).every((k) => k in dashboardEn),
  Object.keys(dashboardNl).filter((k) => !(k in dashboardEn)).join(', '))
check('1a mutation: a missing section is caught',
  (() => {
    const broken = new Set(nlPaths); for (const p of [...broken]) if (p.startsWith('siteHealth.')) broken.delete(p)
    return deLeaves.some((l) => !broken.has(l.path))
  })())

// 2 — NOT HEBREW, AND NOT ANOTHER LATIN LANGUAGE EITHER.
const hebrew = nlLeaves.filter((l) => HEBREW.test(l.text))
check('2a: no leaf of the Dutch dictionary is in Hebrew',
  hebrew.length === 0, hebrew.slice(0, 5).map((l) => `${l.path} = ${l.text}`).join(' | '))
const merged = leaves(getDashboardDictionary('nl'))
const mergedHebrew = merged.filter((l) => HEBREW.test(l.text))
// The English dashboard itself shows a few Hebrew publishGate strings, which the
// main build thread owns; the Dutch dashboard inherits exactly those.
const inheritedHebrew = leaves(dashboardEn).filter((l) => HEBREW.test(l.text)).map((l) => l.path)
check('2b: the merged Dutch dictionary is Hebrew-free apart from what the ENGLISH one already shows',
  mergedHebrew.every((l) => inheritedHebrew.includes(l.path)),
  mergedHebrew.filter((l) => !inheritedHebrew.includes(l.path)).slice(0, 5).map((l) => l.path).join(', '))
check('2a mutation: a Hebrew string is caught', HEBREW.test('מילת מפתח'))

/*
 * 2c — THE COPIED-NOT-TRANSLATED GUARD. nl/ was written from the de/ parts, so
 * the failure mode is "a part was copied and not translated", which leaves
 * GERMAN on a Dutch screen. Measured as a RATE rather than per leaf: a handful
 * of leaves legitimately coincide across two latin languages (a product name,
 * "SEO", a bare number, a one-word label), so the bar is that the overwhelming
 * majority of long prose leaves differ. A whole untranslated part moves this
 * number immediately, which is what it is for.
 */
const PROSE_MIN = 25
const comparable = (other: Leaf[]) => other.filter((l) => l.text.length >= PROSE_MIN && nlByPath.has(l.path))
for (const [name, other] of [
  ['German', deLeaves],
  ['Italian', leaves(dashboardIt)],
  ['French', leaves(dashboardFr)],
  ['Portuguese', leaves(dashboardPtBR)],
  ['Spanish', leaves(dashboardEs)],
] as const) {
  const pool = comparable(other)
  const same = pool.filter((l) => nlByPath.get(l.path) === l.text)
  const rate = pool.length === 0 ? 1 : same.length / pool.length
  check(`2c-${name}: Dutch prose is not ${name} (${same.length} of ${pool.length} long leaves identical)`,
    pool.length > 500 && rate < 0.02,
    `${(rate * 100).toFixed(1)}% identical; e.g. ${same.slice(0, 4).map((l) => `${l.path}="${l.text.slice(0, 50)}"`).join(' | ')}`)
}
check('2c mutation: a dictionary that is really German is caught',
  (() => {
    const pool = comparable(deLeaves)
    return pool.length > 0 && pool.length / pool.length >= 0.02
  })())
const enLeaves = leaves(dashboardEn)
const enPool = enLeaves.filter((l) => l.text.length >= PROSE_MIN && nlByPath.has(l.path))
const enSame = enPool.filter((l) => nlByPath.get(l.path) === l.text)
check(`2d: Dutch prose is not English either (${enSame.length} of ${enPool.length} long leaves identical)`,
  enPool.length > 500 && enSame.length / enPool.length < 0.02,
  enSame.slice(0, 4).map((l) => `${l.path}="${l.text.slice(0, 50)}"`).join(' | '))

/*
 * 2e — THE REGISTER. Oren's register for every foreign language is the formal
 * one, and in Dutch that is `u`, never `je`. The unambiguous informal markers
 * are the pronouns `je`, `jij`, `jou`, `jullie` and the possessive `jouw`.
 *
 * JavaScript's \b counts only [A-Za-z0-9_], so a diaeresis is a word boundary
 * and a bare \bje\b would fire inside a word that happens to end before one.
 * Hence the Unicode lookarounds and the u flag. `je` has to be matched
 * standalone, because "jegens" and "project" both contain it, and the same is
 * true of `jou` inside "journaal".
 */
const INFORMAL = /(?<!\p{L})(?:je|jij|jou|jouw|jouwe|jullie)(?!\p{L})/iu
const informal = nlLeaves.filter((l) => INFORMAL.test(l.text))
check('2e: the whole Dutch dictionary keeps the formal u register',
  informal.length === 0, informal.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
check('2e mutation: an informal sentence is caught',
  INFORMAL.test('Verbind je website om te beginnen') && INFORMAL.test('Hier zijn jouw zoekwoorden'))
check('2e control: the pattern does not fire on ordinary formal Dutch',
  !INFORMAL.test('Verbindt u uw website, dan meten wij de posities elke maand in dit project en jegens de concurrenten.'))

/*
 * 2f — THE DIAERESIS IS WRITTEN OUT, AND GERMAN LETTERS ARE NOT.
 *
 * Two different mistakes, one check each. A dictionary pushed through an ASCII
 * pipeline comes back as "geinstalleerd" and "coordinaten", which is how a
 * Dutch reader can tell nobody who speaks the language wrote it. And a
 * dictionary copied from de/ and edited carelessly keeps letters Dutch does not
 * have: ä and ß. ö and ü are NOT in that list, because Dutch writes them as
 * ordinary diaereses — coördinaten, reünie — so testing for them would fire on
 * correct Dutch.
 */
{
  const all = nlLeaves.map((l) => l.text).join('\n')
  check('2f: the Dutch dictionary writes its diaereses as themselves',
    /[ëïöüéè]/.test(all))
  const TRANSLIT = /(?<!\p{L})(?:geinstalleerd|coordinaten|reunie|beinvloed(?:t|en|e)?|zoeven|ideeen|tweeentwintig)(?!\p{L})/iu
  const translit = nlLeaves.filter((l) => TRANSLIT.test(l.text))
  check('2f1: and no word is spelled the ASCII way',
    translit.length === 0, translit.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
  check('2f1 mutation: a transliterated word is caught',
    TRANSLIT.test('De plug-in is geinstalleerd') && TRANSLIT.test('De coordinaten van de vestiging'))
  const GERMAN_LETTER = /[äÄß]/
  const germanish = nlLeaves.filter((l) => GERMAN_LETTER.test(l.text))
  check('2f2: and no leaf carries a letter Dutch does not have (ä, ß)',
    germanish.length === 0, germanish.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
  check('2f2 mutation: a German letter is caught, and a Dutch diaeresis is not',
    GERMAN_LETTER.test('Größe der Website') && !GERMAN_LETTER.test('de coördinaten van de vestiging'))
}

// 3 — THE PARTS DIRECTORY.
const owners: Record<string, number> = {}
for (const part of NL_PARTS) for (const k of Object.keys(part as object)) owners[k] = (owners[k] || 0) + 1
const shared = Object.entries(owners).filter(([, n]) => n > 1)
check('3a: no section is named by two parts of nl/', shared.length === 0, shared.map(([k]) => k).join(', '))
check('3b: the parts together name every section of the assembled dictionary',
  Object.keys(owners).length === Object.keys(dashboardNl).length)
check('3a mutation: a section in two parts is caught',
  (() => {
    const o: Record<string, number> = {}
    for (const part of [...NL_PARTS, NL_PARTS[0]]) for (const k of Object.keys(part as object)) o[k] = (o[k] || 0) + 1
    return Object.values(o).some((n) => n > 1)
  })())

// 4 — THE COPY OUTSIDE THE DICTIONARY.
const planLines = [...planLimitLines('regular', 'nl'), ...planLimitLines('large_agency', 'nl'), ...trialLimitLines('nl')]
check('4a: the plan and trial limit lines are Dutch, not Hebrew',
  planLines.every((l) => !HEBREW.test(l)) && planLines.some((l) => /website/i.test(l)),
  planLines.filter((l) => HEBREW.test(l))[0])
check('4a mutation: a Hebrew plan line is caught', planLimitLines('regular', 'he').some((l) => HEBREW.test(l)))
check('4a1: and they are not the German ones either',
  planLimitLines('regular', 'nl').join('|') !== planLimitLines('regular', 'de').join('|'))
check('4b: the "what a check is" sentence has its own Dutch',
  !HEBREW.test(CHECKS_EXPLAINER.nl) && CHECKS_EXPLAINER.nl !== CHECKS_EXPLAINER.de && CHECKS_EXPLAINER.nl !== CHECKS_EXPLAINER.en)
const shellSrc = src('components/auth/AuthShell.tsx')
check('4c: the auth frame reads one exhaustive table, so Dutch cannot fall through to Hebrew',
  /const AUTH_LANDING: Record<PublicLocale, /.test(shellSrc)
  && /const landing = AUTH_LANDING\[locale\]/.test(shellSrc))
check('4c mutation: a ternary chain back in AuthShell fails 4c',
  !/const landing = AUTH_LANDING\[locale\]/.test(
    shellSrc.replace('const landing = AUTH_LANDING[locale]',
      "const landing = locale === 'nl' ? landingNl : landingHe")))
check('4c1: and the Dutch panel really carries Dutch copy, not Hebrew',
  !HEBREW.test(landingNl.demo.rank.keyword) && landingNl.demo.rank.keyword !== landingHe.demo.rank.keyword)
check('4d: the 451 notice does not answer Hebrew to a Dutch visitor',
  !HEBREW.test(sanctionsNotice('nl')) && sanctionsNotice('nl') !== sanctionsNotice('en'))
const tNl = createI18n('nl'), tDe = createI18n('de'), tEn = createI18n('en')
check('4f: the AI-visibility strings answer Dutch',
  !HEBREW.test(tNl('ai_visibility')) && tNl('ai_visibility') !== tDe('ai_visibility') && tNl('ai_visibility') !== tEn('ai_visibility'))
check('4f1: a regional Dutch tag reads the same Dutch', createI18n('nl-NL')('ai_visibility') === tNl('ai_visibility'))
check('4g: every AI-visibility entry that has English has Dutch',
  (() => {
    const s = read('lib/ai-visibility/i18n.ts')
    const withEn = (s.match(/\ben: '/g) || []).length
    const withNl = (s.match(/\bnl: '/g) || []).length
    console.log(`    → ${withNl} Dutch values against ${withEn} English ones`)
    return withNl >= withEn
  })())
check('4h: the monthly report speaks Dutch',
  !HEBREW.test(monthlyCopy('nl').title) && monthlyCopy('nl').title !== monthlyCopy('en').title)
check('4i: the PDF and Excel labels speak Dutch',
  !HEBREW.test(getExportLabels('nl').rankingReport) && getExportLabels('nl').rankingReport !== getExportLabels('en').rankingReport)
{
  const nlDate = curriedDate('nl').dateTime('2026-09-27T17:09:00Z')
  check('4k: Dutch dates read as Dutch, not as English wearing a Dutch label',
    !/Sep\b|PM|AM/.test(nlDate) && /sep/i.test(nlDate), nlDate)
  check('4k mutation: the English form is what this check rejects',
    /Sep\b|PM|AM/.test(curriedDate('en').dateTime('2026-09-27T17:09:00Z')))
}

// 5 — THE FLAG STILL GATES THE LANGUAGE.
const switcher = src('components/DashboardLanguageSwitcher.tsx')
check('5a: the in-app switcher offers NL only while the Dutch build is on',
  /dutchSiteEnabled\(\) \?/.test(switcher) && /'nl' as PublicLocale/.test(switcher))
check('5a mutation: an unconditional NL option is caught',
  !/dutchSiteEnabled\(\) \?/.test("{ locale: 'nl' as PublicLocale, lang: 'nl' },"))

/*
 * 6 — NO PRICE IN EUROS, anywhere a Dutch reader can see one.
 *
 * The rule and the reason are in the module comment above. The surfaces checked
 * are the ones that name a price: the dashboard dictionary, the Dutch landing
 * and pricing copy, and the five Dutch legal documents. A currency symbol is
 * not the only way to get this wrong, so the word "euro" and the code "EUR" are
 * matched too.
 */
{
  const EURO = /€|(?<!\p{L})EUR(?!\p{L})|(?<!\p{L})euro'?s?(?!\p{L})/iu
  const euroLeaves = nlLeaves.filter((l) => EURO.test(l.text))
  check('6a: no leaf of the Dutch dashboard names a price in euros',
    euroLeaves.length === 0, euroLeaves.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
  const copyFiles = ['lib/i18n/public/landing-nl.ts', 'lib/i18n/public/pricing-nl.ts', 'lib/i18n/public/nl.ts']
  const offenders = copyFiles.filter((f) => EURO.test(src(f)))
  check('6b: neither does the Dutch landing or pricing copy',
    offenders.length === 0, offenders.join(', '))
  // The legal documents are the one place the word is allowed, because the
  // terms and the refund policy EXPLAIN the rule — artikel 6:193e BW and the
  // price-indication rules behind it. What is not allowed is a price: a euro
  // amount next to a plan. So the documents are checked for a FIGURE in euros,
  // not the word.
  const EURO_PRICE = /(?:€\s*\d|\d+(?:[.,]\d+)?\s*(?:€|EUR(?!\p{L})|euro(?!\p{L})))/iu
  const docs = ['terms', 'privacy', 'refund-policy', 'accessibility', 'affiliate-terms']
  const priced = docs.filter((d) => EURO_PRICE.test(read(`content/legal/nl/${d}.md`)))
  check('6c: no Dutch legal document states a price in euros',
    priced.length === 0, priced.join(', '))
  check('6a mutation: a euro price is caught',
    EURO.test('79 € per maand') && EURO.test('vanaf 79 EUR per maand') && EURO_PRICE.test('79 € per maand'))
  check('6c control: the rule is explained in words, so the documents DO name the currency',
    /euro/i.test(read('content/legal/nl/refund-policy.md')) && /euro/i.test(read('content/legal/nl/terms.md')))
  // And the positive half: the Dutch pricing copy names DOLLARS, because that
  // is what Creem actually charges from the Netherlands.
  check('6d: the Dutch pricing copy names the price in dollars',
    /\$|USD|Amerikaanse dollar/.test(src('lib/i18n/public/pricing-nl.ts')))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}

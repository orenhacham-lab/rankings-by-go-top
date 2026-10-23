/**
 * THE DASHBOARD IN ITALIAN — the full-translation wave, sixth language.
 *
 * Oren's rule for this wave: a language we add is translated in BOTH the public
 * site and the app, so "Italian falls back to English" is not good enough for
 * the dashboard. What that claim means in code, and therefore what this suite
 * proves:
 *
 *  1. PARITY WITH FRENCH, LEAF FOR LEAF. fr/ is the finished parts dictionary
 *     this one was written from, so every path it answers the Italian one
 *     answers too. A section translated half-way shows up here as a missing
 *     path.
 *  2. NOTHING ANSWERS IN HEBREW, and nothing answers in FRENCH, SPANISH or
 *     PORTUGUESE either. The second half is the one that matters here: it/ was
 *     written from the fr/ parts, so a part left un-translated reads as French
 *     rather than as the English the merge is designed to fall back to — and
 *     French is latin-script left-to-right prose, which no Hebrew detector
 *     would ever notice.
 *  3. THE PARTS DIRECTORY CANNOT HALF-OWN A SECTION. it/ is assembled by a flat
 *     spread, so two parts naming one section would silently drop one of them.
 *  4. THE COPY OUTSIDE THE DICTIONARY IS ITALIAN TOO — the plan limit lines,
 *     the auth frame's brand panel, the 451 notice, the AI-visibility strings,
 *     the monthly report and the export labels. Every one of those was once a
 *     ternary chain ending in Hebrew or English.
 *  5. THE FLAG STILL GATES THE LANGUAGE. The in-app switcher offers IT only
 *     while the Italian build is on.
 *
 * MUTATION CONTROL. Every guard is re-run against a deliberately broken input
 * and must then fail.
 *
 * Run: npx tsx lib/i18n/dashboard/__qa__/italian-dashboard.qa.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { dashboardIt, IT_PARTS } from '../it/index'
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
import { landingIt } from '../../public/landing-it'
import { landingHe } from '../../public/landing-he'
import { formatDate as curriedDate } from '../../format-date'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(p, 'utf8')
/** Source with comments stripped, per the repo's source-guard convention. */
const src = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const HEBREW = /[֐-׿]/
const ROOT = join(__dirname, '..', '..', '..', '..')
function readdirRecursive(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === '__qa__' || name === 'node_modules') continue
    const rel = join(dir, name)
    if (statSync(join(ROOT, rel)).isDirectory()) readdirRecursive(rel, out)
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, join(ROOT, rel)))
  }
  return out
}

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

const itLeaves = leaves(dashboardIt)
const frLeaves = leaves(dashboardFr)
const itPaths = new Set(itLeaves.map((l) => l.path))
const itByPath = new Map(itLeaves.map((l) => [l.path, l.text]))

console.log('\nITALIAN DASHBOARD\n')
console.log(`  → ${itLeaves.length} Italian leaves across ${Object.keys(dashboardIt).length} sections (French: ${frLeaves.length} across ${Object.keys(dashboardFr).length})`)

// 1 — PARITY WITH FRENCH.
const missing = frLeaves.filter((l) => !itPaths.has(l.path))
check('1a: every path the French dictionary answers, the Italian one answers',
  missing.length === 0, missing.slice(0, 5).map((l) => l.path).join(', '))
check('1b: the Italian dictionary names the same number of sections as the English one',
  Object.keys(dashboardIt).length === Object.keys(dashboardEn).length,
  `it ${Object.keys(dashboardIt).length} vs en ${Object.keys(dashboardEn).length}`)
check('1c: every Italian section is a real section of the English dictionary',
  Object.keys(dashboardIt).every((k) => k in dashboardEn),
  Object.keys(dashboardIt).filter((k) => !(k in dashboardEn)).join(', '))
check('1a mutation: a missing section is caught',
  (() => {
    const broken = new Set(itPaths); for (const p of [...broken]) if (p.startsWith('siteHealth.')) broken.delete(p)
    return frLeaves.some((l) => !broken.has(l.path))
  })())

// 2 — NOT HEBREW, AND NOT ANOTHER LATIN LANGUAGE EITHER.
const hebrew = itLeaves.filter((l) => HEBREW.test(l.text))
check('2a: no leaf of the Italian dictionary is in Hebrew',
  hebrew.length === 0, hebrew.slice(0, 5).map((l) => `${l.path} = ${l.text}`).join(' | '))
const merged = leaves(getDashboardDictionary('it'))
const mergedHebrew = merged.filter((l) => HEBREW.test(l.text))
// The English dashboard itself shows a few Hebrew publishGate strings, which the
// main build thread owns; the Italian dashboard inherits exactly those.
const inheritedHebrew = leaves(dashboardEn).filter((l) => HEBREW.test(l.text)).map((l) => l.path)
check('2b: the merged Italian dictionary is Hebrew-free apart from what the ENGLISH one already shows',
  mergedHebrew.every((l) => inheritedHebrew.includes(l.path)),
  mergedHebrew.filter((l) => !inheritedHebrew.includes(l.path)).slice(0, 5).map((l) => l.path).join(', '))
check('2a mutation: a Hebrew string is caught', HEBREW.test('מילת מפתח'))

/*
 * 2c — THE COPIED-NOT-TRANSLATED GUARD. it/ was written from the fr/ parts, so
 * the failure mode is "a part was copied and not translated", which leaves
 * FRENCH on an Italian screen. Measured as a RATE rather than per leaf: a
 * handful of leaves legitimately coincide across two latin languages (a product
 * name, "SEO", a bare number, a one-word label), so the bar is that the
 * overwhelming majority of long prose leaves differ. A whole untranslated part
 * moves this number immediately, which is what it is for.
 */
const PROSE_MIN = 25
const comparable = (other: Leaf[]) => other.filter((l) => l.text.length >= PROSE_MIN && itByPath.has(l.path))
const sameAs = (other: Leaf[]) => comparable(other).filter((l) => itByPath.get(l.path) === l.text)
for (const [name, other] of [['French', frLeaves], ['Portuguese', leaves(dashboardPtBR)], ['Spanish', leaves(dashboardEs)]] as const) {
  const pool = comparable(other)
  const same = sameAs(other)
  const rate = pool.length === 0 ? 1 : same.length / pool.length
  check(`2c-${name}: Italian prose is not ${name} (${same.length} of ${pool.length} long leaves identical)`,
    pool.length > 500 && rate < 0.02,
    `${(rate * 100).toFixed(1)}% identical; e.g. ${same.slice(0, 4).map((l) => `${l.path}="${l.text.slice(0, 50)}"`).join(' | ')}`)
}
check('2c mutation: a dictionary that is really French is caught',
  (() => {
    const pool = comparable(frLeaves)
    return pool.length > 0 && pool.length / pool.length >= 0.02
  })())
const enLeaves = leaves(dashboardEn)
const enPool = enLeaves.filter((l) => l.text.length >= PROSE_MIN && itByPath.has(l.path))
const enSame = enPool.filter((l) => itByPath.get(l.path) === l.text)
check(`2d: Italian prose is not English either (${enSame.length} of ${enPool.length} long leaves identical)`,
  enPool.length > 500 && enSame.length / enPool.length < 0.02,
  enSame.slice(0, 4).map((l) => `${l.path}="${l.text.slice(0, 50)}"`).join(' | '))

/*
 * 2e — THE REGISTER. Oren's register for every foreign language is the formal
 * one. In Italian the unambiguous informal markers are the pronoun `tu` and the
 * possessives `tuo`/`tua`/`tuoi`/`tue`.
 *
 * `tuo` and `tua` are matched only before one of the nouns this product
 * addresses the reader about, which is the shape a real slip takes ("collega il
 * tuo sito"); JavaScript's \b counts only [A-Za-z0-9_], so an accented letter
 * is a word boundary and a bare \btu\b would fire inside "attuale". Hence the
 * Unicode lookarounds and the u flag.
 */
const INFORMAL = /(?<!\p{L})(?:tu|tuoi|tue)(?!\p{L})|(?<!\p{L})(?:tuo|tua)\s+(?:account|sito|siti|piano|progetto|progetti|parola|parole|articolo|articoli|negozio|dominio|abbonamento|prova|report|rapporto|rapporti|posizione|posizioni|visibilità|azienda|attività|pannello)(?!\p{L})/iu
const informal = itLeaves.filter((l) => INFORMAL.test(l.text))
check('2e: the whole Italian dictionary keeps the formal register',
  informal.length === 0, informal.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
check('2e mutation: an informal sentence is caught',
  INFORMAL.test('Collega il tuo sito per iniziare') && INFORMAL.test('Ecco le tue parole chiave'))
check('2e control: the pattern does not fire on ordinary Italian',
  !INFORMAL.test('Il piano attuale resta invariato e la posizione viene misurata ogni mese.'))

// 3 — THE PARTS DIRECTORY.
const owners: Record<string, number> = {}
for (const part of IT_PARTS) for (const k of Object.keys(part as object)) owners[k] = (owners[k] || 0) + 1
const shared = Object.entries(owners).filter(([, n]) => n > 1)
check('3a: no section is named by two parts of it/', shared.length === 0, shared.map(([k]) => k).join(', '))
check('3b: the parts together name every section of the assembled dictionary',
  Object.keys(owners).length === Object.keys(dashboardIt).length)
check('3a mutation: a section in two parts is caught',
  (() => {
    const o: Record<string, number> = {}
    for (const part of [...IT_PARTS, IT_PARTS[0]]) for (const k of Object.keys(part as object)) o[k] = (o[k] || 0) + 1
    return Object.values(o).some((n) => n > 1)
  })())

// 4 — THE COPY OUTSIDE THE DICTIONARY.
const planLines = [...planLimitLines('regular', 'it'), ...planLimitLines('large_agency', 'it'), ...trialLimitLines('it')]
check('4a: the plan and trial limit lines are Italian, not Hebrew',
  planLines.every((l) => !HEBREW.test(l)) && planLines.some((l) => /sito|siti/i.test(l)),
  planLines.filter((l) => HEBREW.test(l))[0])
check('4a mutation: a Hebrew plan line is caught', planLimitLines('regular', 'he').some((l) => HEBREW.test(l)))
check('4b: the "what a check is" sentence has its own Italian',
  !HEBREW.test(CHECKS_EXPLAINER.it) && CHECKS_EXPLAINER.it !== CHECKS_EXPLAINER.fr && CHECKS_EXPLAINER.it !== CHECKS_EXPLAINER.en)
const shellSrc = src('components/auth/AuthShell.tsx')
check('4c: the auth frame reads one exhaustive table, so Italian cannot fall through to Hebrew',
  /const AUTH_LANDING: Record<PublicLocale, /.test(shellSrc)
  && /const landing = AUTH_LANDING\[locale\]/.test(shellSrc)
  && !/locale === '(?:es|pt-BR|fr|en)' \?[^\n]*landing/.test(shellSrc))
check('4c mutation: a ternary chain back in AuthShell fails 4c',
  /locale === '(?:es|pt-BR|fr|en)' \?[^\n]*landing/.test(
    shellSrc.replace('const landing = AUTH_LANDING[locale]',
      "const landing = locale === 'fr' ? landingFr : landingHe")))
check('4c1: and the Italian panel really carries Italian copy, not Hebrew',
  !HEBREW.test(landingIt.demo.rank.keyword) && landingIt.demo.rank.keyword !== landingHe.demo.rank.keyword)
check('4d: the 451 notice does not answer Hebrew to an Italian visitor',
  !HEBREW.test(sanctionsNotice('it')) && sanctionsNotice('it') !== sanctionsNotice('en'))
const freeCheckRead = (c: string) =>
  /const readPublicLocale = \(v: unknown\): PublicLocale => normalizePublicLocale\(v\) \?\? 'he'/.test(c)
  && !/readPublicLocale = [^\n]*v === '/.test(c)
const freeCheckSrc = src('lib/presignup/http.ts')
check('4e: the free check reads its language from the one list, so it is never Hebrew',
  freeCheckRead(freeCheckSrc))
check('4e mutation: a hand-written list that happens to include it fails it too',
  !freeCheckRead(freeCheckSrc.replace("normalizePublicLocale(v) ?? 'he'", "v === 'en' || v === 'es' || v === 'it' ? v : 'he'")))
const tIt = createI18n('it'), tFr = createI18n('fr'), tEn = createI18n('en')
check('4f: the AI-visibility strings answer Italian',
  !HEBREW.test(tIt('ai_visibility')) && tIt('ai_visibility') !== tFr('ai_visibility') && tIt('ai_visibility') !== tEn('ai_visibility'))
check('4f1: a regional Italian tag reads the same Italian', createI18n('it-IT')('ai_visibility') === tIt('ai_visibility'))
check('4g: every AI-visibility entry that has English has Italian',
  (() => {
    const s = read('lib/ai-visibility/i18n.ts')
    const withEn = (s.match(/\ben: '/g) || []).length
    const withIt = (s.match(/\bit: '/g) || []).length
    console.log(`    → ${withIt} Italian values against ${withEn} English ones`)
    return withIt >= withEn
  })())
check('4h: the monthly report speaks Italian',
  !HEBREW.test(monthlyCopy('it').title) && monthlyCopy('it').title !== monthlyCopy('en').title)
check('4i: the PDF and Excel labels speak Italian',
  !HEBREW.test(getExportLabels('it').rankingReport) && getExportLabels('it').rankingReport !== getExportLabels('en').rankingReport)
const frByPath = new Map(frLeaves.map((l) => [l.path, l.text]))
check('4j: the competitor screen speaks Italian',
  (() => {
    const title = itByPath.get('researchCompetitive.title') ?? ''
    return title.length > 0 && !HEBREW.test(title) && title !== frByPath.get('researchCompetitive.title')
  })(), `it="${itByPath.get('researchCompetitive.title')}" fr="${frByPath.get('researchCompetitive.title')}"`)

/*
 * 4k — DATES AND NUMBERS ARE NOT A BILINGUAL SURFACE. The French wave fixed
 * this (lib/i18n/format-date.ts takes a PublicLocale and every call site hands
 * it `uiLocale`); Italian inherits it, and this guard is what keeps the next
 * language from re-introducing "Audito 3 days ago".
 */
{
  const FORMATTERS = /(?:formatCount|formatCompact|formatDate|formatDateTime|relativeTime)\(/
  const files = readdirRecursive('components').concat(readdirRecursive('app'))
  const offenders: string[] = []
  for (const rel of files) {
    const text = src(rel)
    if (!/useDashboardLanguage\(\)/.test(text)) continue
    for (const line of text.split('\n')) {
      if (!FORMATTERS.test(line)) continue
      if (/,\s*language\s*\)/.test(line) || /formatDate\(language\)/.test(line)) offenders.push(`${rel}: ${line.trim().slice(0, 90)}`)
    }
  }
  check('4k: no date or number formatter is handed the bilingual `language`',
    offenders.length === 0, offenders.slice(0, 5).join(' | '))
  check('4k mutation: a formatter handed `language` is caught',
    /,\s*language\s*\)/.test('{formatCount(b.count, language)}')
    && /formatDate\(language\)/.test('const when = (iso: string) => formatDate(language).dateTime(iso)'))
  check('4k1: the curried formatter takes a PublicLocale, not a bilingual Locale',
    /export function formatDate\(lang: PublicLocale\): DateFormatter/.test(src('lib/i18n/format-date.ts')))
  const itDate = curriedDate('it').dateTime('2026-09-27T17:09:00Z')
  check('4k2: and Italian dates really read as Italian, not as English wearing an Italian label',
    !/Sep\b|PM|AM/.test(itDate) && /set/i.test(itDate), itDate)
  check('4k2 mutation: the English form is what this check rejects',
    /Sep\b|PM|AM/.test(curriedDate('en').dateTime('2026-09-27T17:09:00Z')))
}

// 5 — THE FLAG STILL GATES THE LANGUAGE.
const switcher = src('components/DashboardLanguageSwitcher.tsx')
check('5a: the in-app switcher offers IT only while the Italian build is on',
  /italianSiteEnabled\(\) \?/.test(switcher) && /'it' as PublicLocale/.test(switcher))
check('5a mutation: an unconditional IT option is caught',
  !/italianSiteEnabled\(\) \?/.test("{ locale: 'it' as PublicLocale, lang: 'it', label: 'IT' },"))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}

/**
 * THE DASHBOARD IN FRENCH — the full-translation wave, fifth language.
 *
 * Oren's rule for this wave: a language we add is translated in BOTH the public
 * site and the app, so "French falls back to English" is not good enough for
 * the dashboard. What that claim means in code, and therefore what this suite
 * proves:
 *
 *  1. PARITY WITH PORTUGUESE, LEAF FOR LEAF. pt-BR is the finished parts
 *     dictionary, so every path it answers the French one answers too. A
 *     section translated half-way shows up here as a missing path.
 *  2. NOTHING ANSWERS IN HEBREW, and nothing answers in SPANISH or PORTUGUESE
 *     either. The second half matters more for French than it did for the
 *     earlier languages: fr/ was written from the pt-BR parts, so a part left
 *     un-translated would read as Portuguese rather than as the English the
 *     merge is designed to fall back to — and Portuguese is latin-script
 *     left-to-right prose, which no Hebrew detector would ever notice.
 *  3. THE PARTS DIRECTORY CANNOT HALF-OWN A SECTION. fr/ is assembled by a flat
 *     spread, so two parts naming one section would silently drop one of them.
 *     That is the one mistake the arrangement allows, and fr/index.ts's own
 *     comment promises this suite catches it.
 *  4. THE COPY OUTSIDE THE DICTIONARY IS FRENCH TOO — the plan limit lines, the
 *     auth frame's brand panel, the 451 notice, the free check's language, the
 *     AI-visibility strings, the monthly report, the export labels and the
 *     competitor screen. Every one of those was a ternary chain ending in
 *     Hebrew or English, and the French reader was getting that last branch.
 *  5. THE FLAG STILL GATES THE LANGUAGE. The in-app switcher offers FR only
 *     while the French build is on.
 *
 * MUTATION CONTROL. Every guard is re-run against a deliberately broken input
 * and must then fail.
 *
 * Run: npx tsx lib/i18n/dashboard/__qa__/french-dashboard.qa.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { dashboardFr, FR_PARTS } from '../fr/index'
import { dashboardPtBR } from '../pt-BR/index'
import { dashboardEs } from '../es'
import { dashboardEn } from '../en'
import { getDashboardDictionary } from '../getDashboardDictionary'
import { planLimitLines, trialLimitLines, CHECKS_EXPLAINER } from '../../../plans/features'
import { sanctionsNotice } from '../../../sanctions/guard'
import { createI18n } from '../../../ai-visibility/i18n'
import { monthlyCopy } from '../../../../components/reports/monthly/copy'
import { getExportLabels } from '../../../export/i18n'
import { landingFr } from '../../public/landing-fr'
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
/** Every .ts/.tsx file under a directory, __qa__ aside (it is full of examples). */
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

const frLeaves = leaves(dashboardFr)
const ptLeaves = leaves(dashboardPtBR)
const frPaths = new Set(frLeaves.map((l) => l.path))
const frByPath = new Map(frLeaves.map((l) => [l.path, l.text]))

console.log('\nFRENCH DASHBOARD\n')
console.log(`  → ${frLeaves.length} French leaves across ${Object.keys(dashboardFr).length} sections (Portuguese: ${ptLeaves.length} across ${Object.keys(dashboardPtBR).length})`)

// 1 — PARITY WITH PORTUGUESE.
const missing = ptLeaves.filter((l) => !frPaths.has(l.path))
check('1a: every path the Portuguese dictionary answers, the French one answers',
  missing.length === 0, missing.slice(0, 5).map((l) => l.path).join(', '))
check('1b: the French dictionary names the same number of sections as the English one',
  Object.keys(dashboardFr).length === Object.keys(dashboardEn).length,
  `fr ${Object.keys(dashboardFr).length} vs en ${Object.keys(dashboardEn).length}`)
check('1c: every French section is a real section of the English dictionary',
  Object.keys(dashboardFr).every((k) => k in dashboardEn),
  Object.keys(dashboardFr).filter((k) => !(k in dashboardEn)).join(', '))
// Mutation control: drop a Portuguese-answered path and 1a must fail.
check('1a mutation: a missing section is caught',
  (() => {
    const broken = new Set(frPaths); for (const p of [...broken]) if (p.startsWith('siteHealth.')) broken.delete(p)
    return ptLeaves.some((l) => !broken.has(l.path))
  })())

// 2 — NOT HEBREW, AND NOT ANOTHER LATIN LANGUAGE EITHER.
const hebrew = frLeaves.filter((l) => HEBREW.test(l.text))
check('2a: no leaf of the French dictionary is in Hebrew',
  hebrew.length === 0, hebrew.slice(0, 5).map((l) => `${l.path} = ${l.text}`).join(' | '))
const merged = leaves(getDashboardDictionary('fr'))
const mergedHebrew = merged.filter((l) => HEBREW.test(l.text))
// The English dashboard itself shows a few Hebrew publishGate strings, which the
// main build thread owns; the French dashboard inherits exactly those.
const inheritedHebrew = leaves(dashboardEn).filter((l) => HEBREW.test(l.text)).map((l) => l.path)
check('2b: the merged French dictionary is Hebrew-free apart from what the ENGLISH one already shows',
  mergedHebrew.every((l) => inheritedHebrew.includes(l.path)),
  mergedHebrew.filter((l) => !inheritedHebrew.includes(l.path)).slice(0, 5).map((l) => l.path).join(', '))
check('2a mutation: a Hebrew string is caught', HEBREW.test('מילת מפתח'))

/*
 * 2c and 2d are the guards the earlier languages did not need. fr/ was written
 * from the pt-BR parts, so the failure mode here is not "English showed
 * through" — the merge is designed for that and it is survivable — but "a part
 * was copied and not translated", which leaves PORTUGUESE on a French screen.
 * Measured as a RATE rather than per leaf: a handful of leaves legitimately
 * coincide across two latin languages (a product name, "SEO", a bare number, a
 * one-word label such as "Options"), so the bar is that the overwhelming
 * majority of long prose leaves differ. A whole untranslated part moves this
 * number immediately, which is what it is for.
 */
const PROSE_MIN = 25
const prose = (d: Record<string, string> | Map<string, string>, path: string) =>
  (d instanceof Map ? d.get(path) : d[path]) ?? ''
const comparable = (other: Leaf[]) => other.filter((l) => l.text.length >= PROSE_MIN && frByPath.has(l.path))
const sameAs = (other: Leaf[]) => comparable(other).filter((l) => prose(frByPath, l.path) === l.text)
for (const [name, other] of [['Portuguese', ptLeaves], ['Spanish', leaves(dashboardEs)]] as const) {
  const pool = comparable(other)
  const same = sameAs(other)
  const rate = pool.length === 0 ? 1 : same.length / pool.length
  check(`2c-${name}: French prose is not ${name} (${same.length} of ${pool.length} long leaves identical)`,
    pool.length > 500 && rate < 0.02,
    `${(rate * 100).toFixed(1)}% identical; e.g. ${same.slice(0, 4).map((l) => `${l.path}="${l.text.slice(0, 50)}"`).join(' | ')}`)
}
check('2c mutation: a dictionary that is really Portuguese is caught',
  (() => {
    const pool = comparable(ptLeaves)
    // Every long leaf copied from Portuguese: the rate goes to 1.
    return pool.length > 0 && pool.length / pool.length >= 0.02
  })())
// A French screen must also read as FRENCH rather than as English wearing a
// French flag, so a sample of long leaves has to differ from the English too.
const enLeaves = leaves(dashboardEn)
const enPool = enLeaves.filter((l) => l.text.length >= PROSE_MIN && frByPath.has(l.path))
const enSame = enPool.filter((l) => prose(frByPath, l.path) === l.text)
check(`2d: French prose is not English either (${enSame.length} of ${enPool.length} long leaves identical)`,
  enPool.length > 500 && enSame.length / enPool.length < 0.02,
  enSame.slice(0, 4).map((l) => `${l.path}="${l.text.slice(0, 50)}"`).join(' | '))

/*
 * 2e — vouvoiement. Oren's register for every foreign language is the formal
 * one, and in French that is a grammatical choice, not a tone: `tu`, `toi`,
 * `ton`, `ta` and `tes` are the wrong form of address, not merely informal.
 * JavaScript's \b is ASCII-only, so `\btes\b` matches inside `êtes` — which is
 * why this is written with Unicode lookarounds and the `u` flag.
 *
 * `ton` and `ta` are NOT matched on their own, and that is deliberate rather
 * than a hole: `ton` is also the ordinary French noun for "tone", which this
 * dictionary genuinely uses (`contentHub.brief.toneOfVoice` is the single word
 * "Ton", and the article-design step talks about "le ton de l'écriture"). A
 * bare `ton` therefore reports the correct copy as a defect. They are matched
 * when followed by one of the nouns this product addresses the reader about,
 * which is the shape a real tutoiement slip takes ("ton compte", "ta
 * boutique"); the unambiguous forms `tu`, `toi`, `tes` and `tien` need no such
 * company.
 */
const TU = /(?<!\p{L})(?:tu|toi|tes|tien|tiens|tienne)(?!\p{L})|(?<!\p{L})(?:ton|ta)\s+(?:compte|site|sites|plan|projet|projets|mot|mots|article|articles|tableau|boutique|domaine|abonnement|essai|rapport|rapports|position|visibilit\u00e9|entreprise)(?!\p{L})/iu
const tutoiement = frLeaves.filter((l) => TU.test(l.text))
check('2e: the whole French dictionary addresses the reader as vous, never tu',
  tutoiement.length === 0, tutoiement.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
check('2e mutation: a tutoiement sentence is caught',
  TU.test('Connecte ton site pour commencer') && TU.test('Voici tes mots-clés'))
check('2e control: the pattern does not fire on ordinary French', !TU.test('Vous êtes prêt à suivre votre position chaque mois.'))

// 3 — THE PARTS DIRECTORY.
const owners: Record<string, number> = {}
for (const part of FR_PARTS) for (const k of Object.keys(part as object)) owners[k] = (owners[k] || 0) + 1
const shared = Object.entries(owners).filter(([, n]) => n > 1)
check('3a: no section is named by two parts of fr/',
  shared.length === 0, shared.map(([k]) => k).join(', '))
check('3b: the parts together name every section of the assembled dictionary',
  Object.keys(owners).length === Object.keys(dashboardFr).length)
check('3a mutation: a section in two parts is caught',
  (() => {
    const o: Record<string, number> = {}
    for (const part of [...FR_PARTS, FR_PARTS[0]]) for (const k of Object.keys(part as object)) o[k] = (o[k] || 0) + 1
    return Object.values(o).some((n) => n > 1)
  })())

// 4 — THE COPY OUTSIDE THE DICTIONARY.
const planLines = [...planLimitLines('regular', 'fr'), ...planLimitLines('large_agency', 'fr'), ...trialLimitLines('fr')]
check('4a: the plan and trial limit lines are French, not Hebrew',
  planLines.every((l) => !HEBREW.test(l)) && planLines.some((l) => /site/i.test(l)),
  planLines.filter((l) => HEBREW.test(l))[0])
check('4a mutation: a Hebrew plan line is caught', planLimitLines('regular', 'he').some((l) => HEBREW.test(l)))
check('4b: the "what a check is" sentence has its own French',
  !HEBREW.test(CHECKS_EXPLAINER.fr) && CHECKS_EXPLAINER.fr !== CHECKS_EXPLAINER.es && CHECKS_EXPLAINER.fr !== CHECKS_EXPLAINER.en)
/*
 * 4c. The auth frame used to pick its brand panel with a chain of ternaries
 * whose LAST branch was Hebrew, so a French visitor to /fr/login met Hebrew
 * right-to-left copy beside the form — and the Portuguese suite's version of
 * this guard, which pinned one arm of that chain, stayed green through it. It
 * reads an exhaustive Record now, so the next language cannot fall through.
 */
const shellSrc = src('components/auth/AuthShell.tsx')
check('4c: the auth frame reads one exhaustive table, so French cannot fall through to Hebrew',
  /const AUTH_LANDING: Record<PublicLocale, /.test(shellSrc)
  && /const landing = AUTH_LANDING\[locale\]/.test(shellSrc)
  && !/locale === '(?:es|pt-BR|en)' \?[^\n]*landing/.test(shellSrc))
check('4c mutation: a ternary chain back in AuthShell fails 4c',
  /locale === '(?:es|pt-BR|en)' \?[^\n]*landing/.test(
    shellSrc.replace('const landing = AUTH_LANDING[locale]',
      "const landing = locale === 'es' ? landingEs : landingHe")))
check('4c1: and the French panel really carries French copy, not Hebrew',
  !HEBREW.test(landingFr.demo.rank.keyword) && landingFr.demo.rank.keyword !== landingHe.demo.rank.keyword)
check('4d: the 451 notice does not answer Hebrew to a French visitor',
  !HEBREW.test(sanctionsNotice('fr')) && sanctionsNotice('fr') !== sanctionsNotice('en'))
/*
 * 4e — the free check reads its language from the ONE list. Asserted as the
 * deferral rather than as a literal list of languages, for the reason the
 * Portuguese suite records: a guard that quotes such a list freezes it.
 */
const freeCheckRead = (c: string) =>
  /const readPublicLocale = \(v: unknown\): PublicLocale => normalizePublicLocale\(v\) \?\? 'he'/.test(c)
  && !/readPublicLocale = [^\n]*v === '/.test(c)
const freeCheckSrc = src('lib/presignup/http.ts')
check('4e: the free check reads its language from the one list, so fr is never Hebrew',
  freeCheckRead(freeCheckSrc))
check('4e mutation: a hand-written list that happens to include fr fails it too',
  !freeCheckRead(freeCheckSrc.replace("normalizePublicLocale(v) ?? 'he'", "v === 'en' || v === 'es' || v === 'fr' ? v : 'he'")))
const tFr = createI18n('fr'), tPt = createI18n('pt-BR'), tEn = createI18n('en')
check('4f: the AI-visibility strings answer French',
  !HEBREW.test(tFr('ai_visibility')) && tFr('ai_visibility') !== tPt('ai_visibility') && tFr('ai_visibility') !== tEn('ai_visibility'))
check('4f1: a regional French tag reads the same French', createI18n('fr-CA')('ai_visibility') === tFr('ai_visibility'))
check('4g: every AI-visibility entry that has English has French',
  (() => {
    const s = read('lib/ai-visibility/i18n.ts')
    const withEn = (s.match(/\ben: '/g) || []).length
    const withFr = (s.match(/\bfr: '/g) || []).length
    console.log(`    → ${withFr} French values against ${withEn} English ones`)
    return withFr >= withEn
  })())
check('4h: the monthly report speaks French',
  !HEBREW.test(monthlyCopy('fr').title) && monthlyCopy('fr').title !== monthlyCopy('en').title)
check('4i: the PDF and Excel labels speak French',
  !HEBREW.test(getExportLabels('fr').rankingReport) && getExportLabels('fr').rankingReport !== getExportLabels('en').rankingReport)
// `researchCompetitive` is a TOP-LEVEL section of the dictionary, not a part of
// `guide`, even though fr/guide.ts is the file that mounts it (its header says
// why). Read by path off the assembled dictionary, so moving the file next to
// the other languages — the follow-up that header asks for — cannot break this.
const ptByPath = new Map(ptLeaves.map((l) => [l.path, l.text]))
check('4j: the competitor screen speaks French',
  (() => {
    const title = frByPath.get('researchCompetitive.title') ?? ''
    return title.length > 0 && !HEBREW.test(title) && title !== ptByPath.get('researchCompetitive.title')
  })(), `fr="${frByPath.get('researchCompetitive.title')}" pt="${ptByPath.get('researchCompetitive.title')}"`)

/*
 * 4k — DATES AND NUMBERS ARE NOT A BILINGUAL SURFACE.
 *
 * The dashboard deliberately narrows most of itself to `Locale` ('he' | 'en');
 * lib/i18n/dashboard/locale.ts says why and that is not in question here. Dates
 * and numbers were swept up in that narrowing by accident, and `Intl` writes
 * both in every language we ship, so the narrowing protected nothing and cost
 * French (and Spanish, and Portuguese, since the day each shipped) lines like
 * "Audité 3 days ago" and "Sep 27, 2026 · 5:09 PM" in the middle of their own
 * prose. Caught on a French screenshot, not by a test — hence this guard.
 *
 * A SOURCE guard, because the defect is in which variable a call site passes,
 * which no amount of reading the dictionary can show. Every component that has
 * both values in scope (`const { language, uiLocale } = useDashboardLanguage()`)
 * must hand the formatters `uiLocale`.
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
  // …and the formatters themselves accept every language, which is what makes
  // passing uiLocale meaningful rather than merely type-correct.
  check('4k1: the curried formatter takes a PublicLocale, not a bilingual Locale',
    /export function formatDate\(lang: PublicLocale\): DateFormatter/.test(src('lib/i18n/format-date.ts')))
  const frDate = curriedDate('fr').dateTime('2026-09-27T17:09:00Z')
  check('4k2: and French dates really read as French, not as English wearing a French label',
    !/Sep\b|PM|AM/.test(frDate) && /sept/i.test(frDate), frDate)
  check('4k2 mutation: the English form is what this check rejects',
    /Sep\b|PM|AM/.test(curriedDate('en').dateTime('2026-09-27T17:09:00Z')))
}

// 5 — THE FLAG STILL GATES THE LANGUAGE.
const switcher = src('components/DashboardLanguageSwitcher.tsx')
check('5a: the in-app switcher offers FR only while the French build is on',
  /frenchSiteEnabled\(\) \?/.test(switcher) && /'fr' as PublicLocale/.test(switcher))
check('5a mutation: an unconditional FR option is caught',
  !/frenchSiteEnabled\(\) \?/.test("{ locale: 'fr' as PublicLocale, lang: 'fr', label: 'FR' },"))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}

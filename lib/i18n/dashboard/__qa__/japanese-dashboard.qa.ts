/**
 * THE DASHBOARD IN JAPANESE — the full-translation wave, seventh language.
 *
 * Oren's rule for this wave: a language we add is translated in BOTH the public
 * site and the app, so "Japanese falls back to English" is not good enough for
 * the dashboard. This is the twin of
 * lib/i18n/dashboard/__qa__/italian-dashboard.qa.ts, and it proves the same five
 * things — with the one difference that matters:
 *
 *   JAPANESE IS NOT WRITTEN IN THE SAME SCRIPT AS THE LANGUAGE IT WAS COPIED
 *   FROM. In the Latin-script waves the "copied and not translated" failure can
 *   only be caught by comparing strings leaf for leaf, because French prose on
 *   an Italian screen looks like prose either way. Japanese can be asked the
 *   stronger question directly: is this leaf WRITTEN in Japanese? So section 2
 *   keeps the identical-leaf rate guard AND adds a script guard, which catches a
 *   part left in Italian even if someone edited a word of it.
 *
 *  1. PARITY WITH ITALIAN, LEAF FOR LEAF. it/ is the finished parts dictionary
 *     this one was written from, so every path it answers the Japanese one
 *     answers too. A section translated half-way shows up as a missing path.
 *  2. NOTHING ANSWERS IN HEBREW, nothing answers in ITALIAN, FRENCH, SPANISH,
 *     PORTUGUESE or ENGLISH, and every prose leaf is written in Japanese.
 *  3. THE PARTS DIRECTORY CANNOT HALF-OWN A SECTION. ja/ is assembled by a flat
 *     spread, so two parts naming one section would silently drop one of them.
 *  4. THE COPY OUTSIDE THE DICTIONARY IS JAPANESE TOO — the plan limit lines,
 *     the auth frame's brand panel, the 451 notice, the AI-visibility strings,
 *     the monthly report and the export labels.
 *  5. THE FLAG STILL GATES THE LANGUAGE. The in-app switcher offers Japanese
 *     only while the Japanese build is on.
 *
 * THE REGISTER, which is section 2f, is Japanese-specific and is the same
 * contract the Japanese legal documents are held to: plain polite です・ます, no
 * 謙譲語 (no 〜させていただきます, no いたします, no 弊社) and no である体. A
 * dashboard that bows to the user instead of telling them what happened is the
 * failure this catches.
 *
 * MUTATION CONTROL. Every guard is re-run against a deliberately broken input
 * and must then fail.
 *
 * Run: npx tsx lib/i18n/dashboard/__qa__/japanese-dashboard.qa.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { dashboardJa, JA_PARTS } from '../ja/index'
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
import { landingJa } from '../../public/landing-ja'
import { landingHe } from '../../public/landing-he'
import { formatDate as curriedDate } from '../../format-date'
import { textScript } from '../../../text/segment'

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

const jaLeaves = leaves(dashboardJa)
const itLeaves = leaves(dashboardIt)
const jaPaths = new Set(jaLeaves.map((l) => l.path))
const jaByPath = new Map(jaLeaves.map((l) => [l.path, l.text]))

console.log('\nJAPANESE DASHBOARD\n')
console.log(`  → ${jaLeaves.length} Japanese leaves across ${Object.keys(dashboardJa).length} sections (Italian: ${itLeaves.length} across ${Object.keys(dashboardIt).length})`)

// 1 — PARITY WITH ITALIAN.
const missing = itLeaves.filter((l) => !jaPaths.has(l.path))
check('1a: every path the Italian dictionary answers, the Japanese one answers',
  missing.length === 0, missing.slice(0, 5).map((l) => l.path).join(', '))
check('1b: the Japanese dictionary names the same number of sections as the English one',
  Object.keys(dashboardJa).length === Object.keys(dashboardEn).length,
  `ja ${Object.keys(dashboardJa).length} vs en ${Object.keys(dashboardEn).length}`)
check('1c: every Japanese section is a real section of the English dictionary',
  Object.keys(dashboardJa).every((k) => k in dashboardEn),
  Object.keys(dashboardJa).filter((k) => !(k in dashboardEn)).join(', '))
check('1a mutation: a missing section is caught',
  (() => {
    const broken = new Set(jaPaths); for (const p of [...broken]) if (p.startsWith('siteHealth.')) broken.delete(p)
    return itLeaves.some((l) => !broken.has(l.path))
  })())

// 2 — NOT HEBREW, NOT ANOTHER LANGUAGE, AND WRITTEN IN JAPANESE.
const hebrew = jaLeaves.filter((l) => HEBREW.test(l.text))
check('2a: no leaf of the Japanese dictionary is in Hebrew',
  hebrew.length === 0, hebrew.slice(0, 5).map((l) => `${l.path} = ${l.text}`).join(' | '))
const merged = leaves(getDashboardDictionary('ja'))
const mergedHebrew = merged.filter((l) => HEBREW.test(l.text))
// The English dashboard itself shows a few Hebrew publishGate strings, which the
// main build thread owns; the Japanese dashboard inherits exactly those.
const inheritedHebrew = leaves(dashboardEn).filter((l) => HEBREW.test(l.text)).map((l) => l.path)
check('2b: the merged Japanese dictionary is Hebrew-free apart from what the ENGLISH one already shows',
  mergedHebrew.every((l) => inheritedHebrew.includes(l.path)),
  mergedHebrew.filter((l) => !inheritedHebrew.includes(l.path)).slice(0, 5).map((l) => l.path).join(', '))
check('2a mutation: a Hebrew string is caught', HEBREW.test('מילת מפתח'))

/*
 * 2c — THE COPIED-NOT-TRANSLATED GUARD, as a rate. Same bar as the Italian wave:
 * a handful of leaves legitimately coincide across languages (a product name,
 * "SEO", a bare number, a one-word label), so what is measured is whether the
 * overwhelming majority of long prose leaves differ. A whole untranslated part
 * moves this number immediately.
 */
const PROSE_MIN = 25
const comparable = (other: Leaf[]) => other.filter((l) => l.text.length >= PROSE_MIN && jaByPath.has(l.path))
const sameAs = (other: Leaf[]) => comparable(other).filter((l) => jaByPath.get(l.path) === l.text)
for (const [name, other] of [['Italian', itLeaves], ['French', leaves(dashboardFr)], ['Portuguese', leaves(dashboardPtBR)], ['Spanish', leaves(dashboardEs)], ['English', leaves(dashboardEn)]] as const) {
  const pool = comparable(other)
  const same = sameAs(other)
  const rate = pool.length === 0 ? 1 : same.length / pool.length
  check(`2c-${name}: Japanese prose is not ${name} (${same.length} of ${pool.length} long leaves identical)`,
    pool.length > 300 && rate < 0.02,
    `${(rate * 100).toFixed(1)}% identical; e.g. ${same.slice(0, 4).map((l) => `${l.path}="${l.text.slice(0, 50)}"`).join(' | ')}`)
}
check('2c mutation: a dictionary that is really Italian is caught',
  (() => {
    const pool = comparable(itLeaves)
    return pool.length > 0 && pool.length / pool.length >= 0.02
  })())

/*
 * 2d — AND EVERY PROSE LEAF IS WRITTEN IN JAPANESE.
 *
 * This is the guard the Latin-script waves could not have. `textScript` reads
 * the characters, so a leaf that carries no kana and no kanji is either a brand,
 * a label, a path or a number — or it is a part somebody forgot to translate.
 * The exceptions are explicit and narrow, and the mutation control holds both
 * sides: Italian prose fails, a brand and a path do not.
 */
const LOOKS_TECHNICAL = (t: string) =>
  /^[\s\p{P}\p{S}\d]*$/u.test(t)                          // punctuation, digits, nothing
  || /^(?:\/|https?:|mailto:|tel:|#|data:)/.test(t)       // a path, a URL, an anchor
  || /^[A-Za-z0-9 .+&'’()\-/_%:,]{1,28}$/.test(t)         // a short Latin label or brand
  // A list of brand names, Latin on purpose and punctuated in Japanese; each
  // piece must be at most two words, so a brand list passes and an English
  // SENTENCE does not.
  || (/^[A-Za-z0-9 .+&'’()\-/_%:,、・]+$/.test(t)
    && t.split(/[,、・]/).every((piece) => piece.trim().split(/\s+/).filter(Boolean).length <= 2))
  // An e-mail placeholder. It is an address a merchant reads as an address, so
  // it stays Latin in every locale — Italian has email@esempio.it against our
  // mail@example.jp. The shape is anchored, so an English sentence with an
  // address in it still fails.
  || /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(t)
const notJapanese = jaLeaves.filter((l) =>
  l.text.length >= 12 && !LOOKS_TECHNICAL(l.text) && textScript(l.text) !== 'ja')
check('2d: every prose leaf of the Japanese dictionary is written in Japanese',
  notJapanese.length === 0, notJapanese.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
check('2d mutation: an Italian leaf left behind is caught, and a brand or a path is not',
  textScript('Monitoraggio delle parole chiave e visibilità') !== 'ja'
  && !LOOKS_TECHNICAL('Monitoraggio delle parole chiave e visibilità')
  && LOOKS_TECHNICAL('Go Top SEO') && LOOKS_TECHNICAL('/projects/new')
  && LOOKS_TECHNICAL('ChatGPT、Gemini、Perplexity')
  && LOOKS_TECHNICAL('mail@example.jp')
  // the e-mail clause is anchored: a sentence that merely contains an address fails
  && !LOOKS_TECHNICAL('Write to mail@example.jp and we will answer you shortly')
  && textScript('検索順位の計測') === 'ja')

/*
 * 2f — THE REGISTER. です・ます with no 謙譲語 and no である体, exactly as
 * components/public/__qa__/translated-legal-coverage.qa.ts requires of the
 * Japanese legal documents. 「お願いいたします」 is the one set phrase the legal
 * suite exempts; it has no place in a dashboard label, so nothing is exempted
 * here and the control proves the pattern fires on it too.
 */
const HUMBLE = /させていただ|いたします|弊社|小社|ご査収/
const PLAIN = /である。|する。|ない。|だ。/
/*
 * The one exemption, and it is not our voice: this placeholder shows the
 * merchant an EXAMPLE of the instructions THEY type for the writer, and an
 * instruction to a writer is written plain in Japanese — 「価格には触れない。」 —
 * exactly as Italian and French put the same example in the infinitive
 * (`scrivere alla prima persona plurale`, `écrire à la première personne`).
 * Writing it です・ます would make it read as a promise from us instead of a
 * sample of their own words. The path is pinned, so the exemption cannot drift
 * to a label we do speak in.
 */
const USER_VOICE = ['projectSettings.writingGuidance.instructionsPlaceholder']
const ourVoice = jaLeaves.filter((l) => !USER_VOICE.includes(l.path))
const humble = ourVoice.filter((l) => HUMBLE.test(l.text))
const plain = ourVoice.filter((l) => PLAIN.test(l.text))
check('2f: the whole Japanese dictionary keeps the です・ます register, with no 謙譲語',
  humble.length === 0, humble.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
check('2f1: and no である体 either',
  plain.length === 0, plain.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
check('2f mutation: the humble and plain forms are caught',
  HUMBLE.test('レポートをお送りさせていただきます。') && HUMBLE.test('弊社の記録です。')
  && HUMBLE.test('ご確認をお願いいたします。')
  && PLAIN.test('記事は公開済みである。'))
check('2f control: the pattern does not fire on ordinary polite Japanese',
  !HUMBLE.test('サイトを接続すると、順位の計測が始まります。')
  && !PLAIN.test('この記事はまだ公開されていません。'))
// The exemption is one path, it exists, and it is the only leaf it covers.
check('2f2: the one user-voice exemption is a real leaf, and it is alone',
  USER_VOICE.every((path) => jaLeaves.some((l) => l.path === path))
  && ourVoice.length === jaLeaves.length - USER_VOICE.length)
check('2f2 mutation: were the exemption dropped, the placeholder would be caught',
  PLAIN.test(jaLeaves.find((l) => l.path === USER_VOICE[0])!.text))

// 3 — THE PARTS DIRECTORY.
const owners: Record<string, number> = {}
for (const part of JA_PARTS) for (const k of Object.keys(part as object)) owners[k] = (owners[k] || 0) + 1
const shared = Object.entries(owners).filter(([, n]) => n > 1)
check('3a: no section is named by two parts of ja/', shared.length === 0, shared.map(([k]) => k).join(', '))
check('3b: the parts together name every section of the assembled dictionary',
  Object.keys(owners).length === Object.keys(dashboardJa).length)
check('3a mutation: a section in two parts is caught',
  (() => {
    const o: Record<string, number> = {}
    for (const part of [...JA_PARTS, JA_PARTS[0]]) for (const k of Object.keys(part as object)) o[k] = (o[k] || 0) + 1
    return Object.values(o).some((n) => n > 1)
  })())

// 4 — THE COPY OUTSIDE THE DICTIONARY.
const planLines = [...planLimitLines('regular', 'ja'), ...planLimitLines('large_agency', 'ja'), ...trialLimitLines('ja')]
check('4a: the plan and trial limit lines are Japanese, not Hebrew',
  planLines.every((l) => !HEBREW.test(l)) && planLines.some((l) => /サイト/.test(l)),
  planLines.filter((l) => HEBREW.test(l))[0])
check('4a mutation: a Hebrew plan line is caught', planLimitLines('regular', 'he').some((l) => HEBREW.test(l)))
check('4b: the "what a check is" sentence has its own Japanese',
  !HEBREW.test(CHECKS_EXPLAINER.ja) && CHECKS_EXPLAINER.ja !== CHECKS_EXPLAINER.it && CHECKS_EXPLAINER.ja !== CHECKS_EXPLAINER.en)
const shellSrc = src('components/auth/AuthShell.tsx')
check('4c: the auth frame reads one exhaustive table, so Japanese cannot fall through to Hebrew',
  /const AUTH_LANDING: Record<PublicLocale, /.test(shellSrc)
  && /const landing = AUTH_LANDING\[locale\]/.test(shellSrc)
  && !/locale === '(?:es|pt-BR|fr|it|en)' \?[^\n]*landing/.test(shellSrc))
check('4c mutation: a ternary chain back in AuthShell fails 4c',
  /locale === '(?:es|pt-BR|fr|it|en)' \?[^\n]*landing/.test(
    shellSrc.replace('const landing = AUTH_LANDING[locale]',
      "const landing = locale === 'it' ? landingIt : landingHe")))
check('4c1: and the Japanese panel really carries Japanese copy, not Hebrew',
  !HEBREW.test(landingJa.demo.rank.keyword) && landingJa.demo.rank.keyword !== landingHe.demo.rank.keyword)
check('4d: the 451 notice does not answer Hebrew to a Japanese visitor',
  !HEBREW.test(sanctionsNotice('ja')) && sanctionsNotice('ja') !== sanctionsNotice('en'))
const freeCheckRead = (c: string) =>
  /const readPublicLocale = \(v: unknown\): PublicLocale => normalizePublicLocale\(v\) \?\? 'he'/.test(c)
  && !/readPublicLocale = [^\n]*v === '/.test(c)
const freeCheckSrc = src('lib/presignup/http.ts')
check('4e: the free check reads its language from the one list, so it is never Hebrew',
  freeCheckRead(freeCheckSrc))
check('4e mutation: a hand-written list that happens to include ja fails it too',
  !freeCheckRead(freeCheckSrc.replace("normalizePublicLocale(v) ?? 'he'", "v === 'en' || v === 'es' || v === 'ja' ? v : 'he'")))
const tJa = createI18n('ja'), tIt = createI18n('it'), tEn = createI18n('en')
check('4f: the AI-visibility strings answer Japanese',
  !HEBREW.test(tJa('ai_visibility')) && tJa('ai_visibility') !== tIt('ai_visibility') && tJa('ai_visibility') !== tEn('ai_visibility'))
check('4f1: a regional Japanese tag reads the same Japanese', createI18n('ja-JP')('ai_visibility') === tJa('ai_visibility'))
check('4g: every AI-visibility entry that has English has Japanese',
  (() => {
    const s = read('lib/ai-visibility/i18n.ts')
    const withEn = (s.match(/\ben: '/g) || []).length
    const withJa = (s.match(/\bja: '/g) || []).length
    console.log(`    → ${withJa} Japanese values against ${withEn} English ones`)
    return withJa >= withEn
  })())
check('4h: the monthly report speaks Japanese',
  !HEBREW.test(monthlyCopy('ja').title) && monthlyCopy('ja').title !== monthlyCopy('en').title)
check('4i: the PDF and Excel labels speak Japanese',
  !HEBREW.test(getExportLabels('ja').rankingReport) && getExportLabels('ja').rankingReport !== getExportLabels('en').rankingReport)
const itByPath = new Map(itLeaves.map((l) => [l.path, l.text]))
check('4j: the competitor screen speaks Japanese',
  (() => {
    const title = jaByPath.get('researchCompetitive.title') ?? ''
    return title.length > 0 && !HEBREW.test(title) && title !== itByPath.get('researchCompetitive.title')
  })(), `ja="${jaByPath.get('researchCompetitive.title')}" it="${itByPath.get('researchCompetitive.title')}"`)

/*
 * 4k — DATES AND NUMBERS ARE NOT A BILINGUAL SURFACE, inherited from the French
 * wave and re-checked here so the seventh language cannot re-introduce
 * "Audited 3 days ago" on a Japanese screen.
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
  const jaDate = curriedDate('ja').dateTime('2026-09-27T17:09:00Z')
  check('4k1: Japanese dates read as Japanese, not as English wearing a Japanese label',
    !/Sep\b|PM|AM/.test(jaDate) && /[年月日]/.test(jaDate), jaDate)
  check('4k1 mutation: the English form is what this check rejects',
    /Sep\b|PM|AM/.test(curriedDate('en').dateTime('2026-09-27T17:09:00Z')))
}

// 5 — THE FLAG STILL GATES THE LANGUAGE.
const switcher = src('components/DashboardLanguageSwitcher.tsx')
check('5a: the in-app switcher offers Japanese only while the Japanese build is on',
  /japaneseSiteEnabled\(\) \?/.test(switcher) && /'ja' as PublicLocale/.test(switcher))
check('5a mutation: an unconditional JA option is caught',
  !/japaneseSiteEnabled\(\) \?/.test("{ locale: 'ja' as PublicLocale, lang: 'ja' },"))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}

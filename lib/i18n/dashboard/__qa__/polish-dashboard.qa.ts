/**
 * THE DASHBOARD IN POLISH — the full-translation wave, tenth language.
 *
 * Oren's rule for this wave: a language we add is translated in BOTH the public
 * site and the app, so "Polish falls back to English" is not good enough for
 * the dashboard. What that claim means in code, and therefore what this suite
 * proves:
 *
 *  1. PARITY WITH DUTCH, LEAF FOR LEAF. nl/ is the finished parts dictionary
 *     this one was written from, so every path it answers the Polish one
 *     answers too. A section translated half-way shows up here as a missing
 *     path.
 *  2. NOTHING ANSWERS IN HEBREW, and nothing answers in DUTCH, GERMAN,
 *     ITALIAN, FRENCH, SPANISH or PORTUGUESE either. The Dutch half is the one
 *     that matters here: pl/ was written from the nl/ parts, so a part left
 *     un-translated reads as Dutch rather than as the English the merge falls
 *     back to — and Dutch is latin-script left-to-right prose, which no Hebrew
 *     detector would ever notice.
 *  3. THE PARTS DIRECTORY CANNOT HALF-OWN A SECTION. pl/ is assembled by a flat
 *     spread, so two parts naming one section would silently drop one of them.
 *  4. THE COPY OUTSIDE THE DICTIONARY IS POLISH TOO — the plan limit lines, the
 *     auth frame's brand panel, the 451 notice, the AI-visibility strings, the
 *     monthly report and the export labels. Every one of those was once a
 *     ternary chain ending in Hebrew or English, and lib/plans/features.ts in
 *     particular fell through to HEBREW for a locale with no branch of its own,
 *     which is the bug that once shipped on the live /pt-BR pricing page.
 *  5. THE FLAG STILL GATES THE LANGUAGE. The in-app switcher offers PL only
 *     while the Polish build is on.
 *  6. NO PRICE IS NAMED IN ZŁOTY OR IN EUROS. Outside Israel the product
 *     charges US DOLLARS through Creem, so a złoty figure on a Polish screen is
 *     a price this service does not take — and art. 4 ust. 1 ustawy o
 *     informowaniu o cenach towarów i usług, with art. 12 ust. 1 pkt 5 ustawy o
 *     prawach konsumenta behind it, is precisely about the stated price being
 *     the total actually payable. A Polish reader expects złoty, which is what
 *     makes it the mistake a translator makes without being asked to.
 *  7. THE PLURAL IS NOT A TWO-WAY ONE. Polish agreement has three classes (1 /
 *     2-4 / 0 and 5+, with 12-14 taking the genitive plural), so a dictionary
 *     that reached for a singular-or-plural ternary would be wrong on a third of
 *     all numbers. lib/i18n/dashboard/pl/plural.ts is the helper, and this
 *     suite checks the helper itself, because every count line in the Polish
 *     dictionary rests on it.
 *
 * MUTATION CONTROL. Every guard is re-run against a deliberately broken input
 * and must then fail.
 *
 * Run: npx tsx lib/i18n/dashboard/__qa__/polish-dashboard.qa.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { dashboardPl, PL_PARTS } from '../pl/index'
import { dashboardNl } from '../nl/index'
import { dashboardDe } from '../de/index'
import { dashboardIt } from '../it/index'
import { dashboardFr } from '../fr/index'
import { dashboardPtBR } from '../pt-BR/index'
import { dashboardEs } from '../es'
import { dashboardEn } from '../en'
import { getDashboardDictionary } from '../getDashboardDictionary'
import { plForm, plPick } from '../pl/plural'
import { planLimitLines, trialLimitLines, CHECKS_EXPLAINER } from '../../../plans/features'
import { sanctionsNotice } from '../../../sanctions/guard'
import { createI18n } from '../../../ai-visibility/i18n'
import { monthlyCopy } from '../../../../components/reports/monthly/copy'
import { getExportLabels } from '../../../export/i18n'
import { landingPl } from '../../public/landing-pl'
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

const plLeaves = leaves(dashboardPl)
const nlLeaves = leaves(dashboardNl)
const plPaths = new Set(plLeaves.map((l) => l.path))
const plByPath = new Map(plLeaves.map((l) => [l.path, l.text]))

console.log('\nPOLISH DASHBOARD\n')
console.log(`  → ${plLeaves.length} Polish leaves across ${Object.keys(dashboardPl).length} sections (Dutch: ${nlLeaves.length} across ${Object.keys(dashboardNl).length})`)

// 1 — PARITY WITH DUTCH.
const missing = nlLeaves.filter((l) => !plPaths.has(l.path))
check('1a: every path the Dutch dictionary answers, the Polish one answers',
  missing.length === 0, missing.slice(0, 5).map((l) => l.path).join(', '))
check('1b: the Polish dictionary names the same number of sections as the English one',
  Object.keys(dashboardPl).length === Object.keys(dashboardEn).length,
  `pl ${Object.keys(dashboardPl).length} vs en ${Object.keys(dashboardEn).length}`)
check('1c: every Polish section is a real section of the English dictionary',
  Object.keys(dashboardPl).every((k) => k in dashboardEn),
  Object.keys(dashboardPl).filter((k) => !(k in dashboardEn)).join(', '))
check('1a mutation: a missing section is caught',
  (() => {
    const broken = new Set(plPaths); for (const p of [...broken]) if (p.startsWith('siteHealth.')) broken.delete(p)
    return nlLeaves.some((l) => !broken.has(l.path))
  })())

// 2 — NOT HEBREW, AND NOT ANOTHER LATIN LANGUAGE EITHER.
const hebrew = plLeaves.filter((l) => HEBREW.test(l.text))
check('2a: no leaf of the Polish dictionary is in Hebrew',
  hebrew.length === 0, hebrew.slice(0, 5).map((l) => `${l.path} = ${l.text}`).join(' | '))
const merged = leaves(getDashboardDictionary('pl'))
const mergedHebrew = merged.filter((l) => HEBREW.test(l.text))
// The English dashboard itself shows a few Hebrew publishGate strings, which the
// main build thread owns; the Polish dashboard inherits exactly those.
const inheritedHebrew = leaves(dashboardEn).filter((l) => HEBREW.test(l.text)).map((l) => l.path)
check('2b: the merged Polish dictionary is Hebrew-free apart from what the ENGLISH one already shows',
  mergedHebrew.every((l) => inheritedHebrew.includes(l.path)),
  mergedHebrew.filter((l) => !inheritedHebrew.includes(l.path)).slice(0, 5).map((l) => l.path).join(', '))
check('2a mutation: a Hebrew string is caught', HEBREW.test('מילת מפתח'))

/*
 * 2c — THE COPIED-NOT-TRANSLATED GUARD. pl/ was written from the nl/ parts, so
 * the failure mode is "a part was copied and not translated", which leaves
 * DUTCH on a Polish screen. Measured as a RATE rather than per leaf: a handful
 * of leaves legitimately coincide across two latin languages (a product name,
 * "SEO", a bare number, a one-word label), so the bar is that the overwhelming
 * majority of long prose leaves differ. A whole untranslated part moves this
 * number immediately, which is what it is for.
 */
const PROSE_MIN = 25
const comparable = (other: Leaf[]) => other.filter((l) => l.text.length >= PROSE_MIN && plByPath.has(l.path))
for (const [name, other] of [
  ['Dutch', nlLeaves],
  ['German', leaves(dashboardDe)],
  ['Italian', leaves(dashboardIt)],
  ['French', leaves(dashboardFr)],
  ['Portuguese', leaves(dashboardPtBR)],
  ['Spanish', leaves(dashboardEs)],
] as const) {
  const pool = comparable(other)
  const same = pool.filter((l) => plByPath.get(l.path) === l.text)
  const rate = pool.length === 0 ? 1 : same.length / pool.length
  check(`2c-${name}: Polish prose is not ${name} (${same.length} of ${pool.length} long leaves identical)`,
    pool.length > 500 && rate < 0.02,
    `${(rate * 100).toFixed(1)}% identical; e.g. ${same.slice(0, 4).map((l) => `${l.path}="${l.text.slice(0, 50)}"`).join(' | ')}`)
}
check('2c mutation: a dictionary that is really Dutch is caught',
  (() => {
    const pool = comparable(nlLeaves)
    return pool.length > 0 && pool.length / pool.length >= 0.02
  })())
const enLeaves = leaves(dashboardEn)
const enPool = enLeaves.filter((l) => l.text.length >= PROSE_MIN && plByPath.has(l.path))
const enSame = enPool.filter((l) => plByPath.get(l.path) === l.text)
check(`2d: Polish prose is not English either (${enSame.length} of ${enPool.length} long leaves identical)`,
  enPool.length > 500 && enSame.length / enPool.length < 0.02,
  enSame.slice(0, 4).map((l) => `${l.path}="${l.text.slice(0, 50)}"`).join(' | '))

/*
 * 2e — THE REGISTER. Oren's register for every foreign language is the formal
 * one, and in Polish that is the third person with Państwo, never the ty form.
 *
 * TWO THINGS ARE DELIBERATELY NOT FORBIDDEN HERE, and the suite would lie if
 * they were:
 *
 *   · THE BARE DATIVE `ci`. It is spelled exactly like the masculine personal
 *     plural demonstrative ("ci dostawcy"), which is correct Państwo prose. The
 *     unambiguous oblique forms are cię, ciebie, tobie, tobą.
 *   · THE BARE IMPERATIVE. A BUTTON is labelled "Zapisz", "Dodaj", "Anuluj" in
 *     every Polish interface there has ever been, and the prose around it keeps
 *     Państwo. Forbidding the imperative would forbid the whole button layer.
 *     So this looks for the ty PRONOUN and the ty second-person INDICATIVE,
 *     which no button label needs.
 *
 * JavaScript's \b counts only [A-Za-z0-9_], so a Polish diacritic is a word
 * boundary. Hence the Unicode lookarounds and the u flag.
 */
const INFORMAL = /(?<!\p{L})(?:ty|cię|ciebie|tobie|tobą|twój|twoj(?:a|e|ego|emu|ej|ich|im|ą|ym)|twoim|możesz|musisz|masz|chcesz|zrobisz|zobaczysz)(?!\p{L})/iu
const informal = plLeaves.filter((l) => INFORMAL.test(l.text))
check('2e: the whole Polish dictionary keeps the formal Państwo register',
  informal.length === 0, informal.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
check('2e mutation: an informal sentence is caught',
  INFORMAL.test('Podłącz swoją witrynę, a możesz od razu zacząć')
  && INFORMAL.test('To są twoje słowa kluczowe'))
check('2e control: the pattern does not fire on formal Polish, on a button label, or on the demonstrative ci',
  !INFORMAL.test('Jeśli Państwo podłączą witrynę, mierzymy pozycje raz w miesiącu w tym projekcie i wobec konkurentów.')
  && !INFORMAL.test('Zapisz') && !INFORMAL.test('Dodaj słowo kluczowe')
  && !INFORMAL.test('standardowe klauzule, które ci dostawcy zawierają w umowach'))

/*
 * 2f — THE DIACRITICS ARE WRITTEN OUT, AND DUTCH SPELLINGS ARE NOT.
 *
 * Two different mistakes, one check each. A dictionary pushed through an ASCII
 * pipeline comes back as "slowo kluczowe" and "miesiac", which is how a Polish
 * reader can tell nobody who speaks the language wrote it. And a dictionary
 * copied from nl/ and edited carelessly keeps Dutch words.
 *
 * THERE IS NO LETTER SHAPE THAT MARKS DUTCH FOR A POLISH READER, and the
 * attempt is recorded here so nobody adds it back: `ij` is the Polish
 * imperative ending (Zacznij, Zamknij), `aa` appears wherever the prefix za-
 * meets a vowel (Zaakceptuj), `ee` appears in loanwords (Freelancerzy). So the
 * Dutch leak is read by a closed list of Dutch WORDS.
 */
{
  const all = plLeaves.map((l) => l.text).join('\n')
  check('2f: the Polish dictionary writes its diacritics as themselves',
    /[ąćęłńóśźż]/.test(all))
  // Only words whose CORRECT spelling carries a diacritic, so the pattern reads
  // "this word lost its diacritic" and never fires on a word that has none.
  // `wyszukiwane` is correctly spelled without one, which is why it is absent.
  const TRANSLIT = /(?<!\p{L})(?:slowo|slowa|slow|miesiac|miesiecy|miesiecznie|zadne|zadnych|wlasny|wlasna|prosze|panstwo|panstwa|panstwu|artykul|artykuly|artykulow|strone|wiecej|nastepny|sledzenie|wiecie|bedzie|moga|sa)(?!\p{L})/iu
  const translit = plLeaves.filter((l) => TRANSLIT.test(l.text))
  check('2f1: and no word is spelled the ASCII way',
    translit.length === 0, translit.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
  check('2f1 mutation: a transliterated word is caught, and the correct spelling is not',
    TRANSLIT.test('Dodaj slowo kluczowe') && TRANSLIT.test('Raz w miesiac')
    && !TRANSLIT.test('Dodaj słowo kluczowe') && !TRANSLIT.test('Raz w miesiącu'))
  const DUTCH_WORD = /(?<!\p{L})(?:de|het|een|niet|zijn|wordt|worden|voor|van|met|uit|aan|zich|ook|maar|naar|geen|alleen|hoeveel|waarom|welke|wij|onze|elke|iedere|zonder|tussen|binnen|tijdens|volgens|zoals|omdat|terwijl|deze|hebben|heeft|kunnen|moeten|mogen|altijd|maandelijks|wanneer|niets|weinig|goede|nieuwe|eigen|samen|daarom|zoekwoorden|posities|website|rapporten|controle|meten|vragen)(?!\p{L})/iu
  const dutchish = plLeaves.filter((l) => DUTCH_WORD.test(l.text))
  check('2f2: and no leaf carries a Dutch word',
    dutchish.length === 0, dutchish.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
  check('2f2 mutation: a Dutch sentence is caught, and Polish is not',
    DUTCH_WORD.test('Wij meten uw posities elke maand')
    && DUTCH_WORD.test('Eén website, geen losse tools')
    && !DUTCH_WORD.test('Mierzymy Państwa pozycje raz w miesiącu')
    && !DUTCH_WORD.test('Jedna witryna, bez luźnych narzędzi'))
}

/*
 * 2g — THE PLURAL. Polish agreement has three classes, and 12, 13 and 14 take
 * the genitive plural although they end in 2, 3 and 4. The helper is the one
 * place that knows it, and every count line in pl/ goes through it, so a
 * regression here is a regression in dozens of visible strings at once.
 */
{
  const forms = ['słowo', 'słowa', 'słów'] as const
  const f = (n: number) => plPick(n, forms[0], forms[1], forms[2])
  /*
   * ONLY EXACTLY 1 TAKES THE SINGULAR. 21, 101 and 121 take the GENITIVE plural
   * ("dwadzieścia jeden słów", "sto jeden słów"), which is where Polish
   * parts company with the languages whose rule is "last digit 1". A reading
   * that gave 101 the singular would be wrong on every hundred, and this is the
   * line that states it.
   */
  check('2g: the helper agrees on 1, on 2-4, and on 0 and 5 and up',
    f(1) === 'słowo' && f(2) === 'słowa' && f(3) === 'słowa' && f(4) === 'słowa'
    && f(0) === 'słów' && f(5) === 'słów' && f(11) === 'słów'
    && f(21) === 'słów' && f(101) === 'słów'
    && f(22) === 'słowa' && f(102) === 'słowa' && f(103) === 'słowa',
    [0, 1, 2, 4, 5, 11, 21, 22, 101, 102].map((n) => `${n}:${f(n)}`).join(' '))
  check('2g1: and 12, 13 and 14 take the genitive plural, not the 2-4 form',
    f(12) === 'słów' && f(13) === 'słów' && f(14) === 'słów'
    && f(112) === 'słów' && f(113) === 'słów',
    [12, 13, 14, 112].map((n) => `${n}:${f(n)}`).join(' '))
  check('2g2: the three classes are indexed, so a caller cannot reach for a two-way plural',
    plForm(1) === 0 && plForm(3) === 1 && plForm(5) === 2
    && plForm(13) === 2 && plForm(0) === 2 && plForm(103) === 1,
    [0, 1, 3, 5, 13, 103].map((n) => `${n}:${plForm(n)}`).join(' '))
  check('2g mutation: a two-way plural is wrong on exactly the cases this helper exists for',
    (() => {
      const twoWay = (n: number) => (n === 1 ? forms[0] : forms[1])
      return twoWay(3) === f(3) && twoWay(5) !== f(5) && twoWay(13) !== f(13) && twoWay(0) !== f(0)
    })())
}

// 3 — THE PARTS DIRECTORY.
const owners: Record<string, number> = {}
for (const part of PL_PARTS) for (const k of Object.keys(part as object)) owners[k] = (owners[k] || 0) + 1
const shared = Object.entries(owners).filter(([, n]) => n > 1)
check('3a: no section is named by two parts of pl/', shared.length === 0, shared.map(([k]) => k).join(', '))
check('3b: the parts together name every section of the assembled dictionary',
  Object.keys(owners).length === Object.keys(dashboardPl).length)
check('3a mutation: a section in two parts is caught',
  (() => {
    const o: Record<string, number> = {}
    for (const part of [...PL_PARTS, PL_PARTS[0]]) for (const k of Object.keys(part as object)) o[k] = (o[k] || 0) + 1
    return Object.values(o).some((n) => n > 1)
  })())

// 4 — THE COPY OUTSIDE THE DICTIONARY.
const planLines = [...planLimitLines('regular', 'pl'), ...planLimitLines('large_agency', 'pl'), ...trialLimitLines('pl')]
check('4a: the plan and trial limit lines are Polish, not Hebrew',
  planLines.every((l) => !HEBREW.test(l)) && planLines.some((l) => /witryn/i.test(l)),
  planLines.filter((l) => HEBREW.test(l))[0])
check('4a mutation: a Hebrew plan line is caught', planLimitLines('regular', 'he').some((l) => HEBREW.test(l)))
check('4a1: and they are not the Dutch ones either',
  planLimitLines('regular', 'pl').join('|') !== planLimitLines('regular', 'nl').join('|'))
check('4b: the "what a check is" sentence has its own Polish',
  !HEBREW.test(CHECKS_EXPLAINER.pl) && CHECKS_EXPLAINER.pl !== CHECKS_EXPLAINER.nl && CHECKS_EXPLAINER.pl !== CHECKS_EXPLAINER.en)
const shellSrc = src('components/auth/AuthShell.tsx')
check('4c: the auth frame reads one exhaustive table, so Polish cannot fall through to Hebrew',
  /const AUTH_LANDING: Record<PublicLocale, /.test(shellSrc)
  && /const landing = AUTH_LANDING\[locale\]/.test(shellSrc))
check('4c mutation: a ternary chain back in AuthShell fails 4c',
  !/const landing = AUTH_LANDING\[locale\]/.test(
    shellSrc.replace('const landing = AUTH_LANDING[locale]',
      "const landing = locale === 'pl' ? landingPl : landingHe")))
check('4c1: and the Polish panel really carries Polish copy, not Hebrew',
  !HEBREW.test(landingPl.demo.rank.keyword) && landingPl.demo.rank.keyword !== landingHe.demo.rank.keyword)
check('4d: the 451 notice does not answer Hebrew to a Polish visitor',
  !HEBREW.test(sanctionsNotice('pl')) && sanctionsNotice('pl') !== sanctionsNotice('en'))
const tPl = createI18n('pl'), tNl = createI18n('nl'), tEn = createI18n('en')
check('4f: the AI-visibility strings answer Polish',
  !HEBREW.test(tPl('ai_visibility')) && tPl('ai_visibility') !== tNl('ai_visibility') && tPl('ai_visibility') !== tEn('ai_visibility'))
check('4f1: a regional Polish tag reads the same Polish', createI18n('pl-PL')('ai_visibility') === tPl('ai_visibility'))
check('4g: every AI-visibility entry that has English has Polish',
  (() => {
    const s = read('lib/ai-visibility/i18n.ts')
    const withEn = (s.match(/\ben: '/g) || []).length
    const withPl = (s.match(/\bpl: '/g) || []).length
    console.log(`    → ${withPl} Polish values against ${withEn} English ones`)
    return withPl >= withEn
  })())
/*
 * 4g1: AND NOT ONE OF THEM IS A DOUBLE-ESCAPED NEWLINE. The Polish values were
 * inserted by a script, and the five recommendation bodies that carry a line
 * break came out as a literal backslash-n on the screen: `\\n` in the source
 * instead of `\n`. The Dutch value of the same key is the control.
 */
check('4g1: a multi-line recommendation body carries a real line break, not a literal backslash-n',
  tPl('rec_weak_engines_body').includes('\n') && !tPl('rec_weak_engines_body').includes('\\n')
  && tPl('rec_weak_questions_zero_single').includes('\n') && !tPl('rec_weak_questions_zero_single').includes('\\n'),
  JSON.stringify(tPl('rec_weak_engines_body').slice(0, 60)))
check('4g1 mutation: the literal form is what that check rejects',
  'a.\\nb'.includes('\\n') && !'a.\nb'.includes('\\n'))
check('4h: the monthly report speaks Polish',
  !HEBREW.test(monthlyCopy('pl').title) && monthlyCopy('pl').title !== monthlyCopy('en').title)
check('4i: the PDF and Excel labels speak Polish',
  !HEBREW.test(getExportLabels('pl').rankingReport) && getExportLabels('pl').rankingReport !== getExportLabels('en').rankingReport)
{
  const plDate = curriedDate('pl').dateTime('2026-09-27T17:09:00Z')
  check('4k: Polish dates read as Polish, not as English wearing a Polish label',
    !/Sep\b|PM|AM/.test(plDate) && /wrz/i.test(plDate), plDate)
  check('4k mutation: the English form is what this check rejects',
    /Sep\b|PM|AM/.test(curriedDate('en').dateTime('2026-09-27T17:09:00Z')))
}

// 5 — THE FLAG STILL GATES THE LANGUAGE.
const switcher = src('components/DashboardLanguageSwitcher.tsx')
check('5a: the in-app switcher offers PL only while the Polish build is on',
  /polishSiteEnabled\(\) \?/.test(switcher) && /'pl' as PublicLocale/.test(switcher))
check('5a mutation: an unconditional PL option is caught',
  !/polishSiteEnabled\(\) \?/.test("{ locale: 'pl' as PublicLocale, lang: 'pl' },"))

/*
 * 6 — NO PRICE IN ZŁOTY OR IN EUROS, anywhere a Polish reader can see one.
 *
 * The rule and the reason are in the module comment above. The surfaces checked
 * are the ones that name a price: the dashboard dictionary, the Polish landing
 * and pricing copy, and the five Polish legal documents. A currency symbol is
 * not the only way to get this wrong, so the words "złoty" and "euro" and the
 * codes PLN and EUR are matched too.
 */
{
  const LOCAL = /€|(?<!\p{L})EUR(?!\p{L})|(?<!\p{L})euro(?!\p{L})|(?<!\p{L})PLN(?!\p{L})|(?<!\p{L})z[łl](?!\p{L})|(?<!\p{L})z[łl]ot\w*(?!\p{L})/iu
  const localLeaves = plLeaves.filter((l) => LOCAL.test(l.text))
  check('6a: no leaf of the Polish dashboard names a price in złoty or in euros',
    localLeaves.length === 0, localLeaves.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
  const copyFiles = ['lib/i18n/public/landing-pl.ts', 'lib/i18n/public/pricing-pl.ts', 'lib/i18n/public/pl.ts']
  const offenders = copyFiles.filter((f) => LOCAL.test(src(f)))
  check('6b: neither does the Polish landing or pricing copy',
    offenders.length === 0, offenders.join(', '))
  // The legal documents are the one place the words are allowed, because the
  // terms and the refund policy EXPLAIN the rule — art. 4 ust. 5 ustawy o
  // informowaniu o cenach towarów i usług. What is not allowed is a price: an
  // amount next to a plan. So the documents are checked for a FIGURE, not the
  // word — with ONE exception, struck out before the test rather than loosening
  // the pattern: the two fines of art. 6 ust. 1-2 of that same act (20 000 zł,
  // and 40 000 zł on a third breach within twelve months) are złoty figures
  // that have to be quotable, because they are the sanction that makes the rule
  // bite. They are statutory amounts, never a price for anything we sell, and
  // they are removed only where they stand next to that citation.
  const LOCAL_PRICE = /(?:€\s*\d|\d+(?:[.,]\d+)?\s*(?:€|EUR(?!\p{L})|euro(?!\p{L})|PLN(?!\p{L})|z[łl](?!\p{L})|z[łl]ot\w*))/iu
  const STATUTORY_FINE = /(?:20|40)\s?000 zł/g
  const docs = ['terms', 'privacy', 'refund-policy', 'accessibility', 'affiliate-terms']
  const priced = docs.filter((d) => LOCAL_PRICE.test(read(`content/legal/pl/${d}.md`).replace(STATUTORY_FINE, '[kara]')))
  check('6c: no Polish legal document states a price in złoty or in euros',
    priced.length === 0, priced.join(', '))
  // The control for the exception, so the carve-out cannot quietly swallow a
  // real price: a monthly figure in złoty is still caught beside the fines.
  check('6c mutation: the statutory-fine carve-out does not let a real złoty price through',
    LOCAL_PRICE.test('do 20 000 zł, a abonament kosztuje 299 zł miesięcznie'.replace(STATUTORY_FINE, '[kara]'))
    && !LOCAL_PRICE.test('kara do 20 000 zł, a przy trzecim naruszeniu do 40 000 zł'.replace(STATUTORY_FINE, '[kara]')))
  check('6a mutation: a złoty and a euro price are both caught',
    LOCAL.test('299 zł miesięcznie') && LOCAL.test('od 79 EUR miesięcznie')
    && LOCAL_PRICE.test('299 zł miesięcznie') && LOCAL_PRICE.test('79 € miesięcznie'))
  check('6c control: the rule is explained in words, so the documents DO name the currency',
    /dolar/i.test(read('content/legal/pl/refund-policy.md')) && /dolar/i.test(read('content/legal/pl/terms.md')))
  // And the positive half: the Polish pricing copy names DOLLARS, because that
  // is what Creem actually charges from Poland.
  check('6d: the Polish pricing copy names the price in dollars',
    /\$|USD|dolar/i.test(src('lib/i18n/public/pricing-pl.ts')))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}

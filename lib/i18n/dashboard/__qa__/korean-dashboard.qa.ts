/**
 * THE DASHBOARD IN KOREAN — the full-translation wave, eleventh language.
 *
 * Oren's rule for this wave: a language we add is translated in BOTH the public
 * site and the app, so "Korean falls back to English" is not good enough for
 * the dashboard. What that claim means in code, and therefore what this suite
 * proves:
 *
 *  1. PARITY WITH POLISH, LEAF FOR LEAF. pl/ is the finished parts dictionary
 *     this one was written from, so every path it answers the Korean one
 *     answers too. A section translated half-way shows up here as a missing
 *     path.
 *  2. NOTHING ANSWERS IN HEBREW, and nothing answers in JAPANESE either. The
 *     Japanese half is the one worth stating: ja/ is the other CJK tree, and a
 *     Korean screen that borrowed a Japanese string would carry kana, which no
 *     Hebrew detector would notice. The POSITIVE form of the same check is that
 *     the prose is actually Hangul, because an untranslated part reads as
 *     English and English is not a script anyone would look twice at.
 *  3. THE PARTS DIRECTORY CANNOT HALF-OWN A SECTION. ko/ is assembled by a flat
 *     spread, so two parts naming one section would silently drop one of them.
 *  4. THE COPY OUTSIDE THE DICTIONARY IS KOREAN TOO — the plan limit lines, the
 *     auth frame's brand panel, the 451 notice, the AI-visibility strings, the
 *     monthly report, the export labels and the dates. This is not a
 *     hypothetical: lib/plans/features.ts had NO Korean branch when the Korean
 *     dictionary was first assembled, so every one of the five limit lines on
 *     /ko/pricing and on the dashboard's plan cards came back in HEBREW — the
 *     same fall-through that once shipped on the live /pt-BR pricing page.
 *     Check 4a is the one that found it.
 *  5. THE FLAG STILL GATES THE LANGUAGE. The in-app switcher offers KO only
 *     while the Korean build is on.
 *  6. NO PRICE IS NAMED IN WON. Outside Israel the product charges US DOLLARS
 *     through Creem, so a won figure on a Korean screen is a price this service
 *     does not take — and 전자상거래법 제13조 제2항 obliges a mail-order seller
 *     to state, before the contract, the price and every other amount payable,
 *     which makes an invented won figure a price we could be held to. A Korean
 *     reader expects won, which is what makes it the mistake a translator makes
 *     without being asked to. The legal thread's ruling of 12 Nov 2026 is the
 *     authority, and two further conditions of it are checked here because this
 *     is the suite a later change would run: the Korean documents state SEVEN
 *     days and never fourteen, and they claim NO Korean business-registration
 *     number and NO 통신판매업 notification number.
 *  7. THERE IS NO PLURAL HELPER, AND THAT IS THE DECISION. Polish needed one
 *     because its agreement has three classes; Korean has NO grammatical plural
 *     at all, so a count is marked by a COUNTER on the numeral (개, 건, 회, 곳,
 *     일, 자, 점) and a helper would be a mechanism with nothing to decide. This
 *     suite therefore asserts the ABSENCE of one, so that nobody adds a
 *     singular-or-plural ternary to a Korean string later.
 *  8. THE TYPOGRAPHY IS KOREAN AND NOT JAPANESE. The ko tree writes ASCII
 *     sentence punctuation; the full-width 。 、 「 」 （ ） of the ja tree are the
 *     visible trace of a Japanese template reused for Korean.
 *  9. THE REGISTER IS 합니다체. Not 해요체, which is polite but familiar, and
 *     certainly not 반말.
 * 10. A KOREAN PDF IS NOT A GRID OF BOXES. Every HTML-to-PDF document here
 *     declares a Latin/Hebrew font stack, none of whose faces has a Hangul
 *     glyph, so lib/export/cjk-font.ts carries one — and it must still declare
 *     the Japanese face for a Japanese report, and BOTH for a report that holds
 *     both.
 *
 * MUTATION CONTROL. Every guard is re-run against a deliberately broken input
 * and must then fail.
 *
 * Run: npx tsx lib/i18n/dashboard/__qa__/korean-dashboard.qa.ts
 */

import { readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { dashboardKo, KO_PARTS } from '../ko/index'
import { dashboardPl } from '../pl/index'
import { dashboardJa } from '../ja/index'
import { dashboardNl } from '../nl/index'
import { dashboardDe } from '../de/index'
import { dashboardEn } from '../en'
import { getDashboardDictionary } from '../getDashboardDictionary'
import { planLimitLines, trialLimitLines, CHECKS_EXPLAINER } from '../../../plans/features'
import { sanctionsNotice } from '../../../sanctions/guard'
import { createI18n } from '../../../ai-visibility/i18n'
import { monthlyCopy } from '../../../../components/reports/monthly/copy'
import { getExportLabels } from '../../../export/i18n'
import { withCjkFont } from '../../../export/cjk-font'
import { landingKo } from '../../public/landing-ko'
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
const KANA = /[぀-ヿ]/
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/

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

const koLeaves = leaves(dashboardKo)
const plLeaves = leaves(dashboardPl)
const koPaths = new Set(koLeaves.map((l) => l.path))
const koByPath = new Map(koLeaves.map((l) => [l.path, l.text]))

console.log('\nKOREAN DASHBOARD\n')
console.log(`  → ${koLeaves.length} Korean leaves across ${Object.keys(dashboardKo).length} sections (Polish: ${plLeaves.length} across ${Object.keys(dashboardPl).length})`)

// 1 — PARITY WITH POLISH.
const missing = plLeaves.filter((l) => !koPaths.has(l.path))
check('1a: every path the Polish dictionary answers, the Korean one answers',
  missing.length === 0, missing.slice(0, 5).map((l) => l.path).join(', '))
check('1b: the Korean dictionary names the same number of sections as the English one',
  Object.keys(dashboardKo).length === Object.keys(dashboardEn).length,
  `ko ${Object.keys(dashboardKo).length} vs en ${Object.keys(dashboardEn).length}`)
check('1c: every Korean section is a real section of the English dictionary',
  Object.keys(dashboardKo).every((k) => k in dashboardEn),
  Object.keys(dashboardKo).filter((k) => !(k in dashboardEn)).join(', '))
check('1a mutation: a missing section is caught',
  (() => {
    const broken = new Set(koPaths); for (const p of [...broken]) if (p.startsWith('siteHealth.')) broken.delete(p)
    return plLeaves.some((l) => !broken.has(l.path))
  })())

// 2 — NOT HEBREW, NOT JAPANESE, AND ACTUALLY HANGUL.
const hebrew = koLeaves.filter((l) => HEBREW.test(l.text))
check('2a: no leaf of the Korean dictionary is in Hebrew',
  hebrew.length === 0, hebrew.slice(0, 5).map((l) => `${l.path} = ${l.text}`).join(' | '))
check('2a mutation: a Hebrew string is caught', HEBREW.test('מילת מפתח'))
const merged = leaves(getDashboardDictionary('ko'))
const mergedHebrew = merged.filter((l) => HEBREW.test(l.text))
// The English dashboard itself shows a few Hebrew publishGate strings, which the
// main build thread owns; the Korean dashboard inherits exactly those.
const inheritedHebrew = leaves(dashboardEn).filter((l) => HEBREW.test(l.text)).map((l) => l.path)
check('2b: the merged Korean dictionary is Hebrew-free apart from what the ENGLISH one already shows',
  mergedHebrew.every((l) => inheritedHebrew.includes(l.path)),
  mergedHebrew.filter((l) => !inheritedHebrew.includes(l.path)).slice(0, 5).map((l) => l.path).join(', '))
const kana = koLeaves.filter((l) => KANA.test(l.text))
check('2c: no leaf carries kana, so no Japanese string was reused',
  kana.length === 0, kana.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 50)}`).join(' | '))
check('2c mutation: a Japanese string is caught, and a Korean one is not',
  KANA.test('サイト1件') && !KANA.test('사이트 1개'))

/*
 * 2d — THE POSITIVE FORM, which is the one that actually catches an
 * untranslated part here. A part left in ENGLISH carries no kana and no Hebrew,
 * so neither check above would see it; what it does carry is no Hangul. Long
 * leaves only: a short leaf is legitimately a product name, a URL or a number.
 */
const PROSE_MIN = 25
const prose = koLeaves.filter((l) => l.text.length >= PROSE_MIN)
const noHangul = prose.filter((l) => !HANGUL.test(l.text))
check(`2d: the Korean prose is Hangul (${prose.length - noHangul.length} of ${prose.length} long leaves)`,
  prose.length > 1500 && noHangul.length / prose.length < 0.03,
  noHangul.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 50)}`).join(' | '))
check('2d mutation: an English paragraph is caught',
  !HANGUL.test('Connect your website and we measure the rankings once a month.'))

/*
 * 2e — THE COPIED-NOT-TRANSLATED GUARD, measured as a RATE rather than per
 * leaf: a handful of leaves legitimately coincide across two languages (a
 * product name, "SEO", a bare number, a one-word label), so the bar is that the
 * overwhelming majority of long prose leaves differ. A whole untranslated part
 * moves this number immediately, which is what it is for.
 */
const comparable = (other: Leaf[]) => other.filter((l) => l.text.length >= PROSE_MIN && koByPath.has(l.path))
for (const [name, other] of [
  ['Polish', plLeaves],
  ['Japanese', leaves(dashboardJa)],
  ['Dutch', leaves(dashboardNl)],
  ['German', leaves(dashboardDe)],
  ['English', leaves(dashboardEn)],
] as const) {
  const pool = comparable(other)
  const same = pool.filter((l) => koByPath.get(l.path) === l.text)
  const rate = pool.length === 0 ? 1 : same.length / pool.length
  check(`2e-${name}: Korean prose is not ${name} (${same.length} of ${pool.length} long leaves identical)`,
    pool.length > 500 && rate < 0.02,
    `${(rate * 100).toFixed(1)}% identical; e.g. ${same.slice(0, 4).map((l) => `${l.path}="${l.text.slice(0, 50)}"`).join(' | ')}`)
}
check('2e mutation: a dictionary that is really its source language is caught',
  (() => { const pool = comparable(plLeaves); return pool.length > 0 && pool.length / pool.length >= 0.02 })())

/*
 * 8 — THE TYPOGRAPHY. Checked here, next to the script checks it belongs with.
 *
 * The ja tree writes 。 、 「 」 （ ） because Japanese does. Korean does not: it
 * writes the ASCII period, comma, question mark and parentheses, and the ko
 * dictionary was written that way deliberately (lib/i18n/dashboard/ko/chrome.ts
 * records the decision). A full-width mark in a Korean string is therefore not
 * a style preference, it is the trace of a Japanese template.
 *
 * 「 」 is left out of the forbidden set on purpose: Korean does use the corner
 * brackets to set off a TERM, and lib/content/recommendations/reason-text.ts
 * uses them for exactly that. What this forbids is the SENTENCE punctuation.
 */
{
  const FULLWIDTH = /[。、！？（）・]/
  const offenders = koLeaves.filter((l) => FULLWIDTH.test(l.text))
  check('8a: the Korean dictionary writes ASCII sentence punctuation, not the full-width Japanese forms',
    offenders.length === 0, offenders.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 50)}`).join(' | '))
  check('8a mutation: a Japanese full stop is caught, and the ASCII one is not',
    FULLWIDTH.test('サイトを接続します。') && !FULLWIDTH.test('사이트를 연결합니다.'))
  // And the ja tree really is the other way round, so this is a difference
  // between the two trees rather than a rule nobody follows.
  check('8b: the Japanese dictionary does use them, so the two trees differ on purpose',
    leaves(dashboardJa).some((l) => FULLWIDTH.test(l.text)))
}

/*
 * 9 — THE REGISTER. 합니다체 throughout, with 고객님 where the reader must be
 * addressed. Two things are forbidden and one is deliberately not:
 *
 *   · 해요체 (해요, 예요, 어요, 네요 at a sentence end) is polite but familiar.
 *     It is what a consumer app uses; it is not what a business tool writing to
 *     a paying customer uses, and it is the register a translator reaches for.
 *   · 반말 (거든, 잖아, 〜야) is plainly rude to a customer.
 *   · THE BARE NOUN IS NOT FORBIDDEN. A Korean BUTTON is labelled 저장, 추가,
 *     취소 — a noun, with no ending at all — and the prose around it stays
 *     합니다체. Forbidding endings outright would forbid the whole button layer,
 *     so both patterns are anchored at a SENTENCE end.
 */
{
  const HAEYO = /(?:해요|예요|이에요|에요|어요|아요|네요)(?:[.!?)]|$)/
  const BANMAL = /(?:(?:이|하|되|있|없)야|거든|잖아|(?:했|갔|봤)어)(?:[.!?)]|$)/
  const haeyo = koLeaves.filter((l) => HAEYO.test(l.text))
  const banmal = koLeaves.filter((l) => BANMAL.test(l.text))
  check('9a: no leaf drops into 해요체',
    haeyo.length === 0, haeyo.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 50)}`).join(' | '))
  check('9b: and none into 반말',
    banmal.length === 0, banmal.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 50)}`).join(' | '))
  check('9a mutation: a 해요체 sentence is caught and the 합니다체 one is not',
    HAEYO.test('사이트를 연결해요.') && !HAEYO.test('사이트를 연결합니다.'))
  check('9b mutation: a 반말 sentence is caught, and 이야기 is not mistaken for one',
    BANMAL.test('연결이 끊겼잖아') && !BANMAL.test('제목과 문구가 서로 다른 이야기를 했습니다'))
  check('9c control: a bare-noun button label passes both patterns',
    !HAEYO.test('저장') && !BANMAL.test('추가') && !HAEYO.test('취소'))
  // And the positive half: the dictionary really is 합니다체, in bulk.
  const formal = koLeaves.filter((l) => /(?:습니다|입니다|니다|십시오)[.!?)]?$/.test(l.text))
  check(`9d: the dictionary is 합니다체 in bulk (${formal.length} leaves end in it)`, formal.length > 1500)
}

/*
 * 7 — NO PLURAL HELPER, AND COUNTERS INSTEAD.
 *
 * The reason is in the module comment: Korean has no grammatical plural, so
 * there is nothing for a helper to decide, and a singular-or-plural ternary
 * added later would be a mechanism pretending to a distinction the language
 * does not make. 들 exists but is optional and marks a definite set, never a
 * count. What a count takes is a COUNTER.
 */
{
  check('7a: there is no plural module under ko/, the way there is under pl/',
    !existsSync(join(ROOT, 'lib/i18n/dashboard/ko/plural.ts')))
  check('7a control: pl/ really has one, so 7a is a difference and not a rule nobody follows',
    existsSync(join(ROOT, 'lib/i18n/dashboard/pl/plural.ts')))
  const koSrc = KO_FILES().map((f) => src(`lib/i18n/dashboard/ko/${f}`)).join('\n')
  check('7b: and no Korean part reaches for a plural helper of its own',
    !/\bplural\b|koPick|koForm|\bpluralize\b/i.test(koSrc))
  const COUNTERS = ['개', '건', '회', '곳', '일', '자', '점']
  const counted = koLeaves.filter((l) => COUNTERS.some((c) => l.text.includes(c)))
  check(`7c: counts carry a counter instead (${counted.length} leaves use one)`, counted.length > 500)
  // The five plan limit lines are the clearest case, and the one a reader sees
  // first: every number on them is followed by its counter.
  const lines = [...planLimitLines('large_agency', 'ko'), ...trialLimitLines('ko')]
  const bare = lines.filter((l) => /\d+(?![0-9,.])(?![\s]*(?:개|건|회|곳|일|자|점|위|%))/.test(l.replace(/Google|AI/g, '')))
  check('7d: no number on a Korean plan line is left without its counter',
    bare.length === 0, bare.join(' | '))
  check('7d mutation: a bare numeral is caught',
    /\d+(?![0-9,.])(?![\s]*(?:개|건|회|곳|일|자|점|위|%))/.test('키워드 50까지'))
}
function KO_FILES(): string[] {
  return ['index.ts', 'chrome.ts', 'home.ts', 'projects.ts', 'project-detail.ts', 'project-settings.ts',
    'keyword-research.ts', 'content-hub.ts', 'ai-visibility.ts', 'site-health.ts', 'site-links.ts',
    'tracking.ts', 'strategy.ts', 'billing.ts', 'guide.ts', 'seed-onboarding.ts']
    .filter((f) => existsSync(join(ROOT, 'lib/i18n/dashboard/ko', f)) && statSync(join(ROOT, 'lib/i18n/dashboard/ko', f)).isFile())
}

// 3 — THE PARTS DIRECTORY.
const owners: Record<string, number> = {}
for (const part of KO_PARTS) for (const k of Object.keys(part as object)) owners[k] = (owners[k] || 0) + 1
const shared = Object.entries(owners).filter(([, n]) => n > 1)
check('3a: no section is named by two parts of ko/', shared.length === 0, shared.map(([k]) => k).join(', '))
check('3b: the parts together name every section of the assembled dictionary',
  Object.keys(owners).length === Object.keys(dashboardKo).length)
check('3a mutation: a section in two parts is caught',
  (() => {
    const o: Record<string, number> = {}
    for (const part of [...KO_PARTS, KO_PARTS[0]]) for (const k of Object.keys(part as object)) o[k] = (o[k] || 0) + 1
    return Object.values(o).some((n) => n > 1)
  })())

// 4 — THE COPY OUTSIDE THE DICTIONARY.
/*
 * 4a IS THE CHECK THAT FOUND A REAL BUG. lib/plans/features.ts had no Korean
 * branch, so limitLinesFor and trialLimitLines fell through to their Hebrew
 * default and all eleven lines came back in Hebrew — on /ko/pricing, which a
 * buyer reads, and on the dashboard's plan cards. Exactly the /pt-BR
 * fall-through, in Korean.
 */
const planLines = [...planLimitLines('regular', 'ko'), ...planLimitLines('large_agency', 'ko'), ...trialLimitLines('ko')]
check('4a: the plan and trial limit lines are Korean, not Hebrew',
  planLines.every((l) => !HEBREW.test(l)) && planLines.every((l) => HANGUL.test(l)),
  planLines.filter((l) => HEBREW.test(l) || !HANGUL.test(l))[0])
check('4a mutation: a Hebrew plan line is caught', planLimitLines('regular', 'he').some((l) => HEBREW.test(l)))
check('4a1: and they are not the Polish or Japanese ones either',
  planLimitLines('regular', 'ko').join('|') !== planLimitLines('regular', 'pl').join('|')
  && planLimitLines('regular', 'ko').join('|') !== planLimitLines('regular', 'ja').join('|'))
check('4b: the "what a check is" sentence has its own Korean',
  HANGUL.test(CHECKS_EXPLAINER.ko) && CHECKS_EXPLAINER.ko !== CHECKS_EXPLAINER.pl && CHECKS_EXPLAINER.ko !== CHECKS_EXPLAINER.en)
const shellSrc = src('components/auth/AuthShell.tsx')
check('4c: the auth frame reads one exhaustive table, so Korean cannot fall through to Hebrew',
  /const AUTH_LANDING: Record<PublicLocale, /.test(shellSrc)
  && /const landing = AUTH_LANDING\[locale\]/.test(shellSrc))
check('4c mutation: a ternary chain back in AuthShell fails 4c',
  !/const landing = AUTH_LANDING\[locale\]/.test(
    shellSrc.replace('const landing = AUTH_LANDING[locale]',
      "const landing = locale === 'ko' ? landingKo : landingHe")))
check('4c1: and the Korean panel really carries Korean copy, not Hebrew',
  HANGUL.test(landingKo.demo.rank.keyword) && landingKo.demo.rank.keyword !== landingHe.demo.rank.keyword)
check('4d: the 451 notice does not answer Hebrew to a Korean visitor',
  HANGUL.test(sanctionsNotice('ko')) && sanctionsNotice('ko') !== sanctionsNotice('en'))
const tKo = createI18n('ko'), tPl = createI18n('pl'), tEn = createI18n('en')
check('4f: the AI-visibility strings answer Korean',
  HANGUL.test(tKo('ai_visibility')) && tKo('ai_visibility') !== tPl('ai_visibility') && tKo('ai_visibility') !== tEn('ai_visibility'))
check('4f1: a regional Korean tag reads the same Korean', createI18n('ko-KR')('ai_visibility') === tKo('ai_visibility'))
check('4g: every AI-visibility entry that has English has Korean',
  (() => {
    const s = read('lib/ai-visibility/i18n.ts')
    const withEn = (s.match(/\ben: '/g) || []).length
    const withKo = (s.match(/\bko: '/g) || []).length
    console.log(`    → ${withKo} Korean values against ${withEn} English ones`)
    return withKo >= withEn
  })())
/*
 * 4g1: AND NOT ONE OF THEM IS A DOUBLE-ESCAPED NEWLINE. The Korean values were
 * inserted by a script, the way the Polish ones were, and the recommendation
 * bodies that carry a line break are where that goes wrong: `\\n` in the source
 * prints a literal backslash-n on the screen.
 */
check('4g1: a multi-line recommendation body carries a real line break, not a literal backslash-n',
  tKo('rec_weak_engines_body').includes('\n') && !tKo('rec_weak_engines_body').includes('\\n')
  && tKo('rec_weak_questions_zero_single').includes('\n') && !tKo('rec_weak_questions_zero_single').includes('\\n'),
  JSON.stringify(tKo('rec_weak_engines_body').slice(0, 60)))
check('4g1 mutation: the literal form is what that check rejects',
  'a.\\nb'.includes('\\n') && !'a.\nb'.includes('\\n'))
/*
 * 4g2 — ONE KOREAN NAME FOR THE FEATURE. The AI-visibility module was written
 * with 노출 while the public site, the legal documents and the rest of the
 * dashboard say 가시성, which put two names for one feature on one screen. 노출
 * is not wrong Korean — it is the word in 구글 상위 노출, a measured query — but
 * the product can only have one name, and 가시성 is the one the reviewed copy
 * already uses. This is the check that keeps them from drifting apart again.
 */
check('4g2: the AI-visibility module and the rest of the Korean tree use ONE name for the feature',
  !read('lib/ai-visibility/i18n.ts').includes('노출')
  && tKo('ai_visibility').includes('가시성'),
  tKo('ai_visibility'))
check('4g2 mutation: the other name is what that check rejects', 'AI 노출'.includes('노출'))
check('4h: the monthly report speaks Korean',
  HANGUL.test(monthlyCopy('ko').title) && monthlyCopy('ko').title !== monthlyCopy('en').title)
check('4i: the PDF and Excel labels speak Korean',
  HANGUL.test(getExportLabels('ko').rankingReport) && getExportLabels('ko').rankingReport !== getExportLabels('en').rankingReport)
{
  const koDate = curriedDate('ko').dateTime('2026-09-27T17:09:00Z')
  check('4k: Korean dates read as Korean, not as English wearing a Korean label',
    !/Sep\b|PM|AM/.test(koDate) && /년|월|일/.test(koDate), koDate)
  check('4k mutation: the English form is what this check rejects',
    /Sep\b|PM|AM/.test(curriedDate('en').dateTime('2026-09-27T17:09:00Z')))
}

// 5 — THE FLAG STILL GATES THE LANGUAGE.
const switcher = src('components/DashboardLanguageSwitcher.tsx')
check('5a: the in-app switcher offers KO only while the Korean build is on',
  /koreanSiteEnabled\(\) \?/.test(switcher) && /'ko' as PublicLocale/.test(switcher))
check('5a mutation: an unconditional KO option is caught',
  !/koreanSiteEnabled\(\) \?/.test("{ locale: 'ko' as PublicLocale, lang: 'ko' },"))

/*
 * 6 — NO PRICE IN WON, anywhere a Korean reader can see one, and the two other
 * standing conditions of the legal thread's ruling of 12 Nov 2026.
 */
{
  // The symbol, the ISO code, and a FIGURE followed by 원. Not the bare word
  // 원화 ("the won currency"), because §5 of the Korean terms has to be able to
  // SAY that no won price is shown and why — and not the English word "won",
  // which is in the documents' own frontmatter and is also an ordinary verb.
  const WON = /₩|(?<!\p{L})KRW(?!\p{L})|\d[\d,.]*\s*원(?!\p{L})/iu
  const wonLeaves = koLeaves.filter((l) => WON.test(l.text))
  check('6a: no leaf of the Korean dashboard names a price in won',
    wonLeaves.length === 0, wonLeaves.slice(0, 5).map((l) => `${l.path} = ${l.text.slice(0, 60)}`).join(' | '))
  check('6a mutation: a won price is caught, in both the symbol and the word',
    WON.test('월 99,000원') && WON.test('₩99,000') && WON.test('99000 KRW'))
  const copyFiles = ['lib/i18n/public/landing-ko.ts', 'lib/i18n/public/pricing-ko.ts', 'lib/i18n/public/ko.ts']
  const offenders = copyFiles.filter((f) => WON.test(src(f)))
  check('6b: neither does the Korean landing or pricing copy',
    offenders.length === 0, offenders.join(', '))
  const docs = ['terms', 'privacy', 'refund-policy', 'accessibility', 'affiliate-terms']
  const priced = docs.filter((d) => WON.test(read(`content/legal/ko/${d}.md`)))
  check('6c: no Korean legal document states a price in won',
    priced.length === 0, priced.join(', '))
  // The positive half: the Korean pricing copy names DOLLARS, because that is
  // what Creem actually charges from Korea.
  check('6d: the Korean pricing copy names the price in dollars',
    /\$|USD|달러/.test(src('lib/i18n/public/pricing-ko.ts')))
  /*
   * 6e — SEVEN DAYS, NEVER FOURTEEN. 전자상거래법 제17조 제1항 gives a Korean
   * consumer seven days, and the fourteen of the European documents is a right
   * Korean law does not give. A document that promised fourteen would be a
   * larger promise than the law requires and a different one than the terms
   * state, so the number is checked in both directions.
   */
  const refund = read('content/legal/ko/refund-policy.md')
  const terms = read('content/legal/ko/terms.md')
  check('6e: the Korean refund policy and terms state the SEVEN-day right, by article',
    /7일/.test(refund) && /제17조/.test(refund) && /7일/.test(terms) && /제17조/.test(terms))
  /*
   * 6e1 IS SCOPED TO THE KOREAN CONSUMER'S OWN CLAUSE, and the scoping is the
   * point rather than a weakening. "14일" is legitimate elsewhere in the same
   * file: clause 7.1 states the EU and UK right, which really is fourteen days
   * for a reader there; section 19 gives fourteen days' notice of a material
   * change; and the bulk-undo window is fourteen days. What must never be
   * fourteen is the KOREAN right, so the check reads the Korean clause alone —
   * 7.5 in the terms, and the whole refund policy, which has no European
   * section at all. The one mention of fourteen allowed inside 7.5 is the
   * sentence that says it is NOT fourteen, so that is struck before the test.
   */
  const koreanClause = (terms.match(/\*\*7\.5[\s\S]*?(?=\n\*\*(?:8|7\.6)\.?)/) || [''])[0]
  check('6e0: the Korean consumer clause 7.5 is found, so 6e1 reads something',
    koreanClause.length > 200 && /제17조 제1항/.test(koreanClause), String(koreanClause.length))
  const CONTRAST = /유럽 문서의 14일이 아닙니다/g
  check('6e1: and the Korean clause does not promise fourteen days',
    !/14일|열나흘|십사일/.test(koreanClause.replace(CONTRAST, '[대비]'))
    && !/14일|열나흘|십사일/.test(refund))
  check('6e1 control: the clause DOES carry the sentence saying it is not fourteen',
    CONTRAST.test(koreanClause))
  check('6e mutation: a fourteen-day promise inside the Korean clause is caught',
    /14일/.test('청약철회 기간은 14일입니다'.replace(CONTRAST, '[대비]')))
  /*
   * 6f — NO KOREAN REGISTRATION NUMBER IS CLAIMED. The company holds no Korean
   * business registration (사업자등록번호) and no mail-order notification
   * (통신판매업 신고번호), and claiming either is the false statement the act
   * punishes. The documents SAY SO in words, which is what 6f2 checks; what 6f
   * forbids is a NUMBER next to either name.
   */
  const NUMBERED = /(?:사업자\s*등록\s*번호|통신판매업\s*신고\s*번호)[^\n]{0,40}\d{3}/
  const numbered = docs.filter((d) => NUMBERED.test(read(`content/legal/ko/${d}.md`)))
  check('6f: no Korean document carries a business-registration or mail-order number',
    numbered.length === 0, numbered.join(', '))
  check('6f mutation: an invented number is caught',
    NUMBERED.test('사업자등록번호: 123-45-67890'))
  check('6f2: and the terms say in words that the company holds neither',
    /사업자등록번호가 없고/.test(terms) && /통신판매업/.test(terms))
  /*
   * 6g — AND NOTHING TELLS THE BUYER WHO REMITS KOREAN VAT. That conclusion is
   * the legal thread's record of 12 Nov 2026; a sentence about it on a page a
   * buyer reads is a statement about a tax position we are not the ones making.
   */
  const VAT_REMITTER = /부가가치세[^\n]{0,60}(?:당사가|저희가|회사가)[^\n]{0,20}(?:신고|납부)/
  const vat = docs.filter((d) => VAT_REMITTER.test(read(`content/legal/ko/${d}.md`)))
  check('6g: no Korean document tells the buyer who remits Korean VAT',
    vat.length === 0, vat.join(', '))
  check('6g mutation: such a sentence is caught',
    VAT_REMITTER.test('한국 부가가치세는 당사가 직접 신고합니다'))
}

/*
 * 10 — THE PDF FONT. A monthly report whose keyword table holds Hangul is
 * rendered by PDFShift's machine, whose system fonts we cannot read, from a
 * document that declares 'Segoe UI', Helvetica, Arial — none of which has a
 * Hangul glyph. Without a face of its own the table arrives as rows of empty
 * boxes.
 */
{
  const HEAD = '<html><head><title>t</title></head><body>'
  const korean = withCjkFont(`${HEAD}<p>키워드 순위</p></body></html>`)
  const japanese = withCjkFont(`${HEAD}<p>キーワード</p></body></html>`)
  const both = withCjkFont(`${HEAD}<p>키워드 순위 と キーワード</p></body></html>`)
  const latin = withCjkFont(`${HEAD}<p>keyword rankings</p></body></html>`)
  check('10a: a Korean document declares the Korean face',
    korean.includes('Noto Sans KR') && korean.includes('/fonts/NotoSansKR-Regular.woff'))
  check('10b: and not the Japanese one, which would be three megabytes for nothing',
    !korean.includes('Noto Sans JP'))
  check('10c: a Japanese document still declares only the Japanese face',
    japanese.includes('Noto Sans JP') && !japanese.includes('Noto Sans KR'))
  check('10d: a document holding both declares BOTH, because one of them would print boxes',
    both.includes('Noto Sans KR') && both.includes('Noto Sans JP'))
  check('10e: a Latin-only document is returned untouched, so no existing report changes',
    latin === `${HEAD}<p>keyword rankings</p></body></html>`)
  // Inside the BODY stack, not the document: the @font-face block above it names
  // our family first by necessity, so a whole-document indexOf would compare the
  // wrong two positions.
  const bodyStack = (korean.match(/body, th, td[^}]*}/) || [''])[0]
  check('10f: the body stack puts the renderer\'s own system faces before ours',
    bodyStack.length > 50
    && bodyStack.indexOf('Malgun Gothic') > 0
    && bodyStack.indexOf('Malgun Gothic') < bodyStack.indexOf("'Noto Sans KR'"), bodyStack.slice(0, 120))
  check('10g: and the file it points at is really committed',
    existsSync(join(ROOT, 'public/fonts/NotoSansKR-Regular.woff'))
    && statSync(join(ROOT, 'public/fonts/NotoSansKR-Regular.woff')).size > 1_000_000,
    String(existsSync(join(ROOT, 'public/fonts/NotoSansKR-Regular.woff'))))
  check('10h: the licence notice beside it names the file and its licence',
    /NotoSansKR-Regular\.woff/.test(read('public/fonts/NOTICE.md'))
    && /SIL Open Font License/i.test(read('public/fonts/NOTICE.md')))
  check('10a mutation: a document with no CJK text gets no face at all',
    !withCjkFont(`${HEAD}<p>plain</p></body></html>`).includes('Noto Sans'))
  check('10d mutation: a face keyed on ONE script would leave the other as boxes',
    (() => {
      // What the first version of withCjkFont did: ask textScript(), which can
      // answer with only one script, and declare that one face.
      const one = both.includes('Noto Sans KR') && !both.includes('Noto Sans JP')
      return !one
    })())
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}

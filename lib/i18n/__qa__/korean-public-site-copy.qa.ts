/**
 * THE KOREAN PUBLIC COPY: register, particles and one word per thing.
 *
 * WHY THIS FILE EXISTS. Every other locale has a `*-public-site.qa.ts` that
 * reads its public copy; Korean, merged as the eleventh locale, never got one.
 * The register guard it does have (group 9 of
 * lib/i18n/dashboard/__qa__/korean-dashboard.qa.ts) reads the DASHBOARD
 * dictionary only. So lib/i18n/public/pricing-ko.ts shipped ten 해요체
 * sentences, four of which were FAQ questions, and nothing failed. A model
 * reading the Korean back on 13 Nov 2026 found them; this file is what should
 * have found them.
 *
 * It is deliberately NOT the full mirror the other eight languages have
 * (sections A–E: the route twins, the gate, the flag, the switcher). That is
 * still missing for Korean and is worth its own pass. What is here is the copy
 * itself, which is the part that broke.
 *
 *   A) THE REGISTER is 합니다체, and the question endings count. The dashboard
 *      guard's pattern catches 해요/예요/어요/네요 at a sentence end, which is
 *      most of 해요체 but not the half a translator reaches for in an FAQ:
 *      -나요?, -까요?, -신가요? are every bit as familiar and were exactly what
 *      shipped. A bare noun stays allowed, because a Korean button is a noun.
 *   B) A PARTICLE MAY NOT FOLLOW AN INTERPOLATED VALUE. 을/를, 은/는, 이/가,
 *      으로/로, 과/와 all depend on whether the preceding syllable ends in a
 *      consonant, which the template cannot know. Writing "(으)로" to cover both
 *      is not a fix: the reader sees the parenthesis. The dashboard shipped
 *      `${currency}(으)로` with values that end in ")", so a Korean customer
 *      read "미국 달러($)(으)로".
 *   C) ONE WORD PER THING. AI visibility is 가시성 everywhere and never 노출 —
 *      a rule this project already wrote down after `lib/ai-visibility/i18n.ts`
 *      first shipped 노출 on the same screens, and which pricing-ko then broke
 *      again. Engines are counted 곳, never 종.
 *
 * Every guard has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/i18n/__qa__/korean-public-site-copy.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Comments are not shipped copy: a guard that read them would fail on its own prose. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** The files that hold Korean copy a signed-out or paying reader actually sees. */
const PUBLIC_KO = [
  'lib/i18n/public/ko.ts',
  'lib/i18n/public/pricing-ko.ts',
  'lib/i18n/public/landing-ko.ts',
]
const ALL_KO = [...PUBLIC_KO, 'lib/i18n/dashboard/ko/billing.ts']

/** Every single- or double-quoted and backticked string literal, with its line. */
function strings(rel: string): { line: number; text: string }[] {
  const src = strip(read(rel))
  const out: { line: number; text: string }[] = []
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/(['"`])((?:[^\\\n]|\\.)*?)\1/g)) {
      if (/[가-힣]/.test(m[2])) out.push({ line: i + 1, text: m[2] })
    }
  })
  return out
}
const koStrings = (files: string[]) => files.flatMap((f) => strings(f).map((s) => ({ ...s, file: f })))

console.log('A. the register is 합니다체, questions included')
{
  // The dashboard guard's half, kept identical on purpose so the two agree.
  const HAEYO = /(?:해요|예요|이에요|에요|어요|아요|네요)(?:[.!?)]|$)/
  // The half it is missing: 해요체 QUESTIONS. -나요/-까요/-ㄴ가요 are familiar-polite.
  const HAEYO_Q = /(?:나요|까요|신가요|은가요|는가요)\s*\?/
  const BANMAL = /(?:(?:이|하|되|있|없)야|거든|잖아|(?:했|갔|봤)어)(?:[.!?)]|$)/
  // 주세요 is the one imperative this project names outright: a request is
  // 주십시오 or 주시기 바랍니다 (gotop-korean-locale-build). 안녕하세요 is not a
  // request at all but the fixed greeting, and it opens the two WhatsApp
  // messages the visitor sends US, so it is excluded by name rather than by
  // loosening the pattern.
  const JUSEYO = /(?<!안녕하)세요/

  const all = koStrings(ALL_KO)
  const bad = (re: RegExp) => all.filter((s) => re.test(s.text))
  const show = (rows: { file: string; line: number; text: string }[]) =>
    rows.slice(0, 5).map((r) => `${r.file}:${r.line} "${r.text.slice(0, 40)}"`).join(' | ')

  check('A1: no Korean string drops into 해요체', bad(HAEYO).length === 0, show(bad(HAEYO)))
  check('A2: and none asks a question in 해요체', bad(HAEYO_Q).length === 0, show(bad(HAEYO_Q)))
  check('A3: and none into 반말', bad(BANMAL).length === 0, show(bad(BANMAL)))
  check('A4: a request is 주십시오 or 주시기 바랍니다, never 주세요', bad(JUSEYO).length === 0, show(bad(JUSEYO)))
  // MUTATION CONTROLS — each is a sentence that actually shipped until 13 Nov 2026.
  check('A1-MUT: a 해요체 sentence is caught and the 합니다체 one is not',
    HAEYO.test('사이트를 연결해요.') && !HAEYO.test('사이트를 연결합니다.'))
  check('A2-MUT: the four FAQ questions that shipped are caught, and their 합니다체 forms are not',
    ['어느 요금제가 맞을까요?', '무료 체험에는 무엇이 들어 있나요?', '확인은 자동으로 실행되나요?', '먼저 보고 싶으신가요?']
      .every((q) => HAEYO_Q.test(q))
    && !HAEYO_Q.test('어느 요금제가 맞습니까?') && !HAEYO_Q.test('무료 체험에는 무엇이 들어 있습니까?'))
  check('A4-MUT: the 주세요 that shipped is caught, and 주십시오 is not',
    JUSEYO.test('WhatsApp으로 연락해 주세요.') && !JUSEYO.test('WhatsApp으로 연락해 주시기 바랍니다.'))
  check('A4-MUT2: 안녕하세요 is not mistaken for a request, and 연락해 주세요 still is',
    !JUSEYO.test('안녕하세요. 상담하고 싶은 것이 있습니다') && JUSEYO.test('연락해 주세요'))
  check('A5 control: a bare-noun button label passes every pattern',
    ['저장', '추가', '취소', '요금'].every((n) => !HAEYO.test(n) && !HAEYO_Q.test(n) && !BANMAL.test(n) && !JUSEYO.test(n)))
}

console.log('\nB. no particle follows an interpolated value')
{
  // A particle whose form depends on the previous syllable's final consonant,
  // sitting immediately after a ${...}. "(으)로" and "을(를)" are included:
  // writing both halves is not a fix, it only shows the reader the parenthesis.
  const AFTER_VALUE = /\$\{[^}]*\}\s*(?:\((?:으|를|은|이|과)\)|[을를은는이가와과]|으로|\(으\)로)/
  const offenders = ALL_KO.flatMap((f) =>
    strip(read(f)).split('\n')
      .map((line, i) => ({ file: f, line: i + 1, line_text: line }))
      .filter((r) => /[가-힣]/.test(r.line_text) && AFTER_VALUE.test(r.line_text)))
  check('B1: no Korean template attaches a consonant-sensitive particle to an interpolated value',
    offenders.length === 0,
    offenders.slice(0, 5).map((r) => `${r.file}:${r.line}`).join(' | '))
  // MUTATION CONTROL — the template that shipped, and the fix beside it.
  check('B1-MUT: the ${currency}(으)로 that shipped is caught, and the particle-free form is not',
    AFTER_VALUE.test('`이 계정은 ${currency}(으)로 결제됩니다.`')
    && AFTER_VALUE.test('`${keyword}을 추가합니다`')
    && !AFTER_VALUE.test('`이 계정은 ${currency} 기준으로 결제됩니다.`')
    && !AFTER_VALUE.test('`${count}개를 확인했습니다`'))
  check('B2 control: a particle that does not depend on the final consonant is allowed after a value',
    !AFTER_VALUE.test('`${days}일 후에 종료됩니다`') && !AFTER_VALUE.test('`${site}에서 발행합니다`'))
}

console.log('\nC. one word per thing')
{
  const all = koStrings(ALL_KO)
  // AI visibility is 가시성. 노출 is allowed ONLY about a place on Google Maps
  // or in search, never about an AI answer — that distinction is the whole
  // reason the rule exists, so the guard reads the neighbouring words.
  const aiNoChul = all.filter((s) => /(?:AI|답변|엔진)[^.]{0,8}노출|노출[^.]{0,8}(?:AI|답변|엔진)/.test(s.text))
  check('C1: AI visibility is 가시성, never 노출', aiNoChul.length === 0,
    aiNoChul.slice(0, 5).map((r) => `${r.file}:${r.line} "${r.text.slice(0, 40)}"`).join(' | '))
  const engines = all.filter((s) => /엔진\s*\d+\s*종/.test(s.text))
  check('C2: engines are counted 곳, not 종', engines.length === 0,
    engines.map((r) => `${r.file}:${r.line}`).join(' | '))
  // MUTATION CONTROLS — both strings shipped until 13 Nov 2026.
  check('C1-MUT: "AI 답변 노출" is caught, and Maps 노출 is not mistaken for it',
    /(?:AI|답변|엔진)[^.]{0,8}노출/.test('AI 답변 노출 확인')
    && !/(?:AI|답변|엔진)[^.]{0,8}노출|노출[^.]{0,8}(?:AI|답변|엔진)/.test('Google 지도에서의 노출'))
  check('C2-MUT: "AI 엔진 6종" is caught and "AI 엔진 6곳" is not',
    /엔진\s*\d+\s*종/.test('AI 엔진 6종') && !/엔진\s*\d+\s*종/.test('AI 엔진 6곳'))
  // The public site and the dashboard may legitimately differ in formality, but
  // not in what a thing is CALLED. These are the pairs that had drifted.
  const everywhere = all.map((s) => s.text).join(' ')
  check('C3: the free check is 진단, never 조사', !/조사 요약|첫 조사/.test(everywhere))
  check('C3-MUT: "첫 조사 요약" is caught and "첫 진단 요약" is not',
    /조사 요약|첫 조사/.test('첫 조사 요약') && !/조사 요약|첫 조사/.test('첫 진단 요약'))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}

/**
 * ONE AI-visibility score (lib/ai-visibility/score.ts), and every screen that
 * shows it computing it there.
 *
 * The owner saw four numbers for one question: the AI tab counted every answer
 * ever received, the dashboard only the newest single check, the engine cards
 * every answer per engine, the competitor comparison the latest per question
 * and engine with its own mention rule. Now:
 *   - the score is the latest successful, non-archived answer per question x
 *     engine, on the engines the tool checks; a re-check replaces its answer;
 *   - the denominator is the pairs actually checked (an engine nobody ran is
 *     not a zero);
 *   - the tab, its overview, its engine cards, the dashboard and the competitor
 *     comparison all read it from that module (source guards).
 *
 * Every rule and every guard has a mutation control.
 *
 * Run: npx tsx lib/ai-visibility/__qa__/score.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import * as S from '../score'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

let mutants = 0
function mutant<T>(file: string, from: string | RegExp, to: string): T {
  const src = read(file)
  const out = src.replace(from, to)
  if (out === src) throw new Error(`mutation did not apply to ${file}: ${String(from)}`)
  const dir = file.slice(0, file.lastIndexOf('/'))
  const path = join(ROOT, dir, `.qa-mut-score-${++mutants}-${file.slice(file.lastIndexOf('/') + 1)}`)
  writeFileSync(path, out)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path) as T
  } finally {
    unlinkSync(path)
  }
}

type A = S.ScoredAnswer
const a = (promptId: string, engine: string, at: string, mentioned: boolean, over: Partial<A> = {}): A =>
  ({ promptId, engine, at, status: 'success', excluded: false, mentioned, cited: false, ...over })

// One question, the owner's case: checked on ChatGPT twice (no, then yes), on
// Gemini once (no); an archived answer, a failed one and a retired engine's.
const CASE: A[] = [
  a('q1', 'chatgpt', '2026-09-01T10:00:00Z', false),
  a('q1', 'chatgpt', '2026-09-20T10:00:00Z', true, { cited: true }),
  a('q1', 'gemini', '2026-09-10T10:00:00Z', false),
  a('q1', 'perplexity', '2026-09-21T10:00:00Z', true, { excluded: true }),
  a('q1', 'grok', '2026-09-22T10:00:00Z', true, { status: 'error' }),
  a('q1', 'google_ai_overview', '2026-09-23T10:00:00Z', true),
]

function rules(M: typeof S, tag = '') {
  const v = M.visibilityScore(CASE)
  const ok1 = v.answers === 2 && v.mentions === 1 && v.citations === 1 && v.score === 50
  const perEngine = M.engineScores(CASE)
  const ok2 = perEngine.get('chatgpt')?.answers === 1 && perEngine.get('chatgpt')?.rate === 100 && perEngine.get('gemini')?.rate === 0
  const ok3 = !perEngine.has('perplexity') && !perEngine.has('grok') && !perEngine.has('google_ai_overview')
  const twoQuestions = M.visibilityScore([...CASE, a('q2', 'chatgpt', '2026-09-05T10:00:00Z', false)])
  const ok4 = twoQuestions.answers === 3 && twoQuestions.score === 33
  return { ok1, ok2, ok3, ok4, v, perEngine: [...perEngine.entries()], twoQuestions, tag }
}

async function main() {
  console.log('The shared AI-visibility score')

  console.log('\nA) the definition')
  {
    const r = rules(S)
    check('A1: one question, re-checked on ChatGPT (no → yes) and checked on Gemini (no): 1 of 2 = 50, the re-check replaces its answer', r.ok1, show(r.v))
    check('A2: per engine the same count: ChatGPT 1 answer at 100%, Gemini 0%', r.ok2, show(r.perEngine))
    check('A3: an archived answer, a failed check and a retired engine count nowhere; an unchecked engine has no entry (not a zero)', r.ok3, show(r.perEngine))
    check('A4: another question on the same engine is its own answer (1 of 3 = 33)', r.ok4, show(r.twoQuestions))
    const none = S.visibilityScore([])
    check('A5: before the first answer the score is null, never 0', none.score === null && none.answers === 0)
    const legacy = S.visibilityScore([a('', 'chatgpt', '2026-09-01T00:00:00Z', true, { id: 'x1', promptId: null }), a('', 'chatgpt', '2026-09-02T00:00:00Z', false, { id: 'x2', promptId: null })])
    check('A6: answers without a question id (older rows) each count once, never merged', legacy.answers === 2 && legacy.score === 50, show(legacy))
    const tie = S.latestAnswers([a('q', 'chatgpt', '2026-09-01T00:00:00Z', true, { id: 'first' }), a('q', 'chatgpt', '2026-09-01T00:00:00Z', false, { id: 'second' })])
    check('A7: of two answers at the same time, the one listed first wins (stable)', tie.length === 1 && tie[0].id === 'first')
    check('A8: the engines counted are the six the tool checks', S.SCORED_ENGINES.join(',') === 'chatgpt,perplexity,gemini,copilot,grok,google_ai_mode')
  }

  console.log('\nB) mutation controls: each rule, broken, fails its check')
  {
    const every = rules(mutant<typeof S>('lib/ai-visibility/score.ts', 'if (seen.has(key)) continue', ''), 'every answer')
    check('B1: MUT counting every answer (no latest-per-pair) breaks A1', !every.ok1, show(every.v))
    const oldest = rules(mutant<typeof S>('lib/ai-visibility/score.ts', 'time(y.a.at) - time(x.a.at)', 'time(x.a.at) - time(y.a.at)'), 'oldest wins')
    check('B2: MUT keeping the oldest answer instead of the newest breaks A1', !oldest.ok1, show(oldest.v))
    const archived = rules(mutant<typeof S>('lib/ai-visibility/score.ts', " && a.excluded !== true", ''), 'archived counts')
    check('B3: MUT counting archived answers breaks A3', !archived.ok3, show(archived.perEngine))
    const anyEngine = rules(mutant<typeof S>('lib/ai-visibility/score.ts', ' && isScoredEngine(a.engine)', ' && !!a.engine'), 'any engine')
    check('B4: MUT counting a retired engine breaks A3', !anyEngine.ok3, show(anyEngine.perEngine))
    const perEngineKey = rules(mutant<typeof S>('lib/ai-visibility/score.ts', /const key = `\$\{a\.promptId \|\| `answer:\$\{a\.id \?\? out\.length\}`\}\\u0000\$\{a\.engine\}`/, 'const key = a.engine'), 'per engine only')
    check('B5: MUT keying by engine only (questions merged) breaks A4', !perEngineKey.ok4, show(perEngineKey.twoQuestions))
  }

  console.log('\nC) every screen that shows the score reads it from score.ts')
  const users: { file: string; must: RegExp; what: string }[] = [
    { file: 'components/ai-visibility/overview-model.ts', must: /visibilityScore\(answersOf\(/, what: 'the AI tab overview (score, change, trend)' },
    { file: 'components/ai-visibility/AIVisibilitySection.tsx', must: /const total = visibilityScore\(scored\)[\s\S]*engineScores\(scored\)/, what: 'the AI tab score card and engine cards' },
    { file: 'lib/dashboard/overview.ts', must: /const now = latestAnswers\(answers\)[\s\S]*visibilityScore\(now\)/, what: 'the dashboard AI widget' },
    { file: 'app/api/projects/[id]/ai-visibility/competitor-analysis/route.ts', must: /latestAnswers\(allResults\.map\(/, what: 'the competitor comparison' },
  ]
  for (const u of users) {
    const src = strip(read(u.file))
    check(`C: ${u.what} (${u.file}) uses the shared score`, u.must.test(src))
  }
  {
    const section = strip(read('components/ai-visibility/AIVisibilitySection.tsx'))
    check('C5: the AI tab no longer counts every answer itself (no "successfulScans" tally)', !/successfulScans/.test(section))
    const route = strip(read('app/api/projects/[id]/ai-visibility/competitor-analysis/route.ts'))
    check('C6: the comparison counts the business\'s mentions by the AI tab\'s rule (computeDisplayMatches), not its own detector',
      /computeDisplayMatches\(/.test(route) && !/detectBrandNameMention\(responseText, projectName/.test(route))
    // Guard mutation controls: the guards above fail on the old code.
    const oldSection = section.replace('const total = visibilityScore(scored)', 'const successfulScans = scoreResults.length')
    check('C7: MUT the tab tallying answers itself fails both its C guard and C5', !users[1].must.test(oldSection) && /successfulScans/.test(oldSection))
    const oldDash = strip(read('lib/dashboard/overview.ts')).replace('const now = latestAnswers(answers)', 'const now = answers')
    check('C8: MUT the dashboard scoring every answer fails its C guard', !users[2].must.test(oldDash))
    const oldRoute = route.replace('latestAnswers(allResults.map(', 'dedupe(allResults.map(')
    check('C9: MUT the comparison with its own dedupe fails its C guard', !users[3].must.test(oldRoute))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}

/**
 * THE FUNNEL LOG — counts and reason codes, never merchant text.
 *
 * WHY: a production run that returned 3 topics out of a 26-brief pool left no record
 * of which gate removed the rest. The engine counted every rejection with a typed
 * reason, but that ledger only ever travelled inside the HTTP response and was then
 * dropped; the diagnostics dry-run that would answer it is refused in production.
 *
 * WHAT IS GUARDED: the one line we now write per run carries counts and OUR OWN
 * reason codes, and nothing else. A runtime log is not a place for a customer's
 * titles, keywords or domains, and a count map built from engine output must not be
 * able to smuggle one in.
 *
 * Run: npx tsx lib/content/recommendations/__qa__/funnel-log.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildRecoFunnelLog, logRecoFunnel, reasonCounts, type FunnelLogInput } from '../funnel-log'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** A realistic run: the be-cln shape — a big pool, a handful of accepted topics. */
const RUN: FunnelLogInput = {
  projectId: 'proj-1',
  runId: 'run-1',
  path: 'evidence_first_briefs',
  model: 'gemini-2.5-pro',
  target: 12,
  rawBriefCandidates: 49,
  briefPool: 26,
  briefPoolRejected: { brief_semantic_duplicate: 23 },
  generated: 9,
  engineAccepted: 4,
  engineRejected: { title_keyword_misaligned: 4, unknown_latin_token: 1 },
  routeRejected: { title_exists: 1, intra_run_removed: 0 },
  blogRejected: { pending_semantic_duplicate: 0 },
  fresh: 3,
  persisted: 3,
  stopReason: 'target_reached',
}

/** Everything in the payload that could carry text, flattened. */
function textValues(o: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string') out.push(v)
    else if (v && typeof v === 'object') out.push(...Object.keys(v as object), ...textValues(v as Record<string, unknown>))
    void k
  }
  return out
}

function main(): void {
  console.log('\nA) a real run is recorded in full')
  const log = buildRecoFunnelLog(RUN)
  check('A1: every stage of the funnel is present',
    log.rawBriefCandidates === 49 && log.briefPool === 26 && log.generated === 9
      && log.engineAccepted === 4 && log.fresh === 3 && log.persisted === 3 && log.target === 12)
  check('A2: each stage keeps its own reason codes',
    log.briefPoolRejected.brief_semantic_duplicate === 23
      && log.engineRejected.title_keyword_misaligned === 4
      && log.routeRejected.title_exists === 1)
  check('A3: a zero count is left out rather than written as noise',
    !('intra_run_removed' in log.routeRejected) && Object.keys(log.blogRejected).length === 0)
  check('A4: the stop reason and the model id survive',
    log.stopReason === 'target_reached' && log.model === 'gemini-2.5-pro')

  console.log('\nB) merchant text cannot reach the log')
  const dirty = buildRecoFunnelLog({
    ...RUN,
    engineRejected: {
      title_keyword_misaligned: 2,
      'ניקיון משרדים בתל אביב': 5,
      'How to clean an office': 1,
      'be-cln.co.il': 3,
      'Title: office cleaning': 1,
      'keyword exists': 2,
    },
    stopReason: 'ניקיון משרדים',
  })
  check('B1: the real reason code is kept', dirty.engineRejected.title_keyword_misaligned === 2)
  check('B2: a Hebrew key is dropped', !Object.keys(dirty.engineRejected).some((k) => /[֐-׿]/.test(k)))
  check('B3: an English sentence, a domain and a spaced phrase are all dropped',
    Object.keys(dirty.engineRejected).length === 1, Object.keys(dirty.engineRejected).join('|'))
  check('B4: a stop reason that is not a code becomes null', dirty.stopReason === null)
  check('B5: nothing text-bearing in the whole payload looks like prose',
    textValues(dirty as unknown as Record<string, unknown>).every((v) => /^[a-z][a-z0-9_.-]*$/i.test(v)),
    textValues(dirty as unknown as Record<string, unknown>).join('|'))

  console.log('\nC) counts are counts')
  const odd = buildRecoFunnelLog({
    ...RUN,
    generated: -5,
    fresh: 2.7,
    persisted: Number.NaN,
    target: Number.POSITIVE_INFINITY,
    engineRejected: { a_reason: -3, b_reason: 2.9, c_reason: 'many' as unknown as number },
    routeRejected: 'not an object' as unknown,
    blogRejected: null,
  })
  check('C1: a negative count becomes 0', odd.generated === 0)
  check('C2: a fraction is truncated', odd.fresh === 2 && odd.engineRejected.b_reason === 2)
  check('C3: NaN and Infinity become 0', odd.persisted === 0 && odd.target === 0)
  check('C4: a negative or non-numeric reason count is dropped',
    !('a_reason' in odd.engineRejected) && !('c_reason' in odd.engineRejected))
  check('C5: a map that is not an object becomes empty',
    Object.keys(odd.routeRejected).length === 0 && Object.keys(odd.blogRejected).length === 0)
  check('C6: an array is not a count map', Object.keys(reasonCounts([1, 2, 3])).length === 0)

  console.log('\nD) the line never breaks a run')
  let threw = false
  try {
    const circular: Record<string, unknown> = { a_reason: 1 }
    circular.self = circular
    logRecoFunnel({ ...RUN, engineRejected: circular, projectId: 'proj-1' })
    logRecoFunnel(undefined as unknown as FunnelLogInput)
  } catch { threw = true }
  check('D1: logging a hostile input throws nothing', !threw)

  console.log('\nE) the route actually writes it, and writes nothing else')
  const route = readFileSync(join(__dirname, '../../../../app/api/content/automation/recommendations/route.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  check('E1: the route calls logRecoFunnel', /logRecoFunnel\(\{/.test(route))
  const call = route.slice(route.indexOf('logRecoFunnel({'), route.indexOf('logRecoFunnel({') + 1400)
  const body = call.slice(0, call.indexOf('})') + 2)
  check('E2: the call passes the engine ledger, not suggestion text',
    /engineRejected:/.test(body) && /briefPoolRejected:/.test(body)
      && !/\.title/.test(body) && !/primaryKeyword/.test(body) && !/suggestions\[/.test(body),
    body.slice(0, 200))
  check('E3: it is emitted on the real path, not only under the diagnostics flag',
    !/diagnostics \?[\s\S]{0,40}logRecoFunnel/.test(route))

  console.log('\nMUTATION CONTROLS')
  // The defect: a count map written straight to the log.
  const unfiltered = (m: Record<string, number>) => m
  check('CONTROL 1: without the reason-code filter the Hebrew key survives (so B2 would fail)',
    Object.keys(unfiltered({ 'ניקיון משרדים': 5 })).some((k) => /[֐-׿]/.test(k)))
  // A filter that only rejected non-ASCII would still pass English prose.
  const asciiOnly = (k: string) => /^[\x20-\x7E]+$/.test(k)
  check('CONTROL 2: an ASCII-only filter would admit an English title (so B3 would fail)',
    asciiOnly('How to clean an office') && !('How to clean an office' in dirty.engineRejected))
  // A source guard that matched the bare name would pass a route that never calls it.
  check('CONTROL 3: the source guard needs the real call, not the identifier',
    !/logRecoFunnel\(\{/.test('import { logRecoFunnel } from "@/lib/content/recommendations/funnel-log"'))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}

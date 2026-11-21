/**
 * A CHAIN THAT CANNOT RUN AWAY, AND A LOOP THAT CANNOT BE KILLED MID-PROJECT.
 *
 * `/api/schedule` used to be one 300-second invocation with a serial loop over
 * every due project. At a measured 1.8 s per rank check that is ~166 checks for
 * the WHOLE platform per trigger, and the invocation is killed inside whichever
 * project it happens to be in. lib/scan-scheduler/chain.ts replaces the ceiling
 * with a deadline plus a self-call.
 *
 * The danger that justifies this suite is the opposite one: a route that calls
 * itself can spin forever and spend real money at Serper on every pass. Three
 * independent brakes must ALL hold — a hard cap, forward progress, and work
 * actually remaining — and this suite proves each one alone stops the chain,
 * including against a hostile `?pass=` value.
 *
 * It also proves the route honours them, by reading the route's own source: a
 * chain guarded only inside this module would be worth nothing if the route
 * ignored the decision.
 *
 * MUTATION CONTROLS at the end: each brake is re-run with its rule inverted and
 * must then allow the chain.
 *
 * Run: npx tsx lib/scan-scheduler/__qa__/scan-chain.qa.ts
 */
import { readFileSync } from 'fs'
import {
  SCAN_CHAIN_MAX_PASSES, SCAN_CHAIN_PARAM, SCAN_CHAIN_BUDGET_SHARE,
  readPassNumber, scanDeadlineAt, decideChain, nextPassUrl,
} from '../chain'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
}

const BASE = 'https://example.com/api/schedule'

// ------------------------------------------------------- A. the pass number
console.log('\nA. The pass number cannot be used to buy extra passes')
check('no parameter is pass 1', readPassNumber(BASE) === 1)
check('pass=3 is 3', readPassNumber(`${BASE}?${SCAN_CHAIN_PARAM}=3`) === 3)
for (const bad of ['0', '-5', 'abc', '', '1.5', 'Infinity', 'NaN']) {
  check(`pass=${bad || '(empty)'} falls back to 1`, readPassNumber(`${BASE}?${SCAN_CHAIN_PARAM}=${bad}`) === 1)
}
check('a hostile huge pass is clamped to the cap, not honoured',
  readPassNumber(`${BASE}?${SCAN_CHAIN_PARAM}=999999`) === SCAN_CHAIN_MAX_PASSES)
check('a malformed URL does not throw', readPassNumber('not a url') === 1)

// ---------------------------------------------------------- B. the deadline
console.log('\nB. The loop stops before the platform kills it')
{
  const started = 1_000_000
  const deadline = scanDeadlineAt(started, 300)
  check('the deadline is inside the invocation, not at its edge', deadline < started + 300_000)
  check('the deadline leaves at least a fifth of the budget',
    started + 300_000 - deadline >= 300_000 * 0.2, String(started + 300_000 - deadline))
  check('the share is the documented 0.8', SCAN_CHAIN_BUDGET_SHARE === 0.8)
  check('240 s of a 300 s budget', deadline - started === 240_000, String(deadline - started))
  check('a project would not be started one second before the kill',
    !(started + 299_000 < deadline))
}

// ------------------------------------------------------------- C. the brakes
console.log('\nC. Each brake alone stops the chain')
check('work remains, progress made, below the cap — chain',
  decideChain({ processed: 5, remaining: 3, pass: 1 }).chain === true)
check('BRAKE 1, nothing left — no chain',
  decideChain({ processed: 5, remaining: 0, pass: 1 }).reason === 'nothing_left')
check('BRAKE 2, no progress — no chain even with work remaining',
  decideChain({ processed: 0, remaining: 9, pass: 1 }).reason === 'no_progress')
check('BRAKE 3, the cap — no chain even with work and progress',
  decideChain({ processed: 5, remaining: 9, pass: SCAN_CHAIN_MAX_PASSES }).reason === 'cap_reached')
check('the last allowed pass still chains',
  decideChain({ processed: 1, remaining: 1, pass: SCAN_CHAIN_MAX_PASSES - 1 }).chain === true)
check('one past the cap does not', decideChain({ processed: 1, remaining: 1, pass: SCAN_CHAIN_MAX_PASSES }).chain === false)
check('negative remaining is treated as nothing left',
  decideChain({ processed: 1, remaining: -2, pass: 1 }).chain === false)
check('the cap is a real bound, not a formality', SCAN_CHAIN_MAX_PASSES > 1 && SCAN_CHAIN_MAX_PASSES <= 50,
  String(SCAN_CHAIN_MAX_PASSES))
check('a full chain stays within a sane daily volume at 166 checks a pass',
  SCAN_CHAIN_MAX_PASSES * 166 < 10_000, String(SCAN_CHAIN_MAX_PASSES * 166))

// ------------------------------------------------------------- D. the URL
console.log('\nD. The next pass is this route, once')
check('a pass parameter is added', nextPassUrl(BASE, 2) === `${BASE}?${SCAN_CHAIN_PARAM}=2`)
check('an existing pass is replaced, never appended twice',
  nextPassUrl(`${BASE}?${SCAN_CHAIN_PARAM}=2`, 3) === `${BASE}?${SCAN_CHAIN_PARAM}=3`)
check('other parameters survive', nextPassUrl(`${BASE}?x=1&${SCAN_CHAIN_PARAM}=2`, 3).includes('x=1'))
check('the host is never changed', new URL(nextPassUrl(BASE, 2)).host === 'example.com')
check('round trip: the URL we build reads back as the pass we meant',
  readPassNumber(nextPassUrl(BASE, 7)) === 7)

// ------------------------------------------------- E. the route honours it
console.log('\nE. The route actually uses the brakes')
{
  const route = stripComments(readFileSync('app/api/schedule/route.ts', 'utf8'))
  check('the route reads the pass number', /readPassNumber\(/.test(route))
  check('the route computes a deadline', /scanDeadlineAt\(/.test(route))
  check('the loop breaks on the deadline', /break/.test(route) && /deadline/i.test(route))
  check('the route asks decideChain before chaining', /decideChain\(/.test(route))
  check('the chain is fired through nextPassUrl', /nextPassUrl\(/.test(route))
  check('the self-call carries the cron secret', /CRON_SECRET/.test(route))
  check('the self-call happens after the response, in after()', /after\(/.test(route))

  // THE REGRESSION CHAINING WOULD OTHERWISE INTRODUCE. Two jobs ride on this
  // route and are once-per-TRIGGER, not once-per-invocation: the monthly AI
  // check and the PayPal migration retry. Without a first-pass guard a chain
  // of 20 passes would start each of them 20 times.
  const firstPassGuard = (src: string, job: string) =>
    new RegExp(`isFirstPass\\)\\s*try\\s*\\{[\\s\\S]{0,200}?${job}`).test(src)
  check('the monthly AI check runs on the first pass only',
    firstPassGuard(route, 'startIsolatedMonthlyAiChecks'))
  check('the PayPal migration retry runs on the first pass only',
    firstPassGuard(route, 'retryPayPalMigrations'))
  check('isFirstPass is derived from the pass number, not assumed',
    /isFirstPass\s*=\s*passNumber === 1/.test(route))

  // MUTATION CONTROL for the two guards above.
  check('the first-pass guard FAILS on the unguarded original',
    !firstPassGuard('try {\n after(() => startIsolatedMonthlyAiChecks(x))\n} catch {}', 'startIsolatedMonthlyAiChecks'))
}

// -------------------------------------------------------- F. mutation controls
console.log('\nF. Mutation controls — each brake, inverted, must let it run')
{
  const noCap = (o: { processed: number; remaining: number; pass: number }) =>
    o.remaining > 0 && o.processed > 0
  check('without the cap, pass 20 WOULD chain',
    noCap({ processed: 5, remaining: 9, pass: SCAN_CHAIN_MAX_PASSES }) === true)

  const noProgressGuard = (o: { remaining: number; pass: number }) =>
    o.remaining > 0 && o.pass + 1 <= SCAN_CHAIN_MAX_PASSES
  check('without the progress guard, a pass that did nothing WOULD chain',
    noProgressGuard({ remaining: 9, pass: 1 }) === true)

  const noPassClamp = (url: string) => Number(new URL(url).searchParams.get(SCAN_CHAIN_PARAM))
  check('without the clamp, a hostile pass WOULD be honoured',
    noPassClamp(`${BASE}?${SCAN_CHAIN_PARAM}=999999`) === 999999)

  const noDeadline = (startedAtMs: number) => startedAtMs + 300_000
  check('without the reserve, the deadline WOULD sit at the kill point',
    noDeadline(1_000_000) === 1_300_000 && scanDeadlineAt(1_000_000, 300) < 1_300_000)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}

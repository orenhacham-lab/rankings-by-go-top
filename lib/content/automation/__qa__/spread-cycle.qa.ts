/**
 * THE QUEUE SPREADS THE PLAN'S ARTICLES OVER THE BILLING CYCLE — the guard.
 *
 * Before: the next slot came from the cadence alone. Basic (4 articles a
 * cycle) on "twice a week" published Nov 1, 4, 8, 11 and then stood still for
 * three weeks, its next item failing as quota_exceeded; on "weekly" a cycle
 * with five Sundays published four and failed the fifth.
 *
 *   A) a cadence the allowance covers keeps its own slots (no change);
 *   B) a cadence with more slots than articles is spread over the cycle, never
 *      sooner than the cadence, and never a slot outside the cadence's days;
 *   C) nothing left: the first slot of the next cycle; unknown period: as before;
 *   D) the runner reads the allowance only (no write to billing tables), falls
 *      back to the cadence when it is not a known periodic limit, and the
 *      cadence math is unchanged.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nextPublishAtWeekdays, advanceNextPublishAt, spreadNextPublishAt } from '@/lib/content/automation/schedule'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name, got === undefined ? '' : JSON.stringify(got)) }
}
const TZ = 'Asia/Jerusalem'
const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })

/** One cycle of a pool: publish at each slot while an article is left; returns the publish days. */
function simulate(weekdays: number[], limit: number, startIso: string, endIso: string, spread: boolean): string[] {
  const end = Date.parse(endIso)
  const slotAfter = (ms: number) => nextPublishAtWeekdays('09:00', TZ, weekdays, ms)
  let slot = slotAfter(Date.parse(startIso) - 1)
  const out: string[] = []
  let used = 0
  while (Date.parse(slot) < end) {
    if (used >= limit) { out.push(`STALL ${day(slot)}`); slot = slotAfter(Date.parse(slot)); continue }
    used++
    out.push(day(slot))
    const now = Date.parse(slot) + 60_000
    const cadence = slotAfter(now)
    slot = spread ? spreadNextPublishAt({ cadenceNextIso: cadence, nowMs: now, periodEndIso: endIso, remaining: limit - used, ready: 0, slotAfter }) : cadence
  }
  return out
}

const NOV = ['2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'] as const
// Before (proof of the problem)
const twiceOld = simulate([0, 3], 4, NOV[0], NOV[1], false)
check('proof: twice a week without spreading publishes four in eleven days, then stalls', twiceOld.slice(0, 4).join(',') === '2026-11-01,2026-11-04,2026-11-08,2026-11-11' && twiceOld.includes('STALL 2026-11-15'), twiceOld)

// A) covered cadence unchanged
const weeklyOct = simulate([0], 4, '2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z', true)
check('A1: weekly, four Sundays in the cycle: the same four Sundays', weeklyOct.join(',') === '2026-10-04,2026-10-11,2026-10-18,2026-10-25', weeklyOct)
const big = simulate([0, 3], 20, NOV[0], NOV[1], true)
check('A2: an allowance larger than the slots publishes every slot', big.length === 9 && !big.some((d) => d.startsWith('STALL')), big)

// B) spread
const twice = simulate([0, 3], 4, NOV[0], NOV[1], true)
check('B1: twice a week on Basic: four articles over the whole cycle, no stall', twice.length === 4 && !twice.some((d) => d.startsWith('STALL')) && twice[3] >= '2026-11-22', twice)
check('B2: every spread slot is still one of the chosen weekdays', twice.every((d) => [0, 3].includes(new Date(`${d}T12:00:00Z`).getUTCDay())), twice)
const weeklyNov = simulate([0], 4, NOV[0], NOV[1], true)
check('B3: weekly with five Sundays: four published, the fifth slot never fails on quota', weeklyNov.length === 4 && !weeklyNov.some((d) => d.startsWith('STALL')), weeklyNov)
const now = Date.parse('2026-11-01T07:01:00Z')
const cad = nextPublishAtWeekdays('09:00', TZ, [0, 3], now)
const s = spreadNextPublishAt({ cadenceNextIso: cad, nowMs: now, periodEndIso: NOV[1], remaining: 3, ready: 0, slotAfter: (ms) => nextPublishAtWeekdays('09:00', TZ, [0, 3], ms) })
check('B4: never sooner than the cadence slot', Date.parse(s) >= Date.parse(cad))
const interval = advanceNextPublishAt('2026-11-01T07:00:00Z', TZ, '09:00', 2, now)
const sInt = spreadNextPublishAt({ cadenceNextIso: interval, nowMs: now, periodEndIso: NOV[1], remaining: 2, ready: 1, slotAfter: (ms) => advanceNextPublishAt(interval, TZ, '09:00', 2, ms) })
check('B5: an every-N-days cadence stays on its grid', (Date.parse(sInt) - Date.parse(interval)) % (2 * 86_400_000) === 0 && Date.parse(sInt) > Date.parse(interval), [interval, sInt])
check('B6: articles already generated count as articles left', spreadNextPublishAt({ cadenceNextIso: cad, nowMs: now, periodEndIso: NOV[1], remaining: 0, ready: 8, slotAfter: (ms) => nextPublishAtWeekdays('09:00', TZ, [0, 3], ms) }) === cad)

// C) edges
const none = spreadNextPublishAt({ cadenceNextIso: cad, nowMs: now, periodEndIso: NOV[1], remaining: 0, ready: 0, slotAfter: (ms) => nextPublishAtWeekdays('09:00', TZ, [0, 3], ms) })
check('C1: nothing left: the first slot of the next cycle', Date.parse(none) >= Date.parse(NOV[1]) && Date.parse(none) - Date.parse(NOV[1]) < 4 * 86_400_000, none)
check('C2: no period end (trial, unknown): the cadence slot', spreadNextPublishAt({ cadenceNextIso: cad, nowMs: now, periodEndIso: null, remaining: 0, ready: 0, slotAfter: () => 'x' }) === cad)
check('C3: a slot already past the cycle end is kept', spreadNextPublishAt({ cadenceNextIso: '2026-12-02T07:00:00.000Z', nowMs: now, periodEndIso: NOV[1], remaining: 0, ready: 0, slotAfter: () => 'x' }) === '2026-12-02T07:00:00.000Z')

// D) runner source
const root = join(__dirname, '..', '..', '..', '..')
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const runner = strip(readFileSync(join(root, 'lib/content/automation/runner.ts'), 'utf8'))
// Wave 11: the allowance read moved to plan-rhythm.ts (shared by the runner, the
// pool routes and the screen); the runner still spreads every next slot.
const rhythmSrc = strip(readFileSync(join(root, 'lib/content/automation/plan-rhythm.ts'), 'utf8'))
check('D1: the runner spreads the slot after a publish, falling back to the cadence', /const rhythm = await readPublishRhythmForProject\(admin, pool\.project_id\)/.test(runner) && /return rhythm\.allowance\s*\?\s*spreadNextPublishAt\(\{[\s\S]*?\}\)\s*:\s*cadenceNextIso/.test(runner) && /if \(res\.status === 'published'\) \{[\s\S]*?const nextIso = await nextSlotAfter\(nowMs\)/.test(runner))
check('D2: it reads the article allowance against the plan\'s own limit', /usageType: 'article', limitFor: \(l\) => l\.maxArticlesPerPeriodAccountWide/.test(rhythmSrc) && /a\.state !== 'known'/.test(rhythmSrc) && /a\.periodEnd \?/.test(rhythmSrc))
check('D3: the runner writes no billing table', !/from\('(usage_reservations|subscriptions|billing_periods|plans|profiles)'\)\s*\.(insert|update|upsert|delete)/.test(runner + rhythmSrc))
check('D4: a failed allowance read keeps the cadence', /catch\s*\{\s*return NO_RHYTHM\s*\}/.test(rhythmSrc.slice(rhythmSrc.indexOf('export async function readPublishRhythm('))))

console.log('twice a week:', twiceOld.join(' '), '=>', twice.join(' '), '| weekly, five Sundays:', weeklyNov.join(' '))
console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}

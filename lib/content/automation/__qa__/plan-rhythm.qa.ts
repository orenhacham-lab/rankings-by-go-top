/**
 * THE PLAN DECIDES THE PUBLISHING RHYTHM — the guard (owner, 2026-10-02).
 *
 * "4 articles → one a week, 12 a month → 3 a week, 3 → Sun/Tue/Thu, 1 → Sunday,
 *  never Friday or Saturday."
 *
 *   A) articles a week = monthly allowance ÷ 4 (shared by the account's queues);
 *   B) the days: 1 Sun · 2 Sun+Wed · 3 Sun+Tue+Thu · 4 Sun+Mon+Tue+Thu · 5 Sun–Thu ·
 *      more spread over Sun–Thu; Friday/Saturday never, for any count;
 *   C) slots in the project's own time zone, several on a day hourly, DST-safe;
 *   D) admin / trial / unreadable: the owner's schedule, minus Friday/Saturday;
 *   E) cycle end kept: never more than the allowance, never a stalled slot;
 *   F) the screen's projection = the runner's dates; a stored off-rhythm slot moves;
 *   G) the runner itself: holds on Friday/Saturday, realigns an off-rhythm slot,
 *      publishes on a rhythm day — with a real entitlement read (FakeAdmin);
 *   H) source: every route + the screen use the one slot function, he/en copy.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  articlesPerWeekFor, articlesPerMonthPerSite, perSiteRate, MAX_ARTICLES_PER_WEEK_PER_SITE, WEEKLY_FIT_TOLERANCE,
  weeklyRhythm, rhythmWeekdays, nextRhythmSlotAt, makeSlotAfter, localWeekday,
  slotFitsRhythm, projectPublishDates, spreadNextPublishAt, daySlotMinutes,
  monthlyForSite, rateForMonthly, MAX_MONTHLY_SHARE_PER_SITE,
} from '@/lib/content/automation/schedule'
import { PLAN_CATALOG } from '@/lib/plans/catalog'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { readPublishRhythm } from '@/lib/content/automation/plan-rhythm'
import { runAutomation } from '@/lib/content/automation/runner'
import { topUpTarget } from '@/lib/content/automation/topic-topup'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
let passed = 0
let failed = 0
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name, got === undefined ? '' : JSON.stringify(got)) }
}
const TZ = 'Asia/Jerusalem'
const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const wd = (iso: string) => localWeekday(Date.parse(iso), TZ)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// A) weekly rate from the plan's real allowance
const plans = Object.fromEntries(Object.values(PLAN_CATALOG).map((p) => [p.code, p.maxArticlesPerPeriodAccountWide]))
check('A0: the catalog allowances (read only): regular 4, advanced 12, premium 50, agency 200', same(plans, { regular: 4, advanced: 12, premium: 50, large_agency: 200 }), plans)
check('A1: 4 a month → 1 a week', articlesPerWeekFor(4) === 1)
check('A2: 12 a month → 3 a week', articlesPerWeekFor(12) === 3)
// The rate before the ceiling, for the controls below: divide and floor at 1,
// with nothing stopping 13 a week landing on one site.
const uncapped = (monthly: number, queues = 1) => (monthly > 0 ? Math.max(1, Math.round(monthly / 4 / Math.max(1, Math.floor(queues)))) : 0)
check('A3: a multi-site allowance on ONE site is held at the per-site ceiling, not divided by 4 (50 → 5, 200 → 5)', articlesPerWeekFor(50) === 5 && articlesPerWeekFor(200) === 5)
check('A3a: the ceiling is one article a working day', MAX_ARTICLES_PER_WEEK_PER_SITE === 5)
check('A3b: the ceiling is the widest shape the weekday spread has, so it never stacks two on a day', same(weeklyRhythm(MAX_ARTICLES_PER_WEEK_PER_SITE), [1, 1, 1, 1, 1, 0, 0]))
check(
  'A3c: the ceiling binds only above it — Basic and Advanced keep the rate their allowance gives',
  articlesPerWeekFor(PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide) === 1 && articlesPerWeekFor(PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide) === 3,
)
// A-MUT: a cap stated but not applied. The old code divided and floored at 1
// with no ceiling, which is what put 13 a week into a single site.
check('A-MUT: without the ceiling a single site would be scheduled 13 and 50 a week', uncapped(50) === 13 && uncapped(200) === 50 && articlesPerWeekFor(50) !== uncapped(50))
check(
  'A4: an account allowance is shared by its active queues (50 over 3 → 4), and the per-site ceiling holds above it (50 over 2 → 5, not 6)',
  articlesPerWeekFor(50, 3) === 4 && articlesPerWeekFor(50, 2) === 5 && uncapped(50, 2) === 6,
)
check('A4a: a share too small for a weekly rhythm reports no weekly rate at all, rather than being rounded up to one', articlesPerWeekFor(4, 9) === 0 && perSiteRate(4, 9).intervalDays !== null)
check('A5: no allowance → no rhythm', articlesPerWeekFor(0) === 0 && articlesPerWeekFor(NaN) === 0)

// A-II) EVERY SITE COUNT A PLAN ALLOWS, not just the ones a customer has today.
// The account's allowance is the ceiling: the sum of what its sites are
// scheduled for must not exceed it by more than the cycle spread absorbs.
const MONTH_WEEKS = 30.44 / 7
let worstPlan = ''
let worstRatio = 0
for (const c of Object.values(PLAN_CATALOG)) {
  const monthly = c.maxArticlesPerPeriodAccountWide
  for (let sites = 1; sites <= c.maxProjects; sites++) {
    const r = perSiteRate(monthly, sites)
    // The rate itself, not the rounded-up topic target: a site on a 14-day gap
    // publishes 30.44/14 a month, not ceil(30/14).
    const scheduled = sites * (r.intervalDays ? 30.44 / r.intervalDays : r.perWeek * MONTH_WEEKS)
    const ratio = scheduled / monthly
    if (ratio > worstRatio) { worstRatio = ratio; worstPlan = `${c.code} with ${sites} site(s): ${Math.round(scheduled)} a month vs ${monthly}` }
  }
}
check(`A6: no plan, at any site count it allows, is scheduled for more than 1.15x its monthly allowance (worst: ${worstPlan})`, worstRatio <= 1.15, worstPlan)
check(
  'A7: a share no weekly rhythm fits becomes a gap in days that matches it (Agency over 100 sites → one every 15 days, over 20 sites → every 3)',
  perSiteRate(200, 100).perWeek === 0 && perSiteRate(200, 100).intervalDays === 15 && perSiteRate(200, 20).intervalDays === 3,
  [perSiteRate(200, 100), perSiteRate(200, 20)],
)
check(
  'A8: a share a weekly rhythm does fit keeps the weekday rhythm and no gap (Agency over 12 sites → 4 a week)',
  perSiteRate(200, 12).intervalDays === null && perSiteRate(200, 12).perWeek === 4,
  perSiteRate(200, 12),
)
check(
  'A9: the tolerance is set so the single-site plans keep exactly the rhythm they have today — Basic a weekly Sunday (4 a month is 0.92 of a week, 8% off) and Advanced 3 a week',
  WEEKLY_FIT_TOLERANCE >= 0.09 && perSiteRate(4, 1).perWeek === 1 && perSiteRate(4, 1).intervalDays === null && perSiteRate(12, 1).perWeek === 3 && perSiteRate(12, 1).intervalDays === null,
)
check(
  'A9a: above the per-site ceiling the rate is the ceiling, not a gap: the rest of the allowance waits for the account\'s other sites',
  perSiteRate(50, 1).perWeek === MAX_ARTICLES_PER_WEEK_PER_SITE && perSiteRate(200, 1).perWeek === MAX_ARTICLES_PER_WEEK_PER_SITE
    && perSiteRate(50, 1).intervalDays === null && perSiteRate(200, 1).intervalDays === null,
)
check('A10: exactly one of the two shapes is ever set', Object.values(PLAN_CATALOG).every((c) => {
  for (let s = 1; s <= c.maxProjects; s++) {
    const r = perSiteRate(c.maxArticlesPerPeriodAccountWide, s)
    if ((r.perWeek > 0) === (r.intervalDays !== null)) return false
  }
  return true
}))
// A-MUT2: the floor-at-one this replaced. It is what put an Agency account's
// 100 sites on 435 articles a month against an allowance of 200.
const flooredMonthly = (monthly: number, sites: number) => Math.ceil(Math.min(5, Math.max(1, Math.round(monthly / 4 / sites))) * MONTH_WEEKS) * sites
const rateMonthly = (monthly: number, sites: number) => {
  const r = perSiteRate(monthly, sites)
  return sites * (r.intervalDays ? 30.44 / r.intervalDays : r.perWeek * MONTH_WEEKS)
}
check(
  'A-MUT2: rounding each site to the nearest week would schedule an Agency account for 261 a month over 30 sites and 435 over 100, against an allowance of 200',
  flooredMonthly(200, 30) > 1.15 * 200 && flooredMonthly(200, 100) > 2 * 200 && rateMonthly(200, 30) <= 1.15 * 200 && rateMonthly(200, 100) <= 1.15 * 200,
  [flooredMonthly(200, 30), flooredMonthly(200, 100), Math.round(rateMonthly(200, 30)), Math.round(rateMonthly(200, 100))],
)

check(
  'A13: the topic top-up target covers what the site will actually publish in a month, in both shapes (never fewer topics than articles)',
  Object.values(PLAN_CATALOG).every((c) => {
    for (let s = 1; s <= c.maxProjects; s++) {
      const r = perSiteRate(c.maxArticlesPerPeriodAccountWide, s)
      const real = r.intervalDays ? 30.44 / r.intervalDays : r.perWeek * MONTH_WEEKS
      if (articlesPerMonthPerSite(c.maxArticlesPerPeriodAccountWide, s) < Math.floor(real)) return false
    }
    return true
  }),
)

// A-III) THE PLAN'S GAP OUTRANKS THE OWNER'S OWN WEEKDAYS, or an account with
// more sites than a weekly rhythm can serve would publish on every day the
// owner once picked and blow through the allowance anyway.
const TZ_IL = 'Asia/Jerusalem'
const ownerEveryWeekday = [0, 1, 2, 3, 4]
const withPlanGap = makeSlotAfter({ publishTime: '09:00', timeZone: TZ_IL, perDay: null, publishDays: ownerEveryWeekday, intervalDays: 7, anchorIso: '2026-10-04T06:00:00Z', planIntervalDays: 15 })
const withoutPlanGap = makeSlotAfter({ publishTime: '09:00', timeZone: TZ_IL, perDay: null, publishDays: ownerEveryWeekday, intervalDays: 7, anchorIso: '2026-10-04T06:00:00Z' })
const gapDays = (iso: string) => Math.round((Date.parse(iso) - Date.parse('2026-10-04T06:00:00Z')) / 86400000)
check(`A11: the plan's gap is used, not the owner's weekdays (${gapDays(withPlanGap(Date.parse('2026-10-04T06:00:00Z')))} days away)`, gapDays(withPlanGap(Date.parse('2026-10-04T06:00:00Z'))) >= 14)
check('A11-MUT: without the plan gap the same pool would publish on the owner\'s next weekday', gapDays(withoutPlanGap(Date.parse('2026-10-04T06:00:00Z'))) <= 2)
check('A12: a plan gap still never lands on Friday or Saturday', (() => {
  let at = Date.parse('2026-10-04T06:00:00Z')
  for (let i = 0; i < 12; i++) { const iso = withPlanGap(at); if ([5, 6].includes(localWeekday(Date.parse(iso), TZ_IL))) return false; at = Date.parse(iso) }
  return true
})())

// B) the days
check('B1: 1 a week → Sunday', same(rhythmWeekdays(weeklyRhythm(1)), [0]))
check('B2: 2 a week → Sunday, Wednesday', same(rhythmWeekdays(weeklyRhythm(2)), [0, 3]))
check('B3: 3 a week → Sunday, Tuesday, Thursday', same(rhythmWeekdays(weeklyRhythm(3)), [0, 2, 4]))
check('B4: 4 a week → Sunday, Monday, Tuesday, Thursday', same(rhythmWeekdays(weeklyRhythm(4)), [0, 1, 2, 4]))
check('B5: 5 a week → Sunday to Thursday', same(weeklyRhythm(5), [1, 1, 1, 1, 1, 0, 0]))
check('B6: 13 a week → spread over Sun–Thu, several a day (the 3 extra on Sun/Tue/Thu)', same(weeklyRhythm(13), [3, 2, 3, 2, 3, 0, 0]))
let weekendEver = false
let sumsOk = true
for (let n = 1; n <= 60; n++) { const r = weeklyRhythm(n); if (r[5] || r[6]) weekendEver = true; if (r.reduce((a, b) => a + b, 0) !== n) sumsOk = false }
check('B7: for every count 1–60 no Friday or Saturday, and the week sums to the count', !weekendEver && sumsOk)

// C) slots in the project time zone
const FRI = Date.parse('2026-10-02T10:00:00Z') // Friday 13:00 in Israel
const first = nextRhythmSlotAt('09:00', TZ, weeklyRhythm(1), FRI)
check('C1: from a Friday, Basic publishes Sunday 09:00 Israel time', day(first) === '2026-10-04' && hm(first) === '09:00', first)
const adv: string[] = []
for (let at = Date.parse('2026-10-01T00:00:00Z'), i = 0; i < 14; i++) { const s = nextRhythmSlotAt('09:00', TZ, weeklyRhythm(3), at); adv.push(s); at = Date.parse(s) }
check('C2: Advanced over a month: only Sun/Tue/Thu, always 09:00, never Fri/Sat', adv.every((s) => [0, 2, 4].includes(wd(s)) && hm(s) === '09:00'), adv.map(day))
check('C3: across the end of daylight time (Oct 25) the wall time stays 09:00', adv.some((s) => day(s) > '2026-10-25') && adv.every((s) => hm(s) === '09:00'))
const multi: string[] = []
for (let at = Date.parse('2026-10-03T21:00:00Z'), i = 0; i < 3; i++) { const s = nextRhythmSlotAt('09:00', TZ, weeklyRhythm(13), at); multi.push(s); at = Date.parse(s) }
check('C4: three on a Sunday: 09:00, 10:00, 11:00 the same day', multi.every((s) => day(s) === '2026-10-04') && same(multi.map(hm), ['09:00', '10:00', '11:00']), multi)
check('C5: a late publish time is pulled earlier so a day\'s slots stay on that day', Math.max(...daySlotMinutes(23 * 60, 10)) <= 23 * 60 + 30 && daySlotMinutes(23 * 60, 1)[0] === 23 * 60)
const ny = nextRhythmSlotAt('09:00', 'America/New_York', weeklyRhythm(1), FRI)
check('C6: another project time zone is honoured (Sunday 09:00 New York)', new Date(ny).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hour12: false }) === 'Sun, 09', ny)

// D) admin / trial / unreadable: the owner's schedule without Fri/Sat
const ownerFri = makeSlotAfter({ publishTime: '09:00', timeZone: TZ, perDay: null, publishDays: [5], intervalDays: 7, anchorIso: null })(FRI)
check('D1: an owner who chose Friday publishes on Sunday instead', wd(ownerFri) === 0, ownerFri)
const ownerTwo = makeSlotAfter({ publishTime: '09:00', timeZone: TZ, perDay: null, publishDays: [2, 6], intervalDays: 3, anchorIso: null })
const o: string[] = []
for (let at = FRI, i = 0; i < 6; i++) { const s = ownerTwo(at); o.push(s); at = Date.parse(s) }
check('D2: Tuesday + Saturday keeps Tuesday only', o.every((s) => wd(s) === 2), o.map(day))
const daily = makeSlotAfter({ publishTime: '09:00', timeZone: TZ, perDay: null, publishDays: null, intervalDays: 1, anchorIso: '2026-10-01T06:00:00Z' })
const dl: string[] = []
for (let at = Date.parse('2026-10-01T06:00:00Z'), i = 0; i < 20; i++) { const s = daily(at); dl.push(s); at = Date.parse(s) }
check('D3: an every-day schedule never lands on Friday or Saturday', dl.every((s) => wd(s) !== 5 && wd(s) !== 6) && dl.length === 20, dl.map(day))
const ownerWed = makeSlotAfter({ publishTime: '09:00', timeZone: TZ, perDay: null, publishDays: [3], intervalDays: 7, anchorIso: null })(FRI)
check('D4: an owner schedule on a working day is unchanged (Wednesday stays Wednesday)', wd(ownerWed) === 3 && hm(ownerWed) === '09:00')

// E) cycle end kept
function simulate(perWeek: number, limit: number, startIso: string, endIso: string): string[] {
  const end = Date.parse(endIso)
  const slotAfter = makeSlotAfter({ publishTime: '09:00', timeZone: TZ, perDay: weeklyRhythm(perWeek), publishDays: null, intervalDays: 7, anchorIso: null })
  let slot = slotAfter(Date.parse(startIso) - 1)
  const out: string[] = []
  let used = 0
  while (Date.parse(slot) < end) {
    if (used >= limit) { out.push(`STALL ${day(slot)}`); slot = slotAfter(Date.parse(slot)); continue }
    used++
    out.push(day(slot))
    const now = Date.parse(slot) + 60_000
    slot = spreadNextPublishAt({ cadenceNextIso: slotAfter(now), nowMs: now, periodEndIso: endIso, remaining: limit - used, ready: 0, slotAfter })
  }
  return out
}
const basicNov = simulate(1, 4, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z')
check('E1: Basic in a five-Sunday cycle: four Sundays, no failed fifth', basicNov.length === 4 && !basicNov.some((d) => d.startsWith('STALL')) && basicNov.every((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 0), basicNov)
const advNov = simulate(3, 12, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z')
check('E2: Advanced in a 13-slot cycle: twelve on Sun/Tue/Thu, none past the allowance', advNov.length === 12 && !advNov.some((d) => d.startsWith('STALL')) && advNov.every((d) => [0, 2, 4].includes(new Date(`${d}T12:00:00Z`).getUTCDay())), advNov)

// F) projection = runner
const perDay3 = weeklyRhythm(3)
const sa = makeSlotAfter({ publishTime: '09:00', timeZone: TZ, perDay: perDay3, publishDays: [0], intervalDays: 7, anchorIso: null })
const proj = projectPublishDates({ firstIso: '2026-10-04T06:00:00.000Z', count: 8, slotAfter: sa, cycle: { periodStartIso: '2026-09-15T00:00:00Z', periodEndIso: '2026-10-15T00:00:00Z', articlesLeft: 3, perCycle: 12 } })
check('F1: projected dates are the rhythm\'s days, increasing, the first being the stored slot', proj.length === 8 && proj[0] === '2026-10-04T06:00:00.000Z' && proj.every((s, i) => i === 0 || Date.parse(s) > Date.parse(proj[i - 1]!)) && proj.every((s) => [0, 2, 4].includes(wd(s))), proj.map(day))
check('F2: no more dates inside the cycle than articles left (3), the rest after it renews', proj.filter((s) => Date.parse(s) < Date.parse('2026-10-15T00:00:00Z')).length === 3 && day(proj[3]!) >= '2026-10-15', proj.map(day))
const weekly = projectPublishDates({ firstIso: '2026-10-04T06:00:00.000Z', count: 4, slotAfter: sa, cycle: null })
check('F3: without a known cycle the projection follows the rhythm (Sun, Tue, Thu, Sun) — not plain weekly dates', same(weekly.map(day), ['2026-10-04', '2026-10-06', '2026-10-08', '2026-10-11']), weekly.map(day))
check('F4: a stored Wednesday on Basic does not fit the rhythm; a Sunday does; a Friday never does', !slotFitsRhythm('2026-10-07T06:00:00Z', TZ, weeklyRhythm(1)) && slotFitsRhythm('2026-10-04T06:00:00Z', TZ, weeklyRhythm(1)) && !slotFitsRhythm('2026-10-02T06:00:00Z', TZ, null) && slotFitsRhythm('2026-10-07T06:00:00Z', TZ, null))

// G) the runner, with a real entitlement read
const H = 3_600_000
function seed(opts: { plan: string; role?: string; nextIso: string }) {
  const end = new Date(Date.parse(opts.nextIso) + 20 * 86_400_000).toISOString()
  return new FakeAdmin({
    profiles: [{ id: 'u1', role: opts.role ?? 'user', email: 'u1@example.com' }],
    subscriptions: opts.plan === 'none' ? [] : [{ id: 's1', user_id: 'u1', plan_code: opts.plan, status: 'active', trial_ends_at: null, current_period_start: new Date(Date.parse(opts.nextIso) - 10 * 86_400_000).toISOString(), current_period_end: end, created_at: '2026-09-01T00:00:00Z' }],
    projects: [{ id: 'p1', user_id: 'u1' }],
    article_pools: [{ id: 'pool1', project_id: 'p1', user_id: 'u1', is_active: true, cadence: 'weekly', interval_days: 7, publish_time: '09:00', timezone: TZ, next_publish_at: opts.nextIso, publish_days: [3] }],
    article_pool_items: [{ id: 'i1', pool_id: 'pool1', project_id: 'p1', topic_id: null, status: 'generated', article_id: 'a1', attempts: 0, position: 1, locked_at: null }],
    usage_reservations: [],
  })
}
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const l = console.log, e = console.error, w = console.warn
  console.log = () => {}; console.error = () => {}; console.warn = () => {}
  try { return await fn() } finally { console.log = l; console.error = e; console.warn = w }
}
async function runner() {
  const r = await quiet(() => readPublishRhythm(seed({ plan: 'advanced', nextIso: '2026-10-07T06:00:00Z' }) as unknown as Admin, 'u1'))
  check('G0: an Advanced account reads as 3 a week on Sun/Tue/Thu', r.plan?.perWeek === 3 && same(r.plan?.perDay && rhythmWeekdays(r.plan.perDay), [0, 2, 4]) && r.plan?.intervalDays === null && !!r.allowance, r)
  const adminR = await quiet(() => readPublishRhythm(seed({ plan: 'advanced', role: 'admin', nextIso: '2026-10-07T06:00:00Z' }) as unknown as Admin, 'u1'))
  check('G0b: an admin has no plan rhythm (owner schedule)', adminR.plan === null, adminR)

  // Friday: the stored slot is due (Thursday 23:00 run late), nothing is published.
  const fri = seed({ plan: 'advanced', nextIso: '2026-10-01T20:00:00Z' })
  const s1 = await quiet(() => runAutomation(fri as unknown as Admin, { nowMs: Date.parse('2026-10-02T06:00:00Z') }))
  const p1 = (fri.tables.article_pools[0] as { next_publish_at: string }).next_publish_at
  check('G1: on Friday a due slot is held, not published', s1.published === 0 && s1.diagnostics[0]?.publishAttempted === false && s1.diagnostics[0]?.note === 'held_no_publish_day', s1.diagnostics[0])
  check('G2: …and moved to Sunday 09:00 Israel time', wd(p1) === 0 && hm(p1) === '09:00', p1)

  // Wednesday on Advanced (the owner had chosen Wednesday): realigned to Thursday.
  const wed = seed({ plan: 'advanced', nextIso: '2026-10-07T06:00:00Z' })
  const s2 = await quiet(() => runAutomation(wed as unknown as Admin, { nowMs: Date.parse('2026-10-07T06:05:00Z') }))
  const p2 = (wed.tables.article_pools[0] as { next_publish_at: string }).next_publish_at
  check('G3: a stored Wednesday on Advanced is realigned to the plan\'s Thursday, not published', s2.diagnostics[0]?.note === 'held_realigned_to_plan_rhythm' && s2.diagnostics[0]?.publishAttempted === false && day(p2) === '2026-10-08', [s2.diagnostics[0], p2])

  // Admin keeps the chosen Wednesday and publishes on it.
  const adm = seed({ plan: 'advanced', role: 'admin', nextIso: '2026-10-07T06:00:00Z' })
  const s3 = await quiet(() => runAutomation(adm as unknown as Admin, { nowMs: Date.parse('2026-10-07T06:05:00Z') }))
  check('G4: an admin\'s chosen Wednesday is kept: the runner attempts the publish', s3.diagnostics[0]?.publishAttempted === true, s3.diagnostics[0])

  // A rhythm day: the publish is attempted.
  const tue = seed({ plan: 'advanced', nextIso: '2026-10-06T06:00:00Z' })
  const s4 = await quiet(() => runAutomation(tue as unknown as Admin, { nowMs: Date.parse('2026-10-06T06:05:00Z') + H }))
  check('G5: on the plan\'s Tuesday the runner publishes', s4.diagnostics[0]?.publishAttempted === true, s4.diagnostics[0])
}

// I) the topic top-up feeds the queue at the plan's rhythm, not the owner's old choice
const wk = { id: 'p', cadence: 'weekly', interval_days: 7, publish_days: [0] }
check('I1: Advanced with an old weekly pool: topics for the plan rhythm (12), not 5', topUpTarget({ monthlyArticles: 12, ownerProjects: 1, pool: wk, planRhythm: { activeQueues: 1 } }) === 12 && topUpTarget({ monthlyArticles: 12, ownerProjects: 1, pool: wk }) === 5)
// A small share and an even split of the same allowance, both under the
// per-project cap so the cap is not what the check is reading.
const i1a = (share?: number) => topUpTarget({ monthlyArticles: 50, ownerProjects: 5, pool: wk, planRhythm: { activeQueues: 5, monthlyForThisSite: share } })
check('I1a: a website given a share of its own gets topics for THAT share, not for the even split', i1a(3) === 3 && i1a() === 10, [i1a(3), i1a()])
check('I2: Basic stays 4; shared queues get their share', topUpTarget({ monthlyArticles: 4, ownerProjects: 1, pool: wk, planRhythm: { activeQueues: 1 } }) === 4 && topUpTarget({ monthlyArticles: 50, ownerProjects: 2, pool: wk, planRhythm: { activeQueues: 2 } }) === 12)

// H) source: one slot function everywhere, the screen copy in he + en
const root = join(__dirname, '..', '..', '..', '..')
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const src = (p: string) => strip(readFileSync(join(root, p), 'utf8'))
const route = src('app/api/content/automation/pools/route.ts')
const patch = src('app/api/content/automation/pools/[id]/route.ts')
const screen = src('components/content/AutomationSchedule.tsx')
const rhythmSrc = src('lib/content/automation/plan-rhythm.ts')
check('H1: the pools route projects with the runner\'s functions (no plain weekly projection left)', /projectPublishDates\(/.test(route) && /makeSlotAfter\(/.test(route) && !/projectedPublishAt\(/.test(route) && /rhythm: rhythmDTO\(rhythm\)/.test(route))
check('H2: create and update both take the first slot from the plan rhythm', /firstSlot\([^)]*rhythm\)/.test(route) && /readPublishRhythm\(/.test(route) && /readPublishRhythmForProject\(/.test(patch) && /makeSlotAfter\(/.test(patch))
check('H3: the rhythm read writes nothing', !/\.(insert|update|upsert|delete)\(/.test(rhythmSrc))
// NARROWED 4 October 2026: the condition is no longer "a paid plan" but "the
// schedule is not this account's own" — a trial is locked too (the owner's
// rule: no customer controls the cadence). The claim is unchanged: when the
// account does not set the rhythm, the screen states it and offers neither the
// day picker nor the save button. See
// lib/content/automation/__qa__/schedule-ownership.qa.ts.
check('H4: the screen states the rhythm when the account does not set it, and hides the day picker', /rhythm\?\.source === 'plan'/.test(screen) && /const scheduleLocked = rhythm !== null && rhythm\.source !== 'owner'/.test(screen) && /t\.planRhythmLineOne : t\.planRhythmLine\)/.test(screen) && /data-plan-rhythm="">\{rhythmLine\}</.test(screen) && /t\.noWeekendNote/.test(screen) && /\{!scheduleLocked && <Button[^\n]{0,60}saveSettings/.test(screen))
check('H4-MUT: a screen that locks only a paid plan fails H4', !/\{!scheduleLocked && <Button[^\n]{0,60}saveSettings/.test('{!planRhythm && <Button size="sm" onClick={() => saveSettings()}'))
check('H5: the screen never offers Friday or Saturday', /WORKING_WEEKDAYS/.test(screen) && !/t\.weekdays\.map\(/.test(screen))
for (const lang of ['he', 'en'] as const) {
  const dict = readFileSync(join(root, `lib/i18n/dashboard/${lang}.ts`), 'utf8')
  check(`H6-${lang}: planRhythmLine + noWeekendNote exist`, /planRhythmLine: '[^']*\{n\}[^']*\{days\}[^']*'/.test(dict) && /noWeekendNote: '/.test(dict))
}
const he = readFileSync(join(root, 'lib/i18n/dashboard/he.ts'), 'utf8')
check('H7: the Hebrew line is Hebrew', /planRhythmLine: '[^']*מנוי[^']*'/.test(he) && /noWeekendNote: '[^']*שישי[^']*שבת[^']*'/.test(he))

/**
 * J) THE SPLIT IS THE CUSTOMER'S, THE RHYTHM IS THE PLAN'S (owner, 4 October 2026).
 *
 * The owner asked for the per-site share to be the customer's to set, with the
 * even split as the default: "what you proposed as the default, but an option
 * for them to change it". So one field of the schedule is theirs — how much of
 * their own monthly allowance each of their websites gets — while the days, the
 * times and the per-site ceiling stay the plan's and are unchanged by it.
 */
const jMine = (allowance: number, others: (number | null)[], mine: number | null) => monthlyForSite({ monthlyAllowance: allowance, otherShares: others, mine })
check('J1: nobody set anything → the even split, exactly as before shares existed', jMine(50, [null, null, null, null], null) === 10 && jMine(200, [], null) === 200)
check('J2: a declared share is what that site gets', jMine(50, [null, null], 20) === 20)
check('J3: the sites with no share of their own divide what the declared ones leave', jMine(50, [20, null, null], null) === 10 && jMine(50, [20, 20, null], null) === 5)
check('J4: a declared share is held to what the others have not claimed, so a stale set cannot over-schedule', jMine(50, [30, 15], 20) === 5 && jMine(50, [50], 20) === 0)
check('J5: a nonsense share is no share at all', jMine(50, [null], 0) === 25 && jMine(50, [null], -3) === 25 && jMine(50, [null], 1.7) === 1 && jMine(0, [], 10) === 0)
check('J6: the ceiling is the monthly form of one article a working day', MAX_MONTHLY_SHARE_PER_SITE === 21 && MAX_MONTHLY_SHARE_PER_SITE === Math.floor(MAX_ARTICLES_PER_WEEK_PER_SITE * (30.44 / 7)))
check('J7: a chosen share meets the same rate rules as one nobody chose', same(rateForMonthly(50), perSiteRate(50, 1)) && same(rateForMonthly(12), perSiteRate(12, 1)) && same(rateForMonthly(4), perSiteRate(4, 1)) && same(rateForMonthly(2), perSiteRate(200, 100)))
check('J8: …including the ceiling and the interval', rateForMonthly(40).perWeek === MAX_ARTICLES_PER_WEEK_PER_SITE && rateForMonthly(2).perWeek === 0 && rateForMonthly(2).intervalDays === 15)
// J-MUT: a split that trusted the declared number without the room left.
const jNaive = (allowance: number, others: (number | null)[], mine: number | null) => (mine && mine > 0 ? mine : allowance / (others.filter((x) => x === null).length + 1))
check('J-MUT: trusting the declared number alone over-schedules where J4 holds', jNaive(50, [50], 20) === 20 && jMine(50, [50], 20) === 0)

async function shares() {
  // A Premium account (50 a month) with three websites: one given 30, the other
  // two on the even split of what is left.
  const end = new Date(Date.parse('2026-10-07T06:00:00Z') + 20 * 86_400_000).toISOString()
  const pool = (n: number, share: number | null, active = true) => ({
    id: `pool${n}`, project_id: `p${n}`, user_id: 'u1', is_active: active, cadence: 'weekly', interval_days: 7,
    publish_time: '09:00', timezone: TZ, next_publish_at: '2026-10-07T06:00:00Z', publish_days: [3], monthly_share: share,
  })
  const world = (pools: ReturnType<typeof pool>[]) => new FakeAdmin({
    profiles: [{ id: 'u1', role: 'user', email: 'u1@example.com' }],
    subscriptions: [{ id: 's1', user_id: 'u1', plan_code: 'premium', status: 'active', trial_ends_at: null, current_period_start: '2026-09-27T06:00:00Z', current_period_end: end, created_at: '2026-09-01T00:00:00Z' }],
    projects: [{ id: 'p1', user_id: 'u1' }, { id: 'p2', user_id: 'u1' }, { id: 'p3', user_id: 'u1' }],
    article_pools: pools,
    article_pool_items: [],
    usage_reservations: [],
  })
  const three = world([pool(1, 30), pool(2, null), pool(3, null)])
  const r1 = await quiet(() => readPublishRhythm(three as unknown as Admin, 'u1', { projectId: 'p1' }))
  check('J9: the website given 30 reads as 30, at the per-site ceiling of 5 a week', r1.plan?.monthlyShare === 30 && r1.plan?.monthlyForThisSite === 30 && r1.plan?.perWeek === 5, r1.plan)
  const r2 = await quiet(() => readPublishRhythm(three as unknown as Admin, 'u1', { projectId: 'p2' }))
  check('J10: a website with no share of its own gets half of the 20 left, which is a gap in days rather than a weekly rhythm', r2.plan?.monthlyShare === null && r2.plan?.monthlyForThisSite === 10 && r2.plan?.perWeek === 0 && r2.plan?.intervalDays === 3, r2.plan)
  check('J11: the room left is what the OTHER websites have not claimed, and the field is capped by the per-site ceiling too', r1.plan?.shareRoom === 50 && r1.plan?.maxShare === MAX_MONTHLY_SHARE_PER_SITE && r2.plan?.shareRoom === 20 && r2.plan?.maxShare === 20, [r1.plan?.shareRoom, r1.plan?.maxShare, r2.plan?.shareRoom, r2.plan?.maxShare])
  check('J12: Premium and Agency have websites to split between; Basic and Advanced do not', r1.plan?.multiSite === true && PLAN_CATALOG.premium.maxProjects === 10 && PLAN_CATALOG.advanced.maxProjects === 1)
  const even = world([pool(1, null), pool(2, null), pool(3, null)])
  const r3 = await quiet(() => readPublishRhythm(even as unknown as Admin, 'u1', { projectId: 'p1' }))
  check('J13: with nobody\'s share set, every website reads exactly what it read before the column existed', r3.plan?.monthlyForThisSite === 50 / 3 && same({ perWeek: r3.plan?.perWeek, intervalDays: r3.plan?.intervalDays }, perSiteRate(50, 3)), r3.plan)
  const paused = world([pool(1, null, false), pool(2, null), pool(3, null)])
  const r4 = await quiet(() => readPublishRhythm(paused as unknown as Admin, 'u1', { projectId: 'p1', countThisQueue: true }))
  check('J14: a paused queue\'s own screen counts itself, so its share is the one it would get', r4.plan?.activeQueues === 3 && r4.plan?.monthlyForThisSite === 50 / 3, r4.plan)
  const noProject = await quiet(() => readPublishRhythm(three as unknown as Admin, 'u1'))
  check('J15: asked without a website, the answer is the plain even split and no share', noProject.plan?.monthlyShare === null && noProject.plan?.monthlyForThisSite === 50 / 3, noProject.plan)
}

// J-source) the one field a paying customer owns is read where the others are dropped
check('J16: the PATCH route reads the share OUTSIDE the "the schedule is theirs" gate', (() => {
  const gate = patch.indexOf('if (scheduleIsTheirs) {')
  const share = patch.indexOf("if ('monthlyShare' in body) {")
  return share > 0 && gate > 0 && share < gate
})(), [patch.indexOf('if (scheduleIsTheirs) {'), patch.indexOf("if ('monthlyShare' in body) {")])
check('J17: …and refuses it with a stable code where there is nothing to divide', /code: 'share_not_available'/.test(patch) && /code: 'share_too_large'/.test(patch) && /code: 'share_invalid'/.test(patch) && /if \(!plan \|\| !plan\.multiSite\) return \{ ok: false, code: 'share_not_available'/.test(patch))
check('J18: the share is written BEFORE the slot is computed, and the rhythm re-read', (() => {
  const write = patch.indexOf("update({ monthly_share: share.value })")
  const reread = patch.indexOf('scheduleRhythm = await readPublishRhythmForProject', write)
  const slot = patch.indexOf('patch.next_publish_at =')
  return write > 0 && reread > write && slot > reread
})(), [patch.indexOf('update({ monthly_share: share.value })'), patch.indexOf('patch.next_publish_at =')])
check('J19: the ceiling the route enforces is the shared constant, never a number typed in', /MAX_MONTHLY_SHARE_PER_SITE/.test(patch) && !/21/.test(patch.slice(patch.indexOf('function readMonthlyShare'), patch.indexOf('function cleanPublishDays'))))
check('J20: the screen offers the field only on a plan with more than one website, and only once the queue exists', /planRhythm && planRhythm\.multiSite === true && pool \? planRhythm : null/.test(screen) && /data-article-share=""/.test(screen) && /monthlyShare: raw === '' \? null : Number\(raw\)/.test(screen))
check('J21: …and repeats the server\'s own room rather than guessing it', /d\?\.maxShare/.test(screen) && /t\.shareTooLarge\.replace\('\{max\}', max\)/.test(screen))
check('J22: the list route tells the screen the split, and asks the rhythm about THIS website', /share: rhythm\.plan\.monthlyShare/.test(route) && /multiSite: rhythm\.plan\.multiSite/.test(route) && /projectId: auth\.project\.id/.test(route))
check('J23: the cycle projection follows the share, not a bare even split', /const shareFraction = rhythm\.plan && rhythm\.plan\.monthly > 0 \? rhythm\.plan\.monthlyForThisSite \/ rhythm\.plan\.monthly : 1 \/ queues/.test(route))
// J-MUT2: the field read inside the gate would never run for a paid plan, which
// is the only account that has anything to split.
check('J-MUT2: a share read inside the gate fails J16', (() => {
  const broken = patch.replace("if ('monthlyShare' in body) {", 'if (false) {')
  return broken.indexOf("if ('monthlyShare' in body) {") < 0
})())
for (const lang of ['he', 'en', 'es'] as const) {
  const dict = readFileSync(join(root, `lib/i18n/dashboard/${lang}.ts`), 'utf8')
  check(`J24-${lang}: the split's wording exists, and names the even split as the default`, /shareTitle: '/.test(dict) && /shareHelp: '[^']*\{left\}[^']*\{total\}[^']*\{max\}[^']*'/.test(dict) && /shareEven: '/.test(dict) && /shareTooLarge: '[^']*\{max\}[^']*'/.test(dict))
}

runner().then(() => shares()).then(() => {
  console.log('Basic Nov:', basicNov.join(' '), '| Advanced Nov:', advNov.join(' '))
  console.log(`${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
})
export {}

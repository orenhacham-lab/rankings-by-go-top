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
  articlesPerWeekFor, weeklyRhythm, rhythmWeekdays, nextRhythmSlotAt, makeSlotAfter, localWeekday,
  slotFitsRhythm, projectPublishDates, spreadNextPublishAt, daySlotMinutes,
} from '@/lib/content/automation/schedule'
import { PLAN_CATALOG } from '@/lib/plans/catalog'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { readPublishRhythm } from '@/lib/content/automation/plan-rhythm'
import { runAutomation } from '@/lib/content/automation/runner'
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
check('A3: 50 → 13, 200 → 50', articlesPerWeekFor(50) === 13 && articlesPerWeekFor(200) === 50)
check('A4: an account allowance is shared by its active queues (50 over 2 → 6), never below 1', articlesPerWeekFor(50, 2) === 6 && articlesPerWeekFor(4, 9) === 1)
check('A5: no allowance → no rhythm', articlesPerWeekFor(0) === 0 && articlesPerWeekFor(NaN) === 0)

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
  check('G0: an Advanced account reads as 3 a week on Sun/Tue/Thu', r.plan?.perWeek === 3 && same(r.plan && rhythmWeekdays(r.plan.perDay), [0, 2, 4]) && !!r.allowance, r)
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
check('H4: the screen states the rhythm when the plan sets it and hides the day picker', /rhythm\?\.source === 'plan'/.test(screen) && /t\.planRhythmLineOne : t\.planRhythmLine\)/.test(screen) && /data-plan-rhythm="">\{rhythmLine\}</.test(screen) && /t\.noWeekendNote/.test(screen) && /\{!planRhythm && <Button[^\n]{0,60}saveSettings/.test(screen))
check('H5: the screen never offers Friday or Saturday', /WORKING_WEEKDAYS/.test(screen) && !/t\.weekdays\.map\(/.test(screen))
for (const lang of ['he', 'en'] as const) {
  const dict = readFileSync(join(root, `lib/i18n/dashboard/${lang}.ts`), 'utf8')
  check(`H6-${lang}: planRhythmLine + noWeekendNote exist`, /planRhythmLine: '[^']*\{n\}[^']*\{days\}[^']*'/.test(dict) && /noWeekendNote: '/.test(dict))
}
const he = readFileSync(join(root, 'lib/i18n/dashboard/he.ts'), 'utf8')
check('H7: the Hebrew line is Hebrew', /planRhythmLine: '[^']*מנוי[^']*'/.test(he) && /noWeekendNote: '[^']*שישי[^']*שבת[^']*'/.test(he))

runner().then(() => {
  console.log('Basic Nov:', basicNov.join(' '), '| Advanced Nov:', advNov.join(' '))
  console.log(`${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
})
export {}

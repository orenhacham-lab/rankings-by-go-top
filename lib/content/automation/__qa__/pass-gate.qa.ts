/**
 * QA — the hourly gate on /api/content/automation/cron.
 *
 * What is proved: one pass per window and no more, the window measured from the
 * claimed pass, Vercel's own scheduler never gated, fail-open on a database
 * error, and that the route actually calls the gate before doing any work.
 *
 * What is NOT proved: true concurrent-transaction safety. JS is single-threaded
 * and FakeAdmin is trivially atomic, so A3 shows the SHAPE of the claim (a
 * conditional UPDATE, never read-then-write) rather than Postgres's guarantee.
 * The guarantee comes from the single UPDATE statement with its WHERE, which
 * needs a live database to demonstrate.
 */
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import {
  claimAutomationPass,
  isUngatedScheduler,
  MIN_PASS_INTERVAL_MS,
  AUTOMATION_PASS_KEY,
} from '@/lib/content/automation/pass-gate'
import { readFileSync } from 'node:fs'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  PASS ${name}`) }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Admin = Parameters<typeof claimAutomationPass>[0]
const T0 = Date.parse('2026-11-17T12:00:00.000Z')
const gateAt = (iso: string) => ({ cron_pass_gate: [{ key: AUTOMATION_PASS_KEY, last_started_at: iso }] })

async function main() {
  console.log('A. The claim')

  {
    const admin = new FakeAdmin(gateAt('1970-01-01T00:00:00.000Z'))
    const r = await claimAutomationPass(admin as unknown as Admin, { nowMs: T0 })
    check('A1 a stale row is claimed', r.granted && r.reason === 'claimed', JSON.stringify(r))
    const row = admin.tables.cron_pass_gate[0] as { last_started_at: string }
    check('A1b the claim writes this pass\'s time', Date.parse(row.last_started_at) === T0, row.last_started_at)
  }

  {
    const admin = new FakeAdmin(gateAt(new Date(T0 - 20 * 60_000).toISOString()))
    const r = await claimAutomationPass(admin as unknown as Admin, { nowMs: T0 })
    check('A2 a pass 20 minutes old refuses the next caller', !r.granted && r.reason === 'too_soon', JSON.stringify(r))
    check('A2b the refusal reports the age', r.sinceLastMs === 20 * 60_000, String(r.sinceLastMs))
    const row = admin.tables.cron_pass_gate[0] as { last_started_at: string }
    check('A2c a refused call does NOT move the window', Date.parse(row.last_started_at) === T0 - 20 * 60_000, row.last_started_at)
  }

  {
    // Four quarter-hour callers across one hour: exactly one may run.
    const admin = new FakeAdmin(gateAt('1970-01-01T00:00:00.000Z'))
    const grants: boolean[] = []
    for (const minute of [0, 15, 30, 45]) {
      const r = await claimAutomationPass(admin as unknown as Admin, { nowMs: T0 + minute * 60_000 })
      grants.push(r.granted)
    }
    check('A3 one pass an hour from a quarter-hour caller', JSON.stringify(grants) === JSON.stringify([true, false, false, false]), JSON.stringify(grants))
    const next = await claimAutomationPass(admin as unknown as Admin, { nowMs: T0 + 60 * 60_000 })
    check('A3b the next hour is granted again', next.granted, JSON.stringify(next))
  }

  {
    // 50 minutes, not 60: an hourly scheduler drifting a minute early must not be refused.
    const admin = new FakeAdmin(gateAt(new Date(T0 - 59 * 60_000).toISOString()))
    const r = await claimAutomationPass(admin as unknown as Admin, { nowMs: T0 })
    check('A4 a scheduler a minute early is still granted', r.granted, JSON.stringify(r))
    check('A4b the interval is 50 minutes', MIN_PASS_INTERVAL_MS === 50 * 60_000, String(MIN_PASS_INTERVAL_MS))
  }

  {
    const admin = new FakeAdmin(gateAt(new Date(T0 - 49 * 60_000).toISOString()))
    const r = await claimAutomationPass(admin as unknown as Admin, { nowMs: T0 })
    check('A5 a pass 49 minutes old still holds the window', !r.granted, JSON.stringify(r))
  }

  {
    const admin = new FakeAdmin({ cron_pass_gate: [] })
    const r = await claimAutomationPass(admin as unknown as Admin, { nowMs: T0 })
    check('A6 the first ever call creates the row and runs', r.granted && r.reason === 'first', JSON.stringify(r))
    const second = await claimAutomationPass(admin as unknown as Admin, { nowMs: T0 + 60_000 })
    check('A6b and the next call a minute later is refused', !second.granted, JSON.stringify(second))
  }

  {
    const admin = new FakeAdmin(gateAt('1970-01-01T00:00:00.000Z'))
    const r = await claimAutomationPass(admin as unknown as Admin, { nowMs: T0, intervalMs: 5 * 60_000 })
    check('A7 the interval is overridable for a caller that needs another rate', r.granted, JSON.stringify(r))
  }

  console.log('B. It fails OPEN')

  {
    const admin = new FakeAdmin(gateAt(new Date(T0 - 60_000).toISOString()), { cron_pass_gate: { update: () => ({ message: 'connection reset' }) } })
    const r = await claimAutomationPass(admin as unknown as Admin, { nowMs: T0 })
    check('B1 a failed UPDATE runs the pass anyway', r.granted && r.reason === 'error', JSON.stringify(r))
  }

  {
    const admin = new FakeAdmin(gateAt(new Date(T0 - 60_000).toISOString()), { cron_pass_gate: { select: () => ({ message: 'timeout' }) } })
    const r = await claimAutomationPass(admin as unknown as Admin, { nowMs: T0 })
    check('B2 a failed SELECT runs the pass anyway', r.granted && r.reason === 'error', JSON.stringify(r))
  }

  {
    const thrower = { from() { throw new Error('no client') } }
    const r = await claimAutomationPass(thrower as unknown as Admin, { nowMs: T0 })
    check('B3 a thrown client runs the pass anyway and never rejects', r.granted && r.reason === 'error', JSON.stringify(r))
  }

  console.log('C. Vercel\'s own scheduler is never gated')

  {
    const ua = (v: string) => new Request('https://x/api/content/automation/cron', { headers: { 'user-agent': v } })
    check('C1 vercel-cron is ungated', isUngatedScheduler(ua('vercel-cron/1.0')))
    check('C2 the match ignores case', isUngatedScheduler(ua('Vercel-Cron/1.0')))
    check('C3 cron-job.org is gated', !isUngatedScheduler(ua('cron-job.org')))
    check('C4 a missing user agent is gated', !isUngatedScheduler(new Request('https://x/api/content/automation/cron')))
    check('C5 a user agent merely containing the word is gated', !isUngatedScheduler(ua('curl vercel-cron')))
  }

  console.log('D. The route uses it')

  {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const route = strip(readFileSync('app/api/content/automation/cron/route.ts', 'utf8'))
    check('D1 the route imports the gate', /claimAutomationPass/.test(route) && /isUngatedScheduler/.test(route))
    const claimAt = route.indexOf('claimAutomationPass(')
    const afterAt = route.indexOf('after(async')
    check('D2 the claim happens BEFORE any work is scheduled', claimAt > 0 && afterAt > 0 && claimAt < afterAt, `claim ${claimAt}, after ${afterAt}`)
    const authAt = route.indexOf('authorizeCronRequest')
    check('D3 and AFTER the secret is checked, so an unauthorized call cannot move the window', authAt > 0 && authAt < claimAt, `auth ${authAt}, claim ${claimAt}`)
    check('D4 a skipped call answers 202 and does NOT claim to have accepted the work', /skipped: claim\.reason[\s\S]{0,60}status: 202/.test(route) && !/accepted: true, skipped/.test(route))
    check('D5 the gate is skipped for the ungated scheduler', /if \(!isUngatedScheduler\(request\)\)/.test(route))
  }

  console.log('E. The migration')

  {
    const sql = readFileSync('supabase/migrations/20261117170000_cron_pass_gate.sql', 'utf8')
    check('E1 the table is created', /create table if not exists public\.cron_pass_gate/.test(sql))
    check('E2 key is the primary key, so a concurrent insert cannot double', /key text primary key/.test(sql))
    check('E3 RLS is enabled', /enable row level security/.test(sql))
    check('E4 and no policy is granted to any browser role', !/create policy/i.test(sql))
    check('E5 the automation row is seeded eligible', /values \('automation', 'epoch'\)/.test(sql) && /on conflict \(key\) do nothing/.test(sql))
  }

}

main().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
})

export {}

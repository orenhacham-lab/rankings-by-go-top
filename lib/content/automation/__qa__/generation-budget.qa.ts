/**
 * One pool that cannot generate must not stop every other pool.
 *
 * The runner allows one article generation per run. In production a trial
 * pool with no allowance left answered `quota_exceeded` on every run, came
 * first, took the one slot, and from 7 to 11 October 2026 no other pool got an
 * article written, so nothing published in any project. An attempt that stops
 * before the writer is called now leaves the budget for the next pool.
 *
 * Run: npx tsx lib/content/automation/__qa__/generation-budget.qa.ts
 */
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { runAutomation, spentGenerationBudget, rotateForRun } from '@/lib/content/automation/runner'
import { findStalledPools, buildStallAlertHtml, checkPublishingStalls, isDailyStallCheckRun } from '@/lib/content/automation/stall-watch'
import type { generatePoolItem } from '@/lib/content/automation/generate-item'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const PAST = new Date(Date.now() - 3_600_000).toISOString()
const RUN = 15 * 60 * 1000
/** A run time at which the rotation starts at the first pool by id. */
const firstRunFor = (n: number) => { const r = Math.floor(Date.now() / RUN); return (r - (r % n) + n) * RUN }
const pool = (id: string) => ({ id, project_id: `project-${id}`, is_active: true, cadence: 'weekly', interval_days: 7, publish_time: '09:00', timezone: 'UTC', next_publish_at: PAST, publish_days: [] })
const item = (poolId: string) => ({ id: `item-${poolId}`, pool_id: poolId, project_id: `project-${poolId}`, topic_id: `topic-${poolId}`, status: 'queued', article_id: null, attempts: 0, position: 1, locked_at: null })

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const l = console.log, e = console.error, w = console.warn
  console.log = () => {}; console.error = () => {}; console.warn = () => {}
  try { return await fn() } finally { console.log = l; console.error = e; console.warn = w }
}

/** A writer stand-in: the listed pools are out of allowance, the rest write. */
function fakeGenerate(blocked: Set<string>, reason = 'quota_exceeded') {
  const calls: string[] = []
  const wrote: string[] = []
  const fn = (async (_admin: Admin, itemId: string) => {
    const poolId = itemId.replace(/^item-/, '')
    calls.push(poolId)
    if (blocked.has(poolId)) return { itemId, status: 'queued', articleId: null, reason }
    wrote.push(poolId)
    return { itemId, status: 'generated', articleId: `article-${poolId}` }
  }) as typeof generatePoolItem
  return { fn, calls, wrote }
}

async function main() {
  console.log('1) the pure rule')
  check('a written article spends the budget', spentGenerationBudget({}))
  check('a failed write spends it too (the writer ran)', spentGenerationBudget({ reason: 'gemini_timeout' }))
  for (const r of ['quota_exceeded', 'billing_required', 'entitlement_unavailable', 'usage_period_unavailable', 'generation_in_progress', 'reservation_error']) {
    check(`${r} does not spend it`, !spentGenerationBudget({ reason: r }))
  }
  check('a no-op does not spend it', !spentGenerationBudget({ noop: 'already_claimed' }) && !spentGenerationBudget({ noop: 'max_attempts' }))

  console.log('2) production shape: the out-of-allowance pool comes first')
  {
    const pools = [pool('a-trial-spent'), pool('b-shop'), pool('c-shop')]
    const admin = new FakeAdmin({ article_pools: pools, article_pool_items: pools.map((p) => item(p.id)) })
    const g = fakeGenerate(new Set(['a-trial-spent']))
    await quiet(() => runAutomation(admin as unknown as Admin, { generate: g.fn, nowMs: firstRunFor(pools.length) }))
    check('the blocked pool was tried', g.calls[0] === 'a-trial-spent', g.calls)
    check('the next pool still got its article written', g.wrote[0] === 'b-shop', g.wrote)
    check('the budget still caps real writes at one per run', g.wrote.length === 1, g.wrote)
  }

  console.log('3) several blocked pools in a row, any reason that stops before the writer')
  for (const reason of ['quota_exceeded', 'billing_required', 'entitlement_unavailable']) {
    const pools = [pool('x1'), pool('x2'), pool('x3'), pool('y-ok')]
    const admin = new FakeAdmin({ article_pools: pools, article_pool_items: pools.map((p) => item(p.id)) })
    const g = fakeGenerate(new Set(['x1', 'x2', 'x3']), reason)
    await quiet(() => runAutomation(admin as unknown as Admin, { generate: g.fn, nowMs: firstRunFor(pools.length) }))
    check(`${reason}: the fourth pool still writes`, g.wrote.length === 1 && g.wrote[0] === 'y-ok', g)
  }

  console.log('4) a real write still ends the run\'s generations')
  {
    const pools = [pool('a'), pool('b')]
    const admin = new FakeAdmin({ article_pools: pools, article_pool_items: pools.map((p) => item(p.id)) })
    const g = fakeGenerate(new Set())
    await quiet(() => runAutomation(admin as unknown as Admin, { generate: g.fn, nowMs: firstRunFor(pools.length) }))
    check('only the first pool was written', g.calls.length === 1 && g.wrote[0] === 'a', g)
  }

  console.log('5) the walk order rotates, so no pool is first forever')
  {
    const ids = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id }))
    const base = firstRunFor(4)
    const firsts = [0, 1, 2, 3].map((i) => rotateForRun(ids, base + i * RUN)[0].id)
    check('four runs, four different pools first', new Set(firsts).size === 4, firsts)
    check('every run still walks every pool once', rotateForRun(ids, base + RUN).map((p) => p.id).sort().join() === 'p1,p2,p3,p4')
    check('the order does not depend on how the database returned the rows', rotateForRun([...ids].reverse(), base)[0].id === rotateForRun(ids, base)[0].id)
    // A pool whose writer keeps failing (so it DOES spend the budget) and comes first by id.
    const pools = [pool('a-times-out'), pool('b-shop'), pool('c-shop')]
    const wrote = new Set<string>()
    for (let i = 0; i < 3; i++) {
      const admin = new FakeAdmin({ article_pools: pools, article_pool_items: pools.map((p) => item(p.id)) })
      const g = fakeGenerate(new Set(['a-times-out']), 'gemini_timeout')
      await quiet(() => runAutomation(admin as unknown as Admin, { generate: g.fn, nowMs: firstRunFor(3) + i * RUN }))
      g.wrote.forEach((w) => wrote.add(w))
    }
    check('a pool whose writer keeps failing still lets both others write within three runs', wrote.has('b-shop') && wrote.has('c-shop'), [...wrote])
  }

  console.log('6) the daily stall check')
  {
    const now = Date.parse('2026-10-11T07:00:00Z')
    const P = (id: string, next: string) => ({ id, project_id: `pr-${id}`, next_publish_at: next })
    const I = (pool_id: string, status: string, last_error: string | null = null) => ({ pool_id, status, last_error, position: 1 })
    const names = new Map([['pr-late', 'מטלון'], ['pr-held', 'arcmedia']])
    const pools = [P('late', '2026-10-08T06:00:00Z'), P('held', '2026-10-07T06:00:00Z'), P('fresh', '2026-10-11T06:00:00Z'), P('empty', '2026-10-01T06:00:00Z')]
    const items = [I('late', 'queued'), I('held', 'queued', 'quota_exceeded'), I('fresh', 'queued')]
    const st = findStalledPools(pools, items, names, now)
    check('a queue three days late with work in it is stalled', st.length === 1 && st[0].projectName === 'מטלון' && st[0].overdueHours === 73, st)
    check('a queue held by its owner\'s allowance is not', !st.some((s) => s.poolId === 'held'))
    check('a slot missed by an hour is not, nor a queue with nothing in it', !st.some((s) => s.poolId === 'fresh' || s.poolId === 'empty'))
    const html = buildStallAlertHtml([{ poolId: 'x', projectName: '<b>x</b>', overdueHours: 73 }])
    check('the email escapes project names and states the delay', html.includes('&lt;b&gt;') && html.includes('3 ימים ו-1 שעות'), html)

    const sent: string[] = []
    const send = async (m: { subject: string }) => { sent.push(m.subject); return { ok: true } }
    const env = { RESEND_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv
    const world = new FakeAdmin({
      article_pools: [{ ...P('late', '2026-10-08T06:00:00Z'), is_active: true }, { ...P('ok', '2026-10-12T06:00:00Z'), is_active: true }],
      article_pool_items: [{ id: 'i1', ...I('late', 'queued') }, { id: 'i2', ...I('ok', 'queued') }],
      projects: [{ id: 'pr-late', name: 'מטלון' }, { id: 'pr-ok', name: 'ok' }],
    })
    const r = await quiet(() => checkPublishingStalls(world as unknown as Admin, { nowMs: now, deps: { env, send } }))
    check('the check emails the operator once, naming the count', sent.length === 1 && sent[0].includes('1') && r.alert?.sent === true, [sent, r])
    const calm = new FakeAdmin({ article_pools: [{ ...P('ok', '2026-10-12T06:00:00Z'), is_active: true }], article_pool_items: [], projects: [] })
    sent.length = 0
    await quiet(() => checkPublishingStalls(calm as unknown as Admin, { nowMs: now, deps: { env, send } }))
    check('nothing late, no email', sent.length === 0)
    check('only the Vercel cron\'s call runs the daily check', isDailyStallCheckRun(new Request('http://x', { headers: { 'user-agent': 'vercel-cron/1.0' } })) && !isDailyStallCheckRun(new Request('http://x', { headers: { 'user-agent': 'cron-job.org' } })))
  }

  console.log('7) the cron route wires the check after the runner')
  {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('app/api/content/automation/cron/route.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const run = src.indexOf('runAutomation(createAdminClient()'), chk = src.indexOf('checkPublishingStalls(createAdminClient())')
    check('checkPublishingStalls is called inside after(), behind the daily gate, after the runner', run > 0 && chk > run && /if \(dailyStallCheck\) await checkPublishingStalls/.test(src) && /const dailyStallCheck = isDailyStallCheckRun\(request\)/.test(src))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
export {}

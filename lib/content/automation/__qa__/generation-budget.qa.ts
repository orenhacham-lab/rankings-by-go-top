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
import { runAutomation, spentGenerationBudget } from '@/lib/content/automation/runner'
import type { generatePoolItem } from '@/lib/content/automation/generate-item'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const PAST = new Date(Date.now() - 3_600_000).toISOString()
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
    const pools = [pool('trial-spent'), pool('shop-a'), pool('shop-b')]
    const admin = new FakeAdmin({ article_pools: pools, article_pool_items: pools.map((p) => item(p.id)) })
    const g = fakeGenerate(new Set(['trial-spent']))
    await quiet(() => runAutomation(admin as unknown as Admin, { generate: g.fn }))
    check('the blocked pool was tried', g.calls[0] === 'trial-spent', g.calls)
    check('the next pool still got its article written', g.wrote[0] === 'shop-a', g.wrote)
    check('the budget still caps real writes at one per run', g.wrote.length === 1, g.wrote)
  }

  console.log('3) several blocked pools in a row, any reason that stops before the writer')
  for (const reason of ['quota_exceeded', 'billing_required', 'entitlement_unavailable']) {
    const pools = [pool('x1'), pool('x2'), pool('x3'), pool('ok')]
    const admin = new FakeAdmin({ article_pools: pools, article_pool_items: pools.map((p) => item(p.id)) })
    const g = fakeGenerate(new Set(['x1', 'x2', 'x3']), reason)
    await quiet(() => runAutomation(admin as unknown as Admin, { generate: g.fn }))
    check(`${reason}: the fourth pool still writes`, g.wrote.length === 1 && g.wrote[0] === 'ok', g)
  }

  console.log('4) a real write still ends the run\'s generations')
  {
    const pools = [pool('a'), pool('b')]
    const admin = new FakeAdmin({ article_pools: pools, article_pool_items: pools.map((p) => item(p.id)) })
    const g = fakeGenerate(new Set())
    await quiet(() => runAutomation(admin as unknown as Admin, { generate: g.fn }))
    check('only the first pool was written', g.calls.length === 1 && g.wrote[0] === 'a', g)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
export {}

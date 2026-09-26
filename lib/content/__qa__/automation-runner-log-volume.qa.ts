/**
 * The automation runner logs one line per pool ONLY when it acted on the pool
 * (a generation or publish attempt) or the pool failed; idle pools are counted
 * in a single summary line.
 *
 * Why: cron-job.org calls the runner every 15 minutes and it walks every
 * active pool. With 21 pools, each run wrote 21 "[automation-runner] pool"
 * lines that almost always said "nothing to do", so a one-hour Vercel log read
 * came back at ~67k characters and hid the lines that mattered.
 *
 * Run: npx tsx lib/content/__qa__/automation-runner-log-volume.qa.ts
 */
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { runAutomation } from '../automation/runner'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const FUTURE = new Date(Date.now() + 86_400_000).toISOString()
const PAST = new Date(Date.now() - 3_600_000).toISOString()

function pool(id: string, nextPublishAt: string) {
  return { id, project_id: `project-${id}`, is_active: true, cadence: 'weekly', interval_days: 7, publish_time: '09:00', timezone: 'UTC', next_publish_at: nextPublishAt, publish_days: [] }
}
function item(id: string, poolId: string, status: string) {
  return { id, pool_id: poolId, project_id: `project-${poolId}`, topic_id: null, status, article_id: null, attempts: 0, position: 1, locked_at: null }
}

/** Run with console.log captured; returns the runner's own lines. */
async function captured(fn: () => Promise<unknown>): Promise<{ lines: { tag: string; data: unknown }[]; result: unknown }> {
  const orig = console.log
  const lines: { tag: string; data: unknown }[] = []
  console.log = (tag: unknown, data?: unknown) => { if (typeof tag === 'string' && tag.startsWith('[automation-runner]')) lines.push({ tag, data }) }
  try { return { lines, result: await fn() } } finally { console.log = orig }
}

async function main() {
  console.log('1) 20 idle pools → no per-pool lines, one idle summary line')
  {
    // 19 pools not due with one ready item each (nothing to generate or publish),
    // 1 pool due with no items at all (skipped, nothing attempted).
    const pools = Array.from({ length: 19 }, (_, i) => pool(`idle-${i}`, FUTURE)).concat(pool('due-empty', PAST))
    const items = pools.filter((p) => p.id !== 'due-empty').map((p) => item(`item-${p.id}`, p.id, 'generated'))
    const admin = new FakeAdmin({ article_pools: pools, article_pool_items: items })
    const { lines, result } = await captured(() => runAutomation(admin as unknown as Admin))
    const perPool = lines.filter((l) => l.tag === '[automation-runner] pool')
    const idle = lines.filter((l) => l.tag === '[automation-runner] idle pools')
    const summary = result as { poolsChecked: number; diagnostics: unknown[] }
    check('all 20 pools were still checked', summary.poolsChecked === 20, `poolsChecked=${summary.poolsChecked}`)
    check('…and every pool still has a diagnostic in the returned summary', summary.diagnostics.length === 20, `diagnostics=${summary.diagnostics.length}`)
    check('no per-pool log line for idle pools', perPool.length === 0, `got ${perPool.length}`)
    check('exactly one idle summary line', idle.length === 1, `got ${idle.length}`)
    const data = idle[0]?.data as { count?: number; byNote?: Record<string, number> } | undefined
    check('…counting all 20 pools', data?.count === 20, JSON.stringify(data))
    check('…with the due-but-empty pool named by its note', data?.byNote?.due_but_no_queued_items === 1, JSON.stringify(data))
  }

  console.log('2) a pool the runner acts on is still logged individually')
  {
    // Not due, zero ready items, one queued item → the runner attempts a generation.
    const pools = [pool('acting', FUTURE), pool('idle', FUTURE)]
    const items = [item('q-1', 'acting', 'queued'), item('g-1', 'idle', 'generated')]
    const admin = new FakeAdmin({ article_pools: pools, article_pool_items: items })
    const { lines, result } = await captured(() => runAutomation(admin as unknown as Admin))
    const perPool = lines.filter((l) => l.tag === '[automation-runner] pool')
    const diag = (result as { diagnostics: { poolId: string; generateAttempted: boolean }[] }).diagnostics.find((d) => d.poolId === 'acting')
    check('the runner did attempt a generation on the acting pool', diag?.generateAttempted === true, JSON.stringify(diag))
    check('one per-pool line, for that pool', perPool.length === 1 && (perPool[0].data as { poolId?: string }).poolId === 'acting', JSON.stringify(perPool.map((l) => l.data)))
    const idle = lines.find((l) => l.tag === '[automation-runner] idle pools')?.data as { count?: number } | undefined
    check('the other pool is counted as idle', idle?.count === 1, JSON.stringify(idle))
  }

  console.log('3) a dry run writes no runner log lines (unchanged behaviour)')
  {
    const admin = new FakeAdmin({ article_pools: [pool('p', FUTURE)], article_pool_items: [] })
    const { lines } = await captured(() => runAutomation(admin as unknown as Admin, { dryRun: true }))
    check('no lines', lines.length === 0, JSON.stringify(lines))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
export {}

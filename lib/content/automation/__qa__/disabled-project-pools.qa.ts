/**
 * A POOL OF A DISABLED PROJECT NEVER PUBLISHES — AND EVERY OTHER POOL IS UNTOUCHED.
 *
 * The runner selected pools by `article_pools.is_active` alone, while the switch
 * the owner actually uses to put a site on hold sets `is_active` on the PROJECT.
 *
 * MEASURED IN PRODUCTION 21 Nov 2026: 29 pools are active, but only 23 belong to
 * an active project. Three of the other six still hold 21 queued items, two of
 * them past their publish date — "מספר 1 בניקיון" due 5 Oct with 5 queued, and
 * "gotopseo.com" due 17 Nov with 9. Nothing published from them, but only because
 * other gates (an expired trial, no connected platform) happen to stop them
 * first. That is luck, not a rule.
 *
 * THE GUARD THAT MATTERS MOST IS B1: a pool whose project is active publishes
 * exactly as it did before this check existed. The runner is what customers are
 * paying for, so a guard here is only allowed to subtract the disabled.
 *
 * It FAILS OPEN on purpose: a NULL, a missing project row and a failed read all
 * keep publishing. A guard must never be the reason an article does not go out.
 *
 * Run: npx tsx lib/content/automation/__qa__/disabled-project-pools.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { runAutomation, readDisabledProjects } from '@/lib/content/automation/runner'
import { localWeekday, isNoPublishWeekday } from '@/lib/content/automation/schedule'
import type { generatePoolItem } from '@/lib/content/automation/generate-item'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const RUN = 15 * 60 * 1000
const firstRunFor = (n: number) => { const r = Math.floor(Date.now() / RUN); return (r - (r % n) + n) * RUN }
/** A run slot on a day the runner publishes on, with a due anchor an hour back. */
const duePublishDayRun = (n: number) => {
  const publishes = (ms: number) => !isNoPublishWeekday(localWeekday(ms, 'UTC'))
  let nowMs = firstRunFor(n)
  while (!publishes(nowMs) || !publishes(nowMs - 3_600_000)) nowMs += 24 * 60 * 60 * 1000
  return { nowMs, anchorIso: new Date(nowMs - 3_600_000).toISOString() }
}

const pool = (id: string, nextPublishAt: string) => ({
  id, project_id: `project-${id}`, is_active: true, cadence: 'weekly', interval_days: 7,
  publish_time: '09:00', timezone: 'UTC', next_publish_at: nextPublishAt, publish_days: [],
})
/** A queued item, ready for the writer. */
const item = (poolId: string) => ({
  id: `item-${poolId}`, pool_id: poolId, project_id: `project-${poolId}`, topic_id: `topic-${poolId}`,
  status: 'queued', article_id: null, attempts: 0, position: 1, locked_at: null,
})
const project = (poolId: string, isActive: boolean | null) => ({ id: `project-${poolId}`, is_active: isActive })

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const l = console.log, e = console.error, w = console.warn
  console.log = () => {}; console.error = () => {}; console.warn = () => {}
  try { return await fn() } finally { console.log = l; console.error = e; console.warn = w }
}

function fakeGenerate() {
  const calls: string[] = []
  const fn = (async (_admin: Admin, itemId: string) => {
    const poolId = itemId.replace(/^item-/, '')
    calls.push(poolId)
    return { itemId, status: 'generated', articleId: `article-${poolId}` }
  }) as typeof generatePoolItem
  return { fn, calls }
}
const connected = async () => ({ platform: 'wordpress' })

/** One run over the given pools, returning which pools the writer was called for. */
async function run(pools: ReturnType<typeof pool>[], projects: ReturnType<typeof project>[], nowMs: number, opts: Record<string, unknown> = {}) {
  const admin = new FakeAdmin({
    article_pools: pools,
    article_pool_items: pools.map((p) => item(p.id)),
    projects,
  })
  const g = fakeGenerate()
  const summary = await quiet(() => runAutomation(admin as unknown as Admin, { generate: g.fn, platform: connected, nowMs, ...opts }))
  return { summary, touched: g.calls, admin }
}

async function main() {
  console.log('A) the pure read')
  {
    const admin = new FakeAdmin({ projects: [project('a', false), project('b', true), project('c', null)] })
    const off = await readDisabledProjects(admin as unknown as Admin, ['project-a', 'project-b', 'project-c'])
    check('A1 an explicitly disabled project is reported', off.has('project-a'))
    check('A2 an active one is not', !off.has('project-b'))
    check('A3 a NULL is NOT treated as disabled', !off.has('project-c'), [...off])
    check('A4 a project that has no row at all is not treated as disabled',
      !(await readDisabledProjects(admin as unknown as Admin, ['project-missing'])).has('project-missing'))
    check('A5 no ids, no read', (await readDisabledProjects(admin as unknown as Admin, [])).size === 0)
    // FAIL OPEN: a broken client must answer "nothing is disabled".
    const broken = { from: () => { throw new Error('db down') } }
    check('A6 FAILS OPEN: a throwing client reports nothing disabled',
      (await readDisabledProjects(broken as unknown as Admin, ['project-a'])).size === 0)
    const erroring = { from: () => ({ select: () => ({ in: () => ({ eq: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }
    check('A7 FAILS OPEN: an error response reports nothing disabled',
      (await readDisabledProjects(erroring as unknown as Admin, ['project-a'])).size === 0)
  }

  console.log('\nB) the runner — THE NO-REGRESSION GUARD FIRST')
  {
    const { nowMs, anchorIso } = duePublishDayRun(2)
    const pools = [pool('a-on', anchorIso), pool('b-off', anchorIso)]
    const r = await run(pools, [project('a-on', true), project('b-off', false)], nowMs)
    check('B1 THE NO-REGRESSION GUARD: the active project\'s pool is still written for',
      r.touched.includes('a-on'), r.touched)
    check('B2 the disabled project\'s pool is not touched at all', !r.touched.includes('b-off'), r.touched)
    check('B3 and it is not even counted as a pool that was checked',
      r.summary.poolsChecked === 1, r.summary.poolsChecked)
    check('B4 no diagnostic was written for it either',
      !r.summary.diagnostics.some((d) => d.poolId === 'b-off'), r.summary.diagnostics.map((d) => d.poolId))
  }
  {
    // THE CONTROL FOR B2: the same disabled pool, with its project ACTIVE, IS
    // written for. Without this, B2 could pass because the fixture was never
    // publishable in the first place.
    const { nowMs, anchorIso } = duePublishDayRun(2)
    const pools = [pool('a-on', anchorIso), pool('b-off', anchorIso)]
    const r = await run(pools, [project('a-on', true), project('b-off', true)], nowMs)
    check('B5 CONTROL: with the project active, that very pool IS written for',
      r.touched.includes('b-off') || r.summary.poolsChecked === 2, { touched: r.touched, checked: r.summary.poolsChecked })
  }

  console.log('\nC) fail open, end to end')
  {
    const { nowMs, anchorIso } = duePublishDayRun(1)
    const r = await run([pool('a-null', anchorIso)], [project('a-null', null)], nowMs)
    check('C1 a NULL project keeps publishing', r.summary.poolsChecked === 1 && r.touched.includes('a-null'), r.touched)
  }
  {
    const { nowMs, anchorIso } = duePublishDayRun(1)
    const r = await run([pool('a-orphan', anchorIso)], [], nowMs)
    check('C2 a pool with no project row keeps publishing', r.summary.poolsChecked === 1 && r.touched.includes('a-orphan'), r.touched)
  }

  console.log('\nD) the single-project diagnostic says the right thing')
  {
    const { nowMs, anchorIso } = duePublishDayRun(1)
    const r = await run([pool('a-off', anchorIso)], [project('a-off', false)], nowMs, { projectId: 'project-a-off' })
    const notes = r.summary.diagnostics.map((d) => d.note)
    check('D1 it reports the project as disabled, not as "no active pool"',
      notes.includes('project_disabled') && !notes.includes('no_active_pool_for_project'), notes)
  }
  {
    const { nowMs } = duePublishDayRun(1)
    const r = await run([], [], nowMs, { projectId: 'project-none' })
    check('D2 CONTROL: a project with genuinely no pool still says so',
      r.summary.diagnostics.map((d) => d.note).includes('no_active_pool_for_project'),
      r.summary.diagnostics.map((d) => d.note))
  }

  console.log('\nE) the source')
  {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const src = strip(readFileSync(join(process.cwd(), 'lib/content/automation/runner.ts'), 'utf8'))
    check('E1 the read asks only for an explicit false, so a NULL cannot come back',
      /\.eq\('is_active', false\)/.test(src))
    check('E2 both failure paths return an empty set', (src.match(/return new Set\(\)/g) ?? []).length >= 3)
    check('E3 the filter runs before the rotation, so the rotation cannot hand a run a disabled pool',
      /const ours = [\s\S]{0,400}?rotateForRun\(ours, nowMs\)/.test(src))
    check('E4 nothing else in the runner reads project activity, so there is one place to change',
      (src.match(/is_active/g) ?? []).length === 3, (src.match(/is_active/g) ?? []).length)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exitCode = 1
}

void main()

export {}

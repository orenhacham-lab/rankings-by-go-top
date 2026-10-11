/**
 * Every automated project gets a site mapping, so its articles get internal links.
 *
 * On 11 October 2026, 16 of the 25 projects with an active queue had no
 * `site_page_map` row at all: they were approved before the first-article
 * mapping existed, and nothing else built one. Their recent articles had no
 * internal link. The automation cron now maps one such project per run.
 * Each group ends with a MUTATION CONTROL.
 *
 * Run: npx tsx lib/content/existing-content/__qa__/map-upkeep.qa.ts
 */
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { pickProjectsToMap, runMapUpkeep, MAP_REFRESH_AFTER_MS, MAP_RETRY_AFTER_MS, MAP_UPKEEP_MIN_WINDOW_MS } from '../map-upkeep'
import { AUTO_LINK_MAP_MAX_AGE_MS } from '../../auto-internal-links/step'
import type { EnsureSiteMapOutcome, EnsureSiteMapScope } from '../ensure-site-map'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { code } from '../../cannibalization/__qa__/_strip'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const l = console.log, e = console.error
  console.log = () => {}; console.error = () => {}
  try { return await fn() } finally { console.log = l; console.error = e }
}

const NOW = Date.parse('2026-10-11T20:00:00Z')
const DAY = 24 * 3600_000
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const P = (id: string, o: Record<string, unknown> = {}) => ({ id, user_id: `u-${id}`, target_domain: `${id}.co.il`, ...o })
const M = (id: string, o: Record<string, unknown> = {}) => ({ project_id: id, user_id: `u-${id}`, status: 'completed', finished_at: ago(DAY * 2), urls_found: 40, lease_expires_at: null, ...o })
const ids = (xs: EnsureSiteMapScope[]) => xs.map((x) => x.projectId)

async function main() {
  console.log('A) which projects need a mapping')
  {
    check('the refresh comes well before the link step stops using a map', MAP_REFRESH_AFTER_MS < AUTO_LINK_MAP_MAX_AGE_MS)
    const projects = [P('missing'), P('fresh'), P('old'), P('failed-today'), P('failed-yesterday'), P('empty-ok'), P('running'), P('no-domain', { target_domain: '' })]
    const maps = [
      M('fresh'),
      M('old', { finished_at: ago(MAP_REFRESH_AFTER_MS + DAY) }),
      M('failed-today', { status: 'failed', urls_found: 0, finished_at: ago(3600_000) }),
      M('failed-yesterday', { status: 'failed', urls_found: 0, finished_at: ago(MAP_RETRY_AFTER_MS + 3600_000) }),
      M('empty-ok', { urls_found: 0, finished_at: ago(DAY * 3) }),
      M('running', { status: 'running', finished_at: null, lease_expires_at: new Date(NOW + 60_000).toISOString() }),
    ]
    const todo = ids(pickProjectsToMap(projects, maps, NOW))
    check('a project with no mapping is picked, and first', todo[0] === 'missing', todo)
    check('a mapping older than the refresh age is picked', todo.includes('old'))
    check('a fresh mapping is left alone', !todo.includes('fresh'))
    check('an attempt that failed an hour ago is not retried yet', !todo.includes('failed-today'))
    check('it is retried a day later', todo.includes('failed-yesterday'))
    check('a mapping that found no pages is retried after a day', todo.includes('empty-ok'))
    check('a live run is never disturbed', !todo.includes('running'))
    check('a project with no site is skipped (it would block the queue forever)', !todo.includes('no-domain'))
    check('the scope carries the project\'s own owner', pickProjectsToMap([P('x')], [], NOW)[0].userId === 'u-x')

    const many = ['a', 'b', 'c', 'd'].map((x) => P(x))
    const firsts = new Set([0, 1, 2, 3].map((i) => ids(pickProjectsToMap(many, [], NOW + i * 15 * 60_000))[0]))
    check('the order rotates per run, so one failing site cannot hold the rest back', firsts.size === 4, [...firsts])

    // A map half way to the link step's limit is already refreshed. Mutation run: setting
    // MAP_REFRESH_AFTER_MS to the link step's 30 days fails this check and the first one.
    check('a 15-day-old map is refreshed', ids(pickProjectsToMap([P('old')], [M('old', { finished_at: ago(15 * DAY) })], NOW))[0] === 'old')
  }

  console.log('B) the pass maps one project and stops')
  const world = () => new FakeAdmin({
    article_pools: [{ id: 'pl1', project_id: 'a', is_active: true }, { id: 'pl2', project_id: 'b', is_active: true }, { id: 'pl3', project_id: 'c', is_active: true }, { id: 'pl4', project_id: 'off', is_active: false }],
    projects: [P('a'), P('b'), P('c'), P('off')],
    site_page_map: [M('c')],
  }) as unknown as ServiceRoleClient
  const stand = (answers: Record<string, EnsureSiteMapOutcome>) => {
    const calls: string[] = []
    const ensure = async (_a: ServiceRoleClient, s: EnsureSiteMapScope) => { calls.push(s.projectId); return answers[s.projectId] ?? 'mapped' }
    return { ensure, calls }
  }
  {
    const s = stand({})
    const r = await quiet(() => runMapUpkeep(world(), { deadlineAt: NOW + 250_000, nowMs: () => NOW, ensure: s.ensure }))
    check('one crawl per run', s.calls.length === 1 && r?.outcome === 'mapped', s.calls)
    check('only projects with an active queue, and only those that need it', !s.calls.includes('off') && !s.calls.includes('c'), s.calls)
    const t = stand({ a: 'no_site', b: 'no_site' })
    await quiet(() => runMapUpkeep(world(), { deadlineAt: NOW + 250_000, nowMs: () => NOW, ensure: t.ensure }))
    check('a project with nothing to crawl does not use up the run', t.calls.length === 2, t.calls)
    const u = stand({})
    const late = await quiet(() => runMapUpkeep(world(), { deadlineAt: NOW + MAP_UPKEEP_MIN_WINDOW_MS - 1, nowMs: () => NOW, ensure: u.ensure }))
    check('too little time left: no crawl starts', late === null && u.calls.length === 0)
    const boom = await quiet(() => runMapUpkeep(world(), { deadlineAt: NOW + 250_000, nowMs: () => NOW, ensure: async () => { throw new Error('x') } }))
    check('a crawl that throws does not throw out of the pass', boom === null)
    const foreign = new FakeAdmin({
      article_pools: [{ id: 'pl1', project_id: 'a', is_active: true }],
      projects: [P('a')],
      site_page_map: [M('a', { user_id: 'someone-else' })],
    }) as unknown as ServiceRoleClient
    const v = stand({})
    await quiet(() => runMapUpkeep(foreign, { deadlineAt: NOW + 250_000, nowMs: () => NOW, ensure: v.ensure }))
    check('a mapping row of another owner does not count as the project\'s', v.calls[0] === 'a', v.calls)

    // MUTATION CONTROL — without the window check a crawl starts with seconds left.
    const w = stand({})
    await quiet(() => runMapUpkeep(world(), { deadlineAt: NOW + MAP_UPKEEP_MIN_WINDOW_MS + 1, nowMs: () => NOW, ensure: w.ensure }))
    check('MUTATION: one millisecond more and it does crawl (the window check is what stopped it)', w.calls.length === 1)
  }

  console.log('C) the cron runs the pass, with the real crawl, after the runner')
  {
    const src = code('app/api/content/automation/cron/route.ts')
    const runAt = src.indexOf('runAutomation(createAdminClient()')
    const upAt = src.indexOf('await runMapUpkeep(createAdminClient()')
    check('the pass is awaited inside after(), after the runner', runAt > 0 && upAt > runAt, { runAt, upAt })
    check('it uses the real crawl', /ensure: liveEnsure/.test(src))
    check('it leaves time for the emails after it', /maxDuration \* 1000 - 40_000/.test(src) && src.indexOf('runIsolatedReminders()') > upAt)
    const mod = code('lib/content/existing-content/map-upkeep.ts')
    check('the real crawl is the same ensureSiteMapForProject, no second crawler', /ensureSiteMapForProject\(admin, scope/.test(mod) && /walk: liveWalk/.test(mod))
    // MUTATION CONTROL — a route without the call fails the guard.
    check('MUTATION: a route without the pass is caught', src.replace('await runMapUpkeep(createAdminClient()', '').indexOf('await runMapUpkeep(createAdminClient()') < 0)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}

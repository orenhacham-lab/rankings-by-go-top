/**
 * Topic-row internal-link STATUS — truthful hydration (no false "missing").
 *
 * Proves: (1) the one-shot owner-scoped batch summary loader derives exists/linkCount/
 * approvedCount/stale from the latest active saved batch (so a full page refresh shows the
 * real "N מאושרים", not "add links"); (2) the primary one-click flow threads real counts
 * through onPlansSaved; (3) an unknown/not-yet-loaded status shows a NEUTRAL "checking"
 * state, never "missing". Uses a real in-memory Supabase-shaped fake for the loader.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadPlanSummariesForProject } from '../internal-link-plan-store'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')

// Minimal Supabase-shaped fake supporting select/eq/in/order + await (then).
function fakeAdmin(tables: Record<string, Record<string, unknown>[]>) {
  const from = (table: string) => {
    const eqs: [string, unknown][] = []
    const ins: [string, unknown[]][] = []
    const b: Record<string, unknown> = {}
    const exec = () => {
      const rows = (tables[table] ?? []).filter((r) => eqs.every(([k, v]) => r[k] === v) && ins.every(([k, vs]) => vs.includes(r[k] as never)))
      return { data: rows, error: null }
    }
    Object.assign(b, {
      select() { return b },
      eq(col: string, val: unknown) { eqs.push([col, val]); return b },
      in(col: string, vals: unknown[]) { ins.push([col, vals]); return b },
      order() { return b },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(exec()).then(res, rej) },
    })
    return b
  }
  return { from } as never
}

async function main() {
  console.log('HYDRATE) one-shot saved-plan summaries per topic (refresh-truthful, no N+1)')
  const tables = {
    article_internal_link_plan_batches: [
      // t1: latest active batch has 2 links; an older superseded batch is ignored.
      { id: 'b_old', project_id: 'p1', topic_id: 't1', link_count: 5, stale_at_creation: false, status: 'superseded', created_at: '2026-07-01' },
      { id: 'b1', project_id: 'p1', topic_id: 't1', link_count: 2, stale_at_creation: false, status: 'approved', created_at: '2026-07-08' },
      // t2: a saved ZERO-link batch (truthful "no suitable links", not "add links").
      { id: 'b2', project_id: 'p1', topic_id: 't2', link_count: 0, stale_at_creation: false, status: 'planned', created_at: '2026-07-08' },
      // t3: planned links, none approved yet + stale.
      { id: 'b3', project_id: 'p1', topic_id: 't3', link_count: 3, stale_at_creation: true, status: 'planned', created_at: '2026-07-08' },
      // other project — must not leak.
      { id: 'bX', project_id: 'pX', topic_id: 'tX', link_count: 9, stale_at_creation: false, status: 'approved', created_at: '2026-07-08' },
    ],
    article_internal_link_plan_links: [
      { id: 'l1', batch_id: 'b1', status: 'approved' },
      { id: 'l2', batch_id: 'b1', status: 'approved' },
      { id: 'l3', batch_id: 'b3', status: 'planned' }, // not approved
    ],
  }
  const sums = await loadPlanSummariesForProject(fakeAdmin(tables), 'p1')

  // B — the persisted plan hydrates in ONE batch and shows the real approved count.
  check('B. refresh hydration: t1 → exists, linkCount 2, approvedCount 2 (→ "2 מאושרים")',
    sums.t1?.exists === true && sums.t1?.linkCount === 2 && sums.t1?.approvedCount === 2 && sums.t1?.stale === false)
  // C — a saved zero-link plan is truthful (not "add links").
  check('C. saved zero-link plan → exists true, linkCount 0 (→ "אין קישורים מתאימים")',
    sums.t2?.exists === true && sums.t2?.linkCount === 0 && sums.t2?.approvedCount === 0)
  // planned-not-approved + stale.
  check('planned-not-approved + stale → linkCount 3, approvedCount 0, stale true',
    sums.t3?.linkCount === 3 && sums.t3?.approvedCount === 0 && sums.t3?.stale === true)
  // D — a topic with no saved batch has NO summary → the badge shows "add links".
  check('D. no saved batch → no summary key (badge shows "add links")', sums.t_none === undefined)
  // owner scope — another project never leaks in.
  check('owner-scoped: another project\'s batch never appears', sums.tX === undefined)
  // latest-active wins over a superseded older batch.
  check('latest ACTIVE batch wins (superseded ignored)', sums.t1?.linkCount === 2)

  console.log('GUARD) counts threaded through onPlansSaved + neutral checking state + route')
  {
    const ideas = read('../../../components/content/AutomationIdeas.tsx')
    check('A. onPlansSaved carries the REAL summary (approvedCount + stale), not just linkCount',
      /onPlansSaved\?: \(plans: \{ topicId: string; exists: boolean; linkCount: number; approvedCount: number; stale: boolean \}/.test(ideas) && /out\.summaries\.push\(\{ topicId: id, exists: true, linkCount: r\?\.linkCount/.test(ideas) && /onPlansSaved\?\.\(planSummaries\)/.test(ideas))
    const hub = read('../../../components/content/ContentHub.tsx')
    check('ContentHub seeds the REAL approvedCount/stale (never hardcoded 0)',
      /approvedCount: p\.approvedCount, stale: p\.stale/.test(hub) && !/approvedCount: 0, stale: false/.test(hub))
    check('ContentHub hydrates planStatus from the topics route on load/refresh (one-shot)',
      /json\.planStatus/.test(hub) && /planStatusLoading=\{topicsLoading\}/.test(hub))
    const route = read('../../../app/api/content/topics/route.ts')
    check('topics route returns planStatus in ONE owner-scoped batch (no N+1)',
      /loadPlanSummariesForProject\(auth\.admin, auth\.project\.id\)/.test(route) && /planStatus \}/.test(route))
    const badge = read('../../../components/content/TopicPlanBadge.tsx')
    check('unknown/loading status → NEUTRAL "checking" state, never "add links"',
      /if \(!summary && checking\)/.test(badge) && /t\.badgeChecking/.test(badge))
    const he = read('../../../lib/i18n/dashboard/he.ts'); const en = read('../../../lib/i18n/dashboard/en.ts')
    check('badgeChecking localized (he + en) + existing meanings preserved',
      /badgeChecking:/.test(he) && /badgeChecking:/.test(en) && /badgeAction:/.test(he) && /badgeZero:/.test(he) && /badgeApproved:/.test(he))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

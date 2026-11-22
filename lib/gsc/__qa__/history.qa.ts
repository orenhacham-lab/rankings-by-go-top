/**
 * THE COMPACT SEARCH CONSOLE HISTORY (stage 0 of the learning loop).
 *
 * Proves: the selector keeps only follow-worthy rows (position 1-30, 5+ impressions, at most
 * 2000, highest impressions first, deterministic); the sync archives ONLY the 28-day window,
 * ONLY after the run succeeded, and a history that cannot be written NEVER fails the sync or
 * changes what it stores; the store writes idempotently, scoped to the project, and trims by
 * retention; and source guards (each with a mutation control) pin the safety structure.
 *
 * Run: npx tsx lib/gsc/__qa__/history.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { executeManualSync, type SyncStore, type SyncClient, type PropertySummaryPatch } from '../sync'
import { makeSyncStore } from '../service'
import { selectHistoryRows, historyRetentionCutoff, HISTORY_MAX_ROWS_PER_SYNC, HISTORY_RETENTION_DAYS } from '../history'
import { FakeAdmin } from './_fake-admin'
import type { GscMetricRow } from '../summary'

let pass = 0, fail = 0
function check(name: string, cond: boolean) {
  if (cond) pass++
  else { fail++; console.log(`  ✗ ${name}`) }
}
const row = (query: string, page: string, impressions: number, position: number, clicks = 0): GscMetricRow => ({ query, page, impressions, position, clicks, ctr: 0 })

async function main() {
  // ── the selector ──────────────────────────────────────────────────────────
  const all = [
    row('a', '/1', 100, 3), row('b', '/2', 100, 30), row('c', '/3', 100, 30.01),
    row('d', '/4', 5, 12), row('e', '/5', 4, 12), row('f', '/6', 100, 0),
    row('g', '/7', 100, NaN), row('', '/8', 100, 10), row('h', '', 100, 10),
  ]
  const picked = selectHistoryRows(all).map((r) => r.query).sort()
  check('keeps position 1-30 with 5+ impressions', picked.join() === 'a,b,d')
  check('a page already at position 3 is kept (an improved page must stay visible)', picked.includes('a'))
  check('position 30 kept, 30.01 dropped', picked.includes('b') && !picked.includes('c'))
  check('4 impressions dropped, 5 kept', !picked.includes('e') && picked.includes('d'))
  check('position 0, NaN, empty query, empty page are dropped', !['f', 'g', 'h'].some((q) => picked.includes(q)) && selectHistoryRows([row('', '/8', 100, 10)]).length === 0)
  check('does not mutate its input', all.length === 9 && all[0].query === 'a')

  const big = Array.from({ length: HISTORY_MAX_ROWS_PER_SYNC + 500 }, (_, i) => row(`q${i}`, `/p${i}`, 10 + i, 10))
  const cut = selectHistoryRows(big)
  check('caps at the per-sync maximum', cut.length === HISTORY_MAX_ROWS_PER_SYNC)
  check('the cap keeps the highest impressions', cut[0].impressions === 10 + big.length - 1 && cut[cut.length - 1].impressions === 10 + big.length - HISTORY_MAX_ROWS_PER_SYNC)
  const ties = [row('b', '/x', 50, 10), row('a', '/y', 50, 10), row('a', '/x', 50, 10)]
  check('ties break by query then page, deterministically', selectHistoryRows(ties).map((r) => `${r.query}${r.page}`).join() === 'a/x,a/y,b/x' && selectHistoryRows([...ties].reverse()).map((r) => `${r.query}${r.page}`).join() === 'a/x,a/y,b/x')

  check('retention cutoff is 182 days before the window end', historyRetentionCutoff('2026-11-18') === '2026-05-20' && HISTORY_RETENTION_DAYS === 182)
  check('a malformed date gives no cutoff (nothing is deleted)', historyRetentionCutoff('not-a-date') === null && historyRetentionCutoff('2026-13-45') === null && historyRetentionCutoff('') === null)

  // ── the sync ──────────────────────────────────────────────────────────────
  const summary: PropertySummaryPatch = { clicks: 1, impressions: 1, ctr: 0, position: 1, aggregationType: 'byProperty', dataState: 'final', responseMetadata: {} }
  const rows = [row('q', '/p', 100, 8), row('far', '/f', 100, 60)]
  const client = (fail = false): SyncClient => ({
    probeLatestDate: async () => '2026-11-18',
    fetchWindow: async () => { if (fail) throw Object.assign(new Error('x'), { code: 'api_down' }); return { rows, apiBatches: 1, truncated: false } },
    fetchSummary: async () => summary,
  })
  class Store implements SyncStore {
    runs: { id: string; status: string }[] = []
    archives: { projectId: string; runId: string; windowDays: number; windowEnd: string; rows: GscMetricRow[] }[] = []
    order: string[] = []
    archiveThrows = false
    private n = 0
    async reclaimStaleRuns() { return 0 }
    async createRun() { const id = `run-${++this.n}`; this.runs.push({ id, status: 'running' }); return { id } }
    async insertMetricsBatch() { /* stored */ }
    async pruneSupersededMetrics() { this.order.push('prune'); return 0 }
    async finishRun(runId: string, patch: { status: string }) { this.order.push(`finish:${patch.status}`); const r = this.runs.find((x) => x.id === runId); if (r) r.status = patch.status }
    async archiveHistory(projectId: string, runId: string, windowDays: 28 | 90, windowEnd: string, rs: GscMetricRow[]) {
      this.order.push('archive')
      if (this.archiveThrows) throw new Error('history table missing')
      this.archives.push({ projectId, runId, windowDays, windowEnd, rows: rs }); return rs.length
    }
  }
  const run = (store: SyncStore, c: SyncClient) => executeManualSync({ store, client: c, projectId: 'p', connectionId: 'c', siteUrl: 's', syncGroupId: 'g', maxRows: 50000, batchSize: 1000 })

  const s1 = new Store()
  const r1 = await run(s1, client())
  check('only the 28-day window is archived', s1.archives.length === 1 && s1.archives[0].windowDays === 28)
  check('it is archived with the window END date and the run id', s1.archives[0].windowEnd === '2026-11-18' && s1.archives[0].runId === r1.windows[0].runId)
  check('it receives the window rows (the selector filters, the sync does not)', s1.archives[0].rows.length === 2)
  check('archive happens after the 28-day run succeeded', s1.order.indexOf('finish:succeeded') < s1.order.indexOf('archive'))

  const s2 = new Store(); s2.archiveThrows = true
  const r2 = await run(s2, client())
  check('a history that throws NEVER fails the sync', r2.windows.length === 2 && r2.windows.every((w) => w.status === 'succeeded'))
  check('…and the prune still runs for both windows', s2.order.filter((o) => o === 'prune').length === 2)
  check('…and the runs are still marked succeeded', s2.runs.every((r) => r.status === 'succeeded'))

  const s3 = new Store()
  const r3 = await run(s3, client(true))
  check('a failed run archives nothing', r3.windows.every((w) => w.status === 'failed') && s3.archives.length === 0 && !s3.order.includes('archive'))

  const s4 = new Store()
  const noData = await executeManualSync({ store: s4, client: { ...client(), probeLatestDate: async () => null }, projectId: 'p', connectionId: 'c', siteUrl: 's', syncGroupId: 'g', maxRows: 1, batchSize: 1 })
  check('a property with no data archives nothing', noData.noData && s4.archives.length === 0)

  // A store that has no archiveHistory at all (every fake and store that predates it) still works.
  const bare: SyncStore = { reclaimStaleRuns: async () => 0, createRun: async () => ({ id: 'r' }), insertMetricsBatch: async () => {}, pruneSupersededMetrics: async () => 0, finishRun: async () => {} }
  const r5 = await run(bare, client())
  check('a store without archiveHistory is unaffected', r5.windows.every((w) => w.status === 'succeeded'))

  // ── the real store, on the fake database ──────────────────────────────────
  const tables: Record<string, Record<string, unknown>[]> = { gsc_page_query_history: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = makeSyncStore(new FakeAdmin(tables) as any)
  const n1 = await store.archiveHistory!('p1', 'r1', 28, '2026-11-18', [row('q', '/p', 100, 8, 3), row('far', '/f', 100, 60), row('few', '/g', 2, 5)])
  check('the store writes only the selected rows', n1 === 1 && tables.gsc_page_query_history.length === 1)
  const w = tables.gsc_page_query_history[0]
  check('the stored row carries project, window end, window days, run, and rounded numbers', w.project_id === 'p1' && w.window_end === '2026-11-18' && w.window_days === 28 && w.sync_run_id === 'r1' && w.clicks === 3 && w.impressions === 100 && w.position === 8)
  await store.archiveHistory!('p1', 'r1b', 28, '2026-11-18', [row('q', '/p', 100, 8, 3)])
  check('archiving the same window again does not duplicate', tables.gsc_page_query_history.length === 1)

  tables.gsc_page_query_history.push(
    { project_id: 'p1', window_end: '2026-01-01', window_days: 28, query: 'old', page: '/o' },
    { project_id: 'p2', window_end: '2026-01-01', window_days: 28, query: 'other-project', page: '/o' },
    { project_id: 'p1', window_end: '2026-06-01', window_days: 28, query: 'recent', page: '/r' },
  )
  await store.archiveHistory!('p1', 'r2', 28, '2026-11-18', [row('q2', '/p2', 50, 9)])
  const left = tables.gsc_page_query_history.map((r) => r.query as string)
  check('rows past retention are deleted', !left.includes('old'))
  check('another project is NEVER trimmed', left.includes('other-project'))
  check('a row inside retention survives', left.includes('recent') && left.includes('q') && left.includes('q2'))

  const before = tables.gsc_page_query_history.length
  await store.archiveHistory!('p1', 'r3', 28, 'garbage', [row('q3', '/p3', 50, 9)])
  check('a malformed window end deletes nothing', tables.gsc_page_query_history.length === before + 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bad = makeSyncStore(new FakeAdmin({ gsc_page_query_history: [] }, { gsc_page_query_history: { upsert: () => ({ code: '42P01' }) } }) as any)
  let err = ''
  try { await bad.archiveHistory!('p', 'r', 28, '2026-11-18', [row('q', '/p', 100, 8)]) } catch (e) { err = (e as { code?: string }).code ?? '' }
  check('a write failure surfaces as history_archive_failed (the sync swallows it)', err === 'history_archive_failed')

  // ── source guards, each with a mutation control ───────────────────────────
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const syncSrc = strip(readFileSync(join(process.cwd(), 'lib/gsc/sync.ts'), 'utf8'))
  const svcSrc = strip(readFileSync(join(process.cwd(), 'lib/gsc/service.ts'), 'utf8'))
  const swallowed = (s: string) => /async function archiveQuietly[\s\S]*?try \{[\s\S]*?archiveHistory[\s\S]*?\} catch/.test(s)
  const onlyAfterSuccess = (s: string) => { const f = s.indexOf("status: 'succeeded', rowsFetched: rows.length"); const a = s.indexOf('await archiveQuietly('); return f > 0 && a > f }
  const only28 = (s: string) => /windowDays !== HISTORY_WINDOW_DAYS/.test(s)
  const scoped = (s: string) => /gsc_page_query_history'\)\.delete\(\)\.eq\('project_id', projectId\)/.test(s)
  const idempotent = (s: string) => /ignoreDuplicates: true/.test(s)
  check('guard: the archive call is wrapped so it cannot fail the sync', swallowed(syncSrc))
  check('guard: it runs only after the run is marked succeeded', onlyAfterSuccess(syncSrc))
  check('guard: only the 28-day window is archived', only28(syncSrc))
  check('guard: the retention delete is scoped by project', scoped(svcSrc))
  check('guard: the insert never overwrites a stored row', idempotent(svcSrc))
  check('mutation: removing the try/catch is caught', !swallowed(syncSrc.replace(/try \{ await store\.archiveHistory\(([^)]*)\) \} catch \{[^}]*\}/, 'await store.archiveHistory($1)')))
  check('mutation: archiving before the run succeeds is caught', !onlyAfterSuccess(syncSrc.replace("status: 'succeeded', rowsFetched: rows.length", "status: 'succeeded', rowsFetched: rows.length").replace('await archiveQuietly(', 'await archiveQuietlyX(').replace('const run = await deps.store.createRun(', 'await archiveQuietly(deps.store, deps.projectId, windowDays, "x", "x", [])\n    const run = await deps.store.createRun(')))
  check('mutation: archiving every window is caught', !only28(syncSrc.replace('windowDays !== HISTORY_WINDOW_DAYS', 'false')))
  check('mutation: an unscoped retention delete is caught', !scoped(svcSrc.replace(".eq('project_id', projectId).lt('window_end'", ".lt('window_end'")))
  check('mutation: an overwriting insert is caught', !idempotent(svcSrc.replace('ignoreDuplicates: true', 'ignoreDuplicates: false')))

  console.log(`${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}
main()
export {}

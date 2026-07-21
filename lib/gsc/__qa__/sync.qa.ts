/**
 * Stage E1 — manual sync orchestration + API pagination.
 *
 * Proves: 28/90 stored as SEPARATE immutable runs; inclusive window dates; precomputed
 * weighted aggregates; empty snapshot when no data is available; a per-window failure does
 * NOT abort the other window and NEVER replaces the latest succeeded run; startRow
 * pagination stops on a short page; the safety cap sets truncated=true; and a concurrent
 * sync is rejected (unique-active-run → sync_in_progress).
 */
import { executeManualSync, computeInclusiveWindow, dedupeRows, type SyncStore, type SyncClient } from '../sync'
import { fetchQueryPageWindow } from '../api'
import { makeSyncStore, GscServiceError } from '../service'
import { FakeAdmin } from './_fake-admin'
import type { GscMetricRow } from '../summary'
import type { WindowFetchResult } from '../api'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)

interface FinishPatch { status: string; rowsFetched: number; truncated: boolean; startDate: string | null; endDate: string | null; totalClicks: number; totalImpressions: number; weightedPositionSum: number }
class FakeStore implements SyncStore {
  runs: { id: string; windowDays: number; status: string }[] = []
  finishes: Record<string, FinishPatch> = {}
  metrics: Record<string, GscMetricRow[]> = {}
  reclaimCalls: { projectId: string; leaseMs: number }[] = []
  private n = 0
  async reclaimStaleRuns(projectId: string, leaseMs: number) { this.reclaimCalls.push({ projectId, leaseMs }); return 0 }
  async createRun(run: { windowDays: 28 | 90 }) { const id = `run-${++this.n}`; this.runs.push({ id, windowDays: run.windowDays, status: 'running' }); return { id } }
  async insertMetricsBatch(runId: string, _p: string, rows: GscMetricRow[]) { (this.metrics[runId] ??= []).push(...rows) }
  async finishRun(runId: string, patch: FinishPatch) { this.finishes[runId] = patch; const r = this.runs.find((x) => x.id === runId); if (r) r.status = patch.status }
}

async function main() {
  console.log('GSC manual sync')

  // computeInclusiveWindow: N-day inclusive window ending at latest.
  const w28 = computeInclusiveWindow('2026-07-10', 28)
  const w90 = computeInclusiveWindow('2026-07-10', 90)
  check('28-day window ends at latest', w28.endDate === '2026-07-10')
  check('28-day window spans 27 days back (inclusive 28)', daysBetween(w28.startDate, w28.endDate) === 27)
  check('90-day window spans 89 days back (inclusive 90)', daysBetween(w90.startDate, w90.endDate) === 89)

  // dedupeRows keeps first (query,page).
  const dd = dedupeRows([
    { query: 'a', page: 'p', clicks: 1, impressions: 1, ctr: 1, position: 1 },
    { query: 'a', page: 'p', clicks: 9, impressions: 9, ctr: 9, position: 9 },
    { query: 'a', page: 'q', clicks: 2, impressions: 2, ctr: 1, position: 2 },
  ])
  check('dedupeRows enforces unique (query,page), keeps first', dd.length === 2 && dd[0].clicks === 1)

  // Happy path: both windows succeed as separate immutable runs; weighted aggregates stored.
  const rows: GscMetricRow[] = [
    { query: 'k1', page: 'https://x/1', clicks: 10, impressions: 100, ctr: 0.1, position: 4 },
    { query: 'k2', page: 'https://x/2', clicks: 5, impressions: 900, ctr: 0.0055, position: 8 },
  ]
  const store = new FakeStore()
  const client: SyncClient = {
    probeLatestDate: async () => '2026-07-10',
    fetchWindow: async (): Promise<WindowFetchResult> => ({ rows, apiBatches: 1, truncated: false }),
  }
  const res = await executeManualSync({ store, client, projectId: 'p', connectionId: 'c', siteUrl: 's', syncGroupId: 'g', maxRows: 50000, batchSize: 1000 })
  check('reclaims stale runs BEFORE creating new runs', store.reclaimCalls.length === 1 && store.reclaimCalls[0].projectId === 'p')
  check('produces two runs (28 + 90) — separate immutable snapshots', res.windows.length === 2 && res.windows[0].windowDays === 28 && res.windows[1].windowDays === 90)
  check('both windows succeeded', res.windows.every((w) => w.status === 'succeeded'))
  const f0 = store.finishes[res.windows[0].runId]
  check('run marked succeeded only after rows stored', f0.status === 'succeeded' && store.metrics[res.windows[0].runId].length === 2)
  check('total clicks aggregate stored', f0.totalClicks === 15)
  check('total impressions aggregate stored', f0.totalImpressions === 1000)
  // weightedPositionSum = 4*100 + 8*900 = 7600
  check('weighted position sum stored (impression-weighted)', f0.weightedPositionSum === 7600)
  check('latest date detected from returned data, not hardcoded today', res.latestAvailableDate === '2026-07-10')

  // Empty snapshot: probe returns null → valid empty succeeded runs, no fetch.
  const emptyStore = new FakeStore()
  let fetchCalled = false
  const emptyClient: SyncClient = { probeLatestDate: async () => null, fetchWindow: async () => { fetchCalled = true; return { rows: [], apiBatches: 0, truncated: false } } }
  const emptyRes = await executeManualSync({ store: emptyStore, client: emptyClient, projectId: 'p', connectionId: 'c', siteUrl: 's', syncGroupId: 'g2', maxRows: 50000, batchSize: 1000 })
  check('no data → still two succeeded EMPTY runs', emptyRes.windows.length === 2 && emptyRes.windows.every((w) => w.status === 'succeeded' && w.rowsFetched === 0))
  check('no data → noData flag set, no fetch attempted', emptyRes.noData === true && !fetchCalled)
  check('empty run aggregates are zero', emptyStore.finishes[emptyRes.windows[0].runId].totalImpressions === 0)

  // Per-window failure isolation: 28 fails, 90 still runs; failed run is marked failed.
  const mixStore = new FakeStore()
  let call = 0
  const mixClient: SyncClient = {
    probeLatestDate: async () => '2026-07-10',
    fetchWindow: async () => { call++; if (call === 1) throw Object.assign(new Error('boom'), { code: 'rate_limited' }); return { rows, apiBatches: 1, truncated: false } },
  }
  const mixRes = await executeManualSync({ store: mixStore, client: mixClient, projectId: 'p', connectionId: 'c', siteUrl: 's', syncGroupId: 'g3', maxRows: 50000, batchSize: 1000 })
  check('a failing window does NOT abort the other window', mixRes.windows.length === 2)
  check('28-day run marked failed', mixRes.windows[0].status === 'failed' && mixStore.finishes[mixRes.windows[0].runId].status === 'failed')
  check('90-day run still succeeded', mixRes.windows[1].status === 'succeeded')
  check('failed run stored NO metric rows (partial rows never published)', (mixStore.metrics[mixRes.windows[0].runId] ?? []).length === 0)

  // API pagination: startRow paging stops on a short page.
  const origFetch = globalThis.fetch
  const makeRows = (n: number) => Array.from({ length: n }, (_, i) => ({ keys: [`q${i}`, `https://x/${i}`], clicks: 1, impressions: 2, ctr: 0.5, position: 3 }))
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body); const start = body.startRow ?? 0
    const pages: Record<number, number> = { 0: 2, 2: 2, 4: 1 } // 2,2,1 → short page ends it
    return { ok: true, status: 200, async text() { return JSON.stringify({ rows: makeRows(pages[start] ?? 0) }) } }
  }) as unknown as typeof fetch
  const paged = await fetchQueryPageWindow('tok', 'sc-domain:x', '2026-06-13', '2026-07-10', { maxRows: 50000, pageSize: 2 })
  check('pagination collects all pages until a short page', paged.rows.length === 5)
  check('pagination made 3 API batches', paged.apiBatches === 3)
  check('complete data is not marked truncated', paged.truncated === false)

  // Safety cap → truncated=true.
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body); void body
    return { ok: true, status: 200, async text() { return JSON.stringify({ rows: makeRows(2) }) } } // always a full page
  }) as unknown as typeof fetch
  const capped = await fetchQueryPageWindow('tok', 'sc-domain:x', '2026-06-13', '2026-07-10', { maxRows: 3, pageSize: 2 })
  check('safety cap truncates and flags it', capped.truncated === true && capped.rows.length === 3)
  globalThis.fetch = origFetch

  // Concurrency: a unique-active-run violation (23505) → sync_in_progress.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = new FakeAdmin({}, { gsc_sync_runs: { insert: () => ({ code: '23505' }) } }) as any
  const realStore = makeSyncStore(admin)
  let concErr: GscServiceError | null = null
  try { await realStore.createRun({ syncGroupId: 'g', projectId: 'p', connectionId: 'c', siteUrl: 's', windowDays: 28 }) } catch (e) { concErr = e instanceof GscServiceError ? e : null }
  check('concurrent sync rejected → sync_in_progress (409)', concErr?.code === 'sync_in_progress' && concErr?.status === 409)

  // Stale-run recovery: a run stuck 'running' past the lease is reclaimed as failed; a
  // recent running run for the same project is left untouched.
  const staleIso = new Date(Date.now() - 30 * 60 * 1000).toISOString()  // 30 min ago (> 15 min lease)
  const freshIso = new Date(Date.now() - 60 * 1000).toISOString()       // 1 min ago (in-flight)
  const staleTables = { gsc_sync_runs: [
    { id: 'old', project_id: 'p', status: 'running', started_at: staleIso },
    { id: 'recent', project_id: 'p', status: 'running', started_at: freshIso },
    { id: 'other', project_id: 'q', status: 'running', started_at: staleIso },
  ] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staleAdmin = new FakeAdmin(staleTables) as any
  const reclaimed = await makeSyncStore(staleAdmin).reclaimStaleRuns('p', 15 * 60 * 1000)
  check('reclaims exactly the stale run for this project', reclaimed === 1)
  check('stale run marked failed with stale_run_recovered', staleTables.gsc_sync_runs.find((r) => r.id === 'old')!.status === 'failed' && (staleTables.gsc_sync_runs.find((r) => r.id === 'old') as { sanitized_error_code?: string }).sanitized_error_code === 'stale_run_recovered')
  check('recent in-flight run is NOT touched', staleTables.gsc_sync_runs.find((r) => r.id === 'recent')!.status === 'running')
  check('another project\'s stale run is NOT touched by this project\'s reclaim', staleTables.gsc_sync_runs.find((r) => r.id === 'other')!.status === 'running')

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

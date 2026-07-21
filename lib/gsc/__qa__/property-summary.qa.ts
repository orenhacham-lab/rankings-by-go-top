/**
 * Stage E1 FIX 7 + FIX 8 QA — authoritative property-summary requests/storage/UI and the
 * clickable decoded page-URL column. Offline (mocked fetch); static guards for the status
 * route / GscPanel / migration contracts.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { fetchPropertySummary, fetchQueryPageWindow } from '../api'
import type { GscSyncRun } from '@/lib/supabase/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Replica of the status-route summaryCard contract (kept in sync with app/api/gsc/status/route.ts). */
function summaryCardContract(run: Partial<GscSyncRun>) {
  if (run.summary_total_clicks === null || run.summary_total_clicks === undefined || run.summary_aggregation_type !== 'byProperty') {
    return { summaryResyncRequired: true, clicks: null as number | null }
  }
  return { summaryResyncRequired: false, clicks: Number(run.summary_total_clicks), ctr: Number(run.summary_total_ctr ?? 0), avgPosition: run.summary_average_position == null ? null : Number(run.summary_average_position) }
}
function safeDecodeUrl(u: string): string { try { return decodeURI(u) } catch { return u } }

async function main() {
  console.log('GSC property summary (FIX 8) + URL table (FIX 7)')
  const bodies: Record<string, unknown>[] = []
  const orig = globalThis.fetch
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body); bodies.push(body)
    if (Array.isArray(body.dimensions)) return { ok: true, status: 200, async text() { return JSON.stringify({ rows: [] }) } } // detail request
    // property summary request
    return { ok: true, status: 200, async text() { return JSON.stringify({ rows: [{ clicks: 4880, impressions: 238000, ctr: 0.0205, position: 10.7 }], responseAggregationType: 'byProperty' }) } }
  }) as unknown as typeof fetch

  try {
    const summary = await fetchPropertySummary('tok', 'sc-domain:x', '2026-06-13', '2026-07-10', 'final')
    const sBody = bodies[bodies.length - 1]
    check('(1) property summary request has NO dimensions', !('dimensions' in sBody))
    check('(2) property summary uses aggregationType=byProperty', sBody.aggregationType === 'byProperty')
    check('(6) property summary uses type=web', sBody.type === 'web')
    check('(7) property summary uses the given dataState', sBody.dataState === 'final')
    check('(4/5) property summary uses the exact date range', sBody.startDate === '2026-06-13' && sBody.endDate === '2026-07-10')
    check('summary parses clicks/impressions/ctr/position', summary.clicks === 4880 && summary.impressions === 238000 && Math.abs(summary.ctr - 0.0205) < 1e-9 && summary.position === 10.7)
    check('summary reports responseAggregationType', summary.aggregationType === 'byProperty')

    bodies.length = 0
    await fetchQueryPageWindow('tok', 'sc-domain:x', '2026-06-13', '2026-07-10', { maxRows: 100, pageSize: 2 })
    const dBody = bodies[0]
    check('(3) detail request remains query+page', Array.isArray(dBody.dimensions) && (dBody.dimensions as string[]).join(',') === 'query,page')
    check('(6) detail request uses type=web (matches summary)', dBody.type === 'web')
    check('(7) detail request uses dataState=final (matches summary)', dBody.dataState === 'final')
    check('(4/5) detail request uses the same property + date range', dBody.startDate === '2026-06-13' && dBody.endDate === '2026-07-10')

    // Zero-data property → zeros, still byProperty, not a failure.
    bodies.length = 0
    globalThis.fetch = (async () => ({ ok: true, status: 200, async text() { return JSON.stringify({ rows: [], responseAggregationType: 'byProperty' }) } })) as unknown as typeof fetch
    const zero = await fetchPropertySummary('tok', 'sc-domain:x', '2026-06-13', '2026-07-10', 'final')
    check('(20) zero-data property → zero byProperty summary', zero.clicks === 0 && zero.impressions === 0 && zero.aggregationType === 'byProperty')

    // FIX C — preserve Google's response `metadata` object when present (sanitized).
    globalThis.fetch = (async () => ({ ok: true, status: 200, async text() { return JSON.stringify({ rows: [{ clicks: 5, impressions: 10, ctr: 0.5, position: 3 }], responseAggregationType: 'byProperty', metadata: { first_incomplete_date: '2026-07-09', foo: 'bar' } }) } })) as unknown as typeof fetch
    const withMeta = await fetchPropertySummary('tok', 'sc-domain:x', '2026-06-13', '2026-07-10', 'final')
    const md = withMeta.responseMetadata as { metadata?: Record<string, unknown>; responseAggregationType?: string; rowCount?: number }
    check('FC(13) Google metadata is persisted when present', !!md.metadata && md.metadata.first_incomplete_date === '2026-07-09' && md.metadata.foo === 'bar')
    check('FC(13) responseAggregationType + rowCount still kept', md.responseAggregationType === 'byProperty' && md.rowCount === 1)
    check('FC(13) displayed metrics unchanged by metadata', withMeta.clicks === 5 && withMeta.impressions === 10 && withMeta.position === 3)
    // FIX C — malformed / non-object metadata is ignored safely.
    for (const bad of [JSON.stringify(['a', 'b']), JSON.stringify('a string'), JSON.stringify(42)]) {
      globalThis.fetch = (async () => ({ ok: true, status: 200, async text() { return `{"rows":[{"clicks":5,"impressions":10,"ctr":0.5,"position":3}],"responseAggregationType":"byProperty","metadata":${bad}}` } })) as unknown as typeof fetch
      const s = await fetchPropertySummary('tok', 'sc-domain:x', '2026-06-13', '2026-07-10', 'final')
      const m = s.responseMetadata as { metadata?: unknown }
      check(`FC(14) malformed metadata (${bad}) is ignored + metrics intact`, m.metadata === undefined && s.clicks === 5)
    }
  } finally { globalThis.fetch = orig }

  // ── Top-card contract (FIX 8): use stored property totals, never detail-row sums ──
  const runWithSummary = { total_clicks: 2156, total_impressions: 167890, weighted_position_sum: 999999, summary_total_clicks: 4880, summary_total_impressions: 238000, summary_total_ctr: 0.021, summary_average_position: 10.7, summary_aggregation_type: 'byProperty' } as unknown as GscSyncRun
  const cardA = summaryCardContract(runWithSummary)
  check('(9)(11) top clicks card = property summary (4,880), NOT detail sum (2,156)', cardA.clicks === 4880)
  check('(13) CTR card comes from the property summary', Math.abs((cardA.ctr ?? 0) - 0.021) < 1e-9)
  check('(14) average position card comes from the property summary', cardA.avgPosition === 10.7)
  const oldRun = { total_clicks: 2156, total_impressions: 167890, weighted_position_sum: 999999, summary_total_clicks: null, summary_aggregation_type: null } as unknown as GscSyncRun
  const cardB = summaryCardContract(oldRun)
  check('(18) old run with null summary → summary_resync_required', cardB.summaryResyncRequired === true)
  check('(19) old run never falls back to detail-row totals', cardB.clicks === null)

  // ── Static contracts ───────────────────────────────────────────────────────
  const status = read('app/api/gsc/status/route.ts')
  check('(10) status card reads summary_total_clicks (property summary)', /summary_total_clicks/.test(status))
  check('(10) status card does NOT compute the 4 cards from weighted_position_sum', !/weighted_position_sum \/ /.test(status) && !/run\.weighted_position_sum/.test(status))
  check('(18) status returns summaryResyncRequired for runs without a summary', /summaryResyncRequired: true/.test(status))

  const sync = read('lib/gsc/sync.ts')
  check('(16/17) run succeeds only after summary fetched + validated', /aggregationType !== 'byProperty'[\s\S]{0,120}gsc_summary_aggregation_mismatch/.test(sync) && sync.indexOf('fetchSummary(') < sync.indexOf("status: 'succeeded', rowsFetched: rows.length"))
  check('no silent fallback to detail sums on summary failure (failed branch summary null)', /status: 'failed'[\s\S]{0,200}summary: null/.test(sync))

  const panel = read('components/content/GscPanel.tsx')
  check('FIX7 page URL is a decoded external link (href=raw, target _blank, rel noopener)', /<a href=\{r\.page\} target="_blank" rel="noopener noreferrer" title=\{safeDecodeUrl\(r\.page\)\}/.test(panel))
  check('FIX7 URL wraps (overflow-wrap/break-all), not ellipsis-only', /\[overflow-wrap:anywhere\]|break-all/.test(panel) && /safeDecodeUrl\(r\.page\)/.test(panel))
  check('FIX7 external-link icon present', /<ExternalLink /.test(panel))
  check('FIX8 panel shows the property-summary label + provenance note', /propertySummaryLabel/.test(panel) && /detailVsSummaryNote/.test(panel))
  check('FIX8 panel handles summaryResyncRequired with a sync CTA', /card\.summaryResyncRequired/.test(panel) && /summaryResyncRequired[\s\S]{0,200}handleSync/.test(panel))
  check('FIX8 cards read card.clicks/impressions/ctr/avgPosition (from summary)', /t\.cardClicks, value: fmtInt\(card\.clicks/.test(panel))

  // FIX 7 decode behavior + safe fallback.
  const encoded = 'https://x.co/%D7%A0%D7%A2%D7%9C%D7%99%D7%99%D7%9D'
  check('FIX7 encoded Hebrew URL decodes for display', safeDecodeUrl(encoded) === 'https://x.co/נעליים')
  check('FIX7 malformed encoding falls back to the original', safeDecodeUrl('https://x.co/%E0%A4%A') === 'https://x.co/%E0%A4%A')

  // ── Migration 20260814 ──────────────────────────────────────────────────────
  const mig = read('supabase/migrations/20260814_add_gsc_property_summary.sql')
  check('(24) summary migration adds all summary columns', ['summary_total_clicks', 'summary_total_impressions', 'summary_total_ctr', 'summary_average_position', 'summary_aggregation_type', 'summary_data_state', 'summary_response_metadata'].every((c) => new RegExp(`ADD COLUMN IF NOT EXISTS ${c}`).test(mig)))
  check('(24) summary migration is additive + idempotent', /ADD COLUMN IF NOT EXISTS/.test(mig) && !/DROP TABLE/.test(mig))
  check('summary migration CHECK constraints present', /summary_total_ctr >= 0 AND summary_total_ctr <= 1/.test(mig) && /summary_aggregation_type = 'byProperty'/.test(mig))

  // ── E2A input untouched (reads detail rows, not the summary columns) ─────────
  const load = read('lib/gsc/opportunities/load.ts')
  check('(21) Stage E2A still reads query+page detail rows', /from\('gsc_query_page_metrics'\)/.test(load))
  check('(21) Stage E2A loader does NOT read the property summary columns', !/summary_total_clicks|summary_aggregation_type/.test(load))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

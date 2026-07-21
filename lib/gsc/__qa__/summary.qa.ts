/**
 * Stage E1 — diagnostics math. CTR = total clicks / total impressions (NOT a mean of
 * per-row CTR); average position is impression-weighted. Opportunities is a pure 4..20
 * display filter; multi-page queries is a diagnostic grouping (>1 distinct page).
 */
import { summarizeWindow, positionOpportunities, multiPageQueries, type GscMetricRow } from '../summary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-9

function main() {
  console.log('GSC summary math')
  const rows: GscMetricRow[] = [
    { query: 'a', page: 'https://x/1', clicks: 10, impressions: 100, ctr: 0.10, position: 3 },
    { query: 'b', page: 'https://x/2', clicks: 5, impressions: 900, ctr: 0.0055, position: 8 },
    { query: 'a', page: 'https://x/3', clicks: 0, impressions: 50, ctr: 0, position: 15 },
  ]
  const s = summarizeWindow(rows)
  check('total clicks summed', s.clicks === 15)
  check('total impressions summed', s.impressions === 1050)
  // CTR = 15 / 1050, NOT mean(0.10, 0.0055, 0) = 0.035
  check('CTR = total clicks / total impressions', approx(s.ctr, 15 / 1050))
  check('CTR is NOT the mean of per-row CTR', !approx(s.ctr, (0.10 + 0.0055 + 0) / 3))
  // Weighted position = (3*100 + 8*900 + 15*50) / 1050
  check('avg position is impression-weighted', approx(s.avgPosition, (3 * 100 + 8 * 900 + 15 * 50) / 1050))
  check('avg position is NOT the simple mean', !approx(s.avgPosition, (3 + 8 + 15) / 3))
  check('rowCount reported', s.rowCount === 3)

  const empty = summarizeWindow([])
  check('empty snapshot → zero ctr / position (no divide-by-zero)', empty.ctr === 0 && empty.avgPosition === 0 && empty.clicks === 0)

  // Position opportunities: only 4..20, impressions desc.
  const opp = positionOpportunities([
    { query: 'p3', page: 'u', clicks: 1, impressions: 500, ctr: 0, position: 3 },      // excluded (<4)
    { query: 'p4', page: 'u', clicks: 1, impressions: 100, ctr: 0, position: 4 },      // included
    { query: 'p20', page: 'u', clicks: 1, impressions: 300, ctr: 0, position: 20 },    // included
    { query: 'p21', page: 'u', clicks: 1, impressions: 999, ctr: 0, position: 21 },    // excluded (>20)
  ])
  check('opportunities excludes position < 4 and > 20', opp.length === 2 && opp.every((r) => r.position >= 4 && r.position <= 20))
  check('opportunities sorted by impressions desc', opp[0].query === 'p20' && opp[1].query === 'p4')

  // Multi-page queries: query "a" on 2 distinct pages, "b" on 1 → only "a".
  const mp = multiPageQueries(rows)
  check('multi-page queries returns only queries on >1 page', mp.length === 1 && mp[0].query === 'a')
  check('distinctPageCount is correct', mp[0].distinctPageCount === 2)
  check('multi-page totals aggregate the query rows', mp[0].totalClicks === 10 && mp[0].totalImpressions === 150)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

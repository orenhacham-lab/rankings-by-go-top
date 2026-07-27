/**
 * Area N — GSC improve_page copy must never contradict the metrics.
 *
 * 1. A deterministic 2-candidate fixture proves an improve_page card CAN carry
 *    low_ctr_for_position (ctrGap>0 AND demandStrength<0.3 — the reachable combo).
 * 2. The NEUTRAL base copy (reason absent) contains no "almost no clicks" claim and
 *    no CTR figure, in both he + en.
 * 3. The GATED variant (reason present) shows the REAL CTR, in both he + en.
 * 4. he/en parity of the two summary functions; and the component wires the gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildClientRecommendations } from '../builder'
import { getDashboardDictionary } from '../../../i18n/dashboard/getDashboardDictionary'
import type { Opportunity } from '../../opportunities/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// Component-identical formatters + selector (kept in lockstep with GscRecommendations.tsx).
const fmtCtr = (n: number) => `${(n * 100).toFixed(1)}%`
const fmtPos = (n: number) => (n > 0 ? n.toFixed(1) : '—')

function opp(o: Partial<Opportunity> & { id: string }): Opportunity {
  const d: Opportunity = {
    id: '', primaryQuery: 'query', relatedQueries: [], page: 'https://x.co/p/', pageType: 'article', queryIntent: 'informational',
    clicks: 5, impressions: 500, ctr: 0.01, averagePosition: 8, distinctPageCount: 1,
    opportunityType: 'improve_existing_page', signals: [], opportunityScore: 50,
    scoreComponents: { demandStrength: 0.6, positionOpportunity: 1, ctrGap: 0, contentMatchConfidence: 0, distinctPageSignal: 0 },
    reasons: [], existingContentMatch: null, pageInSiteIndex: true, servesQuery: false, windowDays: 90, syncRunId: 'r', dateStart: null, dateEnd: null,
  }
  return { ...d, ...o }
}

function main() {
  console.log('Area N — improve_page copy vs metrics')

  const he = getDashboardDictionary('he').projectDetail.contentSection.gscRecommendations
  const en = getDashboardDictionary('en').projectDetail.contentSection.gscRecommendations

  // ── 1) Deterministic 2-candidate fixture → ONE improve_page card carrying low_ctr_for_position.
  // ctrGap>0 AND demandStrength<0.3 (the proven-reachable combination): improve_page (priority
  // 'review') that nonetheless emitted the ctr_below_band_median reason.
  const res = buildClientRecommendations({
    opportunities: [
      opp({ id: 'p1', page: 'https://x.co/tread/', primaryQuery: 'need one', impressions: 2000, clicks: 20,
        scoreComponents: { demandStrength: 0.2, positionOpportunity: 1, ctrGap: 0.4, contentMatchConfidence: 0, distinctPageSignal: 0 },
        reasons: [{ code: 'ctr_below_band_median', detail: 'below band median', value: 0.4 }] }),
      opp({ id: 'p2', page: 'https://x.co/tread/', primaryQuery: 'need two', impressions: 1000, clicks: 5,
        scoreComponents: { demandStrength: 0.2, positionOpportunity: 1, ctrGap: 0.1, contentMatchConfidence: 0, distinctPageSignal: 0 } }),
    ],
    decidedOpportunityIds: new Set(), window: 90, projectId: 'proj',
  })
  const card = res.recommendations[0]
  check('fixture yields exactly ONE improve_page card', res.recommendations.length === 1 && card?.category === 'improve_page')
  check('the improve_page card CARRIES low_ctr_for_position', !!card?.reasonKeys.includes('low_ctr_for_position'))
  check('card exposes a real aggregated CTR', card.metrics.impressions === 3000 && card.metrics.clicks === 25 && Math.abs(card.metrics.ctr - 25 / 3000) < 1e-9)

  const posStr = fmtPos(card.metrics.averagePosition)
  const ctrStr = fmtCtr(card.metrics.ctr) // e.g. "0.8%"

  // ── 2) NEUTRAL base copy (reason ABSENT): no false "almost no clicks", no CTR figure.
  for (const [loc, d] of [['he', he], ['en', en]] as const) {
    const base = d.summaries.improve_page(posStr)
    check(`(${loc}) base improve_page has NO "almost no clicks" claim`,
      !base.includes('almost no clicks') && !base.includes('כמעט אינו מקבל קליקים') && !base.includes('אינו מקבל קליקים'))
    check(`(${loc}) base improve_page shows NO CTR figure (no % token)`, !base.includes('%'))
    check(`(${loc}) base improve_page still cites the real position`, base.includes(posStr))
  }

  // ── 3) GATED variant (reason PRESENT): shows the REAL CTR.
  for (const [loc, d] of [['he', he], ['en', en]] as const) {
    const variant = d.summaries.improve_page_low_ctr(posStr, ctrStr)
    check(`(${loc}) variant shows the REAL CTR figure`, variant.includes(ctrStr) && variant.includes('%'))
    check(`(${loc}) variant cites the real position`, variant.includes(posStr))
    check(`(${loc}) variant differs from the neutral base`, variant !== d.summaries.improve_page(posStr))
  }

  // ── 4a) he/en PARITY — both locales expose both functions with the same arity.
  check('he/en parity: improve_page is a 1-arg function in both', typeof he.summaries.improve_page === 'function' && typeof en.summaries.improve_page === 'function' && he.summaries.improve_page.length === 1 && en.summaries.improve_page.length === 1)
  check('he/en parity: improve_page_low_ctr is a 2-arg function in both', typeof he.summaries.improve_page_low_ctr === 'function' && typeof en.summaries.improve_page_low_ctr === 'function' && he.summaries.improve_page_low_ctr.length === 2 && en.summaries.improve_page_low_ctr.length === 2)
  check('improve_ctr copy is UNCHANGED (still shows CTR)', he.summaries.improve_ctr('4.0', '2.1%').includes('2.1%') && en.summaries.improve_ctr('4.0', '2.1%').includes('2.1%'))

  // ── 4b) The component selects the variant ONLY when the reason is present (source-contract).
  const comp = readFileSync(join(__dirname, '..', '..', '..', '..', 'components', 'content', 'GscRecommendations.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  check('component gates improve_page_low_ctr on reasonKeys.includes(low_ctr_for_position)',
    /reasonKeys\.includes\('low_ctr_for_position'\)[\s\S]{0,120}improve_page_low_ctr/.test(comp))
  check('component still falls back to the neutral improve_page base copy',
    /improve_page_low_ctr[\s\S]{0,160}t\.summaries\.improve_page\(/.test(comp))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

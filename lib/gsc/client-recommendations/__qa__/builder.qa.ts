/**
 * Stage E2C — client recommendation builder QA (pure, deterministic). Proves category mapping,
 * page-owned consolidation with distinct-need preservation, the bounded set (≤20 total, ≤2 per page),
 * deterministic ordering + stable ids, overlap primary-page threshold, priority labels, exclusion of
 * new-content candidates + decided opportunities, and that NO internal field leaks to the client.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildClientRecommendations, pageLabelFromUrl, isHomepageUrl } from '../builder'
import { getDashboardDictionary } from '../../../i18n/dashboard/getDashboardDictionary'
import type { Opportunity, QueryIntent } from '../../opportunities/types'
const ROOT = join(__dirname, '..', '..', '..', '..')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

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
const build = (opps: Opportunity[], decided: string[] = [], window: 28 | 90 = 90) =>
  buildClientRecommendations({ opportunities: opps, decidedOpportunityIds: new Set(decided), window, projectId: 'proj' })

function main() {
  console.log('GSC Stage E2C — client recommendation builder')

  // ── Category mapping (A/B/C) ────────────────────────────────────────────────────
  check('(A) improve_title_meta_ctr → improve_ctr', build([opp({ id: 'a', opportunityType: 'improve_title_meta_ctr' })]).recommendations[0]?.category === 'improve_ctr')
  check('(B) improve_existing_page → improve_page', build([opp({ id: 'b', opportunityType: 'improve_existing_page' })]).recommendations[0]?.category === 'improve_page')
  check('(C) internal_link_support_candidate → internal_links', build([opp({ id: 'c', opportunityType: 'internal_link_support_candidate' })]).recommendations[0]?.category === 'internal_links')
  check('(E excluded) supporting_content_candidate produces NO card', build([opp({ id: 'e', opportunityType: 'supporting_content_candidate' })]).recommendations.length === 0)

  // ── Exclusions ──────────────────────────────────────────────────────────────────
  check('decided opportunities are hidden', build([opp({ id: 'd1' })], ['d1']).recommendations.length === 0)
  check('zero-score / zero-impression noise excluded', build([opp({ id: 'z', opportunityScore: 0 }), opp({ id: 'z2', impressions: 0 })]).recommendations.length === 0)

  // ── Page-owned consolidation + distinct-need preservation ────────────────────────
  {
    // FIX 1 — two DIFFERENT search needs (any intent) on the same page + category → ONE page-level card.
    const res = build([
      opp({ id: 'p1', opportunityType: 'improve_existing_page', page: 'https://x.co/tread/', primaryQuery: 'איך לבחור הליכון לדירה קטנה', queryIntent: 'informational', impressions: 2000, clicks: 10 }),
      opp({ id: 'p2', opportunityType: 'improve_existing_page', page: 'https://x.co/tread/', primaryQuery: 'הליכון לשיקום לאחר ניתוח', queryIntent: 'commercial', impressions: 1000, clicks: 5 }),
    ])
    const card = res.recommendations[0]
    check('(FIX1) same page + same category → ONE card', res.recommendations.length === 1 && card.category === 'improve_page')
    check('(FIX1) both distinct needs preserved as separate needGroups', card.needGroups.length === 2 && card.needGroups[0].representativeQuery !== card.needGroups[1].representativeQuery)
    check('(FIX1) metrics + relatedOpportunityIds aggregated (authoritative union)', card.metrics.impressions === 3000 && card.metrics.clicks === 15 && card.relatedOpportunityIds.slice().sort().join(',') === 'p1,p2')
  }
  {
    // FIX 1 — same page, DIFFERENT categories → may remain separate cards, capped at 2 (strongest kept).
    const res = build([
      opp({ id: 'a', opportunityType: 'improve_title_meta_ctr', page: 'https://x.co/pg/', primaryQuery: 'q1', averagePosition: 8, impressions: 3000, scoreComponents: { demandStrength: 0.6, positionOpportunity: 1, ctrGap: 0.4, contentMatchConfidence: 0, distinctPageSignal: 0 } }),
      opp({ id: 'b', opportunityType: 'internal_link_support_candidate', page: 'https://x.co/pg/', primaryQuery: 'q2', impressions: 2000 }),
      opp({ id: 'c', opportunityType: 'improve_existing_page', page: 'https://x.co/pg/', primaryQuery: 'q3', impressions: 1000 }),
    ])
    const onPage = res.recommendations.filter((r) => r.affectedPage === 'https://x.co/pg/')
    check('(FIX1) same page + different categories → separate cards, capped at 2', onPage.length === 2 && new Set(onPage.map((r) => r.category)).size === 2)
    check('(FIX1) the two strongest kept (weakest category dropped)', !res.recommendations.some((r) => r.relatedOpportunityIds.includes('c')))
    check('(FIX1) no two cards share the same page AND category', new Set(res.recommendations.map((r) => `${r.category}|${r.affectedPage}`)).size === res.recommendations.length)
  }

  // ── Overlap (D) + primary-page threshold ─────────────────────────────────────────
  {
    const clearPrimary = opp({
      id: 'o1', opportunityType: 'improve_existing_page', distinctPageCount: 3, signals: ['multi_page_signal'], impressions: 1000,
      pageBreakdown: [{ page: 'https://x.co/main/', impressions: 700, clicks: 10 }, { page: 'https://x.co/b/', impressions: 200, clicks: 2 }, { page: 'https://x.co/c/', impressions: 100, clicks: 1 }],
    })
    const r = build([clearPrimary]).recommendations[0]
    check('(D) 3 pages → page_overlap', r.category === 'page_overlap' && r.priority === 'review')
    check('(D) involved pages present + primary declared at ≥50%', (r.involvedPages?.length ?? 0) === 3 && r.hasClearPrimary === true && r.affectedPage === 'https://x.co/main/')
    check('(D) primary flagged on the involved page', r.involvedPages?.find((p) => p.url === 'https://x.co/main/')?.isPrimary === true)
  }
  {
    const noPrimary = opp({
      id: 'o2', opportunityType: 'improve_existing_page', distinctPageCount: 3, signals: ['multi_page_signal'], impressions: 1000,
      pageBreakdown: [{ page: 'https://x.co/a/', impressions: 400, clicks: 4 }, { page: 'https://x.co/b/', impressions: 350, clicks: 3 }, { page: 'https://x.co/c/', impressions: 250, clicks: 2 }],
    })
    const r = build([noPrimary]).recommendations[0]
    check('(D) no page ≥50% → no clear primary (affectedPage null)', r.category === 'page_overlap' && r.hasClearPrimary === false && r.affectedPage === null)
  }
  {
    // two pages, top ≥50% → NOT material overlap → keeps its base category
    const base = opp({
      id: 'nb', opportunityType: 'improve_title_meta_ctr', distinctPageCount: 2, signals: ['multi_page_signal'], scoreComponents: { demandStrength: 0.6, positionOpportunity: 1, ctrGap: 0.4, contentMatchConfidence: 0, distinctPageSignal: 0.5 }, averagePosition: 8,
      pageBreakdown: [{ page: 'https://x.co/p/', impressions: 900, clicks: 3 }, { page: 'https://x.co/q/', impressions: 100, clicks: 1 }],
    })
    check('non-material 2-page split (top ≥50%) → keeps base category (not overlap)', build([base]).recommendations[0].category === 'improve_ctr')
  }

  // ── Priority labels ──────────────────────────────────────────────────────────────
  check('(priority) CTR high: demand≥0.5 + ctrGap≥0.3 + striking', build([opp({ id: 'ph', opportunityType: 'improve_title_meta_ctr', averagePosition: 8, scoreComponents: { demandStrength: 0.6, positionOpportunity: 1, ctrGap: 0.4, contentMatchConfidence: 0, distinctPageSignal: 0 } })]).recommendations[0].priority === 'high')
  check('(priority) internal_links default review', build([opp({ id: 'pr', opportunityType: 'internal_link_support_candidate', scoreComponents: { demandStrength: 0.2, positionOpportunity: 0.5, ctrGap: 0, contentMatchConfidence: 0.9, distinctPageSignal: 0 } })]).recommendations[0].priority === 'review')

  // ── Bounded volume (≤20 total, ≤2 per page) + determinism ────────────────────────
  {
    const many = Array.from({ length: 30 }, (_, i) => opp({ id: `m${i}`, opportunityType: 'improve_existing_page', page: `https://x.co/pg${i}/`, impressions: 1000 - i }))
    check('(bound) ≤20 total', build(many).recommendations.length === 20)
  }
  {
    // Many needs, same page + same category → exactly ONE consolidated card (all needs inside it).
    const samePage = Array.from({ length: 5 }, (_, i) => opp({ id: `s${i}`, opportunityType: 'improve_existing_page', page: 'https://x.co/one/', queryIntent: (['informational', 'commercial', 'branded_or_service', 'support', 'unknown'] as QueryIntent[])[i], primaryQuery: `need ${i}`, impressions: 1000 - i }))
    const res = build(samePage)
    const onPage = res.recommendations.filter((r) => r.affectedPage === 'https://x.co/one/')
    check('(bound) 5 same-page/same-category needs → ONE card with 5 needGroups', onPage.length === 1 && onPage[0].needGroups.length === 5)
  }
  {
    const set = [
      opp({ id: 'x1', opportunityType: 'improve_title_meta_ctr', page: 'https://x.co/a/', averagePosition: 8, impressions: 500, scoreComponents: { demandStrength: 0.6, positionOpportunity: 1, ctrGap: 0.4, contentMatchConfidence: 0, distinctPageSignal: 0 } }),
      opp({ id: 'x2', opportunityType: 'internal_link_support_candidate', page: 'https://x.co/b/', impressions: 2000 }),
      opp({ id: 'x3', opportunityType: 'improve_existing_page', page: 'https://x.co/c/', impressions: 900 }),
    ]
    const fwd = build(set).recommendations.map((r) => r.id)
    const rev = build(set.slice().reverse()).recommendations.map((r) => r.id)
    check('(determinism) order is input-order independent', fwd.join(',') === rev.join(','))
    check('(determinism) high priority first regardless of impressions', build(set).recommendations[0].relatedOpportunityIds.includes('x1') && build(set).recommendations[0].priority === 'high')
  }

  // ── Stable id ────────────────────────────────────────────────────────────────────
  {
    const o = [opp({ id: 'st', opportunityType: 'improve_existing_page', page: 'https://x.co/z/' })]
    const id90 = build(o, [], 90).recommendations[0].id
    const id90b = build(o, [], 90).recommendations[0].id
    const id28 = build(o, [], 28).recommendations[0].id
    check('(id) stable across builds; changes with window', id90 === id90b && id90 !== id28 && id90.startsWith('rec_'))
  }

  // ── pageLabel + no internal-field leak ───────────────────────────────────────────
  check('(label) pageLabel derived from slug', pageLabelFromUrl('https://x.co/מדריך-הליכון-מתקפל/') === 'מדריך הליכון מתקפל')
  {
    const r = build([opp({ id: 'leak', opportunityType: 'improve_existing_page', opportunityScore: 77, reasons: [{ code: 'high_demand', detail: 'x' }, { code: 'striking_distance_position', detail: 'y' }] })]).recommendations[0]
    const allowed = new Set(['id', 'category', 'priority', 'window', 'affectedPage', 'pageLabel', 'metrics', 'needGroups', 'relatedOpportunityIds', 'involvedPages', 'hasClearPrimary', 'reasonKeys'])
    check('(no-leak) card exposes only whitelisted client fields', Object.keys(r).every((k) => allowed.has(k)))
    const ALLOWED_REASONS = new Set(['high_search_demand', 'ranks_striking_distance', 'low_ctr_for_position', 'has_relevant_page', 'impressions_split_across_pages'])
    check('(no-leak) reasonKeys are whitelisted, translated (no raw codes/score)', r.reasonKeys.every((k) => ALLOWED_REASONS.has(k)) && r.reasonKeys.includes('high_search_demand') && r.reasonKeys.includes('ranks_striking_distance'))
    check('(no-leak) no opportunityScore / opportunityType / reasons on the card', !('opportunityScore' in r) && !('opportunityType' in r) && !('reasons' in r))
  }

  // ── FIX 2 — homepage label ───────────────────────────────────────────────────────
  check('(FIX2) isHomepageUrl: root with/without trailing slash, not a sub-page', isHomepageUrl('https://x.co/') && isHomepageUrl('https://x.co') && !isHomepageUrl('https://x.co/blog/'))
  for (const url of ['https://www.idosport.co.il/', 'https://www.idosport.co.il']) {
    const r = build([opp({ id: 'h', opportunityType: 'improve_existing_page', page: url })]).recommendations[0]
    check(`(FIX2) root URL → isHomepage + pageLabel null (${url})`, r.isHomepage === true && r.pageLabel === null)
  }
  {
    const he = getDashboardDictionary('he').projectDetail.contentSection.gscRecommendations
    const homeRec = build([opp({ id: 'h2', opportunityType: 'improve_existing_page', page: 'https://x.co/' })]).recommendations[0]
    const label = homeRec.isHomepage ? he.homepageLabel : (homeRec.pageLabel ?? he.homepageLabel)
    const homeTitle = he.titles.improve_page(label)
    check('(FIX2) homepage title uses "עמוד הבית"', homeTitle.includes('עמוד הבית'))
    check('(FIX2) "העמוד המדורג מדורג" can never appear (homepage + normal page)', !homeTitle.includes('המדורג מדורג') && !he.titles.improve_page('מדריך הליכון').includes('המדורג מדורג') && !he.titles.improve_ctr(label).includes('המדורג מדורג'))
  }

  // ── FIX 3 — truthful external-link button labels (UI source contract) ─────────────
  {
    const ui = readFileSync(join(ROOT, 'components/content/GscRecommendations.tsx'), 'utf8')
    const he = getDashboardDictionary('he').projectDetail.contentSection.gscRecommendations
    check('(FIX3) i18n has openPage / openPrimary / homepageLabel', typeof he.openPage === 'string' && typeof he.openPrimary === 'string' && typeof he.homepageLabel === 'string')
    check('(FIX3) A/B/C primary button opens the page with the openPage label', /r\.category !== 'page_overlap' && r\.affectedPage &&/.test(ui) && ui.includes('{t.openPage}'))
    check('(FIX3) overlap opens the PRIMARY page only when hasClearPrimary (no arbitrary first page)', /r\.category === 'page_overlap' && r\.hasClearPrimary && r\.affectedPage &&/.test(ui) && ui.includes('{t.openPrimary}'))
    check('(FIX3) no misleading per-category action labels are used', !/t\.actions\[/.test(ui) && !/openHref/.test(ui))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

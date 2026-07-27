/**
 * Stage E2A — deterministic opportunity engine (pure). Converts the query+page rows of ONE
 * succeeded sync run into explainable opportunities. Read-only: it never mutates content and
 * never imports or calls the recommendation engine.
 *
 * Unit of analysis: one conservative query cluster → one opportunity, anchored to the page
 * that receives the most impressions for that cluster. Metrics aggregate the cluster's rows
 * (clicks/impressions summed; CTR = clicks/impressions; position impression-weighted).
 */
import crypto from 'crypto'
import type { GscMetricRow } from '../summary'
import { classifyPage, isActionablePageType, type PageType } from './page-classify'
import { classifyIntent, type QueryIntent } from './query-intent'
import { clusterQueries } from './cluster'
import { urlKey, matchExistingContent } from './content-match'
import { scoreOpportunity, positionBand, median, type ScoreContext, type PositionBand } from './score'
import type { Opportunity, OpportunityType, OpportunitySignal, ContentEvidence, ContentMatch, OpportunityRunMeta, ScoreComponents, ReasonCode } from './types'

/**
 * Stable id: deterministic for a given PROJECT + window + cluster + normalized page — and
 * INDEPENDENT of syncRunId, so the same opportunity keeps its id across re-syncs. syncRunId
 * is still returned on the opportunity for traceability.
 */
function opportunityId(projectId: string, windowDays: number, clusterKey: string, page: string): string {
  const h = crypto.createHash('sha1').update(`${projectId}|${windowDays}|${clusterKey}|${urlKey(page)}`).digest('hex')
  return `opp_${h.slice(0, 16)}`
}

interface Candidate {
  clusterKey: string; primaryQuery: string; relatedQueries: string[]; page: string; pageType: PageType; queryIntent: QueryIntent
  clicks: number; impressions: number; ctr: number; averagePosition: number; distinctPageCount: number
  match: ContentMatch | null
  pageInSiteIndex: boolean; servesQuery: boolean
  pageBreakdown: { page: string; impressions: number; clicks: number }[]
}

/**
 * SERVING-ADEQUACY threshold. A page ranking beyond this position is not meaningfully
 * serving the query, even though GSC reports it as the ranking page.
 *
 * WHY THIS EXISTS: matchExistingContent's rule 1 compares the GSC ranking page against the
 * project's own indexed URLs. But GSC data IS (query, page) pairs where the page is on this
 * site — so for any well-indexed site that comparison is a TAUTOLOGY: it matched at
 * confidence 1 for essentially every query, determineType rule 2 then classified every one
 * as improve_existing_page, and supporting_content_candidate became unreachable. Measured:
 * 721 -> 0 and 471 -> 0 on two unrelated sites, while a third produced a 2.8% trickle ONLY
 * because its crawl was incomplete. The better a site was indexed, the more completely GSC
 * was disabled as a topic source.
 */
export const SERVING_POSITION_MAX = 20

/**
 * Assign exactly one PRIMARY, actionable opportunity type by deterministic precedence.
 * multi_page is NOT a type — it is added separately as a secondary signal. Query intent
 * GUIDES the type but never removes an opportunity. Precedence:
 *   1. meaningful CTR gap + sufficient project-relative demand → improve_title_meta_ctr
 *      (the GSC ranking page IS an existing page — no separate content match required)
 *   2. strong content match → same page: improve_existing_page / other page: internal_link_support_candidate
 *   3. no strong match → intent decides: informational → supporting_content_candidate;
 *      product/commercial/branded_or_service/support → improve_existing_page;
 *      unknown → article/unknown page: supporting_content_candidate; else improve_existing_page.
 */
function determineType(c: Candidate, components: ScoreComponents): { type: OpportunityType; reason?: string } {
  if (components.ctrGap > 0 && components.demandStrength >= 0.3) return { type: 'improve_title_meta_ctr', reason: 'ctr_opportunity_on_ranking_page' }
  if (c.match && c.match.confidence >= 0.5) {
    const thisPage = c.match.matchType === 'url' || (!!c.match.matchedUrl && urlKey(c.match.matchedUrl) === urlKey(c.page))
    return thisPage ? { type: 'improve_existing_page' } : { type: 'internal_link_support_candidate' }
  }
  // No strong content match — intent guides (never destructive).
  if (c.queryIntent === 'informational') return { type: 'supporting_content_candidate', reason: 'intent_supports_new_content' }
  if (c.queryIntent === 'product' || c.queryIntent === 'commercial' || c.queryIntent === 'branded_or_service' || c.queryIntent === 'support')
    return { type: 'improve_existing_page', reason: 'intent_prefers_existing_page' }
  // unknown intent → page type decides.
  if (c.pageType === 'article' || c.pageType === 'unknown') return { type: 'supporting_content_candidate', reason: 'intent_supports_new_content' }
  return { type: 'improve_existing_page', reason: 'intent_prefers_existing_page' }
}

const INTENT_REASON_DETAIL: Record<string, string> = {
  intent_supports_new_content: 'Query intent suggests new supporting content rather than an existing page.',
  intent_prefers_existing_page: 'Query intent points to strengthening the existing ranking page.',
  ctr_opportunity_on_ranking_page: 'The page already ranks — a CTR (title/meta) gain is available without new content.',
}

export function buildOpportunities(rows: GscMetricRow[], evidence: ContentEvidence, runMeta: OpportunityRunMeta): Opportunity[] {
  // Cluster distinct queries by their total (cross-page) impressions.
  const imprByQuery = new Map<string, number>()
  for (const r of rows) imprByQuery.set(r.query, (imprByQuery.get(r.query) ?? 0) + r.impressions)
  const clusters = clusterQueries(Array.from(imprByQuery, ([query, impressions]) => ({ query, impressions })))

  const candidates: Candidate[] = []
  for (const cluster of clusters) {
    const memberSet = new Set(cluster.members)
    const clusterRows = rows.filter((r) => memberSet.has(r.query))
    if (clusterRows.length === 0) continue
    let clicks = 0, impressions = 0, weightedPos = 0
    const pageImpr = new Map<string, number>()
    const pageClicks = new Map<string, number>()
    for (const r of clusterRows) {
      clicks += r.clicks; impressions += r.impressions; weightedPos += r.position * r.impressions
      pageImpr.set(r.page, (pageImpr.get(r.page) ?? 0) + r.impressions)
      pageClicks.set(r.page, (pageClicks.get(r.page) ?? 0) + r.clicks)
    }
    const distinctPageCount = pageImpr.size
    // Observed per-page split (impressions DESC, urlKey ASC) — populated only for multi-page
    // clusters, so the client "overlapping pages" review can show the actual involved pages.
    const pageBreakdown = distinctPageCount > 1
      ? Array.from(pageImpr.entries())
        .map(([pg, imp]) => ({ page: pg, impressions: imp, clicks: pageClicks.get(pg) ?? 0 }))
        .sort((a, b) => b.impressions - a.impressions || (urlKey(a.page) < urlKey(b.page) ? -1 : urlKey(a.page) > urlKey(b.page) ? 1 : 0))
      : []
    // Representative page: most impressions (tie → smallest urlKey, then raw string).
    const page = Array.from(pageImpr.entries()).sort((a, b) =>
      b[1] - a[1] || (urlKey(a[0]) < urlKey(b[0]) ? -1 : urlKey(a[0]) > urlKey(b[0]) ? 1 : (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))[0][0]
    const pageType = classifyPage(page)
    if (!isActionablePageType(pageType)) continue // utility/admin/account/search/archive → observed, not actionable
    const ctr = impressions > 0 ? clicks / impressions : 0
    const averagePosition = impressions > 0 ? weightedPos / impressions : 0
    // SERVING ADEQUACY — the single insertion point. matchExistingContent is UNCHANGED; we
    // only decide what its result means given how the page actually performs.
    //
    //   pageInSiteIndex : rule 1 fired, i.e. the ranking page is one of OUR indexed URLs.
    //                     A non-url match (keyword/title overlap) does NOT resolve the page.
    //   servesQuery     : in the index AND ranking within SERVING_POSITION_MAX.
    //
    // Only a resolved-but-not-serving page yields a null match (=> supporting candidate).
    // An UNRESOLVED page keeps whatever match it had and is additionally barred from
    // eligibility by the adapter: we cannot see that page, so we cannot verify it does not
    // already target this query, and admitting it could put two pages on one query.
    const rawMatch = matchExistingContent(page, cluster.primaryQuery, evidence)
    const pageInSiteIndex = !!rawMatch && rawMatch.matchType === 'url'
    const servesQuery = pageInSiteIndex && averagePosition <= SERVING_POSITION_MAX
    const match = pageInSiteIndex && !servesQuery ? null : rawMatch
    // Intent is computed BEFORE type selection so it can guide (never remove) the type.
    const queryIntent = classifyIntent(cluster.primaryQuery)
    candidates.push({ clusterKey: cluster.key, primaryQuery: cluster.primaryQuery, relatedQueries: cluster.relatedQueries, page, pageType, queryIntent, clicks, impressions, ctr, averagePosition, distinctPageCount, match, pageBreakdown, pageInSiteIndex, servesQuery })
  }

  // Project-relative scoring context: max impressions + per-band median CTR (this dataset only).
  const maxImpressions = candidates.reduce((m, c) => Math.max(m, c.impressions), 0)
  const bandCtrs: Record<PositionBand, number[]> = { none: [], p1_3: [], p4_10: [], p11_20: [], p21_plus: [] }
  for (const c of candidates) bandCtrs[positionBand(c.averagePosition)].push(c.ctr)
  const ctx: ScoreContext = {
    maxImpressions,
    bandMedianCtr: { none: median(bandCtrs.none), p1_3: median(bandCtrs.p1_3), p4_10: median(bandCtrs.p4_10), p11_20: median(bandCtrs.p11_20), p21_plus: median(bandCtrs.p21_plus) },
  }

  const opps: Opportunity[] = candidates.map((c) => {
    const { score, components, reasons } = scoreOpportunity(
      { impressions: c.impressions, ctr: c.ctr, averagePosition: c.averagePosition, distinctPageCount: c.distinctPageCount, contentMatchConfidence: c.match?.confidence ?? 0 },
      ctx,
    )
    const typed = determineType(c, components)
    const allReasons: ReasonCode[] = typed.reason ? [...reasons, { code: typed.reason, detail: INTENT_REASON_DETAIL[typed.reason] ?? typed.reason }] : reasons
    // Secondary diagnostic signals — independent of the primary type. multi_page is a signal
    // only (never confirmed cannibalization); the reason code + warning stay on the record.
    const signals: OpportunitySignal[] = c.distinctPageCount > 1 ? ['multi_page_signal'] : []
    return {
      id: opportunityId(runMeta.projectId, runMeta.windowDays, c.clusterKey, c.page),
      primaryQuery: c.primaryQuery,
      relatedQueries: c.relatedQueries,
      page: c.page,
      pageType: c.pageType,
      queryIntent: c.queryIntent,
      clicks: c.clicks,
      impressions: c.impressions,
      ctr: c.ctr,
      averagePosition: c.averagePosition,
      distinctPageCount: c.distinctPageCount,
      opportunityType: typed.type,
      signals,
      opportunityScore: score,
      scoreComponents: components,
      reasons: allReasons,
      existingContentMatch: c.match,
      pageInSiteIndex: c.pageInSiteIndex,
      servesQuery: c.servesQuery,
      ...(c.pageBreakdown.length > 0 ? { pageBreakdown: c.pageBreakdown } : {}),
      windowDays: runMeta.windowDays,
      syncRunId: runMeta.syncRunId,
      dateStart: runMeta.dateStart,
      dateEnd: runMeta.dateEnd,
    }
  })

  // Stable deterministic ordering: opportunityScore DESC, impressions DESC, id ASC.
  return opps.sort((a, b) => b.opportunityScore - a.opportunityScore || b.impressions - a.impressions || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

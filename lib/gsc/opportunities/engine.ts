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
import type { Opportunity, OpportunityType, ContentEvidence, ContentMatch, OpportunityRunMeta, ScoreComponents, ReasonCode } from './types'

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
}

/**
 * Assign exactly one opportunity type by deterministic precedence. Query intent GUIDES the
 * type but never removes an opportunity. Precedence:
 *   1. multiple distinct pages → multi_page_signal (signal only)
 *   2. meaningful CTR gap + sufficient project-relative demand → improve_title_meta_ctr
 *      (the GSC ranking page IS an existing page — no separate content match required)
 *   3. strong content match → same page: improve_existing_page / other page: internal_link_support_candidate
 *   4. no strong match → intent decides: informational → supporting_content_candidate;
 *      product/commercial/branded_or_service/support → improve_existing_page;
 *      unknown → article/unknown page: supporting_content_candidate; else improve_existing_page.
 */
function determineType(c: Candidate, components: ScoreComponents): { type: OpportunityType; reason?: string } {
  if (c.distinctPageCount > 1) return { type: 'multi_page_signal' } // never "confirmed cannibalization"
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
    for (const r of clusterRows) {
      clicks += r.clicks; impressions += r.impressions; weightedPos += r.position * r.impressions
      pageImpr.set(r.page, (pageImpr.get(r.page) ?? 0) + r.impressions)
    }
    const distinctPageCount = pageImpr.size
    // Representative page: most impressions (tie → smallest urlKey, then raw string).
    const page = Array.from(pageImpr.entries()).sort((a, b) =>
      b[1] - a[1] || (urlKey(a[0]) < urlKey(b[0]) ? -1 : urlKey(a[0]) > urlKey(b[0]) ? 1 : (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))[0][0]
    const pageType = classifyPage(page)
    if (!isActionablePageType(pageType)) continue // utility/admin/account/search/archive → observed, not actionable
    const ctr = impressions > 0 ? clicks / impressions : 0
    const averagePosition = impressions > 0 ? weightedPos / impressions : 0
    const match = matchExistingContent(page, cluster.primaryQuery, evidence)
    // Intent is computed BEFORE type selection so it can guide (never remove) the type.
    const queryIntent = classifyIntent(cluster.primaryQuery)
    candidates.push({ clusterKey: cluster.key, primaryQuery: cluster.primaryQuery, relatedQueries: cluster.relatedQueries, page, pageType, queryIntent, clicks, impressions, ctr, averagePosition, distinctPageCount, match })
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
      opportunityScore: score,
      scoreComponents: components,
      reasons: allReasons,
      existingContentMatch: c.match,
      windowDays: runMeta.windowDays,
      syncRunId: runMeta.syncRunId,
      dateStart: runMeta.dateStart,
      dateEnd: runMeta.dateEnd,
    }
  })

  // Stable deterministic ordering: opportunityScore DESC, impressions DESC, id ASC.
  return opps.sort((a, b) => b.opportunityScore - a.opportunityScore || b.impressions - a.impressions || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

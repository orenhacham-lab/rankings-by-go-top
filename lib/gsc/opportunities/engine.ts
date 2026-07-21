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
import { classifyIntent } from './query-intent'
import { clusterQueries } from './cluster'
import { urlKey, matchExistingContent } from './content-match'
import { scoreOpportunity, positionBand, median, type ScoreContext, type PositionBand } from './score'
import type { Opportunity, OpportunityType, ContentEvidence, ContentMatch, OpportunityRunMeta, ScoreComponents } from './types'

/** Stable id: deterministic for a given run + cluster + page. */
function opportunityId(runMeta: OpportunityRunMeta, clusterKey: string, page: string): string {
  const h = crypto.createHash('sha1').update(`${runMeta.syncRunId}|${runMeta.windowDays}|${clusterKey}|${urlKey(page)}`).digest('hex')
  return `opp_${h.slice(0, 16)}`
}

interface Candidate {
  clusterKey: string; primaryQuery: string; relatedQueries: string[]; page: string; pageType: PageType
  clicks: number; impressions: number; ctr: number; averagePosition: number; distinctPageCount: number
  match: ContentMatch | null
}

/** Assign exactly one opportunity type by deterministic precedence. */
function determineType(c: Candidate, components: ScoreComponents): OpportunityType {
  if (c.distinctPageCount > 1) return 'multi_page_signal' // signal only — never "confirmed cannibalization"
  if (c.match && c.match.confidence >= 0.5) {
    const thisPage = c.match.matchType === 'url' || (!!c.match.matchedUrl && urlKey(c.match.matchedUrl) === urlKey(c.page))
    if (thisPage) {
      if (components.ctrGap > 0 && components.demandStrength >= 0.3) return 'improve_title_meta_ctr'
      return 'improve_existing_page'
    }
    return 'internal_link_support_candidate' // a relevant page exists, but not the ranking one
  }
  return 'supporting_content_candidate'
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
    candidates.push({ clusterKey: cluster.key, primaryQuery: cluster.primaryQuery, relatedQueries: cluster.relatedQueries, page, pageType, clicks, impressions, ctr, averagePosition, distinctPageCount, match })
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
    return {
      id: opportunityId(runMeta, c.clusterKey, c.page),
      primaryQuery: c.primaryQuery,
      relatedQueries: c.relatedQueries,
      page: c.page,
      pageType: c.pageType,
      queryIntent: classifyIntent(c.primaryQuery),
      clicks: c.clicks,
      impressions: c.impressions,
      ctr: c.ctr,
      averagePosition: c.averagePosition,
      distinctPageCount: c.distinctPageCount,
      opportunityType: determineType(c, components),
      opportunityScore: score,
      scoreComponents: components,
      reasons,
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

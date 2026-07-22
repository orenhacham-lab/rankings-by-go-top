/**
 * Stage E2C — client-facing Search Console recommendations BUILDER (pure, deterministic).
 *
 * Transforms Stage-E2A opportunities into a small bounded set of plain-language page recommendations
 * across categories A–D. It reuses ONLY the GSC layer (opportunity records + GSC-side normalization +
 * urlKey); it imports NOTHING from lib/content/recommendations, so the accepted reco→adapter→E2A
 * isolation and E3A (the only GSC→generation path) are untouched.
 *
 * Bounded + deterministic: ≤ maxTotal (default 20) total, ≤ maxPerPage (default 2) per affected page,
 * ordered by priority → impressions → id. Ambiguous/low-value cards are suppressed rather than shown.
 * No numeric score or internal label ever leaves this layer.
 */
import crypto from 'crypto'
import { urlKey } from '../opportunities/content-match'
import { contentTokenSet } from '../opportunities/normalize'
import type { Opportunity, QueryIntent } from '../opportunities/types'
import type {
  ClientRecommendation, ClientRecCategory, ClientPriority, ClientReasonKey,
  ClientNeedGroup, ClientInvolvedPage, BuildRecommendationsResult,
} from './types'

const DEFAULT_MAX_TOTAL = 20
const DEFAULT_MAX_PER_PAGE = 2
const PRIMARY_PAGE_MIN_SHARE = 0.5 // a page is the "likely primary" only with ≥50% of impressions

/** GSC-side intent cluster (no dependency on the reco-side semantic-dup). */
type IntentCluster = 'info' | 'buy' | 'local' | 'other'
function intentCluster(intent: QueryIntent): IntentCluster {
  if (intent === 'informational') return 'info'
  if (intent === 'commercial' || intent === 'product') return 'buy'
  if (intent === 'branded_or_service') return 'local'
  return 'other' // support / unknown
}

/** Deterministic source order: opportunityScore DESC, impressions DESC, id ASC. */
function sourceOrder(a: Opportunity, b: Opportunity): number {
  return b.opportunityScore - a.opportunityScore || b.impressions - a.impressions || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** Human, client-safe label from a URL slug (last non-empty path segment, decoded, hyphens→spaces).
 *  Never an internal term; null when it cannot be derived. */
export function pageLabelFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const seg = u.pathname.split('/').filter(Boolean).pop()
    if (!seg) return null
    const label = decodeURIComponent(seg).replace(/[-_]+/g, ' ').replace(/\.(html?|php|aspx?)$/i, '').trim()
    return label.length > 0 ? label : null
  } catch {
    return null
  }
}

/** A multi-page cluster is a MATERIAL overlap (→ category D) when no page clearly dominates, or
 *  three or more pages compete. Otherwise the base A/B/C recommendation is kept. */
function isMaterialOverlap(o: Opportunity): boolean {
  const bd = o.pageBreakdown ?? []
  if (o.distinctPageCount <= 1 || bd.length < 2) return false
  const total = bd.reduce((s, p) => s + p.impressions, 0)
  const topShare = total > 0 ? bd[0].impressions / total : 1
  return topShare < PRIMARY_PAGE_MIN_SHARE || o.distinctPageCount >= 3
}

/** Base category for a non-overlap opportunity (supporting_content_candidate is excluded upstream). */
function baseCategory(o: Opportunity): ClientRecCategory | null {
  switch (o.opportunityType) {
    case 'improve_title_meta_ctr': return 'improve_ctr'
    case 'improve_existing_page': return 'improve_page'
    case 'internal_link_support_candidate': return 'internal_links'
    default: return null // supporting_content_candidate → not shown in this tab
  }
}

const STRIKING = (avgPos: number) => avgPos > 3 && avgPos <= 20

/** Priority from the representative opportunity's deterministic components (never a numeric score). */
function priorityFor(category: ClientRecCategory, rep: Opportunity): ClientPriority {
  const c = rep.scoreComponents
  const striking = STRIKING(rep.averagePosition)
  if (category === 'page_overlap') return 'review' // soft signal — never high, never confirmed
  if (category === 'improve_ctr') {
    if (c.demandStrength >= 0.5 && c.ctrGap >= 0.3 && striking) return 'high'
    if (c.ctrGap > 0 && striking) return 'good'
    return 'review'
  }
  if (category === 'improve_page') {
    if (c.demandStrength >= 0.5 && c.contentMatchConfidence >= 0.9 && striking) return 'high'
    if (c.demandStrength >= 0.3 && striking) return 'good'
    return 'review'
  }
  // internal_links
  if (c.demandStrength >= 0.5 && striking) return 'good'
  return 'review'
}

const REASON_MAP: Record<string, ClientReasonKey> = {
  high_demand: 'high_search_demand',
  striking_distance_position: 'ranks_striking_distance',
  ctr_below_band_median: 'low_ctr_for_position',
  has_existing_content_match: 'has_relevant_page',
  multi_page_signal: 'impressions_split_across_pages',
}
function reasonKeysFor(category: ClientRecCategory, members: Opportunity[]): ClientReasonKey[] {
  const keys = new Set<ClientReasonKey>()
  for (const o of members) for (const r of o.reasons) { const k = REASON_MAP[r.code]; if (k) keys.add(k) }
  if (category === 'page_overlap') keys.add('impressions_split_across_pages')
  // Deterministic order.
  const ORDER: ClientReasonKey[] = ['high_search_demand', 'ranks_striking_distance', 'low_ctr_for_position', 'has_relevant_page', 'impressions_split_across_pages']
  return ORDER.filter((k) => keys.has(k))
}

const PRIORITY_RANK: Record<ClientPriority, number> = { high: 0, good: 1, review: 2 }

function stableId(projectId: string, window: number, category: string, pageKey: string, needSig: string): string {
  const h = crypto.createHash('sha1').update(`${projectId}|${window}|${category}|${pageKey}|${needSig}`).digest('hex')
  return `rec_${h.slice(0, 16)}`
}

interface Group { key: string; category: ClientRecCategory; pageKey: string; needSig: string; affectedPage: string | null; members: Opportunity[] }

export function buildClientRecommendations(params: {
  opportunities: Opportunity[]
  decidedOpportunityIds: Set<string>
  window: 28 | 90
  projectId: string
  limits?: { maxTotal?: number; maxPerPage?: number }
}): BuildRecommendationsResult {
  const maxTotal = params.limits?.maxTotal ?? DEFAULT_MAX_TOTAL
  const maxPerPage = params.limits?.maxPerPage ?? DEFAULT_MAX_PER_PAGE

  // Eligible opportunities: drop new-content candidates (category E → E3A only), drop decided
  // (handled/hidden), drop empty-score noise.
  const eligible = params.opportunities
    .filter((o) => o.opportunityType !== 'supporting_content_candidate')
    .filter((o) => !params.decidedOpportunityIds.has(o.id))
    .filter((o) => o.opportunityScore > 0 && o.impressions > 0)

  // Assign each eligible opportunity to exactly one category + grouping key.
  const groups = new Map<string, Group>()
  for (const o of eligible) {
    let category: ClientRecCategory | null
    let pageKey: string
    let needSig: string
    let affectedPage: string | null
    if (isMaterialOverlap(o)) {
      category = 'page_overlap'
      pageKey = 'overlap'
      needSig = contentTokenSet(o.primaryQuery).join(' ') || o.id // distinct overlap need
      const bd = o.pageBreakdown ?? []
      const total = bd.reduce((s, p) => s + p.impressions, 0)
      affectedPage = bd.length > 0 && total > 0 && bd[0].impressions / total >= PRIMARY_PAGE_MIN_SHARE ? bd[0].page : null
    } else {
      category = baseCategory(o)
      if (!category) continue
      pageKey = urlKey(o.page)
      needSig = intentCluster(o.queryIntent) // page-owned consolidation groups by intent cluster
      affectedPage = o.page
    }
    const key = `${category}|${pageKey}|${needSig}`
    const g = groups.get(key)
    if (g) g.members.push(o)
    else groups.set(key, { key, category, pageKey, needSig, affectedPage, members: [o] })
  }

  // Build one card per group (page-owned consolidation; distinct needs preserved as needGroups).
  const cards: ClientRecommendation[] = Array.from(groups.values()).map((g) => {
    const members = g.members.slice().sort(sourceOrder)
    const rep = members[0]
    const totalImpr = members.reduce((s, o) => s + o.impressions, 0)
    const totalClicks = members.reduce((s, o) => s + o.clicks, 0)
    const weightedPos = members.reduce((s, o) => s + o.averagePosition * o.impressions, 0)
    const needGroups: ClientNeedGroup[] = members.map((o) => ({ representativeQuery: o.primaryQuery, relatedQueries: o.relatedQueries, opportunityIds: [o.id] }))
    const relatedOpportunityIds = members.map((o) => o.id)

    let involvedPages: ClientInvolvedPage[] | undefined
    let hasClearPrimary: boolean | undefined
    if (g.category === 'page_overlap') {
      const bd = (rep.pageBreakdown ?? [])
      hasClearPrimary = g.affectedPage !== null
      involvedPages = bd.map((p) => ({ url: p.page, impressions: p.impressions, clicks: p.clicks, isPrimary: hasClearPrimary === true && p.page === g.affectedPage }))
    }

    return {
      id: stableId(params.projectId, params.window, g.category, g.pageKey, g.needSig),
      category: g.category,
      priority: priorityFor(g.category, rep),
      window: params.window,
      affectedPage: g.affectedPage,
      pageLabel: g.affectedPage ? pageLabelFromUrl(g.affectedPage) : null,
      metrics: { impressions: totalImpr, clicks: totalClicks, ctr: totalImpr > 0 ? totalClicks / totalImpr : 0, averagePosition: totalImpr > 0 ? weightedPos / totalImpr : rep.averagePosition },
      needGroups,
      relatedOpportunityIds,
      ...(involvedPages ? { involvedPages, hasClearPrimary } : {}),
      reasonKeys: reasonKeysFor(g.category, members),
    }
  })

  // Deterministic ordering: priority → impressions DESC → id ASC.
  cards.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.metrics.impressions - a.metrics.impressions || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  // Bound: ≤ maxPerPage per affected page (null-page overlaps are each their own distinct need,
  // not page-capped), then ≤ maxTotal overall. Suppress the rest.
  const perPage = new Map<string, number>()
  const bounded: ClientRecommendation[] = []
  for (const c of cards) {
    if (bounded.length >= maxTotal) break
    if (c.affectedPage) {
      const k = urlKey(c.affectedPage)
      const n = perPage.get(k) ?? 0
      if (n >= maxPerPage) continue
      perPage.set(k, n + 1)
    }
    bounded.push(c)
  }

  const affectedPages = new Set(bounded.map((c) => c.affectedPage).filter((p): p is string => !!p).map(urlKey)).size
  return { recommendations: bounded, summary: { actionable: bounded.length, affectedPages } }
}

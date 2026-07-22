/**
 * Stage E3A — recommendation-side integration of the GSC evidence source. This is the ONE
 * place the recommendation engine imports the GSC adapter (direction: reco → adapter → E2A).
 * It is additive and flag-gated: when disabled it returns an empty result and mutates nothing,
 * so the existing brief pool, order, prompts, target count and output are byte-for-byte unchanged.
 *
 * It maps adapter candidates → the EXISTING OpportunityBrief contract, re-applies the accepted
 * coverage / ownership / semantic-duplicate guards, MERGES a strong match into an existing brief
 * (attaching GSC provenance instead of duplicating), applies a deterministic source budget, and
 * returns new GSC-origin briefs to append to the working pool. GSC never bypasses a safeguard.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { loadGscRecommendationCandidates } from '@/lib/gsc/recommendations/adapter'
import type { GscInputDiagnostics, GscCandidate, SelectedGscBriefDetail } from '@/lib/gsc/recommendations/types'
import type { OpportunityBrief } from './opportunity-brief'
import type { OpportunityFamily } from './opportunity-synthesis'
import type { SearchIntent } from './opportunity'
import { topicSignature, isHighConfidenceDuplicate, type TopicSignature } from './semantic-dup'
import { partitionSubjectBearing, collapseGscCandidates } from './gsc-need-collapse'
import type { SearchNeed } from './opportunity-brief'

type Admin = ReturnType<typeof createAdminClient>

/** Deterministic source budget from the request targetCount (or the batch floor when absent). */
export function gscSourceBudget(targetCount: number | null | undefined): number {
  const base = targetCount && targetCount > 0 ? targetCount : 4 /* synthesis batch floor */
  return Math.min(60, Math.max(20, base * 3))
}

function mapIntent(gsc: string): { intent: SearchIntent; family: OpportunityFamily; searchNeed: SearchNeed } {
  return gsc === 'commercial'
    ? { intent: 'commercial', family: 'commercial', searchNeed: 'comparison' }
    : { intent: 'informational', family: 'informational', searchNeed: 'informational' }
}

export interface GscIntegrationParams {
  admin: Admin
  projectId: string
  userId: string
  enabled: boolean
  targetCount: number
  /** The current working pool — matched briefs receive GSC provenance IN PLACE (additive). */
  existingPool: OpportunityBrief[]
  isCoveredByContent: (subject: string) => boolean
  isOwnedByEntity: (subject: string) => boolean
  /** Existing pending / generated / indexed / article-topic signatures (the accepted guard set). */
  blogDuplicateSignatures: { sig: TopicSignature; source: string }[]
}

/** Integrate GSC evidence. Never throws; disabled → empty + no mutation. */
export async function integrateGscBriefs(params: GscIntegrationParams): Promise<{ gscBriefs: OpportunityBrief[]; diagnostics: GscInputDiagnostics }> {
  const { diagnostics, candidates } = await loadGscRecommendationCandidates(params.admin, { projectId: params.projectId, userId: params.userId }, { enabled: params.enabled })
  return applyGscBriefIntegration(candidates, diagnostics, params)
}

export interface ApplyParams {
  enabled: boolean
  targetCount: number
  existingPool: OpportunityBrief[]
  isCoveredByContent: (subject: string) => boolean
  isOwnedByEntity: (subject: string) => boolean
  blogDuplicateSignatures: { sig: TopicSignature; source: string }[]
}

/**
 * PURE map/merge/budget over adapter candidates. Applies the accepted coverage/ownership +
 * pending/generated/indexed duplicate guards, merges a strong match into an existing brief
 * (attaching GSC provenance in place), and admits the rest as new GSC-origin briefs within the
 * deterministic source budget. Order is candidate order (score→impressions→id) — input-order
 * independent. Mutates `diagnostics` (counts) and matched existing briefs' sourceEvidence.
 */
export function applyGscBriefIntegration(candidates: GscCandidate[], diagnostics: GscInputDiagnostics, params: ApplyParams): { gscBriefs: OpportunityBrief[]; diagnostics: GscInputDiagnostics } {
  if (!params.enabled || candidates.length === 0) return { gscBriefs: [], diagnostics }

  const bump = (code: string) => { diagnostics.rejectionCounts[code] = (diagnostics.rejectionCounts[code] ?? 0) + 1 }

  // (4) SUBJECT-BEARING GUARD — reject subjectless generic queries ("מה המחיר" / "what is the
  // price": only generic framing tokens, no subject) BEFORE collapse + budget. Domain-neutral:
  // a real subject-bearing token must survive framing removal (never a project vocabulary check).
  const { subjectBearing, subjectless } = partitionSubjectBearing(candidates)
  if (subjectless.length > 0) {
    diagnostics.subjectlessGenericRejectedCount += subjectless.length
    diagnostics.rejectionCounts['subjectless_generic_query'] = (diagnostics.rejectionCounts['subjectless_generic_query'] ?? 0) + subjectless.length
  }
  // (5)(6)(7) COLLAPSE strong near-duplicate needs into ONE unique need (aggregated metrics +
  // preserved provenance, representative = highest source order). The source budget below then
  // applies to UNIQUE needs, not raw query variants.
  const { needs, collapsedNearDuplicateCount } = collapseGscCandidates(subjectBearing)
  diagnostics.collapsedNearDuplicateCount += collapsedNearDuplicateCount
  diagnostics.uniqueNeedCountBeforeBudget = needs.length

  const newBriefs: OpportunityBrief[] = []
  // FIX 4 — one safe diagnostic record per NEW GSC brief, aligned 1:1 with newBriefs. Source
  // metrics only (no OAuth/tokens/prompt/article bodies); synthesis fields stay null here.
  const newBriefDetails: SelectedGscBriefDetail[] = []

  for (const need of needs) {
    const c = need.candidate
    const subject = c.primaryQuery
    // (6) existing coverage / ownership guards (the accepted route-grade helpers).
    if (params.isCoveredByContent(subject) || params.isOwnedByEntity(subject)) { diagnostics.rejectedByExistingCoverageCount++; bump('existing_coverage'); continue }
    const { intent, family, searchNeed } = mapIntent(c.queryIntent)
    const sig = topicSignature(subject, intent)
    // (6) pending / generated_articles / indexed URL / article_topic duplicates (accepted guard).
    const blocked = params.blogDuplicateSignatures.find((bd) => isHighConfidenceDuplicate(sig, bd.sig))
    if (blocked) { diagnostics.rejectedByExistingCoverageCount++; bump(`duplicate_${blocked.source}`); continue }

    // (F.3/4) strong match to an existing brief → attach GSC provenance, do not duplicate.
    const match = params.existingPool.find((b) => isHighConfidenceDuplicate(sig, topicSignature(b.subject, b.intendedIntent)))
    if (match) {
      match.sourceEvidence.push({ kind: 'gsc', text: gscEvidenceText(c) })
      diagnostics.mergedIntoExistingCount++
      // selectedBriefIds carries the ACTUAL brief id (the matched normal brief).
      diagnostics.selectedBriefIds.push(match.opportunityId)
      // Separate truth source for merged evidence — one record per source GSC opportunity.
      diagnostics.mergedGscEvidence.push({ gscOpportunityId: c.opportunityId, briefId: match.opportunityId, consumed: false, accepted: false })
      continue
    }

    // (F.5) a genuinely new content gap → a GSC-origin brief.
    // FIX 1 — map GSC opportunityScore (0–100) into the existing brief score scale (0–1) so
    // the shared prioritizer's briefScore-DESC ordering is on ONE scale (no hidden 100× boost).
    const normalizedOpportunityScore = Math.round((Math.min(100, Math.max(0, c.opportunityScore)) / 100) * 10000) / 10000
    newBriefs.push({
      opportunityId: `gsc:${c.opportunityId}`,
      subject,
      searchNeed,
      family,
      sourceEvidence: [
        { kind: 'gsc', text: gscEvidenceText(c) },
        ...c.relatedQueries.slice(0, 5).map((q) => ({ kind: 'gsc' as const, text: `related query: ${q}` })),
      ],
      // GSC impressions are not verified keyword-research volume → no claimed demand volume.
      alignedDemandQuery: null,
      demandVolumeSource: null,
      intendedIntent: intent,
      intendedPageType: 'article',
      existingContentGap: true,
      relatedEntities: [],
      publishedCoverage: [],
      confidence: normalizedOpportunityScore,
      briefScore: normalizedOpportunityScore,
    })
    newBriefDetails.push({
      briefId: `gsc:${c.opportunityId}`,
      gscOpportunityId: c.opportunityId,
      primaryQuery: c.primaryQuery,
      queryIntent: c.queryIntent,
      opportunityScore: c.opportunityScore,
      impressions: c.impressions,
      clicks: c.clicks,
      averagePosition: c.averagePosition,
      // Collapse provenance — one selected brief per unique need; all raw sources stay traceable.
      relatedOpportunityIds: need.relatedOpportunityIds,
      relatedQueries: need.relatedQueries,
      relatedPages: need.relatedPages,
      relatedReasonCodes: need.relatedReasonCodes,
      relatedSignals: need.relatedSignals,
      collapsedOpportunityCount: need.collapsedOpportunityCount,
      priorityTier: null,
      finalSynthesisRank: null,
      consumed: false,
      consumedRound: null,
      acceptedByEngine: false,
      finalOutcome: null,
    })
  }

  // (G) deterministic source budget — candidates already ordered score→impressions→id.
  const budget = gscSourceBudget(params.targetCount)
  const selected = newBriefs.slice(0, budget)
  const deferred = newBriefs.slice(budget)
  // Details mirror the admitted (within-budget) new briefs, in the same deterministic order.
  diagnostics.selectedGscBriefDetails = newBriefDetails.slice(0, budget)
  diagnostics.addedAsNewBriefCount = selected.length
  diagnostics.deferredByBudgetCount = deferred.length // NOT rejected — merely outside the current source budget
  for (const b of selected) diagnostics.selectedBriefIds.push(b.opportunityId)
  // Deterministic first-seen dedup (a normal brief that received several merged GSC opportunities
  // appears once; each source opportunity stays traceable via mergedGscEvidence).
  diagnostics.selectedBriefIds = Array.from(new Set(diagnostics.selectedBriefIds))

  return { gscBriefs: selected, diagnostics }
}

/** Concise GSC evidence line (metrics for admission/diagnostics — never prompt prose). */
function gscEvidenceText(c: { primaryQuery: string; impressions: number; clicks: number; averagePosition: number; opportunityScore: number }): string {
  return `Search Console gap: "${c.primaryQuery}" — ${c.impressions} impressions, ${c.clicks} clicks, avg pos ${c.averagePosition.toFixed(1)} (score ${c.opportunityScore})`
}

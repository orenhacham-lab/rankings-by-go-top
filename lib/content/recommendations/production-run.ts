/**
 * PRODUCTION Pro-first RUN (Stage D) — impure orchestration around the FROZEN engine.
 *
 * Wires the validated engine building blocks (prepareBriefRun → synthesizeFromSnapshot
 * → finalizeRecommendationAttempt) into the global Pro-first production policy. It does
 * NOT modify any engine logic — it only sequences calls and applies PURE decisions.
 * Exactly one immutable snapshot; discovery runs once; Pro runs once; Flash is a single
 * fallback on the SAME snapshot under strict conditions.
 *
 * Flash is ONLY ever a REAL Flash-class model: after a proven Pro-zero + non-empty
 * model-rescuable rescue, a Flash-class model is resolved; if the resolver fails OR
 * returns a non-Flash-class id, Flash is NOT run (flash_unavailable). A Pro model id is
 * NEVER used as a Flash override. The fallback budget is checked with the EXACT first
 * Flash-round prompt (the same one synthesizeFromSnapshot would build), without
 * consuming a call slot.
 *
 * Each attempt is finalized EXACTLY ONCE; the SELECTED attempt's finalization is
 * returned so the route persists precisely selectedFinalization.finalSuggestions.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { RunCostController } from './run-cost-controller'
import { prepareBriefRun, synthesizeFromSnapshot, type BriefRunSnapshot, type BriefRunDiagnostics } from './generate-from-briefs'
import { finalizeRecommendationAttempt, type FinalizedAttemptResult } from './finalize-attempt'
import { buildBriefSynthesisPrompt, synthesisOutputBudget } from './brief-synthesis'
import { cloneKeywordGuard, deriveBriefOutcomes } from './smart-run-harness'
import { computeRescueAccounting } from './smart-controller'
import { resolveAvailableRecommendationModel } from './model-availability'
import type { ModelPath } from './model-select'
import { selectProductionBatch, isFlashClassModel, type FallbackReason, type ProductionSelected } from './production-controller'
import type { BlogAcceptanceContext } from './blog-article-acceptance'
import type { TopicSuggestion } from './types'

type Admin = ReturnType<typeof createAdminClient>
type Synth = Awaited<ReturnType<typeof synthesizeFromSnapshot>>

/** Full production provenance (Preview-only diagnostics; never shown to the customer).
 *  persistedWrites is filled by the route from the REAL persistence outcome. */
export interface ProductionProvenance {
  /** The requested FIRST model — always the string 'pro' (the global policy). */
  primaryModelRequested: 'pro'
  requestedTier: 'premium'
  proAttempted: boolean
  proRequestedModel: string
  proResolvedModel: string | null
  proTierUsed: string
  proDowngraded: boolean
  proFinalizedCount: number
  fallbackEvaluated: boolean
  fallbackTriggered: boolean
  fallbackReason: FallbackReason | 'pro_unavailable' | null
  fallbackRescueBriefCount: number
  flashAttempted: boolean
  flashResolvedModel: string | null
  flashFinalizedCount: number | null
  selectedModel: ProductionSelected
  selectedFinalizedCount: number
  selectionReason: string
  /** Number of prepareBriefRun invocations (always 1 after a successful preparation). */
  preparationCalls: number
  /** Provider calls made DURING preparation (0 or 1 discovery call). */
  preparationProviderCalls: number
  discoveryCalls: number
  /** The SELECTED model id (persisted as modelUsed). Flash fallback is NEVER Pro. */
  modelUsedForPersistence: string | null
  persistedWrites: number
}

export interface ProFirstProductionResult {
  selectedModel: ProductionSelected
  selectedFinalization: FinalizedAttemptResult
  selectedEngineSuggestions: TopicSuggestion[]
  selectedModelPath: ModelPath
  briefDiagnostics: BriefRunDiagnostics
  rawGenerated: number
  emptyReason: string | null
  provenance: ProductionProvenance
  /** ADDITIVE (Stage-D-neutral): the snapshot-derived context the production route uses
   *  for the blog-article persistence gate. Never affects selection/finalize/budget. */
  acceptanceContext?: BlogAcceptanceContext
}

function providerFailed(synth: Synth): boolean {
  return synth.diagnostics.stop_reason === 'provider_failed' || synth.diagnostics.rounds.some((r) => !r.provider_ok)
}
function synthesisFailed(synth: Synth): boolean {
  return synth.diagnostics.stop_reason === 'synthesis_failed' || synth.diagnostics.rounds.some((r) => r.synthesis_failure !== null)
}
function budgetStopped(synth: Synth): boolean {
  return synth.diagnostics.stop_reason === 'budget_stopped'
}

/**
 * EXACT-prompt fallback budget authorization. Rebuilds the FIRST Flash synthesis round
 * exactly as synthesizeFromSnapshot would (same batch from workingPool, same batchSize,
 * same buildBriefSynthesisPrompt over the snapshot's ctx/langLabel/year, same output
 * budget) and uses the controller's own estimator on the REAL prompt length. Never
 * consumes a call slot. Authorized only if a slot is free AND spentUsd + exact estimate
 * ≤ the cost ceiling.
 */
export function exactFlashBudgetOk(controller: RunCostController, snapshot: BriefRunSnapshot, flashModel: string): boolean {
  if (controller.callCount >= controller.budget.maxModelCallsPerRun) return false
  const target = snapshot.input.targetCount
  const deficit = target // suggestions.length is 0 at the start of a Flash attempt
  const batchSize = Math.min(snapshot.workingPool.length, Math.max(4, Math.ceil(deficit * 1.5)))
  const batch = snapshot.workingPool.slice(0, batchSize)
  const prompt = buildBriefSynthesisPrompt(batch, snapshot.ctx, snapshot.langLabel, snapshot.year)
  const outputBudget = synthesisOutputBudget(batch.length)
  const est = controller.estimateNextCallUsd(flashModel, prompt.length, outputBudget)
  return controller.spentUsd + Math.max(0, est) <= controller.budget.maxEstimatedCostUsd
}

function emptyReasonFor(fallbackReason: FallbackReason | 'pro_unavailable' | null): string {
  if (fallbackReason === 'no_evidence' || fallbackReason === 'preparation_failure') return 'insufficient_inventory'
  if (fallbackReason === 'fallback_budget_blocked') return 'fallback_budget_blocked'
  if (fallbackReason === 'flash_unavailable') return 'flash_unavailable'
  return 'no_safe_opportunities'
}

function flashAttemptModelPath(snapshot: BriefRunSnapshot, flashModel: string): ModelPath {
  // A REAL Pro attempt finalized zero and Flash created the batch → a runtime downgrade
  // with a TRUTHFUL, non-null reason (never downgraded:true with reason:null).
  return { requestedTier: 'premium', requestedModel: snapshot.modelPath.requestedModel, model: flashModel, tierUsed: 'flash', downgraded: true, downgradeReason: 'pro_runtime_fallback' }
}

/** Resolve a REAL Flash-class model, or null when none is offered / a non-Flash id is
 *  returned (both → flash_unavailable). A Pro id is never accepted as Flash. */
async function resolveFlashClassModel(): Promise<string | null> {
  const fr = await resolveAvailableRecommendationModel()
  return fr.ok && isFlashClassModel(fr.model) ? fr.model : null
}

export async function runProFirstProduction(
  admin: Admin,
  input: { projectId: string; targetCount: number; userId?: string },
  controller: RunCostController,
): Promise<ProFirstProductionResult> {
  const snapshot = await prepareBriefRun(admin, { projectId: input.projectId, targetCount: input.targetCount, qualityMode: 'premium', userId: input.userId }, controller)
  const preparationProviderCalls = controller.summary().totalCalls
  const discoveryCalls = snapshot.discovery?.ran ? 1 : 0
  const proRequestedModel = snapshot.modelPath.requestedModel
  const proResolvedModel = snapshot.modelPath.model
  const proDowngraded = snapshot.modelPath.downgraded || snapshot.modelPath.tierUsed !== 'pro'
  const finalizeOnce = (engine: TopicSuggestion[]): FinalizedAttemptResult =>
    finalizeRecommendationAttempt({ guard: cloneKeywordGuard(snapshot.guard), existingPages: snapshot.existingPages }, engine)
  const emptyFinalization = (): FinalizedAttemptResult => finalizeRecommendationAttempt({ guard: cloneKeywordGuard(snapshot.guard), existingPages: snapshot.existingPages }, [])

  // ADDITIVE context for the production route's blog-article persistence gate — a pure
  // read of the snapshot's already-derived evidence. Never affects Stage-D selection.
  const acceptanceContext: BlogAcceptanceContext = {
    brandSafety: snapshot.brandSafety,
    explicitBusinessEvidenceTokens: snapshot.explicitBusinessEvidenceTokens,
    domainTypeWords: snapshot.domainTypeWords,
    blogDuplicateSignatures: snapshot.blogDuplicateSignatures,
  }
  const baseProv = {
    primaryModelRequested: 'pro' as const,
    requestedTier: 'premium' as const,
    proRequestedModel,
    proResolvedModel,
    proTierUsed: snapshot.modelPath.tierUsed,
    proDowngraded,
    preparationCalls: 1,
    preparationProviderCalls,
    discoveryCalls,
    persistedWrites: 0,
  }
  const emptyDiag = (): BriefRunDiagnostics => ({
    engine: 'evidence_first_briefs', modelPath: snapshot.modelPath, modelConfig: null,
    evidence_inventory: snapshot.evidenceInventory, brief_pool: snapshot.briefPool, discovery: snapshot.discovery,
    rounds: [], candidateOutcomes: [], candidateAccounting: { generated: 0, accepted: 0, rejected: 0, not_processed: 0, dropped: 0, outcomesCapped: false, reconciles: true },
    rejected_by_reason: {}, shadow_rejected_by_reason: {}, generated_opportunities: 0,
    finalCount: 0, model_calls: preparationProviderCalls, stop_reason: 'insufficient_inventory',
    brief_consumption: { effectivePoolSize: snapshot.workingPool.length, consumedBriefs: 0, remainingBriefs: snapshot.workingPool.length, callsRemaining: 0 },
    thirdRefillEligible: false,
    thirdRefillUsed: false,
    insufficient_inventory: true, secondary_keywords_filtered: 0, domainTypeWords: [], target_role_mappings: [],
    competitorLeakage: { researchRejected: [], discoveryRejected: [], briefRejected: [], acceptedTitle: [], acceptedPrimaryKeyword: [], acceptedSecondaryKeyword: [], acceptedLinkTarget: [], acceptedMatches: [] },
    cost: { estimatedRunCostUsd: 0, totalCalls: preparationProviderCalls, calls: [], totalPaidCalls: preparationProviderCalls, estimatedRunCostIls: 0, costPerAcceptedTopic: 0, configuredCostCeilingUsd: controller.budget.maxEstimatedCostUsd, remainingBudgetUsd: 0, callsPreventedByBudget: 0, configuredMaxCalls: controller.budget.maxModelCallsPerRun },
  })
  const noBatch = (reason: FallbackReason | 'pro_unavailable', opts: { fallbackEvaluated: boolean; fallbackTriggered: boolean; flashResolvedModel?: string | null; proAttempted: boolean; rescue?: number }): ProFirstProductionResult => ({
    selectedModel: 'none', selectedFinalization: emptyFinalization(), selectedEngineSuggestions: [],
    selectedModelPath: snapshot.modelPath, briefDiagnostics: emptyDiag(), acceptanceContext,
    rawGenerated: 0, emptyReason: emptyReasonFor(reason),
    provenance: {
      ...baseProv, proAttempted: opts.proAttempted, proFinalizedCount: 0,
      fallbackEvaluated: opts.fallbackEvaluated, fallbackTriggered: opts.fallbackTriggered, fallbackReason: reason,
      fallbackRescueBriefCount: opts.rescue ?? 0,
      flashAttempted: false, flashResolvedModel: opts.flashResolvedModel ?? null, flashFinalizedCount: null,
      selectedModel: 'none', selectedFinalizedCount: 0, selectionReason: 'no_batch', modelUsedForPersistence: null,
    },
  })

  // 2) Pro UNAVAILABLE before any Pro call → run ONE Flash, but under the SAME safety
  //    gates as the Pro-zero fallback: a REAL Flash-class model, a non-empty pool, and
  //    EXACT-prompt budget authorization — each failure is a typed NON-run (0 writes),
  //    never a silent Flash attempt.
  if (proDowngraded) {
    const flashModel = snapshot.modelPath.model
    if (!flashModel || !isFlashClassModel(flashModel)) {
      return noBatch('flash_unavailable', { fallbackEvaluated: true, fallbackTriggered: false, proAttempted: false })
    }
    // Empty pool after successful preparation → no evidence to synthesize from.
    if (snapshot.workingPool.length === 0) {
      return noBatch('no_evidence', { fallbackEvaluated: true, fallbackTriggered: false, proAttempted: false, flashResolvedModel: flashModel })
    }
    // EXACT-prompt budget authorization (no slot consumed) BEFORE any provider call.
    if (!exactFlashBudgetOk(controller, snapshot, flashModel)) {
      return noBatch('fallback_budget_blocked', { fallbackEvaluated: true, fallbackTriggered: false, proAttempted: false, flashResolvedModel: flashModel })
    }
    const flashSynth = await synthesizeFromSnapshot(snapshot, controller)
    // A provider-level budget stop (despite the pre-check) → normalized NON-run: Flash is
    // NOT reported as attempted/completed, and nothing is written.
    if (budgetStopped(flashSynth)) {
      return noBatch('fallback_budget_blocked', { fallbackEvaluated: true, fallbackTriggered: false, proAttempted: false, flashResolvedModel: flashModel })
    }
    const flashFin = finalizeOnce(flashSynth.suggestions)
    const flashFinalizedCount = flashFin.finalSuggestions.length
    const sel = selectProductionBatch(0, flashFinalizedCount)
    return {
      selectedModel: sel.selected,
      selectedFinalization: sel.selected === 'flash' ? flashFin : emptyFinalization(),
      selectedEngineSuggestions: sel.selected === 'flash' ? flashSynth.suggestions : [],
      selectedModelPath: snapshot.modelPath, acceptanceContext,
      briefDiagnostics: flashSynth.diagnostics,
      rawGenerated: flashSynth.diagnostics.generated_opportunities,
      emptyReason: sel.selected === 'none' ? emptyReasonFor('pro_unavailable') : null,
      provenance: {
        ...baseProv, proAttempted: false, proFinalizedCount: 0,
        fallbackEvaluated: true, fallbackTriggered: true, fallbackReason: 'pro_unavailable', fallbackRescueBriefCount: 0,
        flashAttempted: true, flashResolvedModel: flashModel, flashFinalizedCount,
        selectedModel: sel.selected, selectedFinalizedCount: flashFinalizedCount, selectionReason: sel.reason,
        modelUsedForPersistence: sel.selected === 'flash' ? flashModel : null,
      },
    }
  }

  // 3) REAL Pro — run once, finalize once.
  const proModel = snapshot.modelPath.model as string
  const proSynth = await synthesizeFromSnapshot(snapshot, controller)
  const proFin = finalizeOnce(proSynth.suggestions)
  const proFinalizedCount = proFin.finalSuggestions.length

  if (proFinalizedCount > 0) {
    return {
      selectedModel: 'pro', selectedFinalization: proFin, selectedEngineSuggestions: proSynth.suggestions,
      selectedModelPath: snapshot.modelPath, briefDiagnostics: proSynth.diagnostics, acceptanceContext,
      rawGenerated: proSynth.diagnostics.generated_opportunities, emptyReason: null,
      provenance: {
        ...baseProv, proAttempted: true, proFinalizedCount,
        fallbackEvaluated: false, fallbackTriggered: false, fallbackReason: 'pro_produced_batch', fallbackRescueBriefCount: 0,
        flashAttempted: false, flashResolvedModel: null, flashFinalizedCount: null,
        selectedModel: 'pro', selectedFinalizedCount: proFinalizedCount, selectionReason: 'pro_final_nonempty',
        modelUsedForPersistence: proModel,
      },
    }
  }

  // 4) Pro finalized ZERO → the fallback path is EVALUATED. Gate order: empty pool →
  //    no rescue (genuine exhaustion) → resolve a REAL Flash model → EXACT-prompt budget.
  const rescue = computeRescueAccounting(deriveBriefOutcomes(snapshot, proSynth, proFin), snapshot.workingPool.length)
  const rescueCount = rescue.rescuePotentialBriefIds.size
  const withProDiag = (r: ProFirstProductionResult): ProFirstProductionResult => ({ ...r, briefDiagnostics: proSynth.diagnostics, rawGenerated: proSynth.diagnostics.generated_opportunities })

  if (snapshot.workingPool.length === 0) return withProDiag(noBatch('no_evidence', { fallbackEvaluated: true, fallbackTriggered: false, proAttempted: true, rescue: rescueCount }))
  if (rescueCount === 0) return withProDiag(noBatch('genuine_exhaustion', { fallbackEvaluated: true, fallbackTriggered: false, proAttempted: true, rescue: rescueCount }))

  // Flash is warranted by rescue → resolve a REAL Flash-class model ONLY now.
  const flashModel = await resolveFlashClassModel()
  if (!flashModel) return withProDiag(noBatch('flash_unavailable', { fallbackEvaluated: true, fallbackTriggered: false, proAttempted: true, rescue: rescueCount }))

  // EXACT-prompt budget authorization (no slot consumed).
  if (!exactFlashBudgetOk(controller, snapshot, flashModel)) return withProDiag(noBatch('fallback_budget_blocked', { fallbackEvaluated: true, fallbackTriggered: false, proAttempted: true, flashResolvedModel: flashModel, rescue: rescueCount }))

  const reason: FallbackReason = providerFailed(proSynth) ? 'pro_provider_failure_rescue' : synthesisFailed(proSynth) ? 'pro_synthesis_failure_rescue' : 'pro_zero_marginal_yield_rescue'

  // 5) Single Flash FALLBACK on the SAME snapshot, resolved Flash-class model.
  const flashSynth = await synthesizeFromSnapshot(snapshot, controller, { modelOverride: flashModel })
  // A provider-level budget stop (despite the pre-check) → normalized NON-run.
  if (budgetStopped(flashSynth)) return withProDiag(noBatch('fallback_budget_blocked', { fallbackEvaluated: true, fallbackTriggered: false, proAttempted: true, flashResolvedModel: flashModel, rescue: rescueCount }))

  const flashFin = finalizeOnce(flashSynth.suggestions)
  const flashFinalizedCount = flashFin.finalSuggestions.length
  const sel = selectProductionBatch(0, flashFinalizedCount)
  return {
    selectedModel: sel.selected,
    selectedFinalization: sel.selected === 'flash' ? flashFin : emptyFinalization(),
    selectedEngineSuggestions: sel.selected === 'flash' ? flashSynth.suggestions : [],
    selectedModelPath: sel.selected === 'flash' ? flashAttemptModelPath(snapshot, flashModel) : snapshot.modelPath, acceptanceContext,
    briefDiagnostics: sel.selected === 'flash' ? flashSynth.diagnostics : proSynth.diagnostics,
    rawGenerated: (sel.selected === 'flash' ? flashSynth : proSynth).diagnostics.generated_opportunities,
    emptyReason: sel.selected === 'none' ? emptyReasonFor(reason) : null,
    provenance: {
      ...baseProv, proAttempted: true, proFinalizedCount: 0,
      fallbackEvaluated: true, fallbackTriggered: true, fallbackReason: reason, fallbackRescueBriefCount: rescueCount,
      flashAttempted: true, flashResolvedModel: flashModel, flashFinalizedCount,
      selectedModel: sel.selected, selectedFinalizedCount: flashFinalizedCount, selectionReason: sel.reason,
      modelUsedForPersistence: sel.selected === 'flash' ? flashModel : null,
    },
  }
}

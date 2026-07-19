/**
 * PRODUCTION Pro-first RUN (Stage D) — impure orchestration around the FROZEN engine.
 *
 * Wires the validated engine building blocks (prepareBriefRun → synthesizeFromSnapshot
 * → finalizeRecommendationAttempt) into the global Pro-first production policy. It does
 * NOT modify any engine logic — it only sequences calls and applies the PURE decisions
 * from production-controller. Exactly one immutable snapshot; discovery runs once; Pro
 * runs once; Flash is a single fallback on the SAME snapshot under strict conditions.
 *
 * Each attempt is finalized EXACTLY ONCE. The SELECTED attempt's finalization result is
 * returned so the route persists precisely selectedFinalization.finalSuggestions (in
 * order) without re-finalizing. Model provenance is per-attempt and truthful: when a
 * Flash override created the batch, the selected model path is Flash — never the
 * snapshot's (Pro) modelPath.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { RunCostController } from './run-cost-controller'
import { prepareBriefRun, synthesizeFromSnapshot, type BriefRunSnapshot, type BriefRunDiagnostics } from './generate-from-briefs'
import { finalizeRecommendationAttempt, type FinalizedAttemptResult } from './finalize-attempt'
import { synthesisOutputBudget } from './brief-synthesis'
import { cloneKeywordGuard, deriveBriefOutcomes } from './smart-run-harness'
import { computeRescueAccounting } from './smart-controller'
import { resolveAvailableRecommendationModel } from './model-availability'
import type { ModelPath } from './model-select'
import { evaluateFlashFallback, selectProductionBatch, type FallbackReason, type ProductionSelected } from './production-controller'
import type { TopicSuggestion } from './types'

type Admin = ReturnType<typeof createAdminClient>
type Synth = Awaited<ReturnType<typeof synthesizeFromSnapshot>>

/** Full production provenance (Preview-only diagnostics; never shown to the customer).
 *  persistedWrites is filled by the route from the REAL persistence outcome. */
export interface ProductionProvenance {
  primaryModelRequested: string
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
  preparationCalls: number
  discoveryCalls: number
  /** The SELECTED model id (persisted as modelUsed). Flash fallback is NEVER Pro. */
  modelUsedForPersistence: string | null
  persistedWrites: number
}

export interface ProFirstProductionResult {
  selectedModel: ProductionSelected
  /** The SELECTED attempt's finalization (finalized ONCE). The route persists exactly
   *  selectedFinalization.finalSuggestions and reuses its funnel/rejection counts. */
  selectedFinalization: FinalizedAttemptResult
  /** The SELECTED attempt's engine suggestions (for engine-accepted counts + provenance
   *  provider badges only; NOT re-finalized). */
  selectedEngineSuggestions: TopicSuggestion[]
  /** Truthful model path of the SELECTED attempt (Flash when Flash created the batch). */
  selectedModelPath: ModelPath
  /** The SELECTED attempt's synth diagnostics (Preview meta). */
  briefDiagnostics: BriefRunDiagnostics
  rawGenerated: number
  emptyReason: string | null
  provenance: ProductionProvenance
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
 * Estimate-AWARE budget authorization for ONE more (Flash) call, using the SAME cost
 * estimator the provider gate uses, WITHOUT consuming a call slot: there must be a free
 * call slot AND the estimated next-call cost must fit under the remaining budget.
 */
function budgetAuthorizesFlashCall(controller: RunCostController, snapshot: BriefRunSnapshot, model: string, targetCount: number): boolean {
  if (controller.callCount >= controller.budget.maxModelCallsPerRun) return false
  const estBatch = Math.min(snapshot.workingPool.length || 1, Math.max(4, Math.ceil(targetCount * 1.5)))
  const outputBudget = synthesisOutputBudget(estBatch)
  // Prompt-size estimate (brief JSON + synthesis scaffold) — the gate estimates from the
  // real prompt length; this pre-check uses a moderate estimate of the same shape.
  const estPromptChars = 2500 + estBatch * 350
  const est = controller.estimateNextCallUsd(model, estPromptChars, outputBudget)
  return controller.spentUsd + Math.max(0, est) <= controller.budget.maxEstimatedCostUsd
}

function emptyReasonFor(fallbackReason: FallbackReason | 'pro_unavailable' | null): string {
  if (fallbackReason === 'no_evidence' || fallbackReason === 'preparation_failure') return 'insufficient_inventory'
  if (fallbackReason === 'fallback_budget_blocked') return 'fallback_budget_blocked'
  return 'no_safe_opportunities'
}

/** A truthful ModelPath for the SELECTED attempt: the model that ACTUALLY produced the
 *  batch (or was attempted), never the snapshot's Pro path when a Flash override ran. */
function flashAttemptModelPath(snapshot: BriefRunSnapshot, flashModel: string): ModelPath {
  return { requestedTier: 'premium', requestedModel: snapshot.modelPath.requestedModel, model: flashModel, tierUsed: 'flash', downgraded: true, downgradeReason: null }
}

/**
 * Run the Pro-first production flow on ONE immutable snapshot. Persists nothing (the
 * route persists selectedFinalization.finalSuggestions).
 */
export async function runProFirstProduction(
  admin: Admin,
  input: { projectId: string; targetCount: number; userId?: string },
  controller: RunCostController,
): Promise<ProFirstProductionResult> {
  const snapshot = await prepareBriefRun(admin, { projectId: input.projectId, targetCount: input.targetCount, qualityMode: 'premium', userId: input.userId }, controller)
  const preparationCalls = controller.summary().totalCalls
  const discoveryCalls = snapshot.discovery?.ran ? 1 : 0
  const proRequestedModel = snapshot.modelPath.requestedModel // the PRO id premium asked for
  const proResolvedModel = snapshot.modelPath.model
  const proDowngraded = snapshot.modelPath.downgraded || snapshot.modelPath.tierUsed !== 'pro'
  const finalizeOnce = (engine: TopicSuggestion[]): FinalizedAttemptResult =>
    finalizeRecommendationAttempt({ guard: cloneKeywordGuard(snapshot.guard), existingPages: snapshot.existingPages }, engine)
  const emptyFinalization = (): FinalizedAttemptResult => finalizeRecommendationAttempt({ guard: cloneKeywordGuard(snapshot.guard), existingPages: snapshot.existingPages }, [])

  const baseProv = {
    primaryModelRequested: proRequestedModel,
    requestedTier: 'premium' as const,
    proRequestedModel,
    proResolvedModel,
    proTierUsed: snapshot.modelPath.tierUsed,
    proDowngraded,
    preparationCalls,
    discoveryCalls,
    persistedWrites: 0,
  }

  // 2) Pro UNAVAILABLE before any Pro call → run Flash ONCE, recorded as Flash.
  if (proDowngraded) {
    const flashModel = snapshot.modelPath.model ?? proRequestedModel
    const flashSynth = await synthesizeFromSnapshot(snapshot, controller) // uses the (downgraded) model
    const flashFin = finalizeOnce(flashSynth.suggestions)
    const flashFinalizedCount = flashFin.finalSuggestions.length
    const sel = selectProductionBatch(0, flashFinalizedCount)
    return {
      selectedModel: sel.selected,
      selectedFinalization: sel.selected === 'flash' ? flashFin : emptyFinalization(),
      selectedEngineSuggestions: sel.selected === 'flash' ? flashSynth.suggestions : [],
      selectedModelPath: snapshot.modelPath, // already truthful: downgraded Flash path
      briefDiagnostics: flashSynth.diagnostics,
      rawGenerated: flashSynth.diagnostics.generated_opportunities,
      emptyReason: sel.selected === 'none' ? emptyReasonFor('pro_unavailable') : null,
      provenance: {
        ...baseProv, proAttempted: false, proFinalizedCount: 0,
        fallbackEvaluated: false, fallbackTriggered: true, fallbackReason: 'pro_unavailable', fallbackRescueBriefCount: 0,
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
      selectedModel: 'pro',
      selectedFinalization: proFin,
      selectedEngineSuggestions: proSynth.suggestions,
      selectedModelPath: snapshot.modelPath, // Pro produced the batch
      briefDiagnostics: proSynth.diagnostics,
      rawGenerated: proSynth.diagnostics.generated_opportunities,
      emptyReason: null,
      provenance: {
        ...baseProv, proAttempted: true, proFinalizedCount,
        fallbackEvaluated: false, fallbackTriggered: false, fallbackReason: 'pro_produced_batch', fallbackRescueBriefCount: 0,
        flashAttempted: false, flashResolvedModel: null, flashFinalizedCount: null,
        selectedModel: 'pro', selectedFinalizedCount: proFinalizedCount, selectionReason: 'pro_final_nonempty',
        modelUsedForPersistence: proModel,
      },
    }
  }

  // 4) Pro finalized ZERO → rescue accounting + est-aware budget-gated fallback.
  const rescue = computeRescueAccounting(deriveBriefOutcomes(snapshot, proSynth, proFin), snapshot.workingPool.length)
  const flashResolution = await resolveAvailableRecommendationModel()
  const flashModel = flashResolution.ok ? flashResolution.model : proRequestedModel
  const budgetOk = budgetAuthorizesFlashCall(controller, snapshot, flashModel, input.targetCount)
  const fallback = evaluateFlashFallback({
    proFinalizedCount: 0,
    preparationSucceeded: true,
    poolEmptyAfterSuccessfulPreparation: snapshot.workingPool.length === 0,
    rescueUniqueBriefIdCount: rescue.rescuePotentialBriefIds.size,
    proProviderFailed: providerFailed(proSynth),
    proSynthesisFailed: synthesisFailed(proSynth),
    budgetAuthorizesFallback: budgetOk,
  })

  const proBase = {
    ...baseProv, proAttempted: true, proFinalizedCount: 0, fallbackEvaluated: true, fallbackRescueBriefCount: rescue.rescuePotentialBriefIds.size,
  }

  if (!fallback.runFlash) {
    return {
      selectedModel: 'none', selectedFinalization: emptyFinalization(), selectedEngineSuggestions: [],
      selectedModelPath: snapshot.modelPath, briefDiagnostics: proSynth.diagnostics,
      rawGenerated: proSynth.diagnostics.generated_opportunities, emptyReason: emptyReasonFor(fallback.reason),
      provenance: {
        ...proBase, fallbackTriggered: false, fallbackReason: fallback.reason,
        flashAttempted: false, flashResolvedModel: null, flashFinalizedCount: null,
        selectedModel: 'none', selectedFinalizedCount: 0, selectionReason: 'no_batch', modelUsedForPersistence: null,
      },
    }
  }

  // 5) Single Flash FALLBACK on the SAME snapshot.
  const flashSynth = await synthesizeFromSnapshot(snapshot, controller, { modelOverride: flashModel })
  // Normalize a provider-level budget block (despite the pre-check) to a NON-run.
  if (budgetStopped(flashSynth)) {
    return {
      selectedModel: 'none', selectedFinalization: emptyFinalization(), selectedEngineSuggestions: [],
      selectedModelPath: snapshot.modelPath, briefDiagnostics: proSynth.diagnostics,
      rawGenerated: proSynth.diagnostics.generated_opportunities, emptyReason: emptyReasonFor('fallback_budget_blocked'),
      provenance: {
        ...proBase, fallbackTriggered: false, fallbackReason: 'fallback_budget_blocked',
        flashAttempted: false, flashResolvedModel: null, flashFinalizedCount: null,
        selectedModel: 'none', selectedFinalizedCount: 0, selectionReason: 'no_batch', modelUsedForPersistence: null,
      },
    }
  }
  const flashFin = finalizeOnce(flashSynth.suggestions)
  const flashFinalizedCount = flashFin.finalSuggestions.length
  const sel = selectProductionBatch(0, flashFinalizedCount)
  return {
    selectedModel: sel.selected,
    selectedFinalization: sel.selected === 'flash' ? flashFin : emptyFinalization(),
    selectedEngineSuggestions: sel.selected === 'flash' ? flashSynth.suggestions : [],
    selectedModelPath: sel.selected === 'flash' ? flashAttemptModelPath(snapshot, flashModel) : snapshot.modelPath,
    briefDiagnostics: sel.selected === 'flash' ? flashSynth.diagnostics : proSynth.diagnostics,
    rawGenerated: (sel.selected === 'flash' ? flashSynth : proSynth).diagnostics.generated_opportunities,
    emptyReason: sel.selected === 'none' ? emptyReasonFor(fallback.reason) : null,
    provenance: {
      ...proBase, fallbackTriggered: true, fallbackReason: fallback.reason,
      flashAttempted: true, flashResolvedModel: flashModel, flashFinalizedCount,
      selectedModel: sel.selected, selectedFinalizedCount: flashFinalizedCount, selectionReason: sel.reason,
      modelUsedForPersistence: sel.selected === 'flash' ? flashModel : null,
    },
  }
}

/**
 * PRODUCTION Pro-first RUN (Stage D) — impure orchestration around the FROZEN engine.
 *
 * Wires the validated engine building blocks (prepareBriefRun → synthesizeFromSnapshot
 * → finalizeRecommendationAttempt) into the global Pro-first production policy. It does
 * NOT modify any engine logic — it only sequences calls and applies the PURE decisions
 * from production-controller. Exactly one immutable snapshot; discovery runs once; Pro
 * runs once; Flash is a single fallback on the SAME snapshot under strict conditions.
 *
 * It returns the SELECTED attempt's PRISTINE engine suggestions (finalization for the
 * decision is done on CLONES, so the returned array is untouched) — the route then runs
 * the same route-level finalizer + persistence exactly as today, so the persisted batch
 * is precisely the selected attempt's finalized suggestions and nothing else.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { RunCostController } from './run-cost-controller'
import { prepareBriefRun, synthesizeFromSnapshot, type BriefRunSnapshot, type BriefRunDiagnostics } from './generate-from-briefs'
import { finalizeRecommendationAttempt } from './finalize-attempt'
import { cloneKeywordGuard, deriveBriefOutcomes } from './smart-run-harness'
import { computeRescueAccounting } from './smart-controller'
import { resolveAvailableRecommendationModel } from './model-availability'
import { RECOMMENDATION_MODEL_PRIMARY } from './model'
import { evaluateFlashFallback, selectProductionBatch, type FallbackReason, type ProductionSelected } from './production-controller'
import type { TopicSuggestion } from './types'

type Admin = ReturnType<typeof createAdminClient>
type Synth = Awaited<ReturnType<typeof synthesizeFromSnapshot>>

export interface ProductionProvenance {
  requestedTier: 'premium'
  requestedModel: string | null
  resolvedModel: string | null
  proDowngradedBeforeCall: boolean
  proModelUsed: string | null
  flashModelUsed: string | null
  selectedModel: ProductionSelected
  /** The SELECTED model id — persisted as modelUsed. Flash fallback is NEVER Pro. */
  modelUsedForPersistence: string | null
  fallbackReason: FallbackReason | 'pro_unavailable' | null
  flashRan: boolean
  proFinalizedCount: number
  flashFinalizedCount: number | null
  preparationProviderCalls: number
  discoveryRan: boolean
}

export interface ProFirstProductionResult {
  selectedModel: ProductionSelected
  /** PRISTINE engine suggestions of the selected attempt (the route finalizes these). */
  selectedEngineSuggestions: TopicSuggestion[]
  briefDiagnostics: BriefRunDiagnostics
  rawGenerated: number
  emptyReason: string | null
  provenance: ProductionProvenance
}

/** Finalize a CLONE of the engine suggestions (finalize mutates its input) so the
 *  originals stay pristine for the route-level finalizer. */
function finalizeForDecision(snapshot: BriefRunSnapshot, engine: TopicSuggestion[]): ReturnType<typeof finalizeRecommendationAttempt> {
  const clone: TopicSuggestion[] = engine.map((s) => structuredClone(s))
  return finalizeRecommendationAttempt({ guard: cloneKeywordGuard(snapshot.guard), existingPages: snapshot.existingPages }, clone)
}

function providerFailed(synth: Synth): boolean {
  return synth.diagnostics.stop_reason === 'provider_failed' || synth.diagnostics.rounds.some((r) => !r.provider_ok)
}
function synthesisFailed(synth: Synth): boolean {
  return synth.diagnostics.stop_reason === 'synthesis_failed' || synth.diagnostics.rounds.some((r) => r.synthesis_failure !== null)
}
/** Read-only budget headroom for ONE more call (never consumes a slot). */
function budgetAuthorizesOneMoreCall(controller: RunCostController): boolean {
  return controller.callCount < controller.budget.maxModelCallsPerRun && controller.spentUsd < controller.budget.maxEstimatedCostUsd
}

/** Map a no-batch outcome to a customer-safe empty reason token for meta.reason. */
function emptyReasonFor(fallbackReason: FallbackReason | 'pro_unavailable' | null): string {
  if (fallbackReason === 'no_evidence' || fallbackReason === 'preparation_failure') return 'insufficient_inventory'
  if (fallbackReason === 'fallback_budget_blocked') return 'fallback_budget_blocked'
  return 'no_safe_opportunities'
}

/**
 * Run the Pro-first production flow on ONE immutable snapshot. Persists nothing (the
 * route persists the returned selected engine suggestions via the existing finalizer).
 */
export async function runProFirstProduction(
  admin: Admin,
  input: { projectId: string; targetCount: number; userId?: string },
  controller: RunCostController,
): Promise<ProFirstProductionResult> {
  // 1) ONE immutable snapshot (evidence → pool → the single discovery call). A
  //    preparation/discovery provider failure throws here and is handled by the route's
  //    existing typed error handling — Flash is never reached.
  const snapshot = await prepareBriefRun(admin, { projectId: input.projectId, targetCount: input.targetCount, qualityMode: 'premium', userId: input.userId }, controller)
  const preparationProviderCalls = controller.summary().totalCalls
  const discoveryRan = snapshot.discovery?.ran ?? false
  const requestedModel = RECOMMENDATION_MODEL_PRIMARY // premium request resolves via resolveRunModel; requested premium id for provenance
  const resolvedModel = snapshot.modelPath.model
  const proDowngradedBeforeCall = snapshot.modelPath.downgraded || snapshot.modelPath.tierUsed !== 'pro'

  const baseProvenance = {
    requestedTier: 'premium' as const,
    requestedModel,
    resolvedModel,
    proDowngradedBeforeCall,
    preparationProviderCalls,
    discoveryRan,
  }

  // 2) Pro UNAVAILABLE before any Pro call → run Flash ONCE, recorded as Flash.
  if (proDowngradedBeforeCall) {
    const flashModel = snapshot.modelPath.model // already the resolved Flash-class id
    const flashSynth = await synthesizeFromSnapshot(snapshot, controller) // uses the snapshot's (downgraded) model
    const flashFin = finalizeForDecision(snapshot, flashSynth.suggestions)
    const flashFinalizedCount = flashFin.finalSuggestions.length
    const sel = selectProductionBatch(0, flashFinalizedCount)
    return {
      selectedModel: sel.selected,
      selectedEngineSuggestions: sel.selected === 'flash' ? flashSynth.suggestions : [],
      briefDiagnostics: flashSynth.diagnostics,
      rawGenerated: flashSynth.diagnostics.generated_opportunities,
      emptyReason: sel.selected === 'none' ? emptyReasonFor('pro_unavailable') : null,
      provenance: {
        ...baseProvenance,
        proModelUsed: null,
        flashModelUsed: flashModel,
        selectedModel: sel.selected,
        modelUsedForPersistence: sel.selected === 'flash' ? flashModel : null,
        fallbackReason: 'pro_unavailable',
        flashRan: true,
        proFinalizedCount: 0,
        flashFinalizedCount,
      },
    }
  }

  // 3) REAL Pro — run once.
  const proModel = snapshot.modelPath.model
  const proSynth = await synthesizeFromSnapshot(snapshot, controller) // uses the resolved Pro model
  const proFin = finalizeForDecision(snapshot, proSynth.suggestions)
  const proFinalizedCount = proFin.finalSuggestions.length

  // 4) Pro produced a non-empty finalized batch → SELECT Pro, do NOT run Flash.
  if (proFinalizedCount > 0) {
    return {
      selectedModel: 'pro',
      selectedEngineSuggestions: proSynth.suggestions,
      briefDiagnostics: proSynth.diagnostics,
      rawGenerated: proSynth.diagnostics.generated_opportunities,
      emptyReason: null,
      provenance: {
        ...baseProvenance,
        proModelUsed: proModel,
        flashModelUsed: null,
        selectedModel: 'pro',
        modelUsedForPersistence: proModel,
        fallbackReason: null,
        flashRan: false,
        proFinalizedCount,
        flashFinalizedCount: null,
      },
    }
  }

  // 5) Pro finalized ZERO → rescue accounting (unique briefIds) + fallback gate.
  const rescue = computeRescueAccounting(deriveBriefOutcomes(snapshot, proSynth, proFin), snapshot.workingPool.length)
  const fallback = evaluateFlashFallback({
    proFinalizedCount: 0,
    preparationSucceeded: true,
    poolEmptyAfterSuccessfulPreparation: snapshot.workingPool.length === 0,
    rescueUniqueBriefIdCount: rescue.rescuePotentialBriefIds.size,
    proProviderFailed: providerFailed(proSynth),
    proSynthesisFailed: synthesisFailed(proSynth),
    budgetAuthorizesFallback: budgetAuthorizesOneMoreCall(controller),
  })

  if (!fallback.runFlash) {
    return {
      selectedModel: 'none',
      selectedEngineSuggestions: [],
      briefDiagnostics: proSynth.diagnostics,
      rawGenerated: proSynth.diagnostics.generated_opportunities,
      emptyReason: emptyReasonFor(fallback.reason),
      provenance: {
        ...baseProvenance,
        proModelUsed: proModel,
        flashModelUsed: null,
        selectedModel: 'none',
        modelUsedForPersistence: null,
        fallbackReason: fallback.reason,
        flashRan: false,
        proFinalizedCount: 0,
        flashFinalizedCount: null,
      },
    }
  }

  // 6) Single Flash FALLBACK on the SAME snapshot, resolved Flash-class model.
  const flashResolution = await resolveAvailableRecommendationModel()
  const flashModel = flashResolution.ok ? flashResolution.model : RECOMMENDATION_MODEL_PRIMARY
  const flashSynth = await synthesizeFromSnapshot(snapshot, controller, { modelOverride: flashModel })
  const flashFin = finalizeForDecision(snapshot, flashSynth.suggestions)
  const flashFinalizedCount = flashFin.finalSuggestions.length
  const sel = selectProductionBatch(0, flashFinalizedCount) // Pro is 0

  return {
    selectedModel: sel.selected,
    selectedEngineSuggestions: sel.selected === 'flash' ? flashSynth.suggestions : [],
    briefDiagnostics: sel.selected === 'flash' ? flashSynth.diagnostics : proSynth.diagnostics,
    rawGenerated: (sel.selected === 'flash' ? flashSynth : proSynth).diagnostics.generated_opportunities,
    emptyReason: sel.selected === 'none' ? emptyReasonFor(fallback.reason) : null,
    provenance: {
      ...baseProvenance,
      proModelUsed: proModel,
      flashModelUsed: flashModel,
      selectedModel: sel.selected,
      modelUsedForPersistence: sel.selected === 'flash' ? flashModel : null,
      fallbackReason: fallback.reason,
      flashRan: true,
      proFinalizedCount: 0,
      flashFinalizedCount,
    },
  }
}

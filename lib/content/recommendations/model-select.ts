/**
 * EXPLICIT run-model selection (Phase 2 — model-path transparency).
 *
 * The single decision point for which Gemini model a recommendation run uses,
 * with a truthful typed contract: requested tier → resolved model, plus an
 * EXPLICIT downgrade record whenever the requested tier is not what actually
 * runs. Diagnostics always carry this object, so the operator can never again
 * believe Pro/Premium ran while the route forced Flash:
 *   - 'standard'  → the proven Flash-class resolver (existing behavior).
 *   - 'premium'   → the configured Pro-class model VALIDATED against the live
 *     model list; when the key does not offer a Pro-class model the run is
 *     EXPLICITLY downgraded to the standard resolution and the downgrade — with
 *     its reason — is part of the run's diagnostics and never silent.
 * Pure decision logic is in pickPremiumModel (offline-testable); this module is
 * the thin async shell.
 */

import { listAvailableGenerationModels, resolveAvailableRecommendationModel, pickPremiumModel } from './model-availability'
import { RECOMMENDATION_MODEL_PRIMARY } from './model'

export type ModelTier = 'standard' | 'premium'

/** The truthful model-path record carried in run diagnostics. */
export interface ModelPath {
  requestedTier: ModelTier
  /** The id the tier ASKED for (config/default), before availability. */
  requestedModel: string
  /** The id actually used for generation calls; null = no model available. */
  model: string | null
  tierUsed: 'flash' | 'pro' | 'none'
  /** True whenever what runs is weaker than what was requested. NEVER silent —
   *  this exact object must be surfaced in Preview diagnostics. */
  downgraded: boolean
  downgradeReason: 'premium_model_unavailable' | 'model_list_unavailable' | 'no_model_available' | null
}

/** Operator-configurable premium model id (validated against the live list). */
export function configuredPremiumModel(): string {
  return process.env.RECO_PREMIUM_MODEL || 'gemini-2.5-pro'
}

function tierOf(model: string | null): 'flash' | 'pro' | 'none' {
  if (!model) return 'none'
  return model.toLowerCase().includes('pro') ? 'pro' : 'flash'
}

/**
 * Resolve the model for ONE run. Standard keeps the existing Flash resolution
 * exactly. Premium resolves a validated Pro-class model, and on unavailability
 * returns the STANDARD resolution with downgraded=true + a typed reason.
 */
export async function resolveRunModel(tier: ModelTier): Promise<ModelPath> {
  if (tier === 'premium') {
    const requestedModel = configuredPremiumModel()
    const available = await listAvailableGenerationModels()
    if (available === null) {
      // Cannot PROVE the premium model is offered — run standard, say so.
      const std = await resolveStandard()
      return { requestedTier: 'premium', requestedModel, model: std.model, tierUsed: tierOf(std.model), downgraded: true, downgradeReason: 'model_list_unavailable' }
    }
    const premium = pickPremiumModel(available, requestedModel)
    if (premium) {
      return { requestedTier: 'premium', requestedModel, model: premium, tierUsed: 'pro', downgraded: false, downgradeReason: null }
    }
    const std = await resolveStandard()
    return { requestedTier: 'premium', requestedModel, model: std.model, tierUsed: tierOf(std.model), downgraded: true, downgradeReason: std.model ? 'premium_model_unavailable' : 'no_model_available' }
  }
  const std = await resolveStandard()
  return { requestedTier: 'standard', requestedModel: RECOMMENDATION_MODEL_PRIMARY, model: std.model, tierUsed: tierOf(std.model), downgraded: std.model ? false : true, downgradeReason: std.model ? null : 'no_model_available' }
}

async function resolveStandard(): Promise<{ model: string | null }> {
  const resolved = await resolveAvailableRecommendationModel()
  return { model: resolved.ok ? resolved.model : null }
}

/**
 * Recommendation cost control — centralized, VERSIONED pricing + per-run budget
 * config + usage→cost estimation. Pure/deterministic (no network). Prices are
 * approximate public Gemini token prices and are OVERRIDABLE via env; the estimate
 * is for telemetry + a soft circuit breaker, never billed. Never exposes keys or
 * billing-account identifiers.
 */

export const RECO_PRICING_VERSION = 'gemini-2.5-2026-07'

/** USD per 1,000,000 tokens (input / output). Output includes thinking tokens. */
interface ModelPrice { inputPerM: number; outputPerM: number }
const PRICES: Record<string, ModelPrice> = {
  'gemini-2.5-flash': { inputPerM: 0.30, outputPerM: 2.50 },
  'gemini-2.5-flash-lite': { inputPerM: 0.10, outputPerM: 0.40 },
  'gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10.0 },
}
const DEFAULT_PRICE: ModelPrice = { inputPerM: 0.30, outputPerM: 2.50 }

/** USD→ILS conversion for display (approximate; override via env). */
export const USD_TO_ILS = Number(process.env.RECO_USD_TO_ILS) || 3.7

export interface CallUsage {
  model: string
  source: string
  callPurpose: string
  inputTokens: number
  outputTokens: number
  thinkingTokens?: number
  retryCount?: number
  success: boolean
}

/** Estimated USD cost of ONE model call (output already includes thinking). */
export function estimateCallCostUsd(u: Pick<CallUsage, 'model' | 'inputTokens' | 'outputTokens'>): number {
  const p = PRICES[u.model] ?? DEFAULT_PRICE
  return (u.inputTokens / 1_000_000) * p.inputPerM + (u.outputTokens / 1_000_000) * p.outputPerM
}

export interface RunCostSummary {
  modelCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalThinkingTokens: number
  estimatedRunCostUsd: number
  estimatedRunCostIls: number
  costPerCall: number
}

/** Aggregate a run's per-call usage into a cost summary (telemetry). */
export function summarizeRunCost(calls: CallUsage[]): RunCostSummary {
  const totalInputTokens = calls.reduce((n, c) => n + (c.inputTokens || 0), 0)
  const totalOutputTokens = calls.reduce((n, c) => n + (c.outputTokens || 0), 0)
  const totalThinkingTokens = calls.reduce((n, c) => n + (c.thinkingTokens || 0), 0)
  const usd = calls.reduce((s, c) => s + estimateCallCostUsd(c), 0)
  return {
    modelCalls: calls.length,
    totalInputTokens, totalOutputTokens, totalThinkingTokens,
    estimatedRunCostUsd: Number(usd.toFixed(6)),
    estimatedRunCostIls: Number((usd * USD_TO_ILS).toFixed(4)),
    costPerCall: Number((usd / (calls.length || 1)).toFixed(6)),
  }
}

/** Configurable per-run limits (Preview defaults; not permanent product limits). */
export interface RunBudget {
  maxEstimatedCostUsd: number
  maxModelCallsPerRun: number
  maxRawCandidates: number
  proCurationEnabled: boolean
}
export function runBudget(mode: 'standard' | 'premium', targetFreshIdeas: number): RunBudget {
  const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d }
  return {
    maxEstimatedCostUsd: mode === 'premium'
      ? num(process.env.RECO_MAX_ESTIMATED_COST_USD_PREMIUM, 0.50)
      : num(process.env.RECO_MAX_ESTIMATED_COST_USD_STANDARD, 0.15),
    maxModelCallsPerRun: num(process.env.RECO_MAX_MODEL_CALLS_PER_RUN, mode === 'premium' ? 6 : 4),
    // One request-level candidate budget = target + a small dedupe allowance (~30%).
    maxRawCandidates: num(process.env.RECO_MAX_RAW_CANDIDATES, Math.ceil(targetFreshIdeas * 1.3)),
    proCurationEnabled: process.env.RECO_ENABLE_PRO_CURATION !== '0',
  }
}

/** A soft circuit breaker: is there budget headroom to make ONE more call? */
export function hasBudgetHeadroom(spent: RunCostSummary, budget: RunBudget): boolean {
  return spent.modelCalls < budget.maxModelCallsPerRun && spent.estimatedRunCostUsd < budget.maxEstimatedCostUsd
}

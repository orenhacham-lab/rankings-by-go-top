/**
 * ONE request-local cost controller shared by EVERY model call in a single user
 * action (all sources, initial + completion + retry). It is the single source of
 * truth for: billing state, call budget, cost budget, and full per-call usage
 * telemetry. Pure/deterministic (no network); the model layer calls into it.
 *
 * A source-local controller is never allowed — the whole run shares one instance,
 * so the call/cost ceilings and the billing circuit breaker are actually enforced
 * across Hybrid sources rather than per source.
 */

import { estimateCallCostUsd, runBudget, USD_TO_ILS, type CallUsage, type RunBudget } from './reco-cost'

export type CallStopReason = 'billing_exhausted' | 'call_budget_exhausted' | 'cost_budget_exhausted'

export interface CallRecord {
  generationRunId: string
  model: string
  source: string
  callPurpose: string
  requestedIdeaCount: number
  maxOutputTokens: number
  inputTokens: number
  outputTokens: number
  thinkingTokens: number
  finishReason?: string
  retryNumber: number
  success: boolean
  errorType?: string
  estimatedCostUsd: number
  durationMs: number
}

export interface RunCostSummaryFull {
  totalCalls: number
  callsBySource: Record<string, number>
  callsPreventedByBudget: number
  callsAlreadyInFlightAtBillingFailure: number
  callsPreventedAfterBillingFailure: number
  totalInputTokens: number
  totalOutputTokens: number
  totalThinkingTokens: number
  estimatedRunCostUsd: number
  estimatedRunCostIls: number
  billingExhausted: boolean
  aborted: boolean
  stopReason?: CallStopReason
  costPerCall: number
}

export class RunCostController {
  readonly generationRunId: string
  readonly budget: RunBudget
  private records: CallRecord[] = []
  private _billingExhausted = false
  private _preventedByBudget = 0
  private _inFlightAtBillingFailure = 0
  private _preventedAfterBilling = 0
  private _inFlight = 0
  private _stopReason?: CallStopReason

  constructor(mode: 'standard' | 'premium', generationRunId: string, targetFreshIdeas: number) {
    this.generationRunId = generationRunId
    this.budget = runBudget(mode, targetFreshIdeas)
  }

  get billingExhausted(): boolean { return this._billingExhausted }
  get stopReason(): CallStopReason | undefined { return this._stopReason }
  get spentUsd(): number { return this.records.reduce((s, r) => s + r.estimatedCostUsd, 0) }
  get callCount(): number { return this.records.length }

  /** Pre-call gate: may we start ONE more call costing ~estCostUsd? Records the
   *  prevention + a typed stop reason when the answer is no. */
  beforeCall(estCostUsd: number): { allowed: boolean; reason?: CallStopReason } {
    if (this._billingExhausted) { this._preventedAfterBilling++; this._stopReason = 'billing_exhausted'; return { allowed: false, reason: 'billing_exhausted' } }
    if (this.records.length >= this.budget.maxModelCallsPerRun) { this._preventedByBudget++; this._stopReason = 'call_budget_exhausted'; return { allowed: false, reason: 'call_budget_exhausted' } }
    if (this.spentUsd + Math.max(0, estCostUsd) > this.budget.maxEstimatedCostUsd) { this._preventedByBudget++; this._stopReason = 'cost_budget_exhausted'; return { allowed: false, reason: 'cost_budget_exhausted' } }
    this._inFlight++
    return { allowed: true }
  }

  /** Estimate a call's cost BEFORE it runs, from prompt size + output budget. */
  estimateNextCallUsd(model: string, promptChars: number, maxOutputTokens: number): number {
    const inputTokens = Math.ceil(promptChars / 4)
    return estimateCallCostUsd({ model, inputTokens, outputTokens: maxOutputTokens })
  }

  /** Record a completed (or failed) call with ACTUAL usage. */
  recordCall(rec: Omit<CallRecord, 'estimatedCostUsd'> & { estimatedCostUsd?: number }): void {
    if (this._inFlight > 0) this._inFlight--
    const estimatedCostUsd = rec.estimatedCostUsd ?? estimateCallCostUsd({ model: rec.model, inputTokens: rec.inputTokens, outputTokens: rec.outputTokens })
    this.records.push({ ...rec, estimatedCostUsd })
  }

  /** Trip the billing circuit breaker: no later call may start. Captures how many
   *  Stage-1 calls were already in flight when billing failed. */
  markBillingExhausted(): void {
    if (this._billingExhausted) return
    this._billingExhausted = true
    this._stopReason = 'billing_exhausted'
    this._inFlightAtBillingFailure = this._inFlight
  }

  records_(): readonly CallRecord[] { return this.records }

  summary(): RunCostSummaryFull {
    const callsBySource: Record<string, number> = {}
    for (const r of this.records) callsBySource[r.source] = (callsBySource[r.source] ?? 0) + 1
    const totalInputTokens = this.records.reduce((n, r) => n + r.inputTokens, 0)
    const totalOutputTokens = this.records.reduce((n, r) => n + r.outputTokens, 0)
    const totalThinkingTokens = this.records.reduce((n, r) => n + r.thinkingTokens, 0)
    const usd = this.spentUsd
    return {
      totalCalls: this.records.length,
      callsBySource,
      callsPreventedByBudget: this._preventedByBudget,
      callsAlreadyInFlightAtBillingFailure: this._inFlightAtBillingFailure,
      callsPreventedAfterBillingFailure: this._preventedAfterBilling,
      totalInputTokens, totalOutputTokens, totalThinkingTokens,
      estimatedRunCostUsd: Number(usd.toFixed(6)),
      estimatedRunCostIls: Number((usd * USD_TO_ILS).toFixed(4)),
      billingExhausted: this._billingExhausted,
      aborted: this._billingExhausted || !!this._stopReason,
      stopReason: this._stopReason,
      costPerCall: Number((usd / (this.records.length || 1)).toFixed(6)),
    }
  }
}

/** Convenience — build a controller for a run. */
export function newRunCostController(mode: 'standard' | 'premium', generationRunId: string, targetFreshIdeas: number): RunCostController {
  return new RunCostController(mode, generationRunId, targetFreshIdeas)
}

export type { CallUsage }

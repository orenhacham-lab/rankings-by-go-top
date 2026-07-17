/**
 * MODEL-AWARE generation config (Part A of the Pro-400 fix) — pure.
 *
 * Live-proven defect: `thinkingConfig: { thinkingBudget: 0 }` was sent for
 * EVERY model. Gemini 2.5 Flash accepts 0 (thinking disabled — the intended
 * low-cost behavior), but Gemini 2.5 Pro cannot disable thinking and the
 * provider rejects the whole call: HTTP 400 INVALID_ARGUMENT "Budget 0 is
 * invalid. This model only works in thinking mode." — zeroing every premium
 * run the moment the real UI started requesting Pro.
 *
 * This module is the ONE place that decides thinking + output-token config per
 * model, from an EXPLICIT capability table (prefix-matched, most-specific
 * first); a substring heuristic is only the conservative fallback for unknown
 * ids. The returned config is surfaced in Preview diagnostics (modelConfig)
 * and its maxOutputTokens is the REAL ceiling (answer budget + thinking
 * budget) so the RunCostController estimates what the call can actually spend.
 */

export interface ModelCapability {
  /** May thinking be fully disabled (thinkingBudget: 0)? */
  canDisableThinking: boolean
  /** Documented valid budget range when thinking is on. */
  minThinkingBudget: number
  maxThinkingBudget: number
}

/** EXPLICIT capability table — prefix keys, most specific first. */
const CAPABILITY_TABLE: { prefix: string; cap: ModelCapability }[] = [
  { prefix: 'gemini-2.5-flash-lite', cap: { canDisableThinking: true, minThinkingBudget: 512, maxThinkingBudget: 24576 } },
  { prefix: 'gemini-2.5-flash', cap: { canDisableThinking: true, minThinkingBudget: 128, maxThinkingBudget: 24576 } },
  // Documented: 2.5 Pro cannot disable thinking; valid budget 128–32768.
  { prefix: 'gemini-2.5-pro', cap: { canDisableThinking: false, minThinkingBudget: 128, maxThinkingBudget: 32768 } },
  { prefix: 'gemini-3-pro', cap: { canDisableThinking: false, minThinkingBudget: 128, maxThinkingBudget: 32768 } },
]

/** Capability lookup: explicit table first; unknown ids fall back CONSERVATIVELY
 *  (a name containing "pro" is assumed unable to disable thinking — the safe
 *  direction: a valid budget works on every model, 0 breaks Pro-class). */
export function modelCapability(model: string): ModelCapability {
  const id = (model || '').toLowerCase().trim()
  for (const row of CAPABILITY_TABLE) if (id.startsWith(row.prefix)) return row.cap
  if (id.includes('pro')) return { canDisableThinking: false, minThinkingBudget: 128, maxThinkingBudget: 32768 }
  return { canDisableThinking: true, minThinkingBudget: 128, maxThinkingBudget: 24576 }
}

export interface RecoModelConfig {
  model: string
  thinkingMode: 'disabled' | 'budgeted'
  thinkingBudget: number
  /** REAL output ceiling sent to the provider: answer budget + thinking budget. */
  maxOutputTokens: number
  /** The JSON-answer share of the ceiling (diagnostics). */
  answerBudget: number
}

/** Operator-configurable Pro thinking budget (default 1024; clamped to the
 *  model's documented valid range). */
export function configuredProThinkingBudget(): number {
  const n = Number(process.env.RECO_PRO_THINKING_BUDGET)
  return Number.isFinite(n) && n > 0 ? n : 1024
}

/**
 * Resolve the generation config for ONE call. `answerBudget` is the token
 * budget for the JSON ANSWER itself (the callers' existing outputBudget
 * semantics); thinking-capable-only models get their thinking budget ADDED on
 * top so the answer is never starved by thinking.
 */
export function resolveModelConfig(model: string, answerBudget: number): RecoModelConfig {
  const cap = modelCapability(model)
  if (cap.canDisableThinking) {
    return { model, thinkingMode: 'disabled', thinkingBudget: 0, maxOutputTokens: answerBudget, answerBudget }
  }
  const budget = Math.max(cap.minThinkingBudget, Math.min(cap.maxThinkingBudget, configuredProThinkingBudget()))
  return { model, thinkingMode: 'budgeted', thinkingBudget: budget, maxOutputTokens: answerBudget + budget, answerBudget }
}

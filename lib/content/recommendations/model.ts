/**
 * Centralized recommendation-model selection (topic generation ONLY).
 *
 * Cost-controlled routing: the DEFAULT generator is Gemini 2.5 Flash (quality is
 * carried by the cleaned project-owned prompts, not by an expensive model per
 * source). Gemini 2.5 Pro is an OPTIONAL, at-most-once-per-action CURATOR (premium
 * mode) — never the per-source generator.
 *
 * Isolated from article writing / SEO fixes / image prompts / metadata / internal
 * links: those keep their own model config.
 */

import { getRecoGenAiClient } from './genai-client'
import { resolveAvailableRecommendationModel } from './model-availability'
import { resolveModelConfig, type RecoModelConfig } from './model-config'
import type { RunCostController, CallStopReason } from './run-cost-controller'

/** DEFAULT generation model — Gemini 2.5 Flash (NOT Flash-Lite, NOT Pro). */
export const RECOMMENDATION_MODEL_PRIMARY = process.env.RECOMMENDATION_MODEL_PRIMARY || 'gemini-2.5-flash'
/** Transient-retry model (same tier by default; never a silent Flash-Lite downgrade). */
export const RECOMMENDATION_MODEL_FALLBACK = process.env.RECOMMENDATION_MODEL_FALLBACK || 'gemini-2.5-flash'
/** OPTIONAL premium curator — one call max per user action, over the merged pool. */
export const RECOMMENDATION_MODEL_CURATOR = process.env.RECOMMENDATION_MODEL_CURATOR || 'gemini-2.5-pro'
/** Config version tag (internal diagnostics / benchmark provenance). */
export const RECOMMENDATION_MODEL_VERSION = process.env.RECOMMENDATION_MODEL_VERSION || 'reco-2026-07-flash-default'

/** Typed model-error categories. billing_exhausted is a HARD stop (no fallback).
 *  A provider 400 (bad request/config) is NEVER described as model_unavailable. */
export type ModelErrorCategory = 'billing_exhausted' | 'rate_limited' | 'model_unavailable' | 'invalid_model_configuration' | 'provider_invalid_argument'

/** Explicit recommendation-call outcomes (Part 2). A MAX_TOKENS/empty response is
 *  NEVER silently collapsed into a generic model_error. */
export type RecoErrorType =
  | 'gemini_max_tokens_empty'
  | 'gemini_empty_candidates'
  | 'gemini_no_text_part'
  | 'gemini_safety_block'
  | 'gemini_timeout'
  | 'gemini_empty_text'
  | 'billing_exhausted'
  | 'rate_limited'
  | 'model_unavailable'
  | 'invalid_model_configuration'
  | 'provider_invalid_argument'

/** Provider/response classification (Part 2). */
export type RecoProviderStatus = 'ok' | 'empty' | 'blocked' | 'error'
export type RecoParseStatus = 'json_ready' | 'empty' | 'not_attempted'

/** Thrown on prepayment/credit exhaustion so the ENTIRE run aborts immediately —
 *  never caught into a Flash fallback or another paid call. */
export class BillingExhaustedError extends Error {
  readonly category = 'billing_exhausted' as const
  constructor(message = 'Gemini prepayment credits are depleted') { super(message); this.name = 'BillingExhaustedError' }
}

/** Thrown when the configured/available Gemini model is not offered to the active
 *  API key (the live 404 "no longer available"). A HARD config failure — the whole
 *  run aborts and the route returns a typed recommendation_model_unavailable. */
export class RecommendationModelUnavailableError extends Error {
  readonly category = 'model_unavailable' as const
  readonly modelId: string | null
  constructor(modelId: string | null, message = 'The configured Gemini model is not available for this API key') {
    super(message); this.name = 'RecommendationModelUnavailableError'; this.modelId = modelId
  }
}

/** True for a provider error message that means the MODEL itself is unavailable
 *  (404 / "no longer available" / "not found"), as opposed to a transient error. */
export function isModelUnavailableMessage(message: string): boolean {
  const m = (message || '').toLowerCase()
  return /no longer available|is not found|not found for api version|models\/[\w.-]+ is not|404.*model|model.*not.*(found|available)/.test(m)
}

/** Classify a provider error message into a typed category. Order matters:
 *  billing → rate limit → thinking/config 400 → generic 400 → unavailable. */
export function classifyModelError(message: string): ModelErrorCategory {
  const m = (message || '').toLowerCase()
  if (/prepayment credits are depleted|no credits|billing required|payment required|insufficient (funds|credit)|quota.*billing|resource_exhausted.*billing/.test(m)) return 'billing_exhausted'
  if (/429|too many requests|rate limit|resource_exhausted|quota exceeded/.test(m)) return 'rate_limited'
  // The live Pro defect class: "Budget 0 is invalid. This model only works in
  // thinking mode." — a CONFIGURATION error, never "model unavailable".
  if (/only works in thinking mode|thinking.?budget|budget \d+ is invalid|thinking mode/.test(m)) return 'invalid_model_configuration'
  if (/invalid_argument|invalid json payload|"code"\s*:\s*400|\[400[\s\]]|http 400|status.*400.*invalid/.test(m)) return 'provider_invalid_argument'
  return 'model_unavailable'
}

/** Strip anything secret-shaped from a provider message before it reaches
 *  diagnostics: API keys, key= params, full URLs, bearer tokens. */
export function sanitizeProviderMessage(message: string): string {
  return (message || '')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[key]')
    .replace(/bearer\s+[A-Za-z0-9._-]+/gi, 'bearer [token]')
    .replace(/https?:\/\/\S+/g, (u) => u.split('?')[0])
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

/**
 * Proportional output-token budget from the requested count + a COMPACT schema
 * (~600 tokens/topic incl. thinking + overhead). Never reserves the ceiling for a
 * few ideas; keeps a hard ceiling so a full batch is not truncated.
 */
export function outputBudgetFor(count: number): number {
  const PER_TOPIC = 600
  const OVERHEAD = 1200
  const CEILING = 16384
  const FLOOR = 2048
  return Math.max(FLOOR, Math.min(CEILING, Math.ceil((count || 1) * PER_TOPIC + OVERHEAD)))
}

export interface RecoGenResult {
  text: string
  ok: boolean
  modelUsed: string | null
  usedFallback: boolean
  /** Typed error category when ok=false (rate_limited / model_unavailable). Billing
   *  never surfaces here — it THROWS BillingExhaustedError. */
  errorCategory?: ModelErrorCategory
  finishReason?: string
  truncated?: boolean
  promptTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
  totalTokenCount?: number
  /** Output-only (candidates) token count used for cost/telemetry. */
  outputTokens?: number
  /** true when the shared cost controller PREVENTED this call (budget ceiling). */
  stopped?: boolean
  stopReason?: CallStopReason
  // Part 2 — explicit response classification (never treat empty as success).
  textPresent?: boolean
  textLength?: number
  providerStatus?: RecoProviderStatus
  parseStatus?: RecoParseStatus
  /** Explicit typed outcome (incl. gemini_max_tokens_empty). */
  errorType?: RecoErrorType
  /** Whether an IDENTICAL retry could plausibly resolve the failure (Part 3). */
  retryable?: boolean
  /** The EXACT generation config used (model-aware thinking budget + real
   *  output ceiling) — surfaced in Preview diagnostics as modelConfig. */
  modelConfig?: RecoModelConfig
  /** Sanitized provider error text (keys/URLs/tokens stripped) on failure. */
  errorMessage?: string
}

export interface RecoGenOptions {
  temperature?: number
  maxOutputTokens?: number
  /** Override the model (e.g. the Pro curator). Defaults to the Flash generator. */
  model?: string
  /** Skip the transient-retry fallback (e.g. the curator makes ONE call only). */
  noFallback?: boolean
}

/** Per-call telemetry context (source + purpose) for the shared controller. */
export interface RecoCallInfo {
  source: string
  callPurpose: string
  requestedIdeaCount: number
  retryNumber?: number
}

/**
 * ONE JSON generation. Uses the Flash generator by default (or `opts.model`). On a
 * BILLING error it THROWS BillingExhaustedError (hard abort — NO fallback, no
 * further paid call). On a rate-limit / transient error it may try ONE fallback
 * (unless noFallback); on total transient failure returns ok=false + errorCategory.
 * Never throws for non-billing failures.
 */
/** Bad (blocking) finish reasons — a candidate here carries no usable JSON. */
const BLOCKING_FINISH = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'LANGUAGE'])
const GENAI_TIMEOUT_MS = 60_000

export interface GenAiClassifyInput {
  textPresent: boolean
  finishReason?: string
  hasCandidates: boolean
  blocked: boolean
}
export interface GenAiClassifyResult {
  ok: boolean
  providerStatus: RecoProviderStatus
  parseStatus: RecoParseStatus
  errorType?: RecoErrorType
  retryable: boolean
}

/**
 * PURE classification of a Gemini response (Part 2). Empty text is NEVER treated
 * as success. A MAX_TOKENS/empty body is the EXPLICIT gemini_max_tokens_empty and
 * is NOT retryable (an identical call repeats it — Part 3). Order matters:
 * MAX_TOKENS-empty → safety block → no candidates → no text part → usable JSON.
 */
export function classifyGenAiResponse(inp: GenAiClassifyInput): GenAiClassifyResult {
  if (!inp.textPresent && inp.finishReason === 'MAX_TOKENS') return { ok: false, providerStatus: 'empty', parseStatus: 'empty', errorType: 'gemini_max_tokens_empty', retryable: false }
  if (inp.blocked) return { ok: false, providerStatus: 'blocked', parseStatus: 'empty', errorType: 'gemini_safety_block', retryable: false }
  if (!inp.hasCandidates) return { ok: false, providerStatus: 'empty', parseStatus: 'empty', errorType: 'gemini_empty_candidates', retryable: true }
  if (!inp.textPresent) return { ok: false, providerStatus: 'empty', parseStatus: 'empty', errorType: 'gemini_empty_text', retryable: false }
  return { ok: true, providerStatus: 'ok', parseStatus: 'json_ready', retryable: false }
}

export async function generateRecommendationJSON(prompt: string, opts: RecoGenOptions = {}, controller?: RunCostController, callInfo?: RecoCallInfo): Promise<RecoGenResult> {
  const client = getRecoGenAiClient()
  if (!client) { console.warn('[reco-model] no gemini client (GEMINI_API_KEY unset)'); return { text: '', ok: false, modelUsed: null, usedFallback: false, errorCategory: 'model_unavailable', errorType: 'model_unavailable', providerStatus: 'error', parseStatus: 'not_attempted', textPresent: false, textLength: 0, retryable: false } }
  // opts.maxOutputTokens is the ANSWER budget (the JSON itself); the real
  // provider ceiling is model-aware (thinking budget added for Pro-class).
  const answerBudget = opts.maxOutputTokens ?? outputBudgetFor(15)
  const source = callInfo?.source ?? 'unknown'
  const callPurpose = callInfo?.callPurpose ?? 'primary'
  const requestedIdeaCount = callInfo?.requestedIdeaCount ?? 0
  const retryNumber = callInfo?.retryNumber ?? 0

  // Part A/B — resolve a model PROVEN available to the active key BEFORE any paid
  // call. An explicit opts.model (e.g. a curator id) is respected; otherwise the
  // resolver picks an available Flash-class model (env override or discovery). A
  // proven-unavailable model is a HARD, typed failure (no silent Pro fallback).
  let id = opts.model || RECOMMENDATION_MODEL_PRIMARY
  if (!opts.model) {
    const resolved = await resolveAvailableRecommendationModel()
    if (resolved.ok) {
      id = resolved.model
    } else if (resolved.reason === 'model_unavailable') {
      console.error('[reco-model] no available Flash-class model for this API key')
      throw new RecommendationModelUnavailableError(id)
    } else if (resolved.reason === 'no_client') {
      return { text: '', ok: false, modelUsed: null, usedFallback: false, errorCategory: 'model_unavailable', errorType: 'model_unavailable', providerStatus: 'error', parseStatus: 'not_attempted', textPresent: false, textLength: 0, retryable: false }
    }
    // list_failed → keep the configured id and let the call surface a typed error.
  }

  // MODEL-AWARE generation config (live Pro defect fix): Flash keeps
  // thinkingBudget 0; Pro-class gets a valid clamped thinking budget and the
  // ceiling covers BOTH the JSON answer and the thinking budget.
  const mc = resolveModelConfig(id, answerBudget)
  const config = {
    responseMimeType: 'application/json',
    temperature: opts.temperature ?? 0.7,
    maxOutputTokens: mc.maxOutputTokens,
    thinkingConfig: { thinkingBudget: mc.thinkingBudget },
  }

  // ENFORCED pre-call gate — the shared controller decides whether this call may
  // start (billing / call ceiling / cost ceiling), estimated on the REAL ceiling.
  if (controller) {
    const est = controller.estimateNextCallUsd(id, prompt.length, mc.maxOutputTokens)
    const gate = controller.beforeCall(est)
    if (!gate.allowed) return { text: '', ok: false, modelUsed: null, usedFallback: false, stopped: true, stopReason: gate.reason, errorCategory: gate.reason === 'billing_exhausted' ? 'billing_exhausted' : 'model_unavailable', errorType: gate.reason === 'billing_exhausted' ? 'billing_exhausted' : 'model_unavailable', providerStatus: 'error', parseStatus: 'not_attempted', textPresent: false, textLength: 0, retryable: false, modelConfig: mc }
  }
  const startedAt = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), GENAI_TIMEOUT_MS)
  try {
    const resp = await client.models.generateContent({ model: id, contents: prompt, config: { ...config, abortSignal: ac.signal } })
    const candidate = resp.candidates?.[0]
    const finishReason = candidate?.finishReason ? String(candidate.finishReason) : undefined
    const usage = resp.usageMetadata
    const promptTokenCount = usage?.promptTokenCount ?? 0
    const outputTokens = usage?.candidatesTokenCount ?? 0
    const thinkingTokens = usage?.thoughtsTokenCount ?? 0
    const totalTokenCount = usage?.totalTokenCount ?? 0
    const rawText = resp.text ?? ''
    const text = typeof rawText === 'string' ? rawText : ''
    const textPresent = text.trim().length > 0
    const hasCandidates = (resp.candidates?.length ?? 0) > 0
    const blocked = (finishReason && BLOCKING_FINISH.has(finishReason)) || !!resp.promptFeedback?.blockReason

    controller?.recordCall({ generationRunId: controller.generationRunId, model: id, source, callPurpose, requestedIdeaCount, maxOutputTokens: mc.maxOutputTokens, inputTokens: promptTokenCount, outputTokens, thinkingTokens, finishReason, retryNumber, success: textPresent, durationMs: Date.now() - startedAt })

    const base = {
      modelUsed: id, usedFallback: false, finishReason, truncated: finishReason === 'MAX_TOKENS',
      promptTokenCount, candidatesTokenCount: outputTokens, thoughtsTokenCount: thinkingTokens, totalTokenCount, outputTokens,
      textPresent, textLength: text.length, modelConfig: mc,
    }
    const cls = classifyGenAiResponse({ textPresent, finishReason, hasCandidates, blocked })
    if (cls.errorType === 'gemini_max_tokens_empty') {
      console.error('[reco-model] MAX_TOKENS with empty text', { model: id, source, maxOutputTokens: mc.maxOutputTokens, outputTokens, thinkingTokens })
    }
    return {
      ...base,
      text: cls.ok ? text : '',
      ok: cls.ok,
      providerStatus: cls.providerStatus,
      parseStatus: cls.parseStatus,
      ...(cls.errorType ? { errorType: cls.errorType, errorCategory: 'model_unavailable' as ModelErrorCategory } : {}),
      retryable: cls.retryable,
    }
  } catch (err) {
    const aborted = ac.signal.aborted || (err as { name?: string })?.name === 'AbortError'
    const message = err instanceof Error ? err.message : String(err)
    const category = classifyModelError(message)
    controller?.recordCall({ generationRunId: controller.generationRunId, model: id, source, callPurpose, requestedIdeaCount, maxOutputTokens: mc.maxOutputTokens, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, retryNumber, success: false, errorType: aborted ? 'gemini_timeout' : category, durationMs: Date.now() - startedAt })
    // BILLING EXHAUSTED → trip the breaker + hard abort. Never a paid fallback.
    if (!aborted && category === 'billing_exhausted') { controller?.markBillingExhausted(); console.error('[reco-model] billing exhausted — aborting run', { model: id }); throw new BillingExhaustedError(message) }
    // MODEL UNAVAILABLE (404 / "no longer available") → HARD typed abort so the run
    // never renders a provider 404 as a successful zero-result (Part C).
    if (!aborted && isModelUnavailableMessage(message)) { console.error('[reco-model] model unavailable (404) — aborting run', { model: id }); throw new RecommendationModelUnavailableError(id, message) }
    if (aborted) { console.error('[reco-model] generation timeout', { model: id, source, ms: GENAI_TIMEOUT_MS }); return { text: '', ok: false, modelUsed: null, usedFallback: false, errorCategory: 'model_unavailable', errorType: 'gemini_timeout', providerStatus: 'error', parseStatus: 'not_attempted', textPresent: false, textLength: 0, retryable: true, modelConfig: mc, errorMessage: 'timeout' } }
    console.error('[reco-model] generation error', { model: id, category, message: sanitizeProviderMessage(message) })
    // A provider 400 (config / bad argument) is a NON-RETRYABLE typed failure —
    // returned (never thrown) so the round records provider_failed_briefs with
    // its exact typed cause.
    return { text: '', ok: false, modelUsed: null, usedFallback: false, errorCategory: category, errorType: category, providerStatus: 'error', parseStatus: 'not_attempted', textPresent: false, textLength: 0, retryable: category === 'rate_limited', modelConfig: mc, errorMessage: sanitizeProviderMessage(message) }
  } finally {
    clearTimeout(timer)
  }
}

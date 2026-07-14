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

import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'

/** DEFAULT generation model — Gemini 2.5 Flash (NOT Flash-Lite, NOT Pro). */
export const RECOMMENDATION_MODEL_PRIMARY = process.env.RECOMMENDATION_MODEL_PRIMARY || 'gemini-2.5-flash'
/** Transient-retry model (same tier by default; never a silent Flash-Lite downgrade). */
export const RECOMMENDATION_MODEL_FALLBACK = process.env.RECOMMENDATION_MODEL_FALLBACK || 'gemini-2.5-flash'
/** OPTIONAL premium curator — one call max per user action, over the merged pool. */
export const RECOMMENDATION_MODEL_CURATOR = process.env.RECOMMENDATION_MODEL_CURATOR || 'gemini-2.5-pro'
/** Config version tag (internal diagnostics / benchmark provenance). */
export const RECOMMENDATION_MODEL_VERSION = process.env.RECOMMENDATION_MODEL_VERSION || 'reco-2026-07-flash-default'

/** Typed model-error categories. billing_exhausted is a HARD stop (no fallback). */
export type ModelErrorCategory = 'billing_exhausted' | 'rate_limited' | 'model_unavailable'

/** Thrown on prepayment/credit exhaustion so the ENTIRE run aborts immediately —
 *  never caught into a Flash fallback or another paid call. */
export class BillingExhaustedError extends Error {
  readonly category = 'billing_exhausted' as const
  constructor(message = 'Gemini prepayment credits are depleted') { super(message); this.name = 'BillingExhaustedError' }
}

/** Classify a provider error message into a typed category. */
export function classifyModelError(message: string): ModelErrorCategory {
  const m = (message || '').toLowerCase()
  if (/prepayment credits are depleted|no credits|billing required|payment required|insufficient (funds|credit)|quota.*billing|resource_exhausted.*billing/.test(m)) return 'billing_exhausted'
  if (/429|too many requests|rate limit|resource_exhausted|quota exceeded/.test(m)) return 'rate_limited'
  return 'model_unavailable'
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
  totalTokenCount?: number
  /** Output-only (candidates) token count used for cost/telemetry. */
  outputTokens?: number
}

export interface RecoGenOptions {
  temperature?: number
  maxOutputTokens?: number
  /** Override the model (e.g. the Pro curator). Defaults to the Flash generator. */
  model?: string
  /** Skip the transient-retry fallback (e.g. the curator makes ONE call only). */
  noFallback?: boolean
}

/**
 * ONE JSON generation. Uses the Flash generator by default (or `opts.model`). On a
 * BILLING error it THROWS BillingExhaustedError (hard abort — NO fallback, no
 * further paid call). On a rate-limit / transient error it may try ONE fallback
 * (unless noFallback); on total transient failure returns ok=false + errorCategory.
 * Never throws for non-billing failures.
 */
export async function generateRecommendationJSON(prompt: string, opts: RecoGenOptions = {}): Promise<RecoGenResult> {
  const client = getGeminiClient()
  if (!client) { console.warn('[reco-model] no gemini client (GEMINI_API_KEY unset)'); return { text: '', ok: false, modelUsed: null, usedFallback: false, errorCategory: 'model_unavailable' } }
  const generationConfig = {
    responseMimeType: 'application/json',
    temperature: opts.temperature ?? 0.7,
    maxOutputTokens: opts.maxOutputTokens ?? outputBudgetFor(15),
  }
  const primaryId = opts.model || RECOMMENDATION_MODEL_PRIMARY
  const tiers: { tier: 'primary' | 'fallback'; id: string }[] = [{ tier: 'primary', id: primaryId }]
  if (!opts.noFallback && RECOMMENDATION_MODEL_FALLBACK !== primaryId) tiers.push({ tier: 'fallback', id: RECOMMENDATION_MODEL_FALLBACK })
  let lastCategory: ModelErrorCategory = 'model_unavailable'
  for (const { tier, id } of tiers) {
    try {
      const model = client.getGenerativeModel({ model: id, generationConfig })
      const resp = (await model.generateContent(prompt)).response
      const text = resp.text()
      const finishReason = resp.candidates?.[0]?.finishReason
      const usage = resp.usageMetadata
      if (tier === 'fallback') console.warn('[reco-model] primary failed → used transient fallback', { primary: primaryId, fallback: id })
      return {
        text, ok: true, modelUsed: id, usedFallback: tier === 'fallback',
        finishReason, truncated: finishReason === 'MAX_TOKENS',
        promptTokenCount: usage?.promptTokenCount, candidatesTokenCount: usage?.candidatesTokenCount, totalTokenCount: usage?.totalTokenCount,
        outputTokens: usage?.candidatesTokenCount,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const category = classifyModelError(message)
      // BILLING EXHAUSTED → hard abort. Never fall through to a paid fallback.
      if (category === 'billing_exhausted') { console.error('[reco-model] billing exhausted — aborting run', { model: id }); throw new BillingExhaustedError(message) }
      lastCategory = category
      console.error('[reco-model] generation error', { tier, model: id, category, message: message.slice(0, 200) })
      // rate_limited / model_unavailable → try the single fallback, then give up.
    }
  }
  return { text: '', ok: false, modelUsed: null, usedFallback: false, errorCategory: lastCategory }
}

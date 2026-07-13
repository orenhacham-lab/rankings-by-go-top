/**
 * Centralized recommendation-model selection (topic generation ONLY).
 *
 * Every recommendation route (Site Scan / Project Data / Keyword Research, and
 * Hybrid which orchestrates them) generates topic ideas through this one module,
 * so the model is pinned in a SINGLE place — never scattered as literal strings.
 *
 * Isolated from article writing / SEO fixes / image prompts / metadata / internal
 * links: those keep their own model config. This module does not touch them.
 *
 * Fallback is EXPLICIT and logged; it never silently downgrades to Flash-Lite and
 * always preserves the same JSON output contract. `modelUsed` is an internal
 * diagnostic — never rendered on the user-facing recommendation card.
 */

import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'

/** Pinned stable Pro model for topic ideation (quality > latency here). Override
 *  only via env for a controlled rollout — never falls back to Flash-Lite. */
export const RECOMMENDATION_MODEL_PRIMARY = process.env.RECOMMENDATION_MODEL_PRIMARY || 'gemini-2.5-pro'
/** Explicit fallback: still a full model (Flash), NOT Flash-Lite. Same contract. */
export const RECOMMENDATION_MODEL_FALLBACK = process.env.RECOMMENDATION_MODEL_FALLBACK || 'gemini-2.5-flash'
/** Config version tag (for internal diagnostics / benchmark provenance). */
export const RECOMMENDATION_MODEL_VERSION = process.env.RECOMMENDATION_MODEL_VERSION || 'reco-2026-07-pro'

export interface RecoGenResult {
  text: string
  /** true when a model responded (JSON may still need parsing by the caller). */
  ok: boolean
  /** Which model produced the text ('primary' id or 'fallback' id); null on total failure. */
  modelUsed: string | null
  /** true only when the primary failed and the fallback was used. */
  usedFallback: boolean
  /** Diagnostics (Preview) — the model's finish reason ('STOP' | 'MAX_TOKENS' | …). */
  finishReason?: string
  /** true when the response was cut by the output-token limit (truncated JSON). */
  truncated?: boolean
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
}

export interface RecoGenOptions {
  temperature?: number
  /** Give a ~20-idea JSON response room so it is never truncated mid-array. */
  maxOutputTokens?: number
}

/**
 * ONE JSON generation for topic recommendations: try the pinned primary, and on a
 * transient error fall back to the explicit fallback model (logged). Returns the
 * raw text + which model was used. Never throws; `ok=false` on total failure so
 * the caller can retry within its own attempt budget.
 */
export async function generateRecommendationJSON(prompt: string, opts: RecoGenOptions = {}): Promise<RecoGenResult> {
  const client = getGeminiClient()
  if (!client) { console.warn('[reco-model] no gemini client (GEMINI_API_KEY unset)'); return { text: '', ok: false, modelUsed: null, usedFallback: false } }
  const generationConfig = {
    responseMimeType: 'application/json',
    temperature: opts.temperature ?? 0.7,
    maxOutputTokens: opts.maxOutputTokens ?? 8192,
  }
  const tiers: { tier: 'primary' | 'fallback'; id: string }[] = [
    { tier: 'primary', id: RECOMMENDATION_MODEL_PRIMARY },
    { tier: 'fallback', id: RECOMMENDATION_MODEL_FALLBACK },
  ]
  for (const { tier, id } of tiers) {
    try {
      const model = client.getGenerativeModel({ model: id, generationConfig })
      const resp = (await model.generateContent(prompt)).response
      const text = resp.text()
      const finishReason = resp.candidates?.[0]?.finishReason
      const usage = resp.usageMetadata
      if (tier === 'fallback') console.warn('[reco-model] primary failed → used explicit fallback', { primary: RECOMMENDATION_MODEL_PRIMARY, fallback: id })
      return {
        text, ok: true, modelUsed: id, usedFallback: tier === 'fallback',
        finishReason, truncated: finishReason === 'MAX_TOKENS',
        promptTokenCount: usage?.promptTokenCount, candidatesTokenCount: usage?.candidatesTokenCount, totalTokenCount: usage?.totalTokenCount,
      }
    } catch (err) {
      console.error('[reco-model] generation error', { tier, model: id, message: err instanceof Error ? err.message : String(err) })
      // primary error → loop continues to the fallback; fallback error → give up.
    }
  }
  return { text: '', ok: false, modelUsed: null, usedFallback: false }
}

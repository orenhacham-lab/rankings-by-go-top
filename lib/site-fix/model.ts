/**
 * The model behind site-health suggestions (titles, descriptions, FAQ: ./suggest.ts). Server-side only.
 *
 * Wave 10: the FAQ for a page without one came back empty and "new title for Google" said no
 * better title could be written, on the owner's real pages. Root cause: every call here used the
 * PINNED id `gemini-2.5-flash` (RECOMMENDATION_MODEL_PRIMARY), which the live key answers with
 * HTTP 404 "no longer available to new users" (see lib/content/recommendations/model-availability.ts,
 * where the idea generator already stopped pinning it). suggest.ts swallows a failed call as
 * "no model help", so the model was never used at all.
 *
 * Now the model is the one the active key actually offers (the same discovery the idea generator
 * uses, cached ten minutes). A model the key does not offer is remembered as unavailable and the
 * call moves ONCE to the classifier model; any other failure (timeout, rate limit, billing) ends
 * the call. So one call costs at most one paid request, and a preview at most two calls per
 * suggestion (suggest.ts). Every call logs its model, tokens and estimated cost, never the prompt
 * or the answer.
 */
import { isModelUnavailableMessage } from '@/lib/content/recommendations/model'
import { resolveModelConfig } from '@/lib/content/recommendations/model-config'
import type { ModelResolution } from '@/lib/content/recommendations/model-availability'
import { estimateCallCostUsd } from '@/lib/content/recommendations/reco-cost'
import type { Generate } from './suggest'

/** What this file needs of @google/genai's client (so the guard runs without a network). */
export interface GenAiLike {
  models: {
    generateContent(req: { model: string; contents: string; config: Record<string, unknown> }): Promise<{
      text?: string
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
    }>
  }
}

export interface SiteFixModelDeps {
  client: () => GenAiLike | null
  resolve: () => Promise<ModelResolution>
  /** The second choice when the first is not offered to the key. */
  fallbackModel: string
  log?: (line: string) => void
}

/** Per call. The fixes route has 60 s; a preview makes at most two calls. */
export const SITE_FIX_MODEL_TIMEOUT_MS = 20_000
/** Answer budget in tokens: five Hebrew questions and answers fit well inside it. */
export const SITE_FIX_ANSWER_TOKENS = 2048
/** Paid requests one call may make: the first model, and the fallback only after a "not offered" answer. */
export const SITE_FIX_MAX_MODELS_PER_CALL = 2

export interface SiteFixCallCost { model: string; inputTokens: number; outputTokens: number; usd: number }

export function makeSiteFixGenerate(deps: SiteFixModelDeps): Generate & { unavailable: Set<string>; lastCost: () => SiteFixCallCost | null } {
  const unavailable = new Set<string>()
  let last: SiteFixCallCost | null = null
  const generate = async (prompt: string): Promise<string> => {
    const client = deps.client()
    if (!client) throw new Error('suggest_unavailable')
    const resolved = await deps.resolve().catch(() => null)
    const ids = [resolved && resolved.ok ? resolved.model : null, deps.fallbackModel]
      .filter((id, i, all): id is string => !!id && all.indexOf(id) === i && !unavailable.has(id))
      .slice(0, SITE_FIX_MAX_MODELS_PER_CALL)
    if (ids.length === 0) throw new Error('suggest_unavailable')
    for (const model of ids) {
      const mc = resolveModelConfig(model, SITE_FIX_ANSWER_TOKENS)
      try {
        const resp = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.4,
            maxOutputTokens: mc.maxOutputTokens,
            thinkingConfig: { thinkingBudget: mc.thinkingBudget },
            abortSignal: AbortSignal.timeout(SITE_FIX_MODEL_TIMEOUT_MS),
          },
        })
        const u = resp.usageMetadata ?? {}
        const inputTokens = Number(u.promptTokenCount) || 0
        const outputTokens = (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0)
        last = { model, inputTokens, outputTokens, usd: estimateCallCostUsd({ model, inputTokens, outputTokens }) }
        deps.log?.(`[site-fix] model call model=${model} in=${inputTokens} out=${outputTokens} usd=${last.usd.toFixed(5)}`)
        return typeof resp.text === 'string' ? resp.text : ''
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!isModelUnavailableMessage(message)) {
          deps.log?.(`[site-fix] model call failed model=${model}`)
          throw new Error('suggest_failed')
        }
        unavailable.add(model)
        deps.log?.(`[site-fix] model not offered to this key model=${model}`)
      }
    }
    throw new Error('suggest_unavailable')
  }
  return Object.assign(generate, { unavailable, lastCost: () => last })
}

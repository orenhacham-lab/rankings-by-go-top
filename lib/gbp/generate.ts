/**
 * The one place lib/gbp speaks to Gemini.
 *
 * Both drafts — the post composer and the review reply — used to call
 * `generateContent` with the pinned `RECOMMENDATION_MODEL_PRIMARY`, which is
 * exactly the call `lib/content/recommendations/model-availability.ts` exists to
 * avoid: that id answered 404 "no longer available to new users" for the live
 * key, and the recommendation path only kept working because it resolves a model
 * the key actually offers before every call. The GBP drafts skipped that, so on
 * 12 October 2026 the composer answered "we could not write a draft" for the
 * owner while articles kept generating.
 *
 * It also failed silently: `draftPost` catches everything and the handler turns
 * it into one friendly sentence, so nothing reached the logs and the cause was
 * not knowable from production. Every failure here is logged with a typed reason
 * and no provider text, no key and no prompt.
 *
 * Server-only.
 */
import { getRecoGenAiClient } from '@/lib/content/recommendations/genai-client'
import { resolveAvailableRecommendationModel } from '@/lib/content/recommendations/model-availability'
import { resolveModelConfig } from '@/lib/content/recommendations/model-config'
import { RECOMMENDATION_MODEL_PRIMARY, classifyModelError, sanitizeProviderMessage } from '@/lib/content/recommendations/model'

export interface GbpGenerateOptions {
  /** Where this came from, for the log line: 'post' or 'review-reply'. */
  label: string
  /** The answer budget in tokens; the real ceiling is model-aware. */
  answerBudget: number
  temperature: number
}

/**
 * One JSON generation for a GBP draft. Returns the raw text, or '' when the
 * model could not answer — the callers treat empty as "no draft", which the
 * composer shows as a sentence inviting the merchant to write it themselves and
 * the automatic post treats as "send the article's own words".
 */
export async function generateGbpDraft(prompt: string, opts: GbpGenerateOptions): Promise<string> {
  const client = getRecoGenAiClient()
  if (!client) { console.error('[gbp-draft] no gemini client (GEMINI_API_KEY unset)', { label: opts.label }); return '' }

  // The model the ACTIVE key offers, never the pinned id on its own.
  let model = RECOMMENDATION_MODEL_PRIMARY
  const resolved = await resolveAvailableRecommendationModel()
  if (resolved.ok) {
    model = resolved.model
  } else if (resolved.reason === 'no_client') {
    console.error('[gbp-draft] no gemini client while resolving the model', { label: opts.label })
    return ''
  } else if (resolved.reason === 'model_unavailable') {
    console.error('[gbp-draft] the key offers no Flash-class model', { label: opts.label })
    return ''
  }
  // list_failed → the pinned id stands and the call below reports what happens.

  const mc = resolveModelConfig(model, opts.answerBudget)
  try {
    const resp = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: opts.temperature,
        maxOutputTokens: mc.maxOutputTokens,
        thinkingConfig: { thinkingBudget: mc.thinkingBudget },
        abortSignal: AbortSignal.timeout(30_000),
      },
    })
    const text = typeof resp.text === 'string' ? resp.text : ''
    if (!text.trim()) {
      const finishReason = resp.candidates?.[0]?.finishReason
      console.error('[gbp-draft] the model answered with no text', {
        label: opts.label, model, finishReason: finishReason ? String(finishReason) : 'none',
        maxOutputTokens: mc.maxOutputTokens,
      })
      return ''
    }
    return text
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const aborted = (e as { name?: string })?.name === 'AbortError' || /abort|timeout/i.test(message)
    console.error('[gbp-draft] generation failed', {
      label: opts.label, model,
      category: aborted ? 'timeout' : classifyModelError(message),
      message: sanitizeProviderMessage(message),
    })
    return ''
  }
}

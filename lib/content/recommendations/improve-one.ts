/**
 * Per-item "שפר עם Gemini Pro" — polish ONE already-validated recommendation with
 * the Pro model.
 *
 * SCOPE (deliberately narrow, so the validated ranking / ownership / subtype /
 * cannibalization / generation logic is NEVER re-run or changed): this refines only
 * the human-facing TITLE and the plain-language REASON. The primary keyword, search
 * intent, recommended page type, internal links and coverage decisions are carried
 * through UNCHANGED. The polished title is accepted only when it still aligns with
 * the SAME primary keyword (existing read-only `isTitleKeywordAligned` gate) and the
 * reason is not malformed (existing `isMalformedReason` gate) — otherwise the
 * original wording is kept (fail-safe: an improvement never degrades an item).
 */

import { resolveRunModel, type ModelPath } from './model-select'
import { generateRecommendationJSON } from './model'
import { isTitleKeywordAligned } from './coverage'
import { isMalformedReason } from './opportunity-validation'
import type { RunCostController } from './run-cost-controller'

export interface ImproveOneInput {
  primaryKeyword: string
  title: string
  suggestionReason: string
  language: 'he' | 'en'
}

export type ImproveOneReason = 'model_unavailable' | 'provider_error' | 'invalid_output' | 'no_change'

export interface ImproveOneResult {
  /** The Pro call ran and produced a usable, validated result (title/reason may be
   *  unchanged if the polish did not beat the original). */
  ok: boolean
  /** The visible title and/or reason actually changed. */
  changed: boolean
  title: string
  suggestionReason: string
  /** The Pro model actually used (null when unavailable). */
  model: string | null
  /** Truthful model path (requested Pro; may report a downgrade). Diagnostic-only. */
  modelPath: ModelPath
  reason?: ImproveOneReason
}

const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '')

/** Extract the first JSON object from a model response (tolerant of code fences). */
function parseObject(text: string): { title?: unknown; reason?: unknown } | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try { return JSON.parse(t) } catch { /* try to locate the object */ }
  const m = t.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

function buildPrompt(input: ImproveOneInput): string {
  const langLine = input.language === 'en'
    ? 'Write in natural English.'
    : 'כתוב בעברית תקנית וזורמת.'
  return [
    'You refine the wording of ONE existing SEO content recommendation. You do NOT change its subject, its target keyword, its intent, or invent any facts, numbers or search-volume claims.',
    langLine,
    'Rules:',
    '- Keep the SAME subject and the SAME primary keyword meaning. The improved title must still be about the primary keyword.',
    '- Improve only the phrasing: a clearer, more compelling title and a clearer one–two sentence reason for a non-expert site owner.',
    '- Do NOT add statistics, search volumes, promises, or claims that were not already present.',
    '- The title must be a natural content title (no "Guide:"/"Article:" prefixes, no quotes around it).',
    '',
    `primary_keyword: ${input.primaryKeyword}`,
    `current_title: ${input.title}`,
    `current_reason: ${input.suggestionReason}`,
    '',
    'Return ONLY strict JSON, no code fence: {"title": "<improved title>", "reason": "<improved reason>"}',
  ].join('\n')
}

/**
 * Polish a single recommendation with the Pro model. Never throws for non-billing
 * failures; returns ok=false with a typed reason when Pro is unavailable or the
 * provider fails, so the caller keeps the original item untouched.
 */
export async function improveRecommendationWithPro(input: ImproveOneInput, controller?: RunCostController): Promise<ImproveOneResult> {
  const modelPath = await resolveRunModel('premium')
  const keep = (ok: boolean, reason: ImproveOneReason): ImproveOneResult => ({
    ok, changed: false, title: input.title, suggestionReason: input.suggestionReason, model: modelPath.model, modelPath, reason,
  })
  // Require an ACTUAL Pro model — never silently improve with Flash under a Pro action.
  if (!modelPath.model || modelPath.tierUsed !== 'pro') return keep(false, 'model_unavailable')

  const res = await generateRecommendationJSON(
    buildPrompt(input),
    {
      model: modelPath.model, maxOutputTokens: 700, temperature: 0.6, noFallback: true,
      // ENFORCED structured output — a two-field object, so the polish can never
      // silently return prose or extra fields.
      responseSchema: { type: 'OBJECT', properties: { title: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['title', 'reason'] },
    },
    controller,
    { source: 'improve_one', callPurpose: 'primary', requestedIdeaCount: 1 },
  )
  if (!res.ok || !res.text) return keep(false, 'provider_error')

  const parsed = parseObject(res.text)
  if (!parsed) return keep(false, 'invalid_output')

  const newTitle = clean(parsed.title)
  const newReason = clean(parsed.reason)
  const usedModel = res.modelUsed ?? modelPath.model

  // FAIL-SAFE validation (existing read-only gates). The polished title is accepted
  // only when it still aligns with the UNCHANGED primary keyword; the reason only
  // when it is well-formed. Otherwise keep the original wording — never degrade.
  const titleOk = newTitle.length >= 6 && newTitle.length <= 140 && isTitleKeywordAligned(input.primaryKeyword, newTitle)
  const reasonOk = newReason.length >= 15 && !isMalformedReason(newReason)
  const finalTitle = titleOk ? newTitle : input.title
  const finalReason = reasonOk ? newReason : input.suggestionReason
  const changed = finalTitle !== input.title || finalReason !== input.suggestionReason

  return { ok: true, changed, title: finalTitle, suggestionReason: finalReason, model: usedModel, modelPath, reason: changed ? undefined : 'no_change' }
}

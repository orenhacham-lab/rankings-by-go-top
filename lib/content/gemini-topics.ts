/**
 * Gemini-backed SEO/GEO article-topic suggestions (Phase 2A).
 *
 * Reuses the SAME Gemini client/env as AI-recommended-questions
 * (getGeminiClient + GEMINI_CLASSIFIER_MODEL). Returns high-quality, deduped
 * topic ideas as structured objects. On any failure it returns null so the
 * caller can fall back to the template generator. No article generation here.
 */

import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'
import type { SuggestionLanguage, SuggestionIntent } from '@/lib/content/topic-suggestions'

export interface GeminiTopicSuggestion {
  title: string
  primaryKeyword: string
  searchIntent: string
  angle: string
  whyThisTopic: string
  suggestedSecondaryKeywords: string[]
  recommendedWordCount: number
}

export interface TopicSuggestionContext {
  primaryKeyword: string
  language: SuggestionLanguage
  searchIntent: SuggestionIntent
  count: number
  businessName?: string | null
  domain?: string | null
  category?: string | null
  secondaryKeywords?: string[]
  targetAudience?: string | null
}

const MIN_TITLE = 12
const MAX_TITLE = 120

function buildPrompt(ctx: TopicSuggestionContext): string {
  const lang = ctx.language === 'he' ? 'Hebrew' : 'English'
  const lines = [
    `You are an SEO/GEO content strategist. Propose ${ctx.count} article TOPICS (titles only, not full articles) that would rank in Google organic search AND be citable by AI answer engines (GEO).`,
    ``,
    `Primary keyword: "${ctx.primaryKeyword}"`,
    `Output language: ${lang} (write every title in ${lang}).`,
    `Search intent: ${ctx.searchIntent}.`,
    ctx.businessName ? `Business: ${ctx.businessName}.` : '',
    ctx.domain ? `Website: ${ctx.domain}.` : '',
    ctx.category ? `Business category/field: ${ctx.category}.` : '',
    ctx.targetAudience ? `Target audience: ${ctx.targetAudience}.` : '',
    ctx.secondaryKeywords && ctx.secondaryKeywords.length ? `Secondary keywords to consider: ${ctx.secondaryKeywords.join(', ')}.` : '',
    ``,
    `Requirements:`,
    `- Every title must be genuinely about the primary keyword and its field.`,
    `- Cover a VARIETY of article types across the set: how-to / buying guide, "how to choose", common mistakes, comparison, price/cost, FAQ, and commercial or local angles when relevant.`,
    `- Natural, human titles. No keyword stuffing (do not repeat the keyword more than once per title). No near-duplicate titles. No weird or artificial phrasing.`,
    `- Do NOT overuse the business name; titles should read as helpful content, not ads.`,
    `- Suitable for a marketing/promotional article without being aggressive.`,
    ``,
    `Return ONLY valid JSON (no markdown, no commentary) in exactly this shape:`,
    `{"topics":[{"title":"...","primaryKeyword":"${ctx.primaryKeyword}","searchIntent":"${ctx.searchIntent}","angle":"...","whyThisTopic":"...","suggestedSecondaryKeywords":["...","..."],"recommendedWordCount":1000}]}`,
  ]
  return lines.filter(Boolean).join('\n')
}

/** Lightweight token set for keyword-relatedness + near-duplicate checks. */
function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[?!.,:;"'“”׳״()\-–—]/g, ' ').split(/\s+/).filter((w) => w.length > 1)
  )
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

/**
 * Quality + dedup filter: drops too-short/long, keyword-stuffed, unrelated, and
 * near-duplicate titles; caps to `max`.
 */
export function filterTopicSuggestions(
  raw: GeminiTopicSuggestion[],
  primaryKeyword: string,
  max = 8
): GeminiTopicSuggestion[] {
  const kwTokens = tokens(primaryKeyword)
  const kwLower = primaryKeyword.trim().toLowerCase()
  const accepted: GeminiTopicSuggestion[] = []
  const acceptedTokenSets: Set<string>[] = []

  for (const item of raw) {
    const title = (item?.title || '').trim()
    if (title.length < MIN_TITLE || title.length > MAX_TITLE) continue

    // Keyword stuffing: keyword appears more than twice.
    if (kwLower) {
      const occurrences = title.toLowerCase().split(kwLower).length - 1
      if (occurrences > 2) continue
    }

    // Relatedness: share at least one meaningful token with the keyword.
    const tSet = tokens(title)
    if (kwTokens.size > 0) {
      let related = false
      for (const w of kwTokens) if (tSet.has(w)) { related = true; break }
      if (!related) continue
    }

    // Near-duplicate against already-accepted titles.
    if (acceptedTokenSets.some((s) => jaccard(s, tSet) >= 0.8)) continue

    accepted.push({
      title,
      primaryKeyword: primaryKeyword,
      searchIntent: typeof item.searchIntent === 'string' ? item.searchIntent : '',
      angle: typeof item.angle === 'string' ? item.angle : '',
      whyThisTopic: typeof item.whyThisTopic === 'string' ? item.whyThisTopic : '',
      suggestedSecondaryKeywords: Array.isArray(item.suggestedSecondaryKeywords)
        ? item.suggestedSecondaryKeywords.filter((k) => typeof k === 'string' && k.trim()).slice(0, 10)
        : [],
      recommendedWordCount:
        Number.isFinite(item.recommendedWordCount) && item.recommendedWordCount > 0
          ? Math.floor(item.recommendedWordCount)
          : 1000,
    })
    acceptedTokenSets.push(tSet)
    if (accepted.length >= max) break
  }

  return accepted
}

/**
 * Generate topic suggestions via Gemini. Returns null on any failure (missing
 * key, API error, unparseable/empty output) so the caller can fall back.
 */
export async function generateTopicSuggestionsWithGemini(
  ctx: TopicSuggestionContext
): Promise<GeminiTopicSuggestion[] | null> {
  const client = getGeminiClient()
  if (!client) {
    console.warn('[content-topic-suggestions] gemini client unavailable')
    return null
  }

  const modelName = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  try {
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
    })
    const result = await model.generateContent(buildPrompt(ctx))
    const text = result.response.text()

    let parsed: { topics?: unknown }
    try {
      parsed = JSON.parse(text)
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) {
        console.warn('[content-topic-suggestions] no JSON in gemini response')
        return null
      }
      parsed = JSON.parse(m[0])
    }

    if (!parsed || !Array.isArray(parsed.topics)) {
      console.warn('[content-topic-suggestions] gemini returned no topics array')
      return null
    }

    const filtered = filterTopicSuggestions(parsed.topics as GeminiTopicSuggestion[], ctx.primaryKeyword, ctx.count)
    if (filtered.length === 0) {
      console.warn('[content-topic-suggestions] all gemini topics filtered out')
      return null
    }
    console.log('[content-topic-suggestions] gemini ok', { requested: ctx.count, returned: filtered.length })
    return filtered
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[content-topic-suggestions] gemini error', { message: msg })
    return null
  }
}

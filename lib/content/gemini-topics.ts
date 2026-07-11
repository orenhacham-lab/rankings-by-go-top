/**
 * Gemini-backed SEO/GEO topic suggestions (content module, Phase 3A hardening).
 *
 * Reuses the SAME Gemini client/env as AI-recommended-questions
 * (getGeminiClient + GEMINI_CLASSIFIER_MODEL). Principle: the PRIMARY KEYWORD
 * always wins — project context only refines when it fits the keyword. Returns
 * raw + filtered topics so the caller can retry before ever falling back.
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

export type ProjectKeywordFit = 'aligned' | 'weak' | 'unrelated'

export interface TopicSuggestionContext {
  primaryKeyword: string
  language: SuggestionLanguage
  searchIntent: SuggestionIntent
  count: number
  businessName?: string | null
  domain?: string | null
  category?: string | null
  targetAudience?: string | null
  /** When false, project context is omitted from the prompt (keyword-only). */
  useProjectContext: boolean
}

const MIN_TITLE = 10
const MAX_TITLE = 130

/** Word tokens (len>1), lowercase, punctuation-stripped. */
function tokens(s: string): Set<string> {
  return new Set(
    (s || '').toLowerCase().replace(/[?!.,:;"'“”׳״()\-–—/]/g, ' ').split(/\s+/).filter((w) => w.length > 1)
  )
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

/**
 * Assess how well the keyword fits the project's field. Based on business name
 * + category only (domain is noise). Handles Hebrew inflections via substring.
 */
export function assessProjectKeywordFit(
  keyword: string,
  ctx: { businessName?: string | null; category?: string | null }
): ProjectKeywordFit {
  const kw = [...tokens(keyword)].filter((w) => w.length >= 2)
  const ctxTokens = [...tokens([ctx.businessName, ctx.category].filter(Boolean).join(' '))].filter((w) => w.length >= 2)
  if (kw.length === 0 || ctxTokens.length === 0) return 'weak'

  // Direct token overlap → aligned.
  if (kw.some((w) => ctxTokens.includes(w))) return 'aligned'
  // Substring overlap either direction (inflections) → weak.
  const sub = kw.some((k) => k.length >= 3 && ctxTokens.some((c) => c.length >= 3 && (c.includes(k) || k.includes(c))))
  return sub ? 'weak' : 'unrelated'
}

/** True if a title is meaningfully related to the keyword (inflection-tolerant). */
function relatedToKeyword(title: string, kwTokens: string[]): boolean {
  if (kwTokens.length === 0) return true
  const tSet = tokens(title)
  const tArr = [...tSet]
  for (const k of kwTokens) {
    if (k.length < 2) continue
    if (tSet.has(k)) return true
    if (k.length >= 3 && tArr.some((w) => w.includes(k) || k.includes(w))) return true
  }
  return false
}

/**
 * Quality + dedup filter. `relaxed` skips the keyword-relatedness gate (last
 * resort so a working Gemini response is never fully discarded).
 */
export function filterTopicSuggestions(
  raw: GeminiTopicSuggestion[],
  primaryKeyword: string,
  max = 8,
  opts: { relaxed?: boolean } = {}
): GeminiTopicSuggestion[] {
  const kwTokens = [...tokens(primaryKeyword)]
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

    // Relatedness (skipped when relaxed).
    if (!opts.relaxed && !relatedToKeyword(title, kwTokens)) continue

    const tSet = tokens(title)
    if (acceptedTokenSets.some((s) => jaccard(s, tSet) >= 0.82)) continue

    accepted.push({
      title,
      primaryKeyword,
      searchIntent: typeof item.searchIntent === 'string' ? item.searchIntent : '',
      angle: typeof item.angle === 'string' ? item.angle : '',
      whyThisTopic: typeof item.whyThisTopic === 'string' ? item.whyThisTopic : '',
      suggestedSecondaryKeywords: Array.isArray(item.suggestedSecondaryKeywords)
        ? item.suggestedSecondaryKeywords.filter((k) => typeof k === 'string' && k.trim()).slice(0, 10)
        : [],
      recommendedWordCount:
        Number.isFinite(item.recommendedWordCount) && item.recommendedWordCount > 0 ? Math.floor(item.recommendedWordCount) : 1000,
    })
    acceptedTokenSets.push(tSet)
    if (accepted.length >= max) break
  }
  return accepted
}

function buildPrompt(ctx: TopicSuggestionContext, strengthen: boolean): string {
  const lang = ctx.language === 'he' ? 'Hebrew' : 'English'
  const lines = [
    `You are an SEO/GEO content strategist. Return EXACTLY ${ctx.count} DISTINCT article topics (titles only) that rank in Google organic search AND are citable by AI answer engines (GEO).`,
    strengthen ? `IMPORTANT: your previous set was too few or too similar — return MORE VARIED, clearly distinct topics this time.` : '',
    ``,
    `PRIMARY KEYWORD (this is the subject — it drives every topic): "${ctx.primaryKeyword}"`,
    `Output language: ${lang} (write every title in ${lang}).`,
    `Search intent: ${ctx.searchIntent}.`,
  ]
  if (ctx.useProjectContext) {
    if (ctx.businessName) lines.push(`Business (secondary context only): ${ctx.businessName}.`)
    if (ctx.category) lines.push(`Field (secondary context only): ${ctx.category}.`)
    if (ctx.targetAudience) lines.push(`Target audience: ${ctx.targetAudience}.`)
  } else {
    lines.push(`Ignore any business/industry framing — base topics ONLY on the primary keyword.`)
  }
  lines.push(
    ``,
    `Requirements:`,
    `- Every title must be genuinely about the primary keyword.`,
    `- Vary the article TYPES across the set: how-to / buying guide, "how to choose", common mistakes, comparison, price/cost, FAQ, and commercial or local angles when relevant.`,
    `- Natural, human titles. No keyword stuffing (do not repeat the keyword more than once per title). No near-duplicate titles.`,
    `- Write "angle" and "whyThisTopic" in ${lang} too.`,
    ``,
    `Return ONLY valid JSON (no markdown, no commentary):`,
    `{"topics":[{"title":"...","primaryKeyword":"${ctx.primaryKeyword}","searchIntent":"${ctx.searchIntent}","angle":"...","whyThisTopic":"...","suggestedSecondaryKeywords":["...","..."],"recommendedWordCount":1000}]}`,
  )
  return lines.filter(Boolean).join('\n')
}

export type RawTopicsResult = { raw: GeminiTopicSuggestion[] } | { error: string }

/** One Gemini call → raw (unfiltered) topics, or a safe error reason. */
export async function generateRawTopics(ctx: TopicSuggestionContext, strengthen = false): Promise<RawTopicsResult> {
  const client = getGeminiClient()
  if (!client) {
    return { error: process.env.GEMINI_API_KEY ? 'gemini_init_failed' : 'missing_gemini_api_key' }
  }
  const modelName = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  try {
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json', temperature: strengthen ? 1.0 : 0.9 },
    })
    const result = await model.generateContent(buildPrompt(ctx, strengthen))
    const text = result.response.text()
    let parsed: { topics?: unknown }
    try {
      parsed = JSON.parse(text)
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) return { error: 'gemini_no_json' }
      parsed = JSON.parse(m[0])
    }
    if (!parsed || !Array.isArray(parsed.topics)) return { error: 'gemini_no_topics' }
    return { raw: parsed.topics as GeminiTopicSuggestion[] }
  } catch (err) {
    console.error('[content-topic-suggestions] gemini error', { message: err instanceof Error ? err.message : String(err) })
    return { error: 'gemini_request_failed' }
  }
}

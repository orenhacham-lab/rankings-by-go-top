/**
 * Recommendation source — keyword research by website URL (Google Ads).
 *
 * Flow: project domain (+ a small capped list of known URLs) → generateKeywordIdeas
 * (Phase 2 service, cached) → filter brand/support/irrelevant → cluster similar
 * keywords → Gemini turns each cluster into ONE article-topic suggestion.
 *
 * Safeguards: caps the number of URL seeds and Google Ads calls per run, reuses
 * the 30-day cache, and fails gracefully (returns a `keywordResearchFailed` meta
 * so project-data suggestions can still work independently). No AI keyword
 * invention — every anchor/keyword comes from Google Ads data.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'
import { generateKeywordIdeas, type KeywordIdeaResult } from '@/lib/google-ads/keyword-ideas'
import { GoogleAdsError } from '@/lib/google-ads/client'
import { isValidCountry, isValidLanguage } from '@/lib/google-ads/constants'
import { getCachedKeywordResults, setCachedKeywordResults } from '@/lib/content/keyword-research-cache'
import { tokens, slugKey } from './dedupe'
import { normalizeText } from './topic-idea-store'
import type { TopicSuggestion } from './types'

// Phase 3F.3.1 — broadened (but still bounded) so the source doesn't exhaust
// after ~2 runs: more URL seeds, an extra keyword-seed pass, a larger raw pool.
const MAX_URL_SEEDS = 5
const MAX_ADS_CALLS = 6
const MIN_MONTHLY = 30
const MAX_KEYWORD_SEEDS = 30
// Phase 3F.3.1e — how many UNUSED candidate keywords become topics per run. The
// avoid set advances the window each run, so successive "find more" clicks work
// through the full inventory instead of re-emitting the same head cluster.
const TOPICS_PER_RUN = 24

const SUPPORT_TERMS = [
  'טלפון', 'משלוח', 'משלוחים', 'אחריות', 'קופון', 'קופונים', 'סניף', 'סניפים', 'ביטול',
  'החזר', 'החזרים', 'החזרה', 'שירות', 'לקוחות', 'יצירת קשר', 'כתובת', 'שעות', 'מבצע', 'מבצעים',
  'phone', 'shipping', 'delivery', 'warranty', 'coupon', 'branch', 'return', 'refund', 'contact',
]

// Phase 3F.3.1e — used-goods / support / review noise. Skipped by default (not a
// good article-topic pool); relevant commercial/informational terms are kept.
const NOISE_TERMS = [
  'יד 2', 'יד2', 'יד שנייה', 'יד שניה', 'למסירה', 'מודעות', 'ביקורת', 'ביקורות',
  'קטלוג', 'טלפון', 'כתובת', 'שעות פתיחה', 'ביד2', 'yad2', 'used',
]
function isNoise(keyword: string): boolean {
  const lower = keyword.toLowerCase()
  return NOISE_TERMS.some((t) => lower.includes(t))
}
/** Skip only very short single-token head terms (e.g. 3-char generics). */
function isTooGeneric(keyword: string): boolean {
  const parts = keyword.trim().split(/\s+/)
  return parts.length === 1 && parts[0]!.length < 4
}
/** Up to n other keywords sharing a significant token (>2 chars) — secondary context. */
function relatedKeywords(primary: string, pool: KeywordIdeaResult[], n: number): string[] {
  const pk = normalizeText(primary)
  const pt = new Set(Array.from(tokens(primary)).filter((t) => t.length > 2))
  if (pt.size === 0) return []
  const out: string[] = []
  for (const r of pool) {
    const kw = r.keyword.trim()
    if (normalizeText(kw) === pk) continue
    const kt = tokens(kw)
    let shared = false
    for (const t of kt) if (pt.has(t)) { shared = true; break }
    if (shared) out.push(kw)
    if (out.length >= n) break
  }
  return out
}

export interface KeywordResearchInput {
  userId: string
  projectId: string
  seedUrls: string[]
  country: string
  language: string
  businessName: string | null
  category: string | null
  /** Phase 3F.3.1 — seed keywords (e.g. project tracked keywords) to widen the pool. */
  seedKeywords?: string[]
  /** Phase 3F.3.1 — normalized primary keywords already known; those clusters are skipped. */
  avoid?: string[]
}

interface ClusterInput {
  primaryKeyword: string
  secondaryKeywords: string[]
  volume: number
}

function isBrandOrSupport(keyword: string, brandTokens: Set<string>): boolean {
  const lower = keyword.toLowerCase()
  if (SUPPORT_TERMS.some((t) => lower.includes(t))) return true
  const kt = tokens(keyword)
  // Brand: the keyword is dominated by business-name tokens (e.g. "עידו ספורט …").
  if (brandTokens.size > 0) {
    let brandHits = 0
    for (const t of kt) if (brandTokens.has(t)) brandHits++
    if (brandHits > 0 && brandHits >= kt.size - 1) return true
  }
  return false
}

function scoreFromVolume(volume: number): number {
  const s = 0.4 + 0.6 * (Math.log10(volume + 1) / 4)
  return Math.max(0.4, Math.min(1, Number(s.toFixed(2))))
}

/** Fetch keyword ideas for one URL seed (cache-first). Throws GoogleAdsError. */
async function fetchSeed(
  admin: ReturnType<typeof createAdminClient>,
  input: KeywordResearchInput,
  url: string,
): Promise<KeywordIdeaResult[]> {
  const key = { projectId: input.projectId, seedType: 'url' as const, seedValue: url, country: input.country, language: input.language }
  const cached = await getCachedKeywordResults(admin, key)
  if (cached) return cached
  const { results } = await generateKeywordIdeas({
    researchType: 'url',
    keywords: [],
    url,
    country: input.country,
    language: input.language,
    minMonthlySearches: MIN_MONTHLY,
    resultsLimit: 250,
  })
  await setCachedKeywordResults(admin, input.userId, key, results)
  return results
}

/** Fetch keyword ideas for a batch of seed KEYWORDS (cache-first). Never throws. */
async function fetchKeywordSeed(
  admin: ReturnType<typeof createAdminClient>,
  input: KeywordResearchInput,
  seedKeywords: string[],
): Promise<KeywordIdeaResult[]> {
  const seeds = seedKeywords.map((k) => k.trim()).filter(Boolean).slice(0, MAX_KEYWORD_SEEDS)
  if (seeds.length === 0) return []
  const cacheKeyValue = seeds.slice(0, 8).join('|').toLowerCase()
  const key = { projectId: input.projectId, seedType: 'keyword' as const, seedValue: cacheKeyValue, country: input.country, language: input.language }
  const cached = await getCachedKeywordResults(admin, key)
  if (cached) return cached
  const { results } = await generateKeywordIdeas({
    researchType: 'keyword',
    keywords: seeds,
    country: input.country,
    language: input.language,
    minMonthlySearches: MIN_MONTHLY,
    resultsLimit: 250,
  })
  await setCachedKeywordResults(admin, input.userId, key, results)
  return results
}

interface GeminiClusterTopic {
  primaryKeyword: string
  title: string
  angle: string
  searchIntent: string
  recommendedWordCount: number
  reason: string
}

/** One Gemini call: clusters (primary + secondary keywords) → article topics. */
async function clustersToTopics(clusters: ClusterInput[], language: 'he' | 'en', businessCtx: string): Promise<GeminiClusterTopic[]> {
  const client = getGeminiClient()
  if (!client) return []
  const modelName = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  const langLabel = language === 'he' ? 'Hebrew' : 'English'
  const prompt = [
    `You turn keyword clusters (from Google Search data) into practical SEO article topics for a website.`,
    businessCtx ? `Business context: ${businessCtx}` : '',
    `Write ALL output in ${langLabel}.`,
    `For EACH cluster below, produce ONE article topic that would naturally rank for those keywords.`,
    `Rules: the title is a natural, clickable article title (NOT a bare keyword); keep the given primaryKeyword EXACTLY as-is; searchIntent ∈ informational|commercial|comparison|transactional|local|other; recommendedWordCount 800-1600; reason = one short plain-language sentence a non-SEO business owner understands.`,
    `Return ONLY JSON: {"topics":[{"primaryKeyword","title","angle","searchIntent","recommendedWordCount","reason"}]} — one entry per cluster, same order.`,
    `Clusters:`,
    JSON.stringify(clusters.map((c) => ({ primaryKeyword: c.primaryKeyword, secondaryKeywords: c.secondaryKeywords }))),
  ].filter(Boolean).join('\n')

  try {
    const model = client.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json', temperature: 0.8 } })
    const result = await model.generateContent(prompt)
    const text = result.response.text()
    let parsed: { topics?: unknown }
    try {
      parsed = JSON.parse(text)
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) return []
      parsed = JSON.parse(m[0])
    }
    return Array.isArray(parsed.topics) ? (parsed.topics as GeminiClusterTopic[]) : []
  } catch (err) {
    console.error('[recommendations] clustersToTopics gemini error', { message: err instanceof Error ? err.message : String(err) })
    return []
  }
}

/**
 * Produce raw keyword-research topic suggestions (NOT yet deduped against
 * existing content — the engine does that). Never throws.
 */
export interface KeywordResearchMeta {
  generated: number
  adsCalls: number
  keywordResearchFailed?: boolean
  failureReason?: string
  // Phase 3F.3.1 / 3F.3.1e inventory diagnostics.
  rawKeywords?: number
  afterBasicFilter?: number
  afterNoiseFilter?: number
  candidateCount?: number
  batchSent?: number
  unusedRemaining?: number
  skippedKnownCount?: number
  skippedKnownExamples?: string[]
  clusters?: number
  reason?: 'keyword_research_failed' | 'thin_data' | 'all_known' | 'exhausted'
}

export async function recommendFromKeywordResearch(
  admin: ReturnType<typeof createAdminClient>,
  input: KeywordResearchInput,
): Promise<{ suggestions: TopicSuggestion[]; meta: KeywordResearchMeta }> {
  const country = isValidCountry(input.country) ? input.country : 'IL'
  const language = (isValidLanguage(input.language) ? input.language : 'he') as 'he' | 'en'
  const seeds = input.seedUrls.filter(Boolean).slice(0, MAX_URL_SEEDS)

  // 1) Fetch keyword ideas (capped calls, graceful failure).
  const merged = new Map<string, KeywordIdeaResult>()
  let adsCalls = 0
  let failureReason: string | undefined
  const absorb = (rows: KeywordIdeaResult[]) => {
    for (const r of rows) {
      const k = r.keyword.trim().toLowerCase()
      if (!k) continue
      const prev = merged.get(k)
      if (!prev || (r.avgMonthlySearches ?? 0) > (prev.avgMonthlySearches ?? 0)) merged.set(k, r)
    }
  }
  for (const url of seeds) {
    if (adsCalls >= MAX_ADS_CALLS) break
    try {
      adsCalls++
      absorb(await fetchSeed(admin, { ...input, country, language }, url))
    } catch (e) {
      failureReason = e instanceof GoogleAdsError ? e.code : 'keyword_research_failed'
      break // stop hitting Google after the first failure
    }
  }
  // Extra keyword-seed pass (project keywords / categories) to widen the pool
  // beyond what the site URLs alone surface — one call, still cache-first.
  const seedKeywords = (input.seedKeywords ?? []).filter(Boolean)
  if (!failureReason && seedKeywords.length > 0 && adsCalls < MAX_ADS_CALLS) {
    try {
      adsCalls++
      absorb(await fetchKeywordSeed(admin, { ...input, country, language }, seedKeywords))
    } catch (e) {
      failureReason = e instanceof GoogleAdsError ? e.code : failureReason
    }
  }

  if (merged.size === 0) {
    return { suggestions: [], meta: { generated: 0, adsCalls, rawKeywords: 0, clusters: 0, keywordResearchFailed: !!failureReason, failureReason, reason: failureReason ? 'keyword_research_failed' : 'thin_data' } }
  }

  const rawKeywords = merged.size

  // 2) Basic + noise filtering (brand/support/used-goods/competitor-support).
  const brandTokens = tokens(input.businessName || '')
  const afterBrand = Array.from(merged.values()).filter((r) => !isBrandOrSupport(r.keyword, brandTokens))
  const afterBasicFilter = afterBrand.length
  const cleaned = afterBrand
    .filter((r) => !isNoise(r.keyword))
    .sort((a, b) => (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0))
  const afterNoiseFilter = cleaned.length

  // 3) KEYWORD INVENTORY (Phase 3F.3.1e): treat EACH distinct keyword as its own
  // candidate primary — NOT collapsed into one head cluster — so long-tail
  // variants ("הליכון ביתי מתקפל", "הליכון חשמלי", "תחזוקת הליכון ביתי") each
  // become separate opportunities. Candidates already known (avoid) are skipped,
  // so repeat "find more" runs advance through the inventory by volume.
  const avoidSet = new Set((input.avoid ?? []).map((a) => normalizeText(a)).filter(Boolean))
  const seenPrimary = new Set<string>()
  const skippedKnownExamples: string[] = []
  let skippedKnownCount = 0
  const candidates: { keyword: string; volume: number }[] = []
  for (const r of cleaned) {
    const kw = r.keyword.trim()
    const nk = normalizeText(kw)
    if (!nk || seenPrimary.has(nk)) continue
    seenPrimary.add(nk)
    if (isTooGeneric(kw)) continue
    if (avoidSet.has(nk)) { skippedKnownCount++; if (skippedKnownExamples.length < 20) skippedKnownExamples.push(kw); continue }
    candidates.push({ keyword: kw, volume: r.avgMonthlySearches ?? 0 })
  }
  const candidateCount = candidates.length

  // Fetched a pool but every usable keyword is already known → EXHAUSTED clusters
  // (distinct from "thin data" when the pool itself was tiny).
  if (candidateCount === 0) {
    const reason = afterNoiseFilter > 0 ? 'exhausted' : 'thin_data'
    return { suggestions: [], meta: { generated: 0, adsCalls, rawKeywords, afterBasicFilter, afterNoiseFilter, candidateCount: 0, batchSent: 0, unusedRemaining: 0, skippedKnownCount, skippedKnownExamples, keywordResearchFailed: !!failureReason, failureReason, reason } }
  }

  // 4) Take the next batch (highest-volume unused first). Attach light related
  // keywords as secondary context WITHOUT removing them from the inventory.
  const batch = candidates.slice(0, TOPICS_PER_RUN)
  const clusterInputs: ClusterInput[] = batch.map((c) => ({
    primaryKeyword: c.keyword,
    secondaryKeywords: relatedKeywords(c.keyword, cleaned, 4),
    volume: c.volume,
  }))

  // 5) Gemini candidate keywords → article topics (keep primaryKeyword EXACTLY;
  // deterministic keyword-title fallback if the model is unavailable).
  const businessCtx = [input.businessName, input.category].filter(Boolean).join(' — ')
  const geminiTopics = await clustersToTopics(clusterInputs, language, businessCtx)
  const byPrimary = new Map(geminiTopics.map((t) => [normalizeText(t.primaryKeyword), t]))

  const suggestions: TopicSuggestion[] = clusterInputs.map((c) => {
    const g = byPrimary.get(normalizeText(c.primaryKeyword))
    const title = g?.title?.trim() || c.primaryKeyword
    const intent = g?.searchIntent?.trim() || 'informational'
    const wc = typeof g?.recommendedWordCount === 'number' ? g.recommendedWordCount : 1000
    const reasonBase = language === 'he'
      ? `נמצא בנתוני חיפוש עם כ-${c.volume.toLocaleString('he-IL')} חיפושים חודשיים`
      : `Found in search data with ~${c.volume.toLocaleString('en-US')} monthly searches`
    return {
      id: `keyword_research_url:${slugKey(c.primaryKeyword)}`,
      title,
      primaryKeyword: c.primaryKeyword,
      secondaryKeywords: c.secondaryKeywords,
      searchIntent: intent,
      recommendedWordCount: wc,
      angle: g?.angle?.trim() || '',
      suggestedInternalLinks: [],
      source: 'keyword_research_url',
      suggestionReason: g?.reason?.trim() ? `${g.reason.trim()} · ${reasonBase}` : reasonBase,
      suggestionScore: scoreFromVolume(c.volume),
    }
  })

  return {
    suggestions,
    meta: {
      generated: suggestions.length, adsCalls, rawKeywords, afterBasicFilter, afterNoiseFilter,
      candidateCount, batchSent: batch.length, unusedRemaining: candidateCount - batch.length,
      skippedKnownCount, skippedKnownExamples, clusters: candidateCount,
      keywordResearchFailed: !!failureReason, failureReason,
    },
  }
}

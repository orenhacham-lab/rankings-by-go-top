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
import { generateRecommendationJSON } from './model'
import { recommendationGuidance } from './prompt-guidance'
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

// Phase 3F.3.1e — used-goods / support / review noise. Phase 3H: RELEVANCE-AWARE
// — a "noise" term that is part of the site's OWN vocabulary is NOT noise there
// (e.g. "יד שנייה" is the core business of a second-hand fashion store), so the
// caller passes the site vocabulary and overlapping terms are kept.
const NOISE_TERMS = [
  'יד 2', 'יד2', 'יד שנייה', 'יד שניה', 'למסירה', 'מודעות', 'ביקורת', 'ביקורות',
  'קטלוג', 'טלפון', 'כתובת', 'שעות פתיחה', 'ביד2', 'yad2', 'used',
]
function isNoise(keyword: string): boolean {
  const lower = keyword.toLowerCase()
  return NOISE_TERMS.some((t) => lower.includes(t))
}

// ── Phase 3H — generic topic-quality rules (site-agnostic, multilingual) ──────
// Commercial/navigation vocabulary that is NEVER an article topic on its own:
// store navigation, promotions, catalogue structure. Token-level match (not
// substring) so real phrases like "מדריך קנייה" are unaffected.
const NAV_COMMERCE_TOKENS = new Set([
  'sale', 'sales', 'shop', 'store', 'outlet', 'category', 'categories', 'collection',
  'collections', 'products', 'product', 'checkout', 'cart', 'brands', 'menu', 'tags',
  'מבצע', 'מבצעים', 'הנחה', 'הנחות', 'קולקציה', 'קולקציות', 'קטגוריה', 'קטגוריות',
  'חנות', 'מוצרים', 'תגית', 'תגיות', 'אאוטלט', 'מותגים', 'תפריט', 'קופה',
])
function hasNavCommerceToken(text: string): boolean {
  return (text || '').toLowerCase().split(/\s+/).some((w) => NAV_COMMERCE_TOKENS.has(w.replace(/[^\p{L}\p{N}]+/gu, '')))
}

/**
 * Phase 3H — a RAW keyword is too generic to be an article topic when it is a
 * single word (any length): "sale", "sport2", "euro2024", "כלבים", "צעצועים"
 * all fail here generically. Real article keywords are phrases; the long-tail
 * variants of a broad head term arrive as separate multi-word keywords anyway.
 */
function isTooGeneric(keyword: string): boolean {
  return keyword.trim().split(/\s+/).filter(Boolean).length < 2
}

/**
 * Phase 3H — shared final quality check for a suggested topic (any source):
 * returns the problem, or null when article-worthy. Generic rules only —
 * single-word titles/keywords and commercial/navigation vocabulary are never
 * valid article topics, regardless of the site's niche.
 */
export function topicQualityIssue(title: string, primaryKeyword: string): 'too_generic' | 'nav_commerce' | null {
  const t = (title || '').trim()
  const k = (primaryKeyword || '').trim()
  if (t.split(/\s+/).filter(Boolean).length < 2 || k.split(/\s+/).filter(Boolean).length < 2) return 'too_generic'
  if (hasNavCommerceToken(k) || hasNavCommerceToken(t)) return 'nav_commerce'
  return null
}

/** Phase 3H — does the keyword share at least one token with the site vocabulary? */
export function sharesSiteVocab(keyword: string, vocab: Set<string> | null | undefined): boolean {
  if (!vocab || vocab.size === 0) return true // no vocabulary → cannot judge
  for (const tk of tokens(keyword)) if (vocab.has(tk)) return true
  return false
}
/** Minimum vocabulary size before the relevance gate is trusted to reject.
 *  Phase 3H.2 — raised: the ratio-based alignment gate needs a representative
 *  vocabulary; on a thin/partial index it stays permissive. */
export const MIN_SITE_VOCAB_TOKENS = 25

// ── Phase 3H.2 — SITE-OFFER ALIGNMENT (deeper than one shared token) ──────────
// One broad token ("כלבים", "צעצועים") let wrong-intent keywords through on a
// dog-products store: adoption/boarding/breed services, children's TV-brand
// toys, sports-broadcast terms — all share ONE token with the site vocabulary
// while the REST of the keyword points at a different market. Alignment now
// requires the MAJORITY of the keyword's meaningful tokens to be site terms:
// matched ≥ 2 AND matched/total > 0.5. Site-agnostic:
//   "מיטה אורטופדית לכלב"  → 2–3/3 ✓ (product-aligned)
//   "כלבים לאימוץ"          → 1/2 ✗ (service intent the store doesn't offer)
//   "סמי הכבאי צעצועים"     → 1/3 ✗ (different entity class)
//   "ספורט 365 לייב"        → ≤1/2 ✗ (numerals never count as matches)

const HE_TOKEN_PREFIX = /^[בלמהושכ]/
function tokenInVocab(tok: string, vocab: Set<string>): boolean {
  if (vocab.has(tok)) return true
  // Light Hebrew prefix slack (ל/ב/ה/ו/ש/כ/מ): "לכלבים" matches vocab "כלבים".
  if (tok.length >= 4 && HE_TOKEN_PREFIX.test(tok) && vocab.has(tok.slice(1))) return true
  return false
}

/** Matched/total meaningful tokens of a keyword vs the site vocabulary. */
export function vocabAlignment(keyword: string, vocab: Set<string>): { matched: number; total: number } {
  const meaningful = Array.from(tokens(keyword)).filter((t) => !/^\d+$/.test(t))
  let matched = 0
  for (const t of meaningful) if (tokenInVocab(t, vocab)) matched++
  return { matched, total: meaningful.length }
}

/** Phase 3H.2 — is the keyword's intent aligned with the site's own vocabulary? */
export function isVocabAligned(keyword: string, vocab: Set<string> | null | undefined): boolean {
  if (!vocab || vocab.size === 0) return true // no vocabulary → cannot judge
  const { matched, total } = vocabAlignment(keyword, vocab)
  if (total === 0) return false
  return matched >= 2 && matched / total > 0.5
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
  /** Phase 3H — the site's OWN vocabulary tokens (scan titles/keywords/slugs +
   *  business context). Google's URL-seeded ideas can include totally unrelated
   *  associations (e.g. "sport2"/"euro2024" on a fashion site); a keyword that
   *  shares NO token with the site vocabulary is rejected as unrelated. Gate is
   *  skipped when the vocabulary is too small to judge (no scan yet). */
  siteVocab?: Set<string>
  /** Phase 3H.2 — the site's OFFERING (top category/product/service titles from
   *  the scan). Given to the model so keywords are interpreted in the store's
   *  context (a product-name keyword is about the PRODUCT, not a same-named
   *  organization), wrong-market clusters are skipped, and broad keywords are
   *  rewritten into the site's differentiator. */
  offerContext?: string[]
  /** PR #23 — structured ALREADY-PENDING block + duplicate self-check (from the
   *  engine's pendingTopicsBlock). Injected into the cluster→topic prompt. */
  pendingBlock?: string
}

export interface ClusterInput {
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
  evidenceSummary?: string
  /** Model-SELECTED secondaries (only terms that belong in the same article). */
  secondaryKeywords?: string[]
  /** Other supplied primary keywords this topic consolidates (synonym clusters). */
  mergedKeywords?: string[]
}

/** A cluster the model rejected as an unsuitable opportunity, with why. */
interface GeminiRejectedCluster {
  primaryKeyword: string
  classification?: string // navigational|competitor|malformed|ambiguous|out_of_scope|duplicate|other_market
}

export interface ClustersToTopicsResult { topics: GeminiClusterTopic[]; rejected: GeminiRejectedCluster[]; ok: boolean }

/**
 * ONE Gemini Pro call: a BATCH of keyword opportunities → an editorial set of
 * article topics. The model reasons over the whole batch — consolidating
 * synonymous clusters, rejecting navigational/competitor/malformed/out-of-scope
 * queries, and choosing only secondaries that belong in the same article. Raw
 * keywords are EVIDENCE, never ready-made titles; there is NO deterministic
 * keyword→title template anywhere in this path.
 */
/** Pure prompt builder (exported for snapshot tests — proves the instructions
 *  are actually present in the request). */
export function buildClustersPrompt(clusters: ClusterInput[], language: 'he' | 'en', businessCtx: string, offerContext: string[], pendingBlock = ''): string {
  const langLabel = language === 'he' ? 'Hebrew' : 'English'
  const year = new Date().getFullYear()
  return [
    `You are an SEO editor turning RAW Google keyword data into a small set of high-quality article topics for a website. Today's year is ${year}.`,
    businessCtx ? `Business context: ${businessCtx}` : '',
    // Phase 3H.2 — the site's actual OFFERING anchors interpretation. Generic:
    // the list comes from the site's own scan.
    offerContext.length ? `The site's ACTUAL offering (its own categories/products/services — this is the ONLY business-scope evidence): ${offerContext.slice(0, 20).join(' ; ')}.` : '',
    offerContext.length ? `Interpret EVERY keyword in the context of this offering — a keyword matching a product/category name is about that PRODUCT/CATEGORY (never an unrelated organization, brand, TV franchise, or service with a similar name).` : '',
    `KEYWORD-RESEARCH RULES (critical):`,
    `- Raw keywords are EVIDENCE, not ready-made titles. NEVER copy a keyword and append a generic suffix like "המדריך המלא" or "כל מה שצריך לדעת" — write a natural, editorial ${langLabel} title that answers the query's real intent.`,
    `- Do NOT create one topic per cluster automatically. CONSOLIDATE clusters that express the same core question (e.g. "גוף תאורה צמוד תקרה" / "גופי תאורה צמודי תקרה" / "תאורה צמודת תקרה" → ONE strong topic); list the absorbed primaries in "mergedKeywords".`,
    `- Classify each query's intent first: informational | commercial | comparison | transactional | navigational/competitor | ambiguous | malformed. REJECT navigational/competitor queries (e.g. a keyword naming another store or brand like "מראה עם תאורה איקאה") unless the offering explicitly supports comparison content. REJECT malformed or ambiguous queries (e.g. "מחסני תאורה צמודי תקרה", "בית מנורה") unless the supplied offering makes their meaning clear and supported.`,
    `- BUSINESS SCOPE comes ONLY from the supplied offering/categories/existing content — NEVER from the business name. A word inside the brand name (e.g. "חשמל") is NOT evidence the business provides electrical-safety advice, socket/dimmer installation or electrician services; do NOT generate such topics unless real products/services above support them.`,
    `- "secondaryKeywords": choose ONLY terms that belong in the SAME article (same intent, same expected answer). Do NOT include a nearby export term that belongs to a different article (e.g. ceiling-FAN or mirror terms on a ceiling-LIGHT topic).`,
    `- The "reason" must explain the CONTENT GAP and business relevance in ${langLabel} — not just the search volume.`,
    pendingBlock,
    recommendationGuidance(langLabel, year, clusters.length),
    `Return ONLY JSON:`,
    `{"topics":[{"primaryKeyword": "<EXACTLY one of the supplied primaryKeyword values>", "title", "angle", "searchIntent", "recommendedWordCount", "reason", "evidenceSummary", "secondaryKeywords": [], "mergedKeywords": []}],`,
    ` "rejected":[{"primaryKeyword": "<EXACTLY as supplied>", "classification": "navigational|competitor|malformed|ambiguous|out_of_scope|duplicate|other_market"}]}.`,
    `Every supplied cluster must appear exactly once: as a topic's primaryKeyword, inside a topic's mergedKeywords, or in "rejected". Return FEWER topics than clusters when consolidation/rejection warrants it — quality over count. searchIntent ∈ informational|commercial|comparison|transactional|local|other; recommendedWordCount 800-1600.`,
    `Clusters (primaryKeyword + monthlyVolume + related export terms as secondary CANDIDATES):`,
    JSON.stringify(clusters.map((c) => ({ primaryKeyword: c.primaryKeyword, monthlyVolume: c.volume, secondaryCandidates: c.secondaryKeywords }))),
  ].filter(Boolean).join('\n')
}

export async function clustersToTopics(clusters: ClusterInput[], language: 'he' | 'en', businessCtx: string, offerContext: string[], pendingBlock = ''): Promise<ClustersToTopicsResult> {
  const prompt = buildClustersPrompt(clusters, language, businessCtx, offerContext, pendingBlock)
  const { text, ok } = await generateRecommendationJSON(prompt, { temperature: 0.8, maxOutputTokens: 8192 })
  if (!ok) return { topics: [], rejected: [], ok: false }
  let parsed: { topics?: unknown; rejected?: unknown }
  try {
    parsed = JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return { topics: [], rejected: [], ok: false }
    try { parsed = JSON.parse(m[0]) } catch { return { topics: [], rejected: [], ok: false } }
  }
  return {
    topics: Array.isArray(parsed.topics) ? (parsed.topics as GeminiClusterTopic[]) : [],
    rejected: Array.isArray(parsed.rejected) ? (parsed.rejected as GeminiRejectedCluster[]) : [],
    ok: true,
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
  // Phase 3H — quality/relevance gate diagnostics.
  filteredGenericCount?: number
  filteredUnrelatedCount?: number
  filteredUnrelatedExamples?: string[]
  // Phase 3H.2 — clusters the model marked as a different market/entity class.
  skippedByModelCount?: number
  skippedByModelExamples?: string[]
  /** PR #23 — model topics dropped by minimal validation (unknown keyword / no title). */
  droppedInvalidTopicCount?: number
  /** PR #23 — clusters absorbed into another topic via mergedKeywords. */
  consolidatedCount?: number
  candidateCount?: number
  batchSent?: number
  unusedRemaining?: number
  skippedKnownCount?: number
  skippedKnownExamples?: string[]
  clusters?: number
  reason?: 'keyword_research_failed' | 'thin_data' | 'all_known' | 'exhausted' | 'unrelated'
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
  // Phase 3H — noise is RELEVANCE-AWARE: a "noise" term that overlaps the site's
  // own vocabulary is the site's actual subject matter and is kept.
  const brandTokens = tokens(input.businessName || '')
  const vocab = input.siteVocab && input.siteVocab.size >= MIN_SITE_VOCAB_TOKENS ? input.siteVocab : null
  const afterBrand = Array.from(merged.values()).filter((r) => !isBrandOrSupport(r.keyword, brandTokens))
  const afterBasicFilter = afterBrand.length
  const cleaned = afterBrand
    .filter((r) => !(isNoise(r.keyword) && !(vocab && sharesSiteVocab(r.keyword, vocab))))
    .filter((r) => !hasNavCommerceToken(r.keyword))
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
  // Phase 3H — diagnostics for the new quality/relevance gates (never silent).
  let filteredGenericCount = 0
  let filteredUnrelatedCount = 0
  const filteredUnrelatedExamples: string[] = []
  const candidates: { keyword: string; volume: number }[] = []
  for (const r of cleaned) {
    const kw = r.keyword.trim()
    const nk = normalizeText(kw)
    if (!nk || seenPrimary.has(nk)) continue
    seenPrimary.add(nk)
    if (isTooGeneric(kw)) { filteredGenericCount++; continue }
    // Phase 3H.2 — site-OFFER alignment gate (majority of meaningful tokens must
    // be site terms, not just one broad shared token): rejects wrong-intent
    // keywords (adoption/boarding services, other-market entities, broadcast
    // terms) that merely touch the site's vocabulary.
    if (vocab && !isVocabAligned(kw, vocab)) {
      filteredUnrelatedCount++
      if (filteredUnrelatedExamples.length < 20) filteredUnrelatedExamples.push(kw)
      continue
    }
    if (avoidSet.has(nk)) { skippedKnownCount++; if (skippedKnownExamples.length < 20) skippedKnownExamples.push(kw); continue }
    candidates.push({ keyword: kw, volume: r.avgMonthlySearches ?? 0 })
  }
  const candidateCount = candidates.length

  // Fetched a pool but every usable keyword is already known → EXHAUSTED clusters
  // (distinct from "thin data" when the pool itself was tiny).
  if (candidateCount === 0) {
    // Phase 3H.1 — honest reason: when the relevance gate removed the remaining
    // pool, say "unrelated" (index may be stale/wrong), not "exhausted".
    const reason = filteredUnrelatedCount > 0 ? 'unrelated' : afterNoiseFilter > 0 ? 'exhausted' : 'thin_data'
    return { suggestions: [], meta: { generated: 0, adsCalls, rawKeywords, afterBasicFilter, afterNoiseFilter, filteredGenericCount, filteredUnrelatedCount, filteredUnrelatedExamples, candidateCount: 0, batchSent: 0, unusedRemaining: 0, skippedKnownCount, skippedKnownExamples, keywordResearchFailed: !!failureReason, failureReason, reason } }
  }

  // 4) Take the next batch (highest-volume unused first). Attach light related
  // keywords as secondary context WITHOUT removing them from the inventory.
  const batch = candidates.slice(0, TOPICS_PER_RUN)
  const clusterInputs: ClusterInput[] = batch.map((c) => ({
    primaryKeyword: c.keyword,
    secondaryKeywords: relatedKeywords(c.keyword, cleaned, 4),
    volume: c.volume,
  }))

  // 5) ONE Gemini Pro editorial pass over the whole batch: the model consolidates
  // synonymous clusters, rejects navigational/competitor/malformed/out-of-scope
  // queries, writes natural titles and selects only same-article secondaries.
  // Suggestions are built ONLY from model-returned topics — there is NO
  // deterministic "[keyword]: המדריך המלא" fallback (an unusable batch returns
  // fewer/none, with rejected classifications counted in diagnostics).
  const businessCtx = [input.businessName, input.category].filter(Boolean).join(' — ')
  const { topics: geminiTopics, rejected: rejectedByModel } = await clustersToTopics(clusterInputs, language, businessCtx, input.offerContext ?? [], input.pendingBlock ?? '')
  const clusterByPrimary = new Map(clusterInputs.map((c) => [normalizeText(c.primaryKeyword), c]))

  const suggestions: TopicSuggestion[] = []
  let droppedInvalidTopic = 0
  for (const g of geminiTopics) {
    const cluster = clusterByPrimary.get(normalizeText(g.primaryKeyword || ''))
    const title = (g.title || '').trim()
    // Non-destructive validation only: the topic must reference a SUPPLIED
    // cluster (no invented keywords) and carry a real model-written title.
    if (!cluster || !title) { droppedInvalidTopic++; continue }
    // Consolidated volume = the primary cluster + every merged synonym cluster
    // (volume stays EVIDENCE for the score; eligibility was the model's call).
    const merged = (Array.isArray(g.mergedKeywords) ? g.mergedKeywords : [])
      .map((k) => clusterByPrimary.get(normalizeText(k)))
      .filter((c): c is ClusterInput => !!c && c !== cluster)
    const volume = cluster.volume + merged.reduce((n, c) => n + c.volume, 0)
    // Secondaries = the MODEL's same-article selection (verbatim strings, no
    // rewriting); merged primaries are folded in so their demand is kept visible.
    const secondaryKeywords = Array.from(new Set([
      ...(Array.isArray(g.secondaryKeywords) ? g.secondaryKeywords.filter((s) => typeof s === 'string' && s.trim()) : []),
      ...merged.map((c) => c.primaryKeyword),
    ]))
    const reasonBase = language === 'he'
      ? `נמצא בנתוני חיפוש עם כ-${volume.toLocaleString('he-IL')} חיפושים חודשיים`
      : `Found in search data with ~${volume.toLocaleString('en-US')} monthly searches`
    const editorial = (g.evidenceSummary && g.evidenceSummary.trim()) || (g.reason && g.reason.trim()) || ''
    suggestions.push({
      id: `keyword_research_url:${slugKey(cluster.primaryKeyword)}`,
      title,
      primaryKeyword: cluster.primaryKeyword,
      secondaryKeywords,
      searchIntent: g.searchIntent?.trim() || 'informational',
      recommendedWordCount: typeof g.recommendedWordCount === 'number' ? g.recommendedWordCount : 1000,
      angle: g.angle?.trim() || '',
      suggestedInternalLinks: [],
      source: 'keyword_research_url',
      suggestionReason: editorial ? `${editorial} · ${reasonBase}` : reasonBase,
      suggestionScore: scoreFromVolume(volume),
    })
  }
  const skippedByModel = rejectedByModel.filter((r) => clusterByPrimary.has(normalizeText(r.primaryKeyword || '')))

  return {
    suggestions,
    meta: {
      generated: suggestions.length, adsCalls, rawKeywords, afterBasicFilter, afterNoiseFilter,
      filteredGenericCount, filteredUnrelatedCount, filteredUnrelatedExamples,
      skippedByModelCount: skippedByModel.length,
      skippedByModelExamples: skippedByModel.slice(0, 10).map((r) => `${r.primaryKeyword}${r.classification ? ` (${r.classification})` : ''}`),
      droppedInvalidTopicCount: droppedInvalidTopic,
      consolidatedCount: Math.max(0, batch.length - skippedByModel.length - suggestions.length - droppedInvalidTopic),
      candidateCount, batchSent: batch.length, unusedRemaining: candidateCount - batch.length,
      skippedKnownCount, skippedKnownExamples, clusters: candidateCount,
      keywordResearchFailed: !!failureReason, failureReason,
    },
  }
}

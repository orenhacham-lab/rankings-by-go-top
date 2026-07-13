/**
 * Content-automation topic recommendations — 'site_scan' source (Phase 3F).
 *
 * Analyzes the project's CACHED WordPress/site scan (never rescans; read-only)
 * and asks the model for new article topics that fill content gaps and support
 * strategically important pages. Builds a COMPACT digest of the scan (titles,
 * slugs, categories, top/orphan pages, anchor phrases, token clusters) — never
 * raw page bodies — so the prompt stays small.
 *
 * Suggests topics ONLY. No article generation, no publishing, no link insertion,
 * and no change to the scanner. Dedupe against existing topics/articles/pages is
 * done by the engine (shared ExistingCorpus) after this returns.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getCachedIndex, reassembleReport } from '@/lib/content/wordpress-content-index'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import { loadShopifyScannedTargets } from '@/lib/shopify/site-targets'
import { clusterByTokens, slugKey } from './dedupe'
import { generateRecommendationJSON } from './model'
import { recommendationGuidance, structuredOutputContract } from './prompt-guidance'
import { validateIdea } from './validate'
import type { TopicSuggestion } from './types'

const currentYear = (): number => new Date().getFullYear()

type Admin = ReturnType<typeof createAdminClient>

export interface SiteScanRecoInput {
  projectId: string
  language: 'he' | 'en'
  langLabel: string
  /** Phase 3H.4 — titles/keywords already existing or already SUGGESTED (pending
   *  ideas). Without this the source had NO MEMORY between runs: a second click
   *  regenerated the same ideas, the guard rejected them all against the first
   *  run's pending rows, and the source "exhausted" after one batch. */
  avoidTitles?: string[]
}

export type SiteScanReason = 'no_scan' | 'insufficient_data' | 'model_error' | 'model_empty'

export interface SiteScanRecoResult {
  suggestions: TopicSuggestion[]
  meta: {
    /** Raw suggestion count BEFORE the engine's corpus dedupe (model + fallback). */
    generated: number
    reason?: SiteScanReason
    /** Rich diagnostics for the debug response. */
    debug: {
      scanFound: boolean
      targetCount: number
      digestCounts: { importantPages: number; categories: number; orphans: number; clusters: number }
      modelCalled: boolean
      modelOk: boolean
      modelRawCount: number
      usedFallback: boolean
      rawSuggestionCount: number
    }
  }
}

/** Model output for one idea (kept small). */
interface SiteScanIdea {
  title?: string
  primaryKeyword?: string
  secondaryKeywords?: string[]
  searchIntent?: string
  intent?: string
  angle?: string
  recommendedWordCount?: number
  reason?: string
  /** Structured-output evidence fields (compose the Hebrew reason). */
  sourceEntityName?: string
  sourceEntityType?: string
  evidenceSummary?: string
  /** A URL from the provided list this new article should link to, if any. */
  suggestedLinkUrl?: string
}

/** Last path segment of a URL (slug), decoded and dash-normalized. */
function slugOf(url: string): string {
  try {
    const path = (url || '').replace(/[?#].*$/, '').replace(/\/+$/, '')
    let last = path.split('/').pop() || ''
    try { last = decodeURIComponent(last) } catch { /* keep raw */ }
    return last.replace(/[-_]+/g, ' ').trim()
  } catch { return '' }
}

/** Top anchor phrases for a target (vetted only), capped. */
function topAnchors(t: ScannedTarget, n: number): string[] {
  return (t.usableAnchors ?? [])
    .filter((a) => a?.usability === 'yes' && (a.text || '').trim())
    .slice(0, n)
    .map((a) => a.text.trim())
}

/**
 * Build a compact, size-controlled digest of the scan for the prompt.
 * Emphasizes: important pages (high inbound), categories, orphan/weak pages,
 * repeated anchor/slug entities, and title clusters — the gap signals.
 */
function buildDigest(targets: ScannedTarget[]) {
  const eligible = targets.filter((t) => t.eligibility === 'yes')

  const byInbound = [...eligible].sort((a, b) => (b.inboundLinkCount ?? 0) - (a.inboundLinkCount ?? 0))
  const importantPages = byInbound.slice(0, 25).map((t) => ({
    title: (t.targetTitle || slugOf(t.targetUrl)).slice(0, 120),
    type: t.targetType,
    inbound: t.inboundLinkCount ?? 0,
    keyword: (t.primaryKeywordCandidate || '').slice(0, 80),
    url: t.targetUrl,
    anchors: topAnchors(t, 3),
  }))

  // Phase 3H — products and product categories are FIRST-CLASS idea sources for
  // ecommerce/service sites: categories first, then products, then tags.
  const typeOrder: Record<string, number> = { category: 0, product: 1, tag: 2 }
  const categories = eligible
    .filter((t) => t.targetType === 'category' || t.targetType === 'product' || t.targetType === 'tag')
    .sort((a, b) => (typeOrder[a.targetType] ?? 9) - (typeOrder[b.targetType] ?? 9) || (b.inboundLinkCount ?? 0) - (a.inboundLinkCount ?? 0))
    .slice(0, 24)
    .map((t) => ({ title: (t.targetTitle || slugOf(t.targetUrl)).slice(0, 100), type: t.targetType, inbound: t.inboundLinkCount ?? 0, url: t.targetUrl }))

  // Orphan / weakly-linked pages that could be supported by new content.
  const orphans = eligible
    .filter((t) => (t.targetType === 'post' || t.targetType === 'page') && (t.inboundLinkCount ?? 0) <= 1)
    .sort((a, b) => (a.inboundLinkCount ?? 0) - (b.inboundLinkCount ?? 0))
    .slice(0, 20)
    .map((t) => ({ title: (t.targetTitle || slugOf(t.targetUrl)).slice(0, 120), url: t.targetUrl, inbound: t.inboundLinkCount ?? 0 }))

  // Underdeveloped clusters: group eligible titles, keep clusters of 2+.
  const clusters = clusterByTokens(eligible.map((t) => t.targetTitle || slugOf(t.targetUrl)).filter(Boolean), 0.5)
    .filter((c) => c.length >= 2)
    .slice(0, 12)
    .map((members) => members.slice(0, 6))

  return { importantPages, categories, orphans, clusters }
}

/** JSON-compact, truncated context so the prompt stays small. */
function digestToPromptBlock(d: ReturnType<typeof buildDigest>): string {
  const lines: string[] = []
  lines.push('IMPORTANT PAGES (high internal-link importance) [title | type | inbound | keyword]:')
  for (const p of d.importantPages) lines.push(`- ${p.title} | ${p.type} | ${p.inbound} | ${p.keyword}`)
  if (d.categories.length) {
    lines.push('CATEGORIES/PRODUCTS/TAGS [title | type]:')
    for (const c of d.categories) lines.push(`- ${c.title} | ${c.type}`)
  }
  if (d.orphans.length) {
    lines.push('ORPHAN / WEAKLY-LINKED PAGES (need supporting content) [title | inbound]:')
    for (const o of d.orphans) lines.push(`- ${o.title} | ${o.inbound}`)
  }
  if (d.clusters.length) {
    lines.push('CONTENT CLUSTERS (grouped existing titles — look for underdeveloped ones):')
    d.clusters.forEach((members, i) => lines.push(`- cluster ${i + 1}: ${members.join(' ; ')}`))
  }
  return lines.join('\n')
}

function sourceUrlList(d: ReturnType<typeof buildDigest>): { url: string; title: string }[] {
  const seen = new Set<string>()
  const out: { url: string; title: string }[] = []
  for (const p of [...d.importantPages, ...d.categories]) {
    if (p.url && !seen.has(p.url)) { seen.add(p.url); out.push({ url: p.url, title: p.title }) }
  }
  return out.slice(0, 30)
}

// Phase 3I.7 — how many avoid entries reach the prompt. Was 40: on a project
// with 40+ existing topic/article titles, the JUST-SAVED ideas (appended after
// them) were sliced away, the repeat run's prompt was identical to the first
// run's, and the model regenerated the exact same batch → instant "exhaustion"
// while unused scan targets remained. 120 covers the recent idea history the
// engine loads (recent-first) plus existing titles. Exported for the harness.
export const AVOID_PROMPT_CAP = 120

export function buildPrompt(langLabel: string, businessCtx: string, digestBlock: string, urlList: { url: string; title: string }[], count: number, avoidTitles: string[]): string {
  const year = currentYear()
  return [
    `You are an SEO content strategist. Analyze a website's existing content (from a site scan) and propose NEW article topics that fill content gaps and strengthen the site's internal structure. Today's year is ${year}.`,
    businessCtx ? `Website: ${businessCtx}.` : '',
    // Phase 3H.4 — rotation memory: never re-emit what already exists or was
    // already suggested; move on to UNUSED entities/clusters/angles instead.
    avoidTitles.length ? `EXISTING/already-suggested titles (do NOT repeat or paraphrase these; rotate to UNUSED entities, categories, products and angles):\n${avoidTitles.slice(0, AVOID_PROMPT_CAP).map((t) => `- ${t}`).join('\n')}` : '',
    `Here is a compact digest of the EXISTING site content — treat every listed page/category/product/brand as the ONLY supplied entities (use exact names; never invent a brand that is not listed):`,
    digestBlock,
    ``,
    `Base each topic on a real listed entity or a demonstrable gap between them. Give each a SPECIFIC long-tail primaryKeyword that includes the article's intent — never the bare entity name alone. Never output a store/navigation topic (sale / קטגוריה / מבצעים / קולקציה).`,
    recommendationGuidance(langLabel, year, count),
    urlList.length ? `If a new article should link to a listed page, set suggestedLinkUrl to EXACTLY one of these URLs (or omit it):\n${urlList.map((u) => `- ${u.url}`).join('\n')}` : '',
    structuredOutputContract(langLabel, count),
    `You MAY additionally include an optional "suggestedLinkUrl" field per topic (one of the URLs above).`,
  ].filter(Boolean).join('\n')
}

/**
 * Robust JSON extraction: tolerate code fences, leading prose, a top-level array
 * instead of {topics:[]}, and trailing junk. Returns null only when nothing
 * parseable is found. Never throws.
 */
function extractIdeas(text: string): SiteScanIdea[] | null {
  const raw = (text || '').trim()
  if (!raw) return null
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const tryParse = (s: string): SiteScanIdea[] | null => {
    try {
      const v = JSON.parse(s)
      if (Array.isArray(v)) return v as SiteScanIdea[]
      if (v && typeof v === 'object' && Array.isArray((v as { topics?: unknown }).topics)) return (v as { topics: SiteScanIdea[] }).topics
      return null
    } catch { return null }
  }
  // 1) whole thing, 2) first {...} object, 3) first [...] array.
  return (
    tryParse(stripped) ??
    tryParse(stripped.match(/\{[\s\S]*\}/)?.[0] ?? '') ??
    tryParse(stripped.match(/\[[\s\S]*\]/)?.[0] ?? '')
  )
}

async function callModel(prompt: string): Promise<{ ideas: SiteScanIdea[]; ok: boolean; modelUsed: string | null }> {
  // Centralized pinned Pro model (explicit logged fallback); big token budget so a
  // ~20-idea JSON response is not truncated.
  const { text, ok, modelUsed } = await generateRecommendationJSON(prompt, { temperature: 0.85, maxOutputTokens: 8192 })
  if (!ok) return { ideas: [], ok: false, modelUsed }
  const ideas = extractIdeas(text)
  if (ideas === null) {
    console.error('[reco-site-scan] unparseable model output', { sample: (text || '').slice(0, 200) })
    return { ideas: [], ok: false, modelUsed }
  }
  return { ideas, ok: true, modelUsed }
}

const MAX_SITE_SCAN_IDEAS = 20

// NOTE: the legacy deterministic fallback (static entity-name-plus-suffix
// editorial templates) has been REMOVED from the user-facing path. When the model
// is short, we run ONE Pro count-completion call and otherwise return fewer with
// an internal shortfall diagnostic — never a static editorial title.

/** One model attempt: raw ideas + ok + which model produced them. */
export interface RawIdeaGen { ideas: SiteScanIdea[]; ok: boolean; modelUsed: string | null }

export interface CompletionResult {
  validIdeas: SiteScanIdea[]
  rawCount: number
  ok: boolean
  modelUsed: string | null
  retryUsed: boolean
  rejects: Record<string, number>
  shortfall: number
  /** The avoid list passed to each call (call 0, then the completion call). */
  avoidHistory: string[][]
}

/**
 * Bounded count completion (max TWO calls) over an INJECTED model function — the
 * SAME model for both calls. The first call requests `target`; if fewer than
 * `target` VALID ideas survive minimal validation, ONE completion call requests
 * exactly the missing number, avoiding everything already produced (valid AND
 * rejected). No deterministic fallback, no rewriting. Pure/testable: the network
 * call is injected. Returns the valid ideas + a full diagnostic breakdown.
 */
export async function completeSiteScanIdeas(
  target: number,
  baseAvoid: string[],
  year: number,
  callModelFor: (need: number, avoid: string[]) => Promise<RawIdeaGen>,
): Promise<CompletionResult> {
  const validateSeen = new Set<string>()
  const rejects: Record<string, number> = {}
  const validIdeas: SiteScanIdea[] = []
  const producedTitles: string[] = []
  const avoidHistory: string[][] = []
  let rawCount = 0
  let ok = false
  let modelUsed: string | null = null
  let retryUsed = false
  for (let call = 0; call < 2 && validIdeas.length < target; call++) {
    if (call > 0) retryUsed = true
    const need = target - validIdeas.length
    const avoidNow = Array.from(new Set([...baseAvoid, ...producedTitles]))
    avoidHistory.push(avoidNow)
    const res = await callModelFor(need, avoidNow)
    if (res.modelUsed) modelUsed = res.modelUsed
    ok = ok || res.ok
    if (!res.ok) break
    if (res.ideas.length === 0) break
    rawCount += res.ideas.length
    for (const g of res.ideas) {
      const t = (g.title || '').trim()
      if (t) producedTitles.push(t)
      const r = validateIdea(g, validateSeen, year)
      if (r) { rejects[r] = (rejects[r] ?? 0) + 1; continue }
      validIdeas.push(g)
      if (validIdeas.length >= target) break
    }
  }
  return { validIdeas, rawCount, ok, modelUsed, retryUsed, rejects, shortfall: Math.max(0, target - validIdeas.length), avoidHistory }
}

/** Generate topic ideas from the cached site scan. Read-only; never rescans. */
export async function recommendFromSiteScan(admin: Admin, input: SiteScanRecoInput, businessCtx: string): Promise<SiteScanRecoResult> {
  const emptyDebug = { scanFound: false, targetCount: 0, digestCounts: { importantPages: 0, categories: 0, orphans: 0, clusters: 0 }, modelCalled: false, modelOk: false, modelRawCount: 0, usedFallback: false, rawSuggestionCount: 0 }

  // Corpus = the WordPress cached scan (if any) UNIONED with synced Shopify
  // entities mapped to the same ScannedTarget model. Shopify-only projects have
  // no WP cache row but a full Shopify corpus; WordPress-only projects get [] for
  // Shopify → identical to before. No ranking/dedup/provenance change.
  const cacheRow = await getCachedIndex(admin, input.projectId)
  const wpTargets = cacheRow ? ((reassembleReport(cacheRow).targets ?? []) as ScannedTarget[]) : []
  const shopifyTargets = await loadShopifyScannedTargets(admin, input.projectId)
  const targets = [...wpTargets, ...shopifyTargets]
  const scanFound = !!cacheRow || shopifyTargets.length > 0
  if (targets.length === 0) return { suggestions: [], meta: { reason: 'no_scan', generated: 0, debug: { ...emptyDebug, scanFound } } }

  const digest = buildDigest(targets)
  const digestCounts = { importantPages: digest.importantPages.length, categories: digest.categories.length, orphans: digest.orphans.length, clusters: digest.clusters.length }
  const debug = { scanFound: true, targetCount: targets.length, digestCounts, modelCalled: false, modelOk: false, modelRawCount: 0, usedFallback: false, rawSuggestionCount: 0 }

  // A scan with no eligible pages/categories can't seed either the prompt or the
  // deterministic fallback → a clean "not enough data", not an error.
  if (digest.importantPages.length === 0 && digest.categories.length === 0) {
    return { suggestions: [], meta: { reason: 'insufficient_data', generated: 0, debug } }
  }

  const urlList = sourceUrlList(digest)
  const urlByKey = new Map(urlList.map((u) => [u.url, u.title]))

  // Up to TWO Gemini calls, BOTH using the centralized primary (Pro) model: the
  // first, then ONE bounded count-completion call for the exact missing number of
  // VALID ideas (gated on VALID count, not raw). NO deterministic fallback.
  const year = currentYear()
  const { validIdeas, rawCount, ok, modelUsed, retryUsed, rejects, shortfall } = await completeSiteScanIdeas(
    MAX_SITE_SCAN_IDEAS, input.avoidTitles ?? [], year,
    (need, avoid) => callModel(buildPrompt(input.langLabel, businessCtx, digestToPromptBlock(digest), urlList, need, avoid)),
  )

  // Build suggestions from the VALID ideas — titles/reasons byte-identical to the
  // model output (reason = the model's own Hebrew evidence sentence).
  const suggestions: TopicSuggestion[] = validIdeas.slice(0, MAX_SITE_SCAN_IDEAS).map((g) => {
    const title = (g.title || '').trim()
    const primaryKeyword = (g.primaryKeyword || title).trim()
    const suggestionReason = (g.evidenceSummary && g.evidenceSummary.trim()) || (g.reason && g.reason.trim()) || ''
    const linkUrl = (g.suggestedLinkUrl || '').trim()
    const suggestedInternalLinks = linkUrl && urlByKey.has(linkUrl)
      ? [{ url: linkUrl, anchor: urlByKey.get(linkUrl) || primaryKeyword }]
      : []
    return {
      id: `site_scan:${slugKey(title)}`,
      title,
      primaryKeyword,
      secondaryKeywords: Array.isArray(g.secondaryKeywords) ? g.secondaryKeywords.filter((s) => typeof s === 'string' && s.trim()) : [],
      searchIntent: g.intent || g.searchIntent || 'informational',
      recommendedWordCount: typeof g.recommendedWordCount === 'number' ? g.recommendedWordCount : 1200,
      angle: g.angle || '',
      suggestedInternalLinks,
      source: 'site_scan' as const,
      suggestionReason,
      suggestionScore: 0.75,
      ...(modelUsed ? { modelUsed } : {}),
    }
  })

  // Internal shortfall diagnostic (from completeSiteScanIdeas) — how many short of
  // the request after the ONE completion call. NO deterministic filler is added.
  debug.modelCalled = true
  debug.modelOk = ok
  debug.modelRawCount = rawCount
  debug.rawSuggestionCount = suggestions.length
  Object.assign(debug as Record<string, unknown>, {
    modelUsed, retryUsed, validationRejects: rejects,
    generatedCount: rawCount, validCount: suggestions.length, shortfall,
  })

  if (suggestions.length === 0) {
    return { suggestions: [], meta: { reason: ok ? 'model_empty' : 'model_error', generated: 0, debug } }
  }
  return { suggestions, meta: { generated: suggestions.length, debug } }
}

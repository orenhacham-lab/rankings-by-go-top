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
import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'
import { getCachedIndex, reassembleReport } from '@/lib/content/wordpress-content-index'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import { loadShopifyScannedTargets } from '@/lib/shopify/site-targets'
import { clusterByTokens, slugKey } from './dedupe'
import { topicQualityIssue } from './keyword-research'
import { qualityGuidance, currentYear, applyQualityRepairs, selectDiverse, cannibalizes } from './quality'
import type { TopicSuggestion } from './types'

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
  angle?: string
  recommendedWordCount?: number
  reason?: string
  /** Which existing page/category/cluster inspired it (source context). */
  sourceContext?: string
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
  return [
    `You are an SEO content strategist. Analyze a website's existing content (from a site scan) and propose NEW article topics that fill content gaps and strengthen the site's internal structure.`,
    businessCtx ? `Website: ${businessCtx}.` : '',
    // Phase 3H.4 — rotation memory: never re-emit what already exists or was
    // already suggested; move on to UNUSED entities/clusters/angles instead.
    avoidTitles.length ? `Do NOT repeat or closely overlap these existing/already-suggested titles and keywords:\n${avoidTitles.slice(0, AVOID_PROMPT_CAP).map((t) => `- ${t}`).join('\n')}\nInstead, ROTATE to entities, categories, products and angles NOT represented in that list (different clusters, different sub-intents, different audiences).` : '',
    `Write ALL output in ${langLabel}.`,
    qualityGuidance(langLabel, currentYear()),
    `Here is a compact digest of the EXISTING site content:`,
    digestBlock,
    ``,
    `Propose ${count} NEW, specific article topics that:`,
    `- support important pages that lack supporting/cluster content,`,
    `- develop underdeveloped content clusters,`,
    `- give orphan/weakly-linked pages a logical supporting article,`,
    `- cover entities that recur in titles/anchors/categories but have no dedicated article,`,
    `- are natural follow-ups to existing pages.`,
    `Each topic MUST be a concrete article that does NOT duplicate an existing page above. Give each a SPECIFIC long-tail primaryKeyword that includes the article's INTENT words (how to choose / benefits / comparison / care / audience) — NEVER just the bare entity/category/product name on its own (e.g. for the entity "קרני אייל לכלבים" use "איך לבחור קרן אייל לכלב", not "קרני אייל לכלבים").`,
    `For products / product categories / service pages, EXPAND the raw entity into a specific article intent: buying guide, how to choose, comparison, benefits/risks, sizing/fit, maintenance/care, use-case, or an audience/problem-specific guide (e.g. entity "מיטות לכלבים" → "מיטות לכלבים: איך לבחור מיטה מתאימה לפי גודל והרגלי שינה"). NEVER output a raw one-word topic or a store/navigation topic (sale / קטגוריה / מבצעים / קולקציה).`,
    urlList.length ? `When a new article should link to an existing page, set suggestedLinkUrl to EXACTLY one of these URLs (or omit it):\n${urlList.map((u) => `- ${u.url}`).join('\n')}` : '',
    `Return ONLY JSON: {"topics":[{"title","primaryKeyword","secondaryKeywords":[],"searchIntent","angle","recommendedWordCount","reason","sourceContext","suggestedLinkUrl"}]}.`,
    `searchIntent ∈ informational|commercial|comparison|transactional|local|other. recommendedWordCount 800-1600. reason = one short plain-language sentence explaining the gap it fills. sourceContext = the existing page/category/cluster it supports.`,
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

async function callModel(prompt: string): Promise<{ ideas: SiteScanIdea[]; ok: boolean }> {
  const client = getGeminiClient()
  if (!client) { console.warn('[reco-site-scan] no gemini client configured'); return { ideas: [], ok: false } }
  const modelName = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  try {
    const model = client.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json', temperature: 0.9, maxOutputTokens: 8192 } })
    const result = await model.generateContent(prompt)
    const text = result.response.text()
    const ideas = extractIdeas(text)
    if (ideas === null) {
      console.error('[reco-site-scan] unparseable model output', { sample: (text || '').slice(0, 200) })
      return { ideas: [], ok: false }
    }
    return { ideas, ok: true }
  } catch (err) {
    console.error('[reco-site-scan] model error', { message: err instanceof Error ? err.message : String(err) })
    return { ideas: [], ok: false }
  }
}

const MAX_SITE_SCAN_IDEAS = 20

/**
 * Deterministic scan-derived suggestions used when the model is unavailable /
 * fails / returns nothing — so a project with a usable scan still gets useful,
 * non-crashing ideas. Built from important pages + categories (a "complete
 * guide" supporting-article angle). No AI. 3–5 items when possible.
 */
function deterministicFallback(digest: ReturnType<typeof buildDigest>, language: 'he' | 'en', avoidTitles: string[] = []): TopicSuggestion[] {
  // Phase 3H.4 — rotation memory for the fallback too: skip templates that were
  // already suggested/exist, so a repeat run moves on to unused seeds.
  const avoid = new Set(avoidTitles.map((t) => t.trim().toLowerCase()).filter(Boolean))
  const he = language === 'he'
  // Entity-appropriate archetypes only — NEVER the generic "טעויות נפוצות וטיפים"
  // cliché (it was applied blindly to brands like "Tom Ford"). A "complete guide"
  // and a "how to choose" buying angle fit products/brands/categories safely.
  const guide = (name: string) => (he ? `המדריך המלא: ${name}` : `The complete guide to ${name}`)
  const howToChoose = (name: string) => (he ? `איך לבחור ${name}` : `How to choose ${name}`)
  const prefix = he ? 'לפי סריקת האתר' : 'From the site scan'
  const supportReason = (name: string) => (he ? `נושא תומך לעמוד/קטגוריה קיימים באתר: ${name} (${prefix})` : `A supporting topic for an existing page/category: ${name} (${prefix})`)

  const seeds: { name: string; keyword: string; url?: string }[] = []
  for (const c of digest.categories) seeds.push({ name: c.title, keyword: c.title, url: c.url })
  for (const p of digest.importantPages) seeds.push({ name: p.title, keyword: p.keyword || p.title, url: p.url })

  const out: TopicSuggestion[] = []
  const seenTitles = new Set<string>()
  for (const s of seeds) {
    const name = (s.name || '').trim()
    // Phase 3H.3 — the fallback keyword carries INTENT, never the bare entity
    // name: a bare-entity keyword exactly matches existing entity-prefixed topic
    // titles and gets (correctly) blocked as covered — which zeroed the whole
    // fallback. "X מדריך"/"X guide" is a real search phrase and a distinct
    // sub-intent under the coverage rules.
    const keyword = (s.keyword || name).trim() === name ? (he ? `${name} מדריך` : `${name} guide`) : (s.keyword || name).trim()
    if (!name || !keyword) continue
    // Phase 3H — a deterministic template can't expand a bare one-word entity or
    // a store/navigation name into a real article ("המדריך המלא: SALE" is junk);
    // only multi-word, non-navigation seeds are used. The model path handles the
    // broad entities; here quality beats coverage.
    if (topicQualityIssue(name, name) !== null) continue
    for (const makeTitle of [guide, howToChoose]) {
      const title = makeTitle(name)
      const key = title.toLowerCase()
      if (seenTitles.has(key) || avoid.has(key)) continue
      seenTitles.add(key)
      out.push({
        id: `site_scan:${slugKey(title)}`,
        title,
        primaryKeyword: keyword,
        secondaryKeywords: [],
        searchIntent: 'informational',
        recommendedWordCount: 1200,
        angle: '',
        suggestedInternalLinks: s.url ? [{ url: s.url, anchor: name }] : [],
        source: 'site_scan',
        suggestionReason: supportReason(name),
        suggestionScore: 0.5,
      })
      if (out.length >= 6) return out
    }
  }
  return out
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
  const prompt = buildPrompt(input.langLabel, businessCtx, digestToPromptBlock(digest), urlList, MAX_SITE_SCAN_IDEAS, input.avoidTitles ?? [])

  const { ideas, ok } = await callModel(prompt)
  debug.modelCalled = true
  debug.modelOk = ok
  debug.modelRawCount = ideas.length

  const reasonPrefix = input.language === 'he' ? 'לפי סריקת האתר' : 'From the site scan'
  const suggestions: TopicSuggestion[] = []
  for (const g of ideas) {
    const title = (g.title || '').trim()
    const primaryKeyword = (g.primaryKeyword || title).trim()
    if (!title || !primaryKeyword) continue
    const ctx = (g.sourceContext || '').trim()
    const baseReason = (g.reason || '').trim()
    const suggestionReason = [baseReason, ctx ? `(${reasonPrefix}: ${ctx})` : `(${reasonPrefix})`].filter(Boolean).join(' ')
    const linkUrl = (g.suggestedLinkUrl || '').trim()
    const suggestedInternalLinks = linkUrl && urlByKey.has(linkUrl)
      ? [{ url: linkUrl, anchor: urlByKey.get(linkUrl) || primaryKeyword }]
      : []
    suggestions.push({
      id: `site_scan:${slugKey(title)}`,
      title,
      primaryKeyword,
      secondaryKeywords: Array.isArray(g.secondaryKeywords) ? g.secondaryKeywords.filter((s) => typeof s === 'string' && s.trim()) : [],
      searchIntent: g.searchIntent || 'informational',
      recommendedWordCount: typeof g.recommendedWordCount === 'number' ? g.recommendedWordCount : 1200,
      angle: g.angle || '',
      suggestedInternalLinks,
      source: 'site_scan',
      suggestionReason,
      suggestionScore: 0.75,
    })
    if (suggestions.length >= MAX_SITE_SCAN_IDEAS) break
  }

  // Per-idea repairs (stale year, reason language) + DISCARD pure-generic and
  // cannibalizing titles + adaptive full-set diversification (MMR).
  const year = currentYear()
  const avoid = input.avoidTitles ?? []
  const cleaned = suggestions.filter((s) => !applyQualityRepairs(s, input.language, year).discard && !cannibalizes(s.title, avoid))
  const diversified = selectDiverse(cleaned, MAX_SITE_SCAN_IDEAS)

  // Model failed or produced nothing usable → deterministic scan-derived ideas
  // so the user is never stuck with a bare error on a project that HAS a scan.
  if (diversified.length === 0) {
    const fallback = deterministicFallback(digest, input.language, input.avoidTitles ?? [])
    debug.usedFallback = fallback.length > 0
    debug.rawSuggestionCount = fallback.length
    if (fallback.length > 0) return { suggestions: fallback, meta: { generated: fallback.length, debug } }
    return { suggestions: [], meta: { reason: ok ? 'model_empty' : 'model_error', generated: 0, debug } }
  }

  debug.rawSuggestionCount = diversified.length
  return { suggestions: diversified, meta: { generated: diversified.length, debug } }
}

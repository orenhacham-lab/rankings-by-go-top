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
import { clusterByTokens, slugKey } from './dedupe'
import type { TopicSuggestion } from './types'

type Admin = ReturnType<typeof createAdminClient>

export interface SiteScanRecoInput {
  projectId: string
  language: 'he' | 'en'
  langLabel: string
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

  const categories = eligible
    .filter((t) => t.targetType === 'category' || t.targetType === 'tag')
    .slice(0, 20)
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
    lines.push('CATEGORIES/TAGS [title | type]:')
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

function buildPrompt(langLabel: string, businessCtx: string, digestBlock: string, urlList: { url: string; title: string }[], count: number): string {
  return [
    `You are an SEO content strategist. Analyze a website's existing content (from a site scan) and propose NEW article topics that fill content gaps and strengthen the site's internal structure.`,
    businessCtx ? `Website: ${businessCtx}.` : '',
    `Write ALL output in ${langLabel}.`,
    `Here is a compact digest of the EXISTING site content:`,
    digestBlock,
    ``,
    `Propose ${count} NEW, specific article topics that:`,
    `- support important pages that lack supporting/cluster content,`,
    `- develop underdeveloped content clusters,`,
    `- give orphan/weakly-linked pages a logical supporting article,`,
    `- cover entities that recur in titles/anchors/categories but have no dedicated article,`,
    `- are natural follow-ups to existing pages.`,
    `Each topic MUST be a concrete article that does NOT duplicate an existing page above. Give each a SPECIFIC long-tail primaryKeyword (never a bare category name).`,
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
function deterministicFallback(digest: ReturnType<typeof buildDigest>, language: 'he' | 'en'): TopicSuggestion[] {
  const he = language === 'he'
  const guide = (name: string) => (he ? `המדריך המלא: ${name}` : `The complete guide to ${name}`)
  const tips = (name: string) => (he ? `${name} — טעויות נפוצות וטיפים` : `${name} — common mistakes and tips`)
  const prefix = he ? 'לפי סריקת האתר' : 'From the site scan'
  const supportReason = (name: string) => (he ? `נושא תומך לעמוד/קטגוריה קיימים באתר: ${name} (${prefix})` : `A supporting topic for an existing page/category: ${name} (${prefix})`)

  const seeds: { name: string; keyword: string; url?: string }[] = []
  for (const c of digest.categories) seeds.push({ name: c.title, keyword: c.title, url: c.url })
  for (const p of digest.importantPages) seeds.push({ name: p.title, keyword: p.keyword || p.title, url: p.url })

  const out: TopicSuggestion[] = []
  const seenTitles = new Set<string>()
  for (const s of seeds) {
    const name = (s.name || '').trim()
    const keyword = (s.keyword || name).trim()
    if (!name || !keyword) continue
    for (const makeTitle of [guide, tips]) {
      const title = makeTitle(name)
      const key = title.toLowerCase()
      if (seenTitles.has(key)) continue
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

  const cacheRow = await getCachedIndex(admin, input.projectId)
  if (!cacheRow) return { suggestions: [], meta: { reason: 'no_scan', generated: 0, debug: emptyDebug } }
  const report = reassembleReport(cacheRow)
  const targets = (report.targets ?? []) as ScannedTarget[]
  if (targets.length === 0) return { suggestions: [], meta: { reason: 'no_scan', generated: 0, debug: { ...emptyDebug, scanFound: true } } }

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
  const prompt = buildPrompt(input.langLabel, businessCtx, digestToPromptBlock(digest), urlList, MAX_SITE_SCAN_IDEAS)

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

  // Model failed or produced nothing usable → deterministic scan-derived ideas
  // so the user is never stuck with a bare error on a project that HAS a scan.
  if (suggestions.length === 0) {
    const fallback = deterministicFallback(digest, input.language)
    debug.usedFallback = fallback.length > 0
    debug.rawSuggestionCount = fallback.length
    if (fallback.length > 0) return { suggestions: fallback, meta: { generated: fallback.length, debug } }
    return { suggestions: [], meta: { reason: ok ? 'model_empty' : 'model_error', generated: 0, debug } }
  }

  debug.rawSuggestionCount = suggestions.length
  return { suggestions, meta: { generated: suggestions.length, debug } }
}

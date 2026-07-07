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

export interface SiteScanRecoResult {
  suggestions: TopicSuggestion[]
  meta: {
    generated: number
    /** 'no_scan' when there is no cached scan/index to analyze. */
    reason?: 'no_scan' | 'model_error' | 'model_empty'
    /** Compact digest sizes (diagnostics). */
    targetsAnalyzed?: number
    clustersFound?: number
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

async function callModel(prompt: string): Promise<{ ideas: SiteScanIdea[]; ok: boolean }> {
  const client = getGeminiClient()
  if (!client) return { ideas: [], ok: false }
  const modelName = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  try {
    const model = client.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json', temperature: 0.9 } })
    const result = await model.generateContent(prompt)
    const text = result.response.text()
    let parsed: { topics?: unknown }
    try { parsed = JSON.parse(text) } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) return { ideas: [], ok: false }
      parsed = JSON.parse(m[0])
    }
    return { ideas: Array.isArray(parsed.topics) ? (parsed.topics as SiteScanIdea[]) : [], ok: true }
  } catch (err) {
    console.error('[reco-site-scan] model error', { message: err instanceof Error ? err.message : String(err) })
    return { ideas: [], ok: false }
  }
}

const MAX_SITE_SCAN_IDEAS = 20

/** Generate topic ideas from the cached site scan. Read-only; never rescans. */
export async function recommendFromSiteScan(admin: Admin, input: SiteScanRecoInput, businessCtx: string): Promise<SiteScanRecoResult> {
  const cacheRow = await getCachedIndex(admin, input.projectId)
  if (!cacheRow) return { suggestions: [], meta: { reason: 'no_scan', generated: 0 } }
  const report = reassembleReport(cacheRow)
  const targets = (report.targets ?? []) as ScannedTarget[]
  if (targets.length === 0) return { suggestions: [], meta: { reason: 'no_scan', generated: 0 } }

  const digest = buildDigest(targets)
  const urlList = sourceUrlList(digest)
  const urlByKey = new Map(urlList.map((u) => [u.url, u.title]))
  const prompt = buildPrompt(input.langLabel, businessCtx, digestToPromptBlock(digest), urlList, MAX_SITE_SCAN_IDEAS)

  const { ideas, ok } = await callModel(prompt)
  if (!ok) return { suggestions: [], meta: { reason: 'model_error', generated: 0, targetsAnalyzed: targets.length, clustersFound: digest.clusters.length } }
  if (ideas.length === 0) return { suggestions: [], meta: { reason: 'model_empty', generated: 0, targetsAnalyzed: targets.length, clustersFound: digest.clusters.length } }

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

  return { suggestions, meta: { generated: ideas.length, targetsAnalyzed: targets.length, clustersFound: digest.clusters.length } }
}

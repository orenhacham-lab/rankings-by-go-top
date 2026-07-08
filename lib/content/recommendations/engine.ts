/**
 * Content-automation topic recommendation engine (source-agnostic).
 *
 * Given a project + a source, produce a USEFUL BATCH of new, non-duplicate
 * TopicSuggestion[]:
 *   - 'keyword'             → expand a broad seed keyword into many distinct
 *                             long-tail article ideas (Gemini).
 *   - 'project_data'        → gap-based ideas from existing project context.
 *   - 'keyword_research_url'→ Google Ads by domain → cluster → Gemini.
 *
 * It loops (bounded) until it reaches a target of new ideas, feeding already-seen
 * titles back so each round produces DIFFERENT ideas. Dedupe is title-based and
 * near-duplicate-only, so broad topical overlap (many "Japan" ideas) is allowed.
 * No auto-save — the route persists only what the user approves.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'
import { assessProjectKeywordFit } from '@/lib/content/gemini-topics'
import { loadInternalLinkCandidates } from '@/lib/content/internal-link-candidates'
import { ExistingCorpus, tokens, jaccard, slugKey } from './dedupe'
import { recommendFromKeywordResearch } from './keyword-research'
import { recommendFromSiteScan } from './site-scan'
import type { RecommendationSource, RecommendationResult, TopicSuggestion, SuggestedInternalLink } from './types'

type Admin = ReturnType<typeof createAdminClient>

const TARGET_NEW = 15
const MAX_ATTEMPTS = 4
const MAX_SUGGESTIONS = 30
const BATCH_SIZE = 15

interface ProjectRow {
  id: string
  business_name: string | null
  target_domain: string | null
  country: string | null
  language: string | null
}

export interface GenerateInput {
  userId: string
  projectId: string
  source: RecommendationSource
  /** Required for the 'keyword' source. */
  keyword?: string
  /** Phase 3F.3.1c — normalized keywords to skip (keyword-research clusters), so
   *  "find more" surfaces fresh clusters instead of re-emitting known ones. */
  avoidKeywords?: string[]
}

/** Raw idea shape returned by the Gemini prompts below. */
interface GeminiIdea {
  title?: string
  primaryKeyword?: string
  secondaryKeywords?: string[]
  searchIntent?: string
  angle?: string
  recommendedWordCount?: number
  reason?: string
}

/** Build https://host/ from a stored target_domain (bare host or full URL). */
function homepageFromDomain(domain: string | null): string | null {
  const d = (domain || '').trim()
  if (!d) return null
  const host = d.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./, '')
  return host ? `https://${host}/` : null
}

/** Attach up to 2 internal-link candidates whose text overlaps the primary keyword. */
function attachInternalLinks(
  primaryKeyword: string,
  candidates: { url: string; title: string; keyword: string | null; historicalAnchors: string[] }[],
): SuggestedInternalLink[] {
  const kw = tokens(primaryKeyword)
  if (kw.size === 0) return []
  const scored = candidates
    .map((c) => {
      const anchor = (c.keyword || c.historicalAnchors[0] || c.title || '').trim()
      const score = jaccard(kw, tokens(`${c.title} ${c.keyword ?? ''}`))
      return { url: c.url, anchor, score }
    })
    .filter((c) => c.anchor && c.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, 2).map((c) => ({ url: c.url, anchor: c.anchor }))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * One Gemini call. `ok` distinguishes a successful response (topics may legit be
 * empty) from a transient failure (no client / thrown request / unparseable
 * output) so the caller can RETRY on failure instead of reporting "no ideas".
 */
async function callGeminiIdeas(prompt: string): Promise<{ ideas: GeminiIdea[]; ok: boolean }> {
  const client = getGeminiClient()
  if (!client) return { ideas: [], ok: false }
  const modelName = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  try {
    const model = client.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json', temperature: 0.95 } })
    const result = await model.generateContent(prompt)
    const text = result.response.text()
    let parsed: { topics?: unknown }
    try {
      parsed = JSON.parse(text)
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) return { ideas: [], ok: false } // unparseable → treat as transient, retry
      parsed = JSON.parse(m[0])
    }
    return { ideas: Array.isArray(parsed.topics) ? (parsed.topics as GeminiIdea[]) : [], ok: true }
  } catch (err) {
    console.error('[recommendations] gemini ideas error', { message: err instanceof Error ? err.message : String(err) })
    return { ideas: [], ok: false }
  }
}

/** Expand a BROAD seed keyword into many distinct long-tail article ideas. */
function keywordSeedPrompt(seed: string, langLabel: string, businessCtx: string, count: number, avoid: string[]): string {
  return [
    `You generate specific SEO article ideas for a website.`,
    businessCtx ? `Website context: ${businessCtx}.` : '',
    `The seed keyword is "${seed}". Treat it as a BROAD SEED — an entire content area — NOT the whole article topic.`,
    `Write ALL output in ${langLabel}.`,
    `Produce up to ${count} DISTINCT, specific, long-tail article ideas a real site in this area would publish — vary the angle: subtopics, regions, itineraries, comparisons, how-tos, costs/budgets, seasons, audiences (families/couples/first-timers), tips, and deep dives.`,
    `Each idea MUST be a concrete article (e.g. for seed "יפן": "מסלול ביפן ל-14 יום", "יפן עם ילדים", "קיוטו בפעם הראשונה", "אוכל רחוב ביפן", "עלויות טיול ביפן"), NOT a rephrasing of the seed.`,
    `Give each a SPECIFIC long-tail primaryKeyword — NEVER just "${seed}" on its own.`,
    avoid.length ? `Do NOT repeat or closely overlap these existing titles: ${avoid.slice(0, 40).map((t) => `"${t}"`).join(', ')}.` : '',
    `Return ONLY JSON: {"topics":[{"title","primaryKeyword","secondaryKeywords":[],"searchIntent","angle","recommendedWordCount","reason"}]}. searchIntent ∈ informational|commercial|comparison|transactional|local|other. recommendedWordCount 800-1600. reason = one short plain-language sentence.`,
  ].filter(Boolean).join('\n')
}

/** Gap-based ideas from existing project context (missing / adjacent / deeper). */
function projectDataPrompt(project: ProjectRow, langLabel: string, count: number, avoid: string[]): string {
  return [
    `You are an SEO content strategist finding CONTENT GAPS for a website.`,
    `Business: ${project.business_name || '(unknown)'} — domain: ${project.target_domain || '(unknown)'}.`,
    `Write ALL output in ${langLabel}.`,
    avoid.length ? `The site ALREADY covers these — do NOT repeat or closely overlap them:\n${avoid.slice(0, 40).map((t) => `- ${t}`).join('\n')}` : '',
    `Suggest up to ${count} NEW article ideas that fill real gaps: missing adjacent topics, deeper sub-topics of what already exists, supporting/comparison/how-to articles, and audience- or season-specific angles. Each must be specific and genuinely useful — not a variant of the existing list.`,
    `Give each a SPECIFIC long-tail primaryKeyword.`,
    `Return ONLY JSON: {"topics":[{"title","primaryKeyword","secondaryKeywords":[],"searchIntent","angle","recommendedWordCount","reason"}]}. searchIntent ∈ informational|commercial|comparison|transactional|local|other. recommendedWordCount 800-1600. reason = one short plain-language sentence.`,
  ].filter(Boolean).join('\n')
}

function mapIdea(g: GeminiIdea, source: RecommendationSource, score: number): TopicSuggestion | null {
  const title = (g.title || '').trim()
  const primaryKeyword = (g.primaryKeyword || title).trim()
  if (!title || !primaryKeyword) return null
  return {
    id: `${source}:${slugKey(title)}`,
    title,
    primaryKeyword,
    secondaryKeywords: Array.isArray(g.secondaryKeywords) ? g.secondaryKeywords.filter((s) => typeof s === 'string' && s.trim()) : [],
    searchIntent: g.searchIntent || 'informational',
    recommendedWordCount: typeof g.recommendedWordCount === 'number' ? g.recommendedWordCount : 1000,
    angle: g.angle || '',
    suggestedInternalLinks: [],
    source,
    suggestionReason: g.reason?.trim() || '',
    suggestionScore: score,
  }
}

/**
 * Loop a Gemini idea generator until we reach `target` NEW (non-duplicate)
 * suggestions or run out of attempts. Feeds seen titles back so each round is
 * different. Dedup is TITLE-based only (broad keyword overlap is allowed).
 *
 * `genBatch` returns `{ items, ok }` where `ok=false` marks a TRANSIENT failure
 * (no client / thrown request / unparseable output). On transient failure we
 * back off and retry within the attempt budget instead of stopping — that's the
 * fix for "first click 0 ideas, second click 15". We only stop early on a
 * genuine successful-but-empty response. `reason` explains a 0 result:
 *   - 'model_error'    → every attempt failed transiently (retry later)
 *   - 'all_duplicates' → the model produced ideas but all were duplicates
 *   - 'model_empty'    → the model succeeded but returned no ideas
 */
async function accumulate(
  genBatch: (avoid: string[]) => Promise<{ items: TopicSuggestion[]; ok: boolean }>,
  corpus: ExistingCorpus,
  existingTitles: string[],
  target: number,
): Promise<{ acc: TopicSuggestion[]; raw: number; dupes: number; attempts: number; reason?: string }> {
  const acc: TopicSuggestion[] = []
  const seenTitles = new Set<string>()
  let raw = 0
  let dupes = 0
  let attempts = 0
  let hadSuccess = false
  let hadError = false
  while (acc.length < target && attempts < MAX_ATTEMPTS) {
    attempts++
    const avoid = [...existingTitles, ...acc.map((a) => a.title)]
    const { items, ok } = await genBatch(avoid)
    if (!ok) {
      // Transient failure — back off and retry (do NOT report "no ideas").
      hadError = true
      await sleep(300 * attempts)
      continue
    }
    hadSuccess = true
    if (items.length === 0) break // genuine empty response → stop looping
    raw += items.length
    for (const s of items) {
      const key = s.title.trim().toLowerCase()
      if (!key || seenTitles.has(key)) { dupes++; continue }
      if (corpus.isDuplicate(s.title)) { dupes++; continue }
      seenTitles.add(key)
      acc.push(s)
      if (acc.length >= target) break
    }
  }
  const reason = acc.length > 0
    ? undefined
    : !hadSuccess && hadError
      ? 'model_error'
      : raw > 0
        ? 'all_duplicates'
        : 'model_empty'
  return { acc, raw, dupes, attempts, reason }
}

export async function generateRecommendations(admin: Admin, input: GenerateInput): Promise<RecommendationResult> {
  // 1) Project context.
  const { data: projRow } = await admin
    .from('projects')
    .select('id, business_name, target_domain, country, language')
    .eq('id', input.projectId)
    .maybeSingle()
  const project = (projRow as ProjectRow | null) ?? { id: input.projectId, business_name: null, target_domain: null, country: null, language: null }
  const language: 'he' | 'en' = String(project.language || '').toLowerCase().startsWith('en') ? 'en' : 'he'
  const langLabel = language === 'he' ? 'Hebrew' : 'English'
  const country = (project.country || 'IL').toUpperCase()
  const businessCtx = [project.business_name, project.target_domain].filter(Boolean).join(' — ')

  // 2) Existing-content corpus (dedupe) + existing titles (prompt avoid list).
  const corpus = new ExistingCorpus()
  const existingTitles: string[] = []
  const { data: topicRows } = await admin.from('article_topics').select('topic, primary_keyword, secondary_keywords').eq('project_id', input.projectId)
  for (const t of (topicRows ?? []) as { topic: string; primary_keyword: string | null; secondary_keywords: string[] | null }[]) {
    corpus.add(t.topic); corpus.add(t.primary_keyword)
    for (const s of t.secondary_keywords ?? []) corpus.add(s)
    if (t.topic) existingTitles.push(t.topic)
  }
  const { data: articleRows } = await admin.from('generated_articles').select('title, slug').eq('project_id', input.projectId)
  for (const a of (articleRows ?? []) as { title: string; slug: string | null }[]) {
    corpus.add(a.title); corpus.add(a.slug)
    if (a.title) existingTitles.push(a.title)
  }

  // 3) Internal-link candidates (for "suggested internal links" enrichment).
  let linkCandidates: { url: string; title: string; keyword: string | null; historicalAnchors: string[] }[] = []
  try {
    const { candidates } = await loadInternalLinkCandidates(admin, input.projectId)
    linkCandidates = candidates
  } catch { linkCandidates = [] }

  // 4) Run the requested source into a deduped batch.
  let suggestions: TopicSuggestion[] = []
  let meta: RecommendationResult['meta']

  if (input.source === 'keyword') {
    const keyword = (input.keyword || '').trim()
    const { acc, raw, dupes, attempts, reason } = await accumulate(
      async (avoid) => {
        const { ideas, ok } = await callGeminiIdeas(keywordSeedPrompt(keyword, langLabel, businessCtx, BATCH_SIZE, avoid))
        return { items: ideas.map((g) => mapIdea(g, 'keyword', 0.7)).filter((x): x is TopicSuggestion => !!x), ok }
      },
      corpus, existingTitles, TARGET_NEW,
    )
    suggestions = acc
    meta = { source: 'keyword', generated: raw, skippedDuplicates: dupes, finalCount: acc.length, attempts, reason }
  } else if (input.source === 'project_data') {
    const { acc, raw, dupes, attempts, reason } = await accumulate(
      async (avoid) => {
        const { ideas, ok } = await callGeminiIdeas(projectDataPrompt(project, langLabel, BATCH_SIZE, avoid))
        const items = ideas.map((g) => {
          const s = mapIdea(g, 'project_data', 0)
          if (!s) return null
          const fit = assessProjectKeywordFit(s.primaryKeyword, { businessName: project.business_name, category: null })
          s.suggestionScore = Number(Math.min(1, 0.6 + (fit === 'aligned' ? 0.2 : fit === 'weak' ? 0.1 : 0)).toFixed(2))
          if (!s.suggestionReason) s.suggestionReason = language === 'he' ? 'נושא משלים לפי נתוני האתר' : 'A supporting topic based on the site data'
          return s
        }).filter((x): x is TopicSuggestion => !!x)
        return { items, ok }
      },
      corpus, existingTitles, TARGET_NEW,
    )
    suggestions = acc
    meta = { source: 'project_data', generated: raw, skippedDuplicates: dupes, finalCount: acc.length, attempts, reason }
  } else if (input.source === 'site_scan') {
    // From the CACHED site scan — content-gap ideas, then dedupe. Never rescans.
    const res = await recommendFromSiteScan(admin, { projectId: input.projectId, language, langLabel }, businessCtx)
    const seenTitles = new Set<string>()
    let dupes = 0
    for (const s of res.suggestions) {
      const key = s.title.trim().toLowerCase()
      if (!key || seenTitles.has(key)) { dupes++; continue }
      if (corpus.isDuplicate(s.title)) { dupes++; continue }
      seenTitles.add(key)
      suggestions.push(s)
    }
    // Precise empty reason: no scan / not enough data / model failure / all
    // ideas were duplicates of existing topics. Never a bare generic error.
    const reason = suggestions.length > 0
      ? undefined
      : res.meta.reason
        ? res.meta.reason // no_scan | insufficient_data | model_error | model_empty
        : res.meta.generated > 0
          ? 'all_duplicates'
          : 'model_empty'
    meta = {
      source: 'site_scan',
      generated: res.meta.generated,
      skippedDuplicates: dupes,
      finalCount: suggestions.length,
      attempts: 1,
      reason,
      debug: process.env.NODE_ENV !== 'production' ? { ...res.meta.debug, afterDedupeCount: suggestions.length, noResultsReason: reason ?? null } : undefined,
    }
  } else {
    // keyword_research_url — Google Ads over URL + keyword seeds → clusters →
    // topics, then dedupe. Phase 3F.3.1: widen with project tracked keywords as
    // extra seeds and skip already-covered clusters so "find more" keeps working.
    const seedUrls = [homepageFromDomain(project.target_domain), ...linkCandidates.map((c) => c.url)].filter((u): u is string => !!u)
    const { data: kwSeedRows } = await admin
      .from('tracking_targets').select('keyword, avg_monthly_searches')
      .eq('project_id', input.projectId)
      .order('avg_monthly_searches', { ascending: false, nullsFirst: false })
      .limit(20)
    const seedKeywords = ((kwSeedRows ?? []) as { keyword: string }[]).map((r) => r.keyword).filter(Boolean)
    const res = await recommendFromKeywordResearch(admin, {
      userId: input.userId, projectId: input.projectId, seedUrls, country, language, businessName: project.business_name, category: null,
      seedKeywords, avoid: [...existingTitles, ...(input.avoidKeywords ?? [])],
    })
    const seenTitles = new Set<string>()
    let dupes = 0
    for (const s of res.suggestions) {
      const key = s.title.trim().toLowerCase()
      if (!key || seenTitles.has(key)) { dupes++; continue }
      if (corpus.isDuplicate(s.title)) { dupes++; continue }
      seenTitles.add(key)
      suggestions.push(s)
    }
    meta = {
      source: 'keyword_research_url',
      generated: res.meta.generated,
      skippedDuplicates: dupes,
      finalCount: suggestions.length,
      attempts: 1,
      keywordResearchFailed: res.meta.keywordResearchFailed,
      failureReason: res.meta.failureReason,
      adsCalls: res.meta.adsCalls,
      reason: suggestions.length === 0 ? (res.meta.reason === 'keyword_research_failed' || res.meta.keywordResearchFailed ? 'keyword_research_failed' : res.meta.reason === 'thin_data' ? 'kr_thin' : res.meta.reason === 'all_known' ? 'kr_all_known' : res.meta.generated === 0 ? 'no_keyword_data' : 'all_duplicates') : undefined,
      debug: process.env.NODE_ENV !== 'production' ? { seedUrlCount: seedUrls.length, seedKeywordCount: seedKeywords.length, rawKeywords: res.meta.rawKeywords, clusters: res.meta.clusters, adsCalls: res.meta.adsCalls, modelTopics: res.meta.generated, afterCorpusDedupe: suggestions.length } : undefined,
    }
  }

  // 5) Enrich internal links + cap + sort.
  const enriched = suggestions
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => ({ ...s, suggestedInternalLinks: s.suggestedInternalLinks.length ? s.suggestedInternalLinks : attachInternalLinks(s.primaryKeyword, linkCandidates) }))
  enriched.sort((a, b) => b.suggestionScore - a.suggestionScore)

  return { suggestions: enriched, meta }
}

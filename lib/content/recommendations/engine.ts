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

async function callGeminiIdeas(prompt: string): Promise<GeminiIdea[]> {
  const client = getGeminiClient()
  if (!client) return []
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
      if (!m) return []
      parsed = JSON.parse(m[0])
    }
    return Array.isArray(parsed.topics) ? (parsed.topics as GeminiIdea[]) : []
  } catch (err) {
    console.error('[recommendations] gemini ideas error', { message: err instanceof Error ? err.message : String(err) })
    return []
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
 */
async function accumulate(
  genBatch: (avoid: string[]) => Promise<TopicSuggestion[]>,
  corpus: ExistingCorpus,
  existingTitles: string[],
  target: number,
): Promise<{ acc: TopicSuggestion[]; raw: number; dupes: number; attempts: number }> {
  const acc: TopicSuggestion[] = []
  const seenTitles = new Set<string>()
  let raw = 0
  let dupes = 0
  let attempts = 0
  while (acc.length < target && attempts < MAX_ATTEMPTS) {
    attempts++
    const avoid = [...existingTitles, ...acc.map((a) => a.title)]
    const batch = await genBatch(avoid)
    if (batch.length === 0) break
    raw += batch.length
    for (const s of batch) {
      const key = s.title.trim().toLowerCase()
      if (!key || seenTitles.has(key)) { dupes++; continue }
      if (corpus.isDuplicate(s.title)) { dupes++; continue }
      seenTitles.add(key)
      acc.push(s)
      if (acc.length >= target) break
    }
  }
  return { acc, raw, dupes, attempts }
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
    const { acc, raw, dupes, attempts } = await accumulate(
      async (avoid) => {
        const ideas = await callGeminiIdeas(keywordSeedPrompt(keyword, langLabel, businessCtx, BATCH_SIZE, avoid))
        return ideas.map((g) => mapIdea(g, 'keyword', 0.7)).filter((x): x is TopicSuggestion => !!x)
      },
      corpus, existingTitles, TARGET_NEW,
    )
    suggestions = acc
    meta = { source: 'keyword', generated: raw, skippedDuplicates: dupes, finalCount: acc.length, attempts, reason: acc.length === 0 ? (raw === 0 ? 'model_empty' : 'all_duplicates') : undefined }
  } else if (input.source === 'project_data') {
    const { acc, raw, dupes, attempts } = await accumulate(
      async (avoid) => {
        const ideas = await callGeminiIdeas(projectDataPrompt(project, langLabel, BATCH_SIZE, avoid))
        return ideas.map((g) => {
          const s = mapIdea(g, 'project_data', 0)
          if (!s) return null
          const fit = assessProjectKeywordFit(s.primaryKeyword, { businessName: project.business_name, category: null })
          s.suggestionScore = Number(Math.min(1, 0.6 + (fit === 'aligned' ? 0.2 : fit === 'weak' ? 0.1 : 0)).toFixed(2))
          if (!s.suggestionReason) s.suggestionReason = language === 'he' ? 'נושא משלים לפי נתוני האתר' : 'A supporting topic based on the site data'
          return s
        }).filter((x): x is TopicSuggestion => !!x)
      },
      corpus, existingTitles, TARGET_NEW,
    )
    suggestions = acc
    meta = { source: 'project_data', generated: raw, skippedDuplicates: dupes, finalCount: acc.length, attempts, reason: acc.length === 0 ? (raw === 0 ? 'model_empty' : 'all_duplicates') : undefined }
  } else {
    // keyword_research_url — one Google Ads pass → clusters → topics, then dedupe.
    const seedUrls = [homepageFromDomain(project.target_domain), ...linkCandidates.map((c) => c.url)].filter((u): u is string => !!u)
    const res = await recommendFromKeywordResearch(admin, {
      userId: input.userId, projectId: input.projectId, seedUrls, country, language, businessName: project.business_name, category: null,
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
      reason: suggestions.length === 0 ? (res.meta.keywordResearchFailed ? 'keyword_research_failed' : res.meta.generated === 0 ? 'no_keyword_data' : 'all_duplicates') : undefined,
    }
  }

  // 5) Enrich internal links + cap + sort.
  const enriched = suggestions
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => ({ ...s, suggestedInternalLinks: s.suggestedInternalLinks.length ? s.suggestedInternalLinks : attachInternalLinks(s.primaryKeyword, linkCandidates) }))
  enriched.sort((a, b) => b.suggestionScore - a.suggestionScore)

  return { suggestions: enriched, meta }
}

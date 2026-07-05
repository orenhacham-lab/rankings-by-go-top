/**
 * Content-automation topic recommendation engine (source-agnostic).
 *
 * Given a project + a source, produce deduped TopicSuggestion[]:
 *   - 'keyword'             → Gemini topic ideas from a keyword seed (reuses the
 *                             existing gemini-topics generator + filter).
 *   - 'project_data'        → Gemini over existing project context (missing /
 *                             supporting topics).
 *   - 'keyword_research_url'→ Google Ads by domain → cluster → Gemini.
 *
 * Deterministic dedupe removes anything close to an existing topic or published
 * article. Never invents keywords beyond what the source produced. No auto-save
 * here — the route persists only what the user approves.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'
import {
  generateRawTopics,
  filterTopicSuggestions,
  assessProjectKeywordFit,
} from '@/lib/content/gemini-topics'
import { loadInternalLinkCandidates } from '@/lib/content/internal-link-candidates'
import { ExistingCorpus, tokens, jaccard, slugKey } from './dedupe'
import { recommendFromKeywordResearch } from './keyword-research'
import type { RecommendationSource, RecommendationResult, TopicSuggestion, SuggestedInternalLink } from './types'

type Admin = ReturnType<typeof createAdminClient>

const MAX_SUGGESTIONS = 20

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

interface GeminiProjectTopic {
  title: string
  primaryKeyword: string
  secondaryKeywords?: string[]
  searchIntent?: string
  angle?: string
  recommendedWordCount?: number
  reason?: string
}

/** Gemini over existing project context → missing/supporting topics. */
async function projectDataTopics(
  project: ProjectRow,
  language: 'he' | 'en',
  existingTitles: string[],
): Promise<GeminiProjectTopic[]> {
  const client = getGeminiClient()
  if (!client) return []
  const modelName = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  const langLabel = language === 'he' ? 'Hebrew' : 'English'
  const prompt = [
    `You are an SEO content strategist. Suggest NEW article topics for a website, based only on its own context.`,
    `Business: ${project.business_name || '(unknown)'} — domain: ${project.target_domain || '(unknown)'}.`,
    `Write ALL output in ${langLabel}.`,
    existingTitles.length ? `The site ALREADY has these topics/articles — do NOT repeat or closely overlap them:` : '',
    existingTitles.length ? existingTitles.slice(0, 30).map((t) => `- ${t}`).join('\n') : '',
    `Suggest up to 8 NEW or SUPPORTING article topics that fill real gaps and fit this business. Each must be genuinely useful, specific, and not a duplicate of the list above.`,
    `Return ONLY JSON: {"topics":[{"title","primaryKeyword","secondaryKeywords":[],"searchIntent","angle","recommendedWordCount","reason"}]}.`,
    `searchIntent ∈ informational|commercial|comparison|transactional|local|other. recommendedWordCount 800-1600. reason = one short plain-language sentence for a non-SEO owner.`,
  ].filter(Boolean).join('\n')

  try {
    const model = client.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json', temperature: 0.9 } })
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
    return Array.isArray(parsed.topics) ? (parsed.topics as GeminiProjectTopic[]) : []
  } catch (err) {
    console.error('[recommendations] projectDataTopics gemini error', { message: err instanceof Error ? err.message : String(err) })
    return []
  }
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
  const country = (project.country || 'IL').toUpperCase()

  // 2) Existing-content corpus (dedupe) + existing titles (project-data prompt).
  const corpus = new ExistingCorpus()
  const existingTitles: string[] = []
  const { data: topicRows } = await admin
    .from('article_topics')
    .select('topic, primary_keyword, secondary_keywords')
    .eq('project_id', input.projectId)
  for (const t of (topicRows ?? []) as { topic: string; primary_keyword: string | null; secondary_keywords: string[] | null }[]) {
    corpus.add(t.topic); corpus.add(t.primary_keyword)
    for (const s of t.secondary_keywords ?? []) corpus.add(s)
    if (t.topic) existingTitles.push(t.topic)
  }
  const { data: articleRows } = await admin
    .from('generated_articles')
    .select('title, slug')
    .eq('project_id', input.projectId)
  for (const a of (articleRows ?? []) as { title: string; slug: string | null }[]) {
    corpus.add(a.title); corpus.add(a.slug)
    if (a.title) existingTitles.push(a.title)
  }

  // 3) Internal-link candidates (for "suggested internal links" enrichment).
  let linkCandidates: { url: string; title: string; keyword: string | null; historicalAnchors: string[] }[] = []
  try {
    const { candidates } = await loadInternalLinkCandidates(admin, input.projectId)
    linkCandidates = candidates
  } catch {
    linkCandidates = []
  }

  // 4) Run the requested source → raw suggestions.
  let raw: TopicSuggestion[] = []
  let meta: RecommendationResult['meta'] = { source: input.source, generated: 0, skippedDuplicates: 0 }

  if (input.source === 'keyword') {
    const keyword = (input.keyword || '').trim()
    if (keyword) {
      const res = await generateRawTopics({
        primaryKeyword: keyword,
        language,
        searchIntent: 'informational',
        count: 8,
        businessName: project.business_name,
        domain: project.target_domain,
        category: null,
        useProjectContext: true,
      })
      if ('raw' in res) {
        const filtered = filterTopicSuggestions(res.raw, keyword, 8)
        const list = filtered.length ? filtered : filterTopicSuggestions(res.raw, keyword, 8, { relaxed: true })
        raw = list.map((g) => ({
          id: `keyword:${slugKey(g.primaryKeyword || g.title)}`,
          title: g.title,
          primaryKeyword: g.primaryKeyword || keyword,
          secondaryKeywords: Array.isArray(g.suggestedSecondaryKeywords) ? g.suggestedSecondaryKeywords : [],
          searchIntent: g.searchIntent || 'informational',
          recommendedWordCount: typeof g.recommendedWordCount === 'number' ? g.recommendedWordCount : 1000,
          angle: g.angle || '',
          suggestedInternalLinks: [],
          source: 'keyword',
          suggestionReason: g.whyThisTopic || (language === 'he' ? 'רעיון שנוצר לפי מילת המפתח שהוזנה' : 'Generated from the entered keyword'),
          suggestionScore: 0.7,
        }))
      }
    }
  } else if (input.source === 'project_data') {
    const topics = await projectDataTopics(project, language, existingTitles)
    raw = topics.map((g) => {
      const primaryKeyword = (g.primaryKeyword || g.title || '').trim()
      const fit = assessProjectKeywordFit(primaryKeyword, { businessName: project.business_name, category: null })
      const score = Math.min(1, 0.6 + (fit === 'aligned' ? 0.2 : fit === 'weak' ? 0.1 : 0))
      return {
        id: `project_data:${slugKey(primaryKeyword)}`,
        title: (g.title || primaryKeyword).trim(),
        primaryKeyword,
        secondaryKeywords: Array.isArray(g.secondaryKeywords) ? g.secondaryKeywords : [],
        searchIntent: g.searchIntent || 'informational',
        recommendedWordCount: typeof g.recommendedWordCount === 'number' ? g.recommendedWordCount : 1000,
        angle: g.angle || '',
        suggestedInternalLinks: [],
        source: 'project_data' as const,
        suggestionReason: g.reason?.trim() || (language === 'he' ? 'נושא משלים לפי נתוני האתר הקיימים' : 'A supporting topic based on the site’s existing content'),
        suggestionScore: Number(score.toFixed(2)),
      }
    }).filter((s) => s.primaryKeyword)
  } else {
    // keyword_research_url
    const seedUrls = [homepageFromDomain(project.target_domain), ...linkCandidates.map((c) => c.url)].filter((u): u is string => !!u)
    const res = await recommendFromKeywordResearch(admin, {
      userId: input.userId,
      projectId: input.projectId,
      seedUrls,
      country,
      language,
      businessName: project.business_name,
      category: null,
    })
    raw = res.suggestions
    meta = { source: input.source, generated: res.meta.generated, skippedDuplicates: 0, keywordResearchFailed: res.meta.keywordResearchFailed, failureReason: res.meta.failureReason, adsCalls: res.meta.adsCalls }
  }

  // 5) Dedupe against existing content + within the batch; enrich internal links.
  const seenIds = new Set<string>()
  const suggestions: TopicSuggestion[] = []
  let skipped = 0
  for (const s of raw) {
    if (!s.primaryKeyword || !s.title) continue
    if (seenIds.has(s.id)) continue
    if (corpus.isDuplicate(s.primaryKeyword) || corpus.isDuplicate(s.title)) { skipped++; continue }
    seenIds.add(s.id)
    suggestions.push({ ...s, suggestedInternalLinks: s.suggestedInternalLinks.length ? s.suggestedInternalLinks : attachInternalLinks(s.primaryKeyword, linkCandidates) })
    if (suggestions.length >= MAX_SUGGESTIONS) break
  }

  suggestions.sort((a, b) => b.suggestionScore - a.suggestionScore)
  meta.generated = raw.length
  meta.skippedDuplicates = skipped
  return { suggestions, meta }
}

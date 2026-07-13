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
import { subjectKey, currentYear, qualityGuidance } from './quality'
import { refineAndSelect, type RefineCtx, type RefineFunnel, type RepairTitleFn, type RefillFn } from './refine'
import { geminiRepairTitle } from './gemini-repair'
import { recommendFromKeywordResearch, topicQualityIssue } from './keyword-research'
import { recommendFromSiteScan } from './site-scan'
import { mergeHybrid, hybridProvenanceReason } from './hybrid'
import { slugFromUrl } from '@/lib/content/internal-links'
import { getCachedIndex, reassembleReport, isStale, isVersionStale } from '@/lib/content/wordpress-content-index'
import { previewStructuredLinks } from '@/lib/content/internal-link-idea-plan'
import { isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import type { RecommendationSource, RecommendationResult, TopicSuggestion, SuggestedInternalLink } from './types'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Phase 3F.3.1e — derive seed CONCEPTS from the site's own taxonomy (category /
 * tag / product target titles + their reliable focus keywords) to widen the
 * keyword-research pool with the catalogue's breadth. Read-only cached scan; no
 * rescan. Never hardcoded — purely project-derived.
 */
async function deriveScanSeedConcepts(admin: Admin, projectId: string): Promise<string[]> {
  try {
    const cacheRow = await getCachedIndex(admin, projectId)
    if (!cacheRow) return []
    const report = reassembleReport(cacheRow)
    const targets = (report.targets ?? []) as ScannedTarget[]
    const out: string[] = []
    const seen = new Set<string>()
    const push = (raw: string | null | undefined) => {
      const v = (raw || '').trim()
      const key = v.toLowerCase()
      if (v && v.length >= 3 && v.length <= 40 && !seen.has(key)) { seen.add(key); out.push(v) }
    }
    for (const t of targets) {
      if (t.targetType === 'category' || t.targetType === 'tag' || t.targetType === 'product') {
        push(t.targetTitle)
        if (t.keywordAvailable) push(t.primaryKeywordCandidate)
      }
    }
    return out.slice(0, 20)
  } catch { return [] }
}

/**
 * Phase 3H — the site's OWN vocabulary: tokens from every scanned target's
 * title / focus keyword / Hebrew slug, plus explicit extra context (business
 * name, tracked keywords). Used as the relevance gate for keyword research —
 * a Google URL-idea sharing NO token with this set is unrelated to the site.
 * Purely project-derived; empty set when no scan exists (gate then skipped).
 */
async function buildSiteVocabulary(admin: Admin, projectId: string, extras: string[]): Promise<Set<string>> {
  const vocab = new Set<string>()
  // Phase 3H.2 — store prefix-stripped variants too so "לכלבים" ↔ "כלבים" match
  // in the alignment ratio regardless of which side carries the ל/ב/ה prefix.
  const absorb = (s: string | null | undefined) => {
    for (const tk of tokens(s || '')) {
      vocab.add(tk)
      if (tk.length >= 4 && /^[בלמהושכ]/.test(tk)) vocab.add(tk.slice(1))
    }
  }
  try {
    const cacheRow = await getCachedIndex(admin, projectId)
    if (cacheRow) {
      const report = reassembleReport(cacheRow)
      for (const t of (report.targets ?? []) as ScannedTarget[]) {
        absorb(t.targetTitle)
        if (t.keywordAvailable) absorb(t.primaryKeywordCandidate)
        const slug = slugFromUrl(t.targetUrl)
        if (/[֐-׿]/.test(slug)) absorb(slug)
      }
    }
  } catch { /* no scan → vocabulary from extras only */ }
  for (const e of extras) absorb(e)
  return vocab
}

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
    qualityGuidance(langLabel, currentYear()),
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
    qualityGuidance(langLabel, currentYear()),
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
  language: 'he' | 'en' = 'he',
  langLabel = 'Hebrew',
): Promise<{ acc: TopicSuggestion[]; raw: number; dupes: number; attempts: number; reason?: string; funnel?: RefineFunnel }> {
  const year = currentYear()
  // 1) Gather a raw candidate POOL (dedup only — quality/repair happens next), so
  //    the refine pass has surplus to repair/diversify without starving the count.
  const pool: TopicSuggestion[] = []
  const seen = new Set<string>()
  let attempts = 0
  let hadSuccess = false
  let hadError = false
  while (pool.length < target && attempts < MAX_ATTEMPTS) {
    attempts++
    const avoid = [...existingTitles, ...pool.map((a) => a.title)]
    const { items, ok } = await genBatch(avoid)
    if (!ok) { hadError = true; await sleep(300 * attempts); continue }
    hadSuccess = true
    if (items.length === 0) break
    for (const s of items) { const k = s.title.trim().toLowerCase(); if (!k || seen.has(k)) continue; seen.add(k); pool.push(s) }
  }

  // 2) Repair weak-but-groundable titles + ONE bounded refill → keep the count.
  const ctx: RefineCtx = {
    existingTitles, language, year,
    isDuplicate: (t) => corpus.isDuplicate(t) || corpus.isDuplicate(subjectKey(t), 0.72),
  }
  const repair: RepairTitleFn = (c) => geminiRepairTitle(langLabel, year, c)
  const refill: RefillFn = async (_need, avoidSubjects) => {
    const { items, ok } = await genBatch(avoidSubjects)
    return ok ? items : []
  }
  const { selected, funnel } = await refineAndSelect(pool, target, ctx, repair, refill)

  const reason = selected.length > 0
    ? undefined
    : !hadSuccess && hadError ? 'model_error' : pool.length > 0 ? 'all_duplicates' : 'model_empty'
  return { acc: selected, raw: pool.length, dupes: pool.length - selected.length, attempts, reason, funnel }
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

  if (input.source === 'hybrid') {
    // Phase 4C — HYBRID orchestrator. Run every ELIGIBLE provider INDEPENDENTLY
    // (each is the existing single-source path, unchanged, and reuses its own
    // caches — site-scan index, keyword-research cache — since they key by
    // project). Failures are isolated via allSettled; one dead provider never
    // stops the others. Then merge + cluster + rank + attach provenance. The
    // 'keyword' provider is only eligible when a seed keyword was supplied.
    const eligible: RecommendationSource[] = ['site_scan', 'keyword_research_url', 'project_data']
    if ((input.keyword || '').trim()) eligible.unshift('keyword')
    const settled = await Promise.allSettled(
      eligible.map((s) => generateRecommendations(admin, { ...input, source: s })),
    )
    const runs = eligible.map((s, i) => {
      const r = settled[i]
      if (r.status === 'fulfilled') return { source: s, ok: true, reason: r.value.meta.reason, suggestions: r.value.suggestions }
      console.error('[recommendations] hybrid provider failed', { source: s, message: String(r.reason).slice(0, 200) })
      return { source: s, ok: false, reason: 'provider_error', suggestions: [] as TopicSuggestion[] }
    })
    const merged = mergeHybrid(runs)
    // Fold a language-aware "supported by…" summary into the reason so provenance
    // survives persistence; supportingSources drives the badges on the fresh run.
    suggestions = merged.suggestions.map((s) => ({ ...s, suggestionReason: hybridProvenanceReason(s.supportingSources ?? [], language, s.suggestionReason) }))
    const rawGenerated = runs.reduce((n, r) => n + r.suggestions.length, 0)
    const anyOk = runs.some((r) => r.ok)
    meta = {
      source: 'hybrid',
      generated: rawGenerated,
      skippedDuplicates: merged.duplicatesRemoved,
      finalCount: suggestions.length,
      attempts: 1,
      reason: suggestions.length > 0 ? undefined : (!anyOk ? 'model_error' : rawGenerated > 0 ? 'all_duplicates' : 'model_empty'),
      providers: merged.providerStatus,
      debug: process.env.NODE_ENV !== 'production'
        ? { providerStatus: merged.providerStatus, rawCount: merged.rawCount, clusterCount: merged.clusterCount, duplicatesRemoved: merged.duplicatesRemoved }
        : undefined,
    }
  } else if (input.source === 'keyword') {
    const keyword = (input.keyword || '').trim()
    const { acc, raw, dupes, attempts, reason } = await accumulate(
      async (avoid) => {
        const { ideas, ok } = await callGeminiIdeas(keywordSeedPrompt(keyword, langLabel, businessCtx, BATCH_SIZE, avoid))
        return { items: ideas.map((g) => mapIdea(g, 'keyword', 0.7)).filter((x): x is TopicSuggestion => !!x), ok }
      },
      corpus, existingTitles, TARGET_NEW, language, langLabel,
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
      corpus, existingTitles, TARGET_NEW, language, langLabel,
    )
    suggestions = acc
    meta = { source: 'project_data', generated: raw, skippedDuplicates: dupes, finalCount: acc.length, attempts, reason }
  } else if (input.source === 'site_scan') {
    // From the CACHED site scan — content-gap ideas, then dedupe. Never rescans.
    // Phase 3H.4 — pass rotation memory: existing titles + PENDING idea titles/
    // keywords, so a repeat run generates DIFFERENT ideas from unused entities
    // instead of regenerating the first batch and "exhausting" after one click.
    // Phase 3I.5 — the avoid list covers ALL idea statuses (bounded, recent
    // first), not only pending: the model was blind to the rejected/duplicate/
    // approved history, regenerated straight into it, and the exact-keyword
    // guard then (correctly) killed every idea — permanent exhaustion on a
    // long-tested project.
    let pendingAvoid: string[] = []
    try {
      const { data: ideaRows } = await admin
        .from('content_topic_ideas')
        .select('title, primary_keyword')
        .eq('project_id', input.projectId)
        .order('created_at', { ascending: false })
        .limit(120)
      pendingAvoid = ((ideaRows ?? []) as { title: string; primary_keyword: string | null }[])
        .flatMap((r) => [r.title, r.primary_keyword ?? ''])
        .filter(Boolean)
    } catch { /* ideas table optional */ }
    // Phase 3I.7 — RECENT SAVED IDEAS FIRST: the prompt caps the avoid list, so
    // whatever is beyond the cap is invisible to the model. With existingTitles
    // first, a project with many topics/articles pushed the JUST-SAVED ideas
    // past the cap — the second run's prompt was identical to the first run's,
    // the model regenerated the same batch, and everything (correctly) died as
    // primary_keyword_exists despite plenty of unused scan targets. The newest
    // idea rows are exactly what changed between runs, so they lead the list.
    const avoidTitles = Array.from(new Set([...pendingAvoid, ...existingTitles, ...(input.avoidKeywords ?? [])]))
    const res = await recommendFromSiteScan(admin, { projectId: input.projectId, language, langLabel, avoidTitles }, businessCtx)
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
    const trackingSeeds = ((kwSeedRows ?? []) as { keyword: string }[]).map((r) => r.keyword).filter(Boolean)
    // Phase 3F.3.1e — DERIVE extra seed concepts from the site's own taxonomy
    // (category/tag/product target titles + reliable focus keywords) so the raw
    // keyword pool spans the whole catalogue, not just the homepage's terms.
    const scanSeeds = await deriveScanSeedConcepts(admin, input.projectId)
    const seedKeywords = Array.from(new Set([...trackingSeeds, ...scanSeeds].map((s) => s.trim()).filter(Boolean)))
    // Phase 3H — the site's own vocabulary gates Google's associative URL ideas.
    const siteVocab = await buildSiteVocabulary(admin, input.projectId, [project.business_name || '', ...trackingSeeds])
    const res = await recommendFromKeywordResearch(admin, {
      userId: input.userId, projectId: input.projectId, seedUrls, country, language, businessName: project.business_name, category: null,
      seedKeywords, avoid: [...existingTitles, ...(input.avoidKeywords ?? [])], siteVocab,
      // Phase 3H.2 — the site's offering (scan-derived category/product titles)
      // anchors the model's interpretation, wrong-market skipping and rewriting.
      offerContext: scanSeeds,
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
      reason: suggestions.length === 0 ? (res.meta.reason === 'keyword_research_failed' || res.meta.keywordResearchFailed ? 'keyword_research_failed' : res.meta.reason === 'thin_data' ? 'kr_thin' : res.meta.reason === 'unrelated' ? 'kr_unrelated' : res.meta.reason === 'exhausted' ? 'kr_exhausted' : res.meta.reason === 'all_known' ? 'kr_all_known' : res.meta.generated === 0 ? 'no_keyword_data' : 'all_duplicates') : undefined,
      debug: process.env.NODE_ENV !== 'production' ? {
        seedUrlCount: seedUrls.length, seedKeywordCount: seedKeywords.length, trackingSeedCount: trackingSeeds.length, scanSeedCount: scanSeeds.length,
        rawKeywords: res.meta.rawKeywords, afterBasicFilter: res.meta.afterBasicFilter, afterNoiseFilter: res.meta.afterNoiseFilter,
        filteredGenericCount: res.meta.filteredGenericCount, filteredUnrelatedCount: res.meta.filteredUnrelatedCount, filteredUnrelatedExamples: res.meta.filteredUnrelatedExamples,
        skippedByModelCount: res.meta.skippedByModelCount, skippedByModelExamples: res.meta.skippedByModelExamples,
        candidateCount: res.meta.candidateCount, batchSent: res.meta.batchSent, unusedRemaining: res.meta.unusedRemaining,
        skippedKnownCount: res.meta.skippedKnownCount, skippedKnownExamples: res.meta.skippedKnownExamples,
        modelTopics: res.meta.generated, afterCorpusDedupe: suggestions.length,
      } : undefined,
    }
  }

  // 4b) Phase 3H — FINAL topic-quality gate for EVERY source (model output
  // included): single-word titles/keywords and commercial/navigation vocabulary
  // ("sale", "כלבים", "קטגוריה", …) are never article-worthy topics. Counted in
  // debug so a heavy filter is visible, never silent.
  {
    const before = suggestions.length
    const qualityExamples: { title: string; issue: string }[] = []
    suggestions = suggestions.filter((s) => {
      const issue = topicQualityIssue(s.title, s.primaryKeyword)
      if (issue) { if (qualityExamples.length < 10) qualityExamples.push({ title: s.title, issue }); return false }
      return true
    })
    if (before !== suggestions.length) {
      meta.finalCount = suggestions.length
      // Phase 3I.3 — production-safe funnel counter (no content, count only).
      meta.qualityFilteredCount = before - suggestions.length
      // Phase 3H.1 — an honest empty reason: when the quality gate removed EVERY
      // candidate, the UI must say that (never "already saved/approved/rejected").
      if (suggestions.length === 0 && before > 0) meta.reason = 'all_quality_filtered'
      if (process.env.NODE_ENV !== 'production') meta.debug = { ...(meta.debug ?? {}), qualityFilteredCount: before - suggestions.length, qualityFilteredExamples: qualityExamples }
    }
  }

  // 5) Enrich internal links + cap + sort. Prefer the SAME planner used by the
  // post-approval drawer (consistent suggestions); fall back to the lightweight
  // keyword-overlap heuristic only when the planner finds nothing / is off.
  let planTargets: ScannedTarget[] = []
  let planHosts: string[] = []
  let indexStale = false
  if (isInternalLinkPlanningEnabled()) {
    try {
      const cacheRow = await getCachedIndex(admin, input.projectId)
      if (cacheRow) { const rep = reassembleReport(cacheRow); planTargets = (rep.targets ?? []) as ScannedTarget[]; planHosts = rep.hosts ?? []; indexStale = isStale(cacheRow) || isVersionStale(cacheRow) }
    } catch { /* no scan cache → heuristic fallback */ }
  }
  const devDebug = process.env.NODE_ENV !== 'production'
  const enriched = suggestions
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => {
      if (s.suggestedInternalLinks.length) return s
      // Phase 3F.3.6 — resolve the MONEY TARGET first (best commercial destination),
      // then supporting links, using the same planner the drawer uses. The card
      // shows the money target first under "Primary commercial link".
      const structured = planTargets.length
        ? previewStructuredLinks({ id: 'preview', title: s.title, primaryKeyword: s.primaryKeyword, secondaryKeywords: s.secondaryKeywords }, planTargets, planHosts, 4, devDebug)
        : { moneyTarget: null, supportingLinks: [] as { url: string; anchor: string; title: string }[], moneyTargetMatchType: 'no_match', reason: 'stale_index' as const }
      const ordered = [...(structured.moneyTarget ? [structured.moneyTarget] : []), ...structured.supportingLinks].map(({ url, anchor }) => ({ url, anchor }))
      if (ordered.length) {
        return { ...s, suggestedInternalLinks: ordered, moneyTargetUrl: structured.moneyTarget?.url ?? null, moneyTargetMatchType: structured.moneyTargetMatchType }
      }
      // Heuristic fallback (keyword-overlap) before declaring "no links".
      const fallback = attachInternalLinks(s.primaryKeyword, linkCandidates)
      if (fallback.length) return { ...s, suggestedInternalLinks: fallback, moneyTargetUrl: null }
      return { ...s, suggestedInternalLinks: [], moneyTargetUrl: null, linkPreviewReason: indexStale ? 'stale_index' : (structured.reason ?? (planTargets.length ? 'valid_no_match' : 'stale_index')) }
    })
  enriched.sort((a, b) => b.suggestionScore - a.suggestionScore)

  // Phase 3F.3.4 — link-target diagnostics (dev only): how many category / product
  // targets the planner had to work with (QA can see if ecommerce hubs exist).
  if (process.env.NODE_ENV !== 'production' && meta.debug) {
    const byType: Record<string, number> = { category: 0, product: 0, post: 0, page: 0, tag: 0, unknown: 0 }
    for (const t of planTargets) byType[t.targetType] = (byType[t.targetType] ?? 0) + 1
    meta.debug = { ...meta.debug, linkTargetTypes: byType, eligibleLinkTargets: planTargets.filter((t) => t.eligibility === 'yes').length, productCategoryTargetCount: byType.category, productTargetCount: byType.product }
  }

  return { suggestions: enriched, meta }
}

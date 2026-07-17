/**
 * Production evidence-cluster builder (A/B/C) — PURE, domain-neutral.
 *
 * Builds ONE project-scoped set of cross-source EvidenceClusters BEFORE any model
 * generation, so generation is opportunity-first (clusters) instead of source-first
 * (per-source prompts). A single cluster combines evidence from multiple sources
 * (keyword research + project priority + existing entity + coverage gap), is ranked
 * by demand/relevance/coverage-gap/source-diversity, and never creates one cluster
 * per product. No hardcoded industry words.
 */

import { tokens } from './dedupe'
import { normalizePhrase } from './keyword-guard'

export type EvidenceSourceKind = 'keyword_research' | 'project_data' | 'site_scan' | 'existing_content' | 'pending'
export type EntityPageType = 'product' | 'category' | 'service' | 'page' | 'post' | 'article' | 'unknown'

export interface KeywordResearchNode { query: string; volume?: number | null }
export interface EntityNode { name: string; url?: string | null; type?: EntityPageType }
export interface CoverageNode { title: string; kind: 'article' | 'topic' | 'pending' }

export interface EvidenceInput {
  keywordResearch: KeywordResearchNode[]
  trackedKeywords: string[]
  projectFocus: string[]
  entities: EntityNode[]
  existingCoverage: CoverageNode[]
}

export interface EvidenceCluster {
  cluster_id: string
  canonical_topic: string
  theme_tokens: string[]
  keyword_research_queries: KeywordResearchNode[]
  tracked_keywords: string[]
  project_focus: string[]
  commercial_entities: EntityNode[]
  existing_coverage: CoverageNode[]
  /** true when demand/entities exist but NO existing informational article covers it. */
  missing_coverage: boolean
  demand_volume: number
  source_composition: EvidenceSourceKind[]
  project_relevance: number
  confidence: number
  score: number
  /** UI label reflecting the DOMINANT evidence, not a generation quota. */
  source_label: 'keyword_research' | 'project_data' | 'site_scan' | 'combined'
  /** Recovery-tier band this cluster qualifies for. 'high' = Tier 1 (proven demand
   *  or multi-source with project relevance); 'medium' = Tier 2 (weaker but still
   *  project-relevant, e.g. zero/unknown volume or a single dominant source). */
  tier_class: 'high' | 'medium'
}

const STOP = new Set<string>(
  ['the', 'a', 'an', 'of', 'for', 'and', 'or', 'with', 'in', 'to', 'best', 'guide', 'price', 'buy', 'online',
   'של', 'עם', 'את', 'על', 'לפי', 'או', 'ל', 'ב', 'ה', 'ו', 'איך', 'מה', 'למה', 'כיצד'].map((t) => normalizePhrase(t)).filter(Boolean),
)

// Hebrew single-letter proclitics that attach to a following word (ו/ה/ב/ל/מ/ש/כ).
// "לחתונה" and "חתונה" are the SAME theme but tokenize differently; without stripping
// them, Hebrew evidence from different sources never joins into one cluster. We EMIT
// BOTH the surface token and its de-prefixed base (never replace), so joining is only
// ever ADDED — genuinely different words keep their own surface token and never merge.
const HE = /[א-ת]/
const HE_PREFIXES = new Set(['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ'])
/** Surface token → [surface, deprefixed-base?] (base only when it is a safe Hebrew
 *  proclitic strip leaving a real word: all-Hebrew, remaining length >= 3). */
function expandHebrew(tok: string): string[] {
  if (tok.length >= 4 && HE.test(tok[0]) && HE_PREFIXES.has(tok[0])) {
    const base = tok.slice(1)
    if (base.length >= 3 && Array.from(base).every((c) => HE.test(c))) return [tok, base]
  }
  return [tok]
}
/** Hebrew-aware content tokens (proclitic-expanded, stop-word filtered, de-duped).
 *  Shared with the internal-link role mapper so joining and link-matching use the
 *  SAME tokenization — a mismatch here is what made relevant Hebrew targets look
 *  unrelated. Exported (do not rename). */
export function contentTokens(s: string): string[] {
  const out: string[] = []
  for (const t of Array.from(tokens(normalizePhrase(s || ''))).filter((t) => t.length > 1 && !STOP.has(t))) {
    for (const e of expandHebrew(t)) if (!STOP.has(e)) out.push(e)
  }
  return Array.from(new Set(out))
}
const contentToks = contentTokens

/**
 * Build cross-source clusters keyed by a shared theme token. Every evidence node
 * (keyword-research query, tracked keyword, entity, project focus, coverage) is
 * bucketed by its content tokens; a token shared by >= 2 nodes ACROSS the corpus is
 * a theme. Each theme yields one cluster that pulls in every node containing it — so
 * a cluster naturally combines keyword research + a category entity + a coverage gap.
 */
export function buildEvidenceClusters(input: EvidenceInput): EvidenceCluster[] {
  return buildEvidenceClustersWithDiag(input).clusters
}

export interface ClusterBuildDiag {
  clusters: EvidenceCluster[]
  /** Distinct shared-token themes that did NOT become a cluster (all nodes already
   *  consumed by a stronger theme, or entities-only with no demand/project signal). */
  rejected_themes: number
  /** Themes dropped specifically because they carried entities but no demand/project
   *  signal (would have been one-article-per-entity). */
  entity_only_rejected: number
}

/** Build clusters AND return why themes were rejected (Part B funnel evidence). */
export function buildEvidenceClustersWithDiag(input: EvidenceInput): ClusterBuildDiag {
  type Node = { text: string; kind: EvidenceSourceKind; toks: string[]; kr?: KeywordResearchNode; ent?: EntityNode; cov?: CoverageNode }
  const nodes: Node[] = []
  for (const k of input.keywordResearch) if (k.query?.trim()) nodes.push({ text: k.query, kind: 'keyword_research', toks: contentToks(k.query), kr: k })
  for (const t of input.trackedKeywords) if (t?.trim()) nodes.push({ text: t, kind: 'project_data', toks: contentToks(t) })
  for (const f of input.projectFocus) if (f?.trim()) nodes.push({ text: f, kind: 'project_data', toks: contentToks(f) })
  for (const e of input.entities) if (e.name?.trim()) nodes.push({ text: e.name, kind: 'site_scan', toks: contentToks(e.name), ent: e })
  for (const c of input.existingCoverage) if (c.title?.trim()) nodes.push({ text: c.title, kind: c.kind === 'pending' ? 'pending' : 'existing_content', toks: contentToks(c.title), cov: c })

  const tokenNodes = new Map<string, number[]>()
  nodes.forEach((n, i) => { for (const t of new Set(n.toks)) { const a = tokenNodes.get(t) ?? []; a.push(i); tokenNodes.set(t, a) } })
  const themes = Array.from(tokenNodes.entries())
    .filter(([, idxs]) => idxs.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))

  const used = new Set<number>()
  const clusters: EvidenceCluster[] = []
  let rejected_themes = 0
  let entity_only_rejected = 0
  let n = 0
  for (const [token, idxs] of themes) {
    const free = idxs.filter((i) => !used.has(i))
    if (free.length < 2) { rejected_themes++; continue }
    const members = free.map((i) => nodes[i])
    // A cluster must carry a real demand OR project signal — not entities alone (that
    // would be one-article-per-product). This holds across ALL recovery tiers.
    const hasDemandOrProject = members.some((m) => m.kind === 'keyword_research' || m.kind === 'project_data')
    if (!hasDemandOrProject) { rejected_themes++; entity_only_rejected++; continue }
    free.forEach((i) => used.add(i))
    n++
    const kr = members.filter((m) => m.kr).map((m) => m.kr!) as KeywordResearchNode[]
    const tracked = members.filter((m) => m.kind === 'project_data' && !m.ent).map((m) => m.text)
    const entities = members.filter((m) => m.ent).map((m) => m.ent!) as EntityNode[]
    const coverage = members.filter((m) => m.cov).map((m) => m.cov!) as CoverageNode[]
    const comp = Array.from(new Set(members.map((m) => m.kind)))
    const demand = kr.reduce((s, q) => s + (q.volume ?? 0), 0)
    const missing = (kr.length > 0 || entities.length > 0) && !coverage.some((c) => c.kind === 'article')
    const projectRelevance = Math.min(1, (tracked.length + input.projectFocus.filter((f) => contentToks(f).includes(token)).length) * 0.34 + (entities.length ? 0.2 : 0))
    const confidence = kr.some((q) => (q.volume ?? 0) > 0) ? 0.9 : kr.length ? 0.6 : entities.length ? 0.5 : 0.4
    const dominant = comp.includes('keyword_research') ? 'keyword_research' : comp.includes('site_scan') && comp.includes('project_data') ? 'combined' : comp.includes('site_scan') ? 'site_scan' : 'project_data'
    const source_label = comp.length >= 3 || (comp.includes('keyword_research') && (comp.includes('site_scan') || comp.includes('project_data'))) ? 'combined' : (dominant as EvidenceCluster['source_label'])
    const score = Number((
      Math.min(1, Math.log10(1 + demand) / 4) * 0.4 +   // demand
      projectRelevance * 0.25 +                          // relevance
      (missing ? 0.2 : 0) +                              // coverage gap
      Math.min(1, comp.length / 3) * 0.15                // source diversity
    ).toFixed(4))
    // Tier band: proven demand OR a multi-source cluster with real project relevance
    // is Tier-1 'high'; everything else (zero/unknown volume, single dominant source)
    // is Tier-2 'medium'. Never entities-only (rejected above).
    const tier_class: EvidenceCluster['tier_class'] = (demand > 0 || (comp.length >= 2 && projectRelevance >= 0.34)) ? 'high' : 'medium'
    clusters.push({
      cluster_id: `c${n}`, canonical_topic: token, theme_tokens: [token],
      keyword_research_queries: kr, tracked_keywords: tracked, project_focus: input.projectFocus.filter((f) => contentToks(f).includes(token)),
      commercial_entities: entities, existing_coverage: coverage, missing_coverage: missing,
      demand_volume: demand, source_composition: comp, project_relevance: Number(projectRelevance.toFixed(2)),
      confidence, score, source_label, tier_class,
    })
  }
  return { clusters, rejected_themes, entity_only_rejected }
}

/** Clusters eligible for a recovery tier. Tier 1 uses only 'high' bands; Tier 2
 *  broadens to include the 'medium' bands too (still project-relevant, never
 *  entities-only). Tier 3 (discovery) does not use clusters — it synthesizes from
 *  the combined evidence directly. */
export function clustersForTier(clusters: EvidenceCluster[], tier: 1 | 2): EvidenceCluster[] {
  return tier === 1 ? clusters.filter((c) => c.tier_class === 'high') : clusters.slice()
}

/** Rank clusters strongest-first (score desc, then demand, stable by id). */
export function rankClusters(clusters: EvidenceCluster[]): EvidenceCluster[] {
  return clusters.slice().sort((a, b) => b.score - a.score || b.demand_volume - a.demand_volume || (a.cluster_id < b.cluster_id ? -1 : 1))
}

/** Select the strongest clusters to send to the model, bounded by the budget. */
export function selectClustersWithinBudget(ranked: EvidenceCluster[], maxClusters: number): EvidenceCluster[] {
  return ranked.slice(0, Math.max(0, maxClusters))
}

/**
 * Flatten the REAL keyword_research_cache shape (each row's `results_json` is a
 * Google-Ads `KeywordIdeaResult[]` = `{ keyword, avgMonthlySearches }[]`) into demand
 * nodes. Never fabricates volume — a missing/absent value stays null. Domain-neutral
 * + pure so the exact production parse is offline-testable (Part I).
 */
export function flattenKeywordResearchCache(rows: { results_json: unknown }[]): KeywordResearchNode[] {
  return flattenKeywordResearchCacheDetailed(rows).nodes
}

export interface KeywordResearchIngestion {
  nodes: KeywordResearchNode[]
  rows_loaded: number
  rows_parsed: number
  rows_skipped: number
  items_parsed: number
  items_skipped: number
  /** Top-level keys of unparsed rows/items (diagnosis of unknown formats). */
  skipped_example_keys: string[]
}

/**
 * TOLERANT flatten with EXACT ingestion accounting (live defect: a silently
 * unparsed format reads as "no keyword research exists"). Accepts:
 *  - results_json as KeywordIdeaResult[]  ({keyword, avgMonthlySearches})
 *  - results_json as {results: [...]} / {keywords: [...]} wrappers
 *  - item field aliases: keyword|query|text · avgMonthlySearches|
 *    avg_monthly_searches|monthlySearches|volume
 * Unknown shapes are COUNTED with example keys, never silently dropped.
 */
export function flattenKeywordResearchCacheDetailed(rows: { results_json: unknown }[]): KeywordResearchIngestion {
  const out: KeywordResearchNode[] = []
  let rowsParsed = 0, rowsSkipped = 0, itemsParsed = 0, itemsSkipped = 0
  const exampleKeys: string[] = []
  const noteKeys = (o: unknown) => {
    if (exampleKeys.length >= 5) return
    if (o && typeof o === 'object') exampleKeys.push(Object.keys(o as object).slice(0, 6).join(','))
    else exampleKeys.push(typeof o)
  }
  for (const row of rows) {
    const rj = row?.results_json
    const arr: unknown[] | null = Array.isArray(rj)
      ? rj
      : rj && typeof rj === 'object' && Array.isArray((rj as { results?: unknown }).results)
        ? (rj as { results: unknown[] }).results
        : rj && typeof rj === 'object' && Array.isArray((rj as { keywords?: unknown }).keywords)
          ? (rj as { keywords: unknown[] }).keywords
          : null
    if (!arr) { rowsSkipped++; noteKeys(rj); continue }
    rowsParsed++
    for (const item of arr) {
      const o = (item ?? {}) as Record<string, unknown>
      const query = [o.keyword, o.query, o.text].find((v): v is string => typeof v === 'string' && !!v.trim())
      if (!query) { itemsSkipped++; noteKeys(item); continue }
      const volRaw = [o.avgMonthlySearches, o.avg_monthly_searches, o.monthlySearches, o.volume].find((v) => typeof v === 'number')
      out.push({ query, volume: typeof volRaw === 'number' ? volRaw : null })
      itemsParsed++
    }
  }
  return { nodes: out, rows_loaded: rows.length, rows_parsed: rowsParsed, rows_skipped: rowsSkipped, items_parsed: itemsParsed, items_skipped: itemsSkipped, skipped_example_keys: exampleKeys }
}

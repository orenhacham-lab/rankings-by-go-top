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
}

const STOP = new Set<string>(
  ['the', 'a', 'an', 'of', 'for', 'and', 'or', 'with', 'in', 'to', 'best', 'guide', 'price', 'buy', 'online',
   'של', 'עם', 'את', 'על', 'לפי', 'או', 'ל', 'ב', 'ה', 'ו', 'איך', 'מה', 'למה', 'כיצד'].map((t) => normalizePhrase(t)).filter(Boolean),
)
const contentToks = (s: string): string[] => Array.from(tokens(normalizePhrase(s || ''))).filter((t) => t.length > 1 && !STOP.has(t))

/**
 * Build cross-source clusters keyed by a shared theme token. Every evidence node
 * (keyword-research query, tracked keyword, entity, project focus, coverage) is
 * bucketed by its content tokens; a token shared by >= 2 nodes ACROSS the corpus is
 * a theme. Each theme yields one cluster that pulls in every node containing it — so
 * a cluster naturally combines keyword research + a category entity + a coverage gap.
 */
export function buildEvidenceClusters(input: EvidenceInput): EvidenceCluster[] {
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
  let n = 0
  for (const [token, idxs] of themes) {
    const free = idxs.filter((i) => !used.has(i))
    if (free.length < 2) continue
    const members = free.map((i) => nodes[i])
    // A cluster must carry a real demand OR project signal — not entities alone.
    const hasDemandOrProject = members.some((m) => m.kind === 'keyword_research' || m.kind === 'project_data')
    if (!hasDemandOrProject) continue
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
    clusters.push({
      cluster_id: `c${n}`, canonical_topic: token, theme_tokens: [token],
      keyword_research_queries: kr, tracked_keywords: tracked, project_focus: input.projectFocus.filter((f) => contentToks(f).includes(token)),
      commercial_entities: entities, existing_coverage: coverage, missing_coverage: missing,
      demand_volume: demand, source_composition: comp, project_relevance: Number(projectRelevance.toFixed(2)),
      confidence, score, source_label,
    })
  }
  return clusters
}

/** Rank clusters strongest-first (score desc, then demand, stable by id). */
export function rankClusters(clusters: EvidenceCluster[]): EvidenceCluster[] {
  return clusters.slice().sort((a, b) => b.score - a.score || b.demand_volume - a.demand_volume || (a.cluster_id < b.cluster_id ? -1 : 1))
}

/** Select the strongest clusters to send to the model, bounded by the budget. */
export function selectClustersWithinBudget(ranked: EvidenceCluster[], maxClusters: number): EvidenceCluster[] {
  return ranked.slice(0, Math.max(0, maxClusters))
}

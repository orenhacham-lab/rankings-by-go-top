/**
 * Phase 4C — Hybrid topic engine: merge + cluster + rank + provenance.
 *
 * PURE, deterministic, source-order-INDEPENDENT. Given the outputs of the
 * existing providers (each already emitting the common TopicSuggestion
 * contract), it:
 *   - flattens all suggestions,
 *   - clusters equivalent ideas (exact keyword, normalized title, token-jaccard
 *     near-dup, and — when a semanticKey backend is injected — cross-lingual /
 *     paraphrase equivalence),
 *   - collapses each cluster to ONE topic with multi-source provenance,
 *   - ranks by a weighted signal blend where RELEVANCE dominates and
 *     multi-source agreement is a secondary boost (3 sources beats 1 only when
 *     relevance is equal).
 *
 * The four providers are never modified — the hybrid branch of the engine calls
 * them unchanged and feeds their results here.
 */

import type { RecommendationSource, TopicSuggestion } from './types'
import { tokens, jaccard, slugKey } from './dedupe'
import { normalizeText } from './topic-idea-store'
import { normalizePhrase } from './keyword-guard'

export interface ProviderRun {
  source: RecommendationSource
  ok: boolean
  reason?: string
  suggestions: TopicSuggestion[]
}

export interface ProviderStatus { source: RecommendationSource; ok: boolean; count: number; reason?: string }

export interface HybridMergeResult {
  suggestions: TopicSuggestion[]
  providerStatus: ProviderStatus[]
  rawCount: number
  duplicatesRemoved: number
  clusterCount: number
}

export interface MergeOpts {
  /** token-jaccard near-dup threshold (default 0.6). */
  threshold?: number
  /** Optional semantic/cross-lingual key: suggestions sharing a non-empty key
   *  are clustered even with zero token overlap (e.g. "washing machine" ↔
   *  "מכונת כביסה"). Injected so the merge stays deterministic + testable; the
   *  production backend (embeddings / model) plugs in here without touching the
   *  merge. Undefined ⇒ deterministic same-language dedup only. */
  semanticKey?: (s: TopicSuggestion) => string | null
}

// Evidence-grounded sources carry a slightly higher base confidence; this is a
// TIE-BREAK-scale nudge, never enough to override relevance.
const SOURCE_CONFIDENCE: Record<string, number> = {
  site_scan: 0.90, keyword_research_url: 0.85, keyword: 0.72, project_data: 0.62, hybrid: 0.70,
}
const INTENT_WEIGHT: Record<string, number> = {
  transactional: 1.0, commercial: 0.92, comparison: 0.86, local: 0.8, informational: 0.72, other: 0.62,
}

interface Flat { s: TopicSuggestion; source: RecommendationSource; kw: string; title: string; tok: Set<string> }

/** Deterministic weighted rank. Relevance dominates (0.5); multi-source
 *  agreement is a bounded secondary boost (0.18) so equal-relevance ties favour
 *  more sources without letting source count override a clearly better idea. */
export function hybridRankScore(relevance: number, intent: string, sourceCount: number, srcConfidence: number): number {
  const intentW = INTENT_WEIGHT[(intent || 'other').toLowerCase()] ?? 0.62
  const agreement = Math.min(1, sourceCount / 3)
  return Number((0.5 * relevance + 0.2 * intentW + 0.18 * agreement + 0.12 * srcConfidence).toFixed(4))
}

/** Human, language-aware provenance summary folded into suggestionReason so it
 *  survives persistence (badges from supportingSources are added on the fresh run). */
export function hybridProvenanceReason(sources: RecommendationSource[], language: 'he' | 'en', repReason: string): string {
  const he = language === 'he'
  const label: Record<string, string> = he
    ? { site_scan: 'סריקת אתר', keyword_research_url: 'מחקר מילות מפתח', project_data: 'נתוני הפרויקט', keyword: 'מילת מפתח', hybrid: 'משולב' }
    : { site_scan: 'Site scan', keyword_research_url: 'Keyword research', project_data: 'Project data', keyword: 'Keyword', hybrid: 'Hybrid' }
  const names = sources.map((s) => label[s] ?? s)
  const prefix = sources.length > 1
    ? (he ? `נתמך על ידי ${sources.length} מקורות: ${names.join(', ')}` : `Supported by ${sources.length} sources: ${names.join(', ')}`)
    : (he ? `נתמך על ידי: ${names[0] ?? ''}` : `Supported only by: ${names[0] ?? ''}`)
  const base = (repReason || '').trim()
  return base ? `${prefix} · ${base}` : prefix
}

/** Merge many providers' suggestions into one ranked, deduped, provenance-rich set. */
export function mergeHybrid(runs: ProviderRun[], opts: MergeOpts = {}): HybridMergeResult {
  const threshold = opts.threshold ?? 0.6
  const providerStatus: ProviderStatus[] = runs.map((r) => ({ source: r.source, ok: r.ok, count: r.suggestions.length, reason: r.reason }))

  const flat: Flat[] = []
  for (const r of runs) {
    for (const s of r.suggestions) {
      flat.push({ s, source: r.source, kw: normalizeText(s.primaryKeyword), title: normalizePhrase(s.title), tok: tokens(`${s.title} ${s.primaryKeyword}`) })
    }
  }
  const rawCount = flat.length

  // Union-find. Grouping is symmetric, so the final clusters are independent of
  // provider order and of iteration order.
  const parent = flat.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
  const unionByKey = (keyFn: (f: Flat) => string | null) => {
    const first = new Map<string, number>()
    flat.forEach((f, i) => { const k = keyFn(f); if (!k) return; const p = first.get(k); if (p !== undefined) union(p, i); else first.set(k, i) })
  }
  unionByKey((f) => f.kw || null)                       // exact normalized keyword
  unionByKey((f) => f.title || null)                    // normalized title phrase
  if (opts.semanticKey) unionByKey((f) => opts.semanticKey!(f.s)) // semantic / cross-lingual
  for (let i = 0; i < flat.length; i++) {               // token-jaccard near-dup
    for (let j = i + 1; j < flat.length; j++) {
      if (find(i) === find(j)) continue
      if (flat[i].tok.size && flat[j].tok.size && jaccard(flat[i].tok, flat[j].tok) >= threshold) union(i, j)
    }
  }

  const clusters = new Map<number, number[]>()
  flat.forEach((_, i) => { const root = find(i); const arr = clusters.get(root); if (arr) arr.push(i); else clusters.set(root, [i]) })

  const out: TopicSuggestion[] = []
  for (const idxs of clusters.values()) {
    const members = idxs.map((i) => flat[i])
    // Representative: highest score, tie-break by slugKey → deterministic.
    const rep = members.slice().sort((a, b) => (b.s.suggestionScore - a.s.suggestionScore) || slugKey(a.s.title).localeCompare(slugKey(b.s.title)))[0].s
    const supporting = Array.from(new Set(members.map((m) => m.source))).sort()
    const seenSrc = new Set<string>()
    const sourceEvidence = members
      .filter((m) => { if (seenSrc.has(m.source)) return false; seenSrc.add(m.source); return true })
      .map((m) => ({ source: m.source, reason: (m.s.suggestionReason || '').trim() }))
    const relevance = Math.max(...members.map((m) => m.s.suggestionScore))
    const srcConf = supporting.reduce((sum, s) => sum + (SOURCE_CONFIDENCE[s] ?? 0.6), 0) / supporting.length
    out.push({
      ...rep,
      source: 'hybrid',
      suggestionScore: hybridRankScore(relevance, rep.searchIntent, supporting.length, srcConf),
      supportingSources: supporting,
      sourceEvidence,
    })
  }

  // Deterministic order: rank desc → more sources → slugKey asc.
  out.sort((a, b) =>
    (b.suggestionScore - a.suggestionScore) ||
    ((b.supportingSources?.length ?? 1) - (a.supportingSources?.length ?? 1)) ||
    slugKey(a.title).localeCompare(slugKey(b.title)))

  return { suggestions: out, providerStatus, rawCount, duplicatesRemoved: rawCount - out.length, clusterCount: out.length }
}

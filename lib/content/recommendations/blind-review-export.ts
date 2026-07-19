/**
 * BLIND QUALITY-REVIEW EXPORT (Stage B, Increment 5) — QA/admin-only.
 *
 * Turns a set of finalized attempts (e.g. the Flash and Pro batches from the smart-run
 * harness) into a review payload a human can score WITHOUT knowing which model produced
 * which batch. The export carries ONLY review-relevant content, projected field by field
 * (never spread), so model-identifying telemetry — modelUsed, requestedTier,
 * improvedWithPro, model config/path — can never ride along. Batches are given anonymous
 * content-independent ids and deterministically shuffled (seeded), so neither the id nor
 * the position reveals the model. The id→model mapping is returned SEPARATELY, so the
 * blind export and the un-blinding key are never the same object.
 *
 * `scanBlindExportForLeakage` is the programmatic guarantee: it walks every string in the
 * export against a model-identity denylist and fails if anything leaks. Stage C runs it
 * before a reviewer ever sees the batches.
 *
 * Decision-only / non-persisting: nothing here generates, ranks, validates, or stores.
 */
import type { TopicSuggestion } from './types'

/** The review-safe projection of one suggestion — reviewer-relevant content only. No
 *  model id, tier, improved flag, score provenance, or diagnostics. */
export interface ReviewSuggestion {
  title: string
  primaryKeyword: string
  secondaryKeywords: string[]
  searchIntent: string
  recommendedPageType: string | null
  suggestionReason: string
  internalLinks: { url: string; anchor: string }[]
}

export interface BlindBatch { batchId: string; suggestions: ReviewSuggestion[] }
/** The reviewer-facing payload — contains NO model-identifying information anywhere. */
export interface BlindReviewExport { batches: BlindBatch[]; suggestionsPerBatch: number[] }
/** The SEPARATE un-blinding key (never merged into the export). May be enriched by the
 *  report layer with internal integrity fields (attempt id, finalized count, per-
 *  suggestion fingerprints) used to verify blind ⇄ finalized correspondence. */
export type BlindReviewMapping = Record<string, {
  role: 'flash' | 'pro'; model: string | null; attemptIndex: number
  attemptId?: string; finalizedCount?: number; finalizedFingerprints?: string[]
}>
export interface BlindReviewBundle { export: BlindReviewExport; mapping: BlindReviewMapping }

export interface AttemptForReview {
  role: 'flash' | 'pro'
  model: string | null
  attemptIndex: number
  suggestions: TopicSuggestion[]
}

function projectSuggestion(s: TopicSuggestion): ReviewSuggestion {
  return {
    title: s.title,
    primaryKeyword: s.primaryKeyword,
    secondaryKeywords: [...(s.secondaryKeywords ?? [])],
    searchIntent: s.searchIntent,
    recommendedPageType: s.recommendedPageType ?? null,
    suggestionReason: s.suggestionReason,
    internalLinks: (s.suggestedInternalLinks ?? []).map((l) => ({ url: l.url, anchor: l.anchor })),
  }
}

// Deterministic, model-independent helpers (seeded — no Math.random, so the export is
// reproducible and testable).
function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/**
 * Build the blind export + the separate un-blinding mapping. Batch order is a seeded
 * shuffle (position never reveals the model); batch ids are content-independent
 * (derived from seed+position only), so two identical batches still get distinct ids.
 */
export function buildBlindReview(attempts: AttemptForReview[], seed: number): BlindReviewBundle {
  // Seeded Fisher–Yates over a COPY, so the source order (e.g. flash-then-pro) is lost.
  const order = attempts.map((_, i) => i)
  const rnd = mulberry32(seed ^ 0x9e3779b9)
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }

  const batches: BlindBatch[] = []
  const mapping: BlindReviewMapping = {}
  order.forEach((srcIdx, position) => {
    const a = attempts[srcIdx]
    // id from seed+position ONLY — independent of content and of role/model.
    const batchId = `batch_${fnv1a(`${seed}:${position}`).toString(36)}`
    batches.push({ batchId, suggestions: a.suggestions.map(projectSuggestion) })
    mapping[batchId] = { role: a.role, model: a.model, attemptIndex: a.attemptIndex }
  })
  return { export: { batches, suggestionsPerBatch: batches.map((b) => b.suggestions.length) }, mapping }
}

/** Model-identity tokens the blind export must never contain. Latin/whole-word matched
 *  so Hebrew content and project URLs (e.g. "/product/…" contains "pro") don't false-hit. */
export const MODEL_IDENTITY_PATTERNS: RegExp[] = [
  /gemini/i, /\bflash\b/i, /\bpro\b/i, /\bcurator\b/i,
  /claude/i, /\bopus\b/i, /\bsonnet\b/i, /\bhaiku\b/i,
  /\bgpt\b/i, /openai/i, /anthropic/i,
  /\bstandard\b/i, /\bpremium\b/i, /\bmodelUsed\b/, /\brequestedTier\b/, /\bimprovedWithPro\b/,
  /gemini-\d/i, /\b2\.5\b/,
]

export interface LeakageHit { batchId: string; path: string; token: string; value: string }
export interface LeakageScan { clean: boolean; hits: LeakageHit[] }

/** Walk every string in the export and flag any model-identity token. This is the
 *  programmatic proof the export is blind — run it before any human sees the batches. */
export function scanBlindExportForLeakage(exp: BlindReviewExport, extraPatterns: RegExp[] = []): LeakageScan {
  const patterns = [...MODEL_IDENTITY_PATTERNS, ...extraPatterns]
  const hits: LeakageHit[] = []
  // `aggressive` also treats _ and - as token boundaries — used ONLY for the batchId,
  // which we fully control (a hand-set "batch_pro_winner" must be caught). Content
  // strings stay raw so real project URLs ("/product/x") don't false-hit \bpro\b.
  const scanString = (batchId: string, path: string, value: string, aggressive = false) => {
    const targets = aggressive ? [value, value.replace(/[_-]+/g, ' ')] : [value]
    for (const p of patterns) for (const t of targets) { const m = p.exec(t); if (m) { hits.push({ batchId, path, token: m[0], value }); break } }
  }
  const walk = (batchId: string, path: string, v: unknown) => {
    if (typeof v === 'string') { scanString(batchId, path, v); return }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(batchId, `${path}[${i}]`, x)); return }
    if (v && typeof v === 'object') { for (const [k, val] of Object.entries(v)) walk(batchId, `${path}.${k}`, val); return }
  }
  for (const b of exp.batches) {
    // The batchId itself must also be non-identifying (controlled → scanned aggressively).
    scanString(b.batchId, 'batchId', b.batchId, true)
    b.suggestions.forEach((s, i) => walk(b.batchId, `suggestions[${i}]`, s))
  }
  return { clean: hits.length === 0, hits }
}

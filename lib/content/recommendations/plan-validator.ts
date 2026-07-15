/**
 * Batched final validator (P0 A) — the ONE (or two) validator model call per plan.
 * Input is ONLY deterministic survivors as compact structured evidence (no raw site
 * dump), in batches of ~20-30. Output is a per-candidate accept/reject/repair decision
 * with typed reason + repaired fields + confidence. This module builds the prompt and
 * defensively parses the response; the orchestrator applies the decisions and RE-RUNS
 * every deterministic gate on a repair (a validator can never revive a hard-rejected
 * candidate or override a hard gate).
 */

import type { TopicSuggestion } from './types'

export const VALIDATOR_BATCH_SIZE = 25

export type ValidatorDecision = 'accept' | 'reject' | 'repair'
export interface ValidatorVerdict {
  candidate_id: string
  decision: ValidatorDecision
  typed_reason: string
  repaired_title?: string
  repaired_primary_keyword?: string
  repaired_secondary_keywords?: string[]
  repaired_reason?: string
  confidence: number
}

/** Compact per-candidate evidence for the validator — no raw site content. */
function candidatePayload(s: TopicSuggestion) {
  return {
    id: s.id,
    title: s.title,
    primaryKeyword: s.primaryKeyword,
    secondaryKeywords: (s.secondaryKeywords ?? []).slice(0, 4),
    intent: s.searchIntent,
    recommendedPageType: s.recommendedPageType ?? 'article',
    demandVerified: !!s.demandEvidence?.demandEvidenceAvailable,
  }
}

/** Build the batched validator prompt for one batch of survivors. */
export function buildValidatorPrompt(batch: TopicSuggestion[], langLabel: string): string {
  return [
    `You are a strict SEO content EDITOR. Return ALL text in ${langLabel}.`,
    `Below are already-safe candidate topics. For EACH, decide: accept (good as-is), reject (weak / redundant / not a real distinct need), or repair (fixable — provide corrected fields).`,
    `Rules: keep only genuinely distinct, natural, well-formed topics. A repaired title/keyword must be a natural complete phrase (no truncation), aligned in intent, and must NOT introduce any business/brand name. Do NOT invent search demand. If unsure, reject.`,
    `CANDIDATES:`,
    JSON.stringify(batch.map(candidatePayload)),
    ``,
    `Return STRICT JSON: {"verdicts":[{"candidate_id":"<id>","decision":"accept|reject|repair","typed_reason":"<short_snake_case>","repaired_title":"...","repaired_primary_keyword":"...","repaired_secondary_keywords":["..."],"repaired_reason":"...","confidence":0.0}]}. Include repaired_* ONLY for decision "repair". One verdict per candidate id.`,
  ].join('\n')
}

/** Defensive parse of the validator response → verdicts keyed by candidate_id. A
 *  malformed/incomplete response yields NO verdict for the affected candidate (the
 *  orchestrator then safely rejects it). */
export function parseValidatorResponse(text: string): Map<string, ValidatorVerdict> {
  const out = new Map<string, ValidatorVerdict>()
  let parsed: { verdicts?: unknown }
  try { parsed = JSON.parse(text) } catch {
    const m = (text || '').match(/\{[\s\S]*\}/)
    if (!m) return out
    try { parsed = JSON.parse(m[0]) } catch { return out }
  }
  const arr = Array.isArray((parsed as { verdicts?: unknown }).verdicts) ? (parsed as { verdicts: unknown[] }).verdicts : []
  for (const v of arr) {
    const o = v as Record<string, unknown>
    const id = typeof o.candidate_id === 'string' ? o.candidate_id : ''
    const decision = o.decision === 'accept' || o.decision === 'reject' || o.decision === 'repair' ? o.decision : null
    if (!id || !decision) continue
    out.set(id, {
      candidate_id: id,
      decision,
      typed_reason: typeof o.typed_reason === 'string' ? o.typed_reason : decision,
      repaired_title: typeof o.repaired_title === 'string' ? o.repaired_title : undefined,
      repaired_primary_keyword: typeof o.repaired_primary_keyword === 'string' ? o.repaired_primary_keyword : undefined,
      repaired_secondary_keywords: Array.isArray(o.repaired_secondary_keywords) ? o.repaired_secondary_keywords.filter((x): x is string => typeof x === 'string') : undefined,
      repaired_reason: typeof o.repaired_reason === 'string' ? o.repaired_reason : undefined,
      confidence: typeof o.confidence === 'number' ? o.confidence : 0.5,
    })
  }
  return out
}

export interface ValidatorMetrics {
  validator_call_count: number
  validator_accept_count: number
  validator_reject_count: number
  validator_repair_count: number
  validator_failure_count: number
}

/** Split survivors into validator batches (~25 each). */
export function validatorBatches<T>(items: T[], size = VALIDATOR_BATCH_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Apply validator verdicts to the deterministic-survivor batches — PURE (the model
 * calls happen in the orchestrator; here is the decision logic). Rules: accept keeps
 * the candidate; reject drops it; repair is RE-VALIDATED through `revalidate` (all
 * deterministic gates) and only kept if it survives (so a validator can never revive a
 * hard-rejected candidate). A missing/malformed verdict safely rejects (failure). Any
 * `unvalidated` candidates (past the call budget) are deterministic survivors and are
 * kept but NOT counted as validator accepts. Metrics are REAL, never mirrored.
 */
export function applyValidatorVerdicts(
  batches: TopicSuggestion[][],
  verdictsPerBatch: Map<string, ValidatorVerdict>[],
  revalidate: (repaired: { primaryKeyword: string; title: string; secondaryKeywords: string[]; intent?: string; reason?: string }, source: TopicSuggestion) => TopicSuggestion | null,
  unvalidated: TopicSuggestion[] = [],
): { accepted: TopicSuggestion[]; metrics: ValidatorMetrics } {
  const metrics: ValidatorMetrics = { validator_call_count: batches.length, validator_accept_count: 0, validator_reject_count: 0, validator_repair_count: 0, validator_failure_count: 0 }
  const accepted: TopicSuggestion[] = []
  const keptKw = new Set<string>()
  const keep = (s: TopicSuggestion) => { const k = (s.primaryKeyword || '').trim().toLowerCase(); if (!k || keptKw.has(k)) return; keptKw.add(k); accepted.push(s) }
  batches.forEach((batch, i) => {
    const verdicts = verdictsPerBatch[i] ?? new Map<string, ValidatorVerdict>()
    for (const s of batch) {
      const v = verdicts.get(s.id)
      if (!v) { metrics.validator_failure_count += 1; continue }
      if (v.decision === 'accept') { metrics.validator_accept_count += 1; keep(s); continue }
      if (v.decision === 'reject') { metrics.validator_reject_count += 1; continue }
      const rep = revalidate({ primaryKeyword: v.repaired_primary_keyword || s.primaryKeyword, title: v.repaired_title || s.title, secondaryKeywords: v.repaired_secondary_keywords || s.secondaryKeywords, intent: s.searchIntent, reason: v.repaired_reason || s.suggestionReason }, s)
      if (rep) { metrics.validator_repair_count += 1; keep(rep) }
      else metrics.validator_failure_count += 1 // repair failed a hard gate → safe reject
    }
  })
  for (const s of unvalidated) keep(s)
  return { accepted, metrics }
}

/**
 * Brief synthesis (Phase 4) — ONE batched model call that POLISHES deterministic
 * OpportunityBriefs into publishable topics. The model's job is narrow by design:
 * wording only (title / primaryKeyword / secondaries / intent) for subjects the
 * evidence already supports. It must NOT invent subjects, merge briefs, add
 * topics, claim demand, or produce links — links and user-facing reasons are
 * composed deterministically downstream.
 *
 * The response is reconciled BY BRIEF ID: every brief ends as polished, skipped
 * (typed, model-declared), or missing (counted) — exact accounting, no silent loss.
 */

import type { OpportunityBrief } from './opportunity-brief'
import type { ProjectContext } from './prompt-guidance'
import { projectContextBlock } from './prompt-guidance'

export interface PolishedTopic {
  briefId: string
  title: string
  primaryKeyword: string
  secondaryKeywords: string[]
  intent: string
}
export interface SkippedBrief { briefId: string; why: string }
export interface SynthesisReconciliation {
  polished: PolishedTopic[]
  skipped: SkippedBrief[]
  /** Brief ids absent from the response (parse truncation / model omission). */
  missing: string[]
  /** Response items with an unknown/duplicate briefId or unusable fields. */
  droppedItems: number
  parseFailed: boolean
  /** Model-emitted item count (polished + skipped + dropped). */
  emitted: number
}

/** Compact brief payload — only what wording needs; ids are opaque. */
function briefPayload(briefs: OpportunityBrief[]) {
  return briefs.map((b) => ({
    id: b.opportunityId,
    subject: b.subject,
    need: b.searchNeed,
    intent: b.intendedIntent,
    ...(b.alignedDemandQuery ? { aligned_query: b.alignedDemandQuery.query } : {}),
    ...(b.relatedEntities.length ? { entities: b.relatedEntities.slice(0, 5).map((e) => e.name) } : {}),
    ...(b.publishedCoverage.length ? { covered_titles: b.publishedCoverage.slice(0, 3) } : {}),
  }))
}

/** Build the single batched polishing prompt. */
export function buildBriefSynthesisPrompt(briefs: OpportunityBrief[], ctx: ProjectContext, langLabel: string, year: number): string {
  return [
    `You are an SEO content editor. Today's year is ${year}. Return ALL text in ${langLabel}.`,
    projectContextBlock(ctx),
    ``,
    `TASK: Below are ${briefs.length} EVIDENCE-BACKED content briefs. For EACH brief, polish it into ONE article topic. The brief IS the opportunity — do NOT invent a different subject, do NOT merge briefs, do NOT add extra topics.`,
    `RULES:`,
    `- "title": one natural, fluent ${langLabel} article title answering the brief's need for its exact subject. Complete words only — never truncate or corrupt a word.`,
    `- "primaryKeyword": a real search phrase for THIS need. It MUST keep the brief subject's core words. When "aligned_query" exists, use it verbatim or a minimal natural variant of it.`,
    `- "secondaryKeywords": up to 3 phrases someone searching this exact article would use. No duplicates of the primary.`,
    `- "intent": keep the brief's intent unless it is clearly wrong for the title you wrote.`,
    `- NEVER mention search volume, demand, popularity, statistics or "many searches" anywhere.`,
    `- NEVER mention a business, brand or product name that is not in that brief's "entities".`,
    `- Do not duplicate a "covered_titles" topic — angle the title differently or skip.`,
    `- If a brief cannot become a distinct, well-formed topic, SKIP it with a short reason.`,
    ``,
    `BRIEFS:`,
    JSON.stringify(briefPayload(briefs)),
    ``,
    `OUTPUT — ONLY valid JSON, no markdown/commentary: {"topics":[{"briefId":string,"skip":boolean,"why":string(only when skip, <=8 words),"title":string,"primaryKeyword":string,"secondaryKeywords":string[],"intent":"informational"|"commercial"|"comparison"|"transactional"|"local"}]}. Include EVERY briefId from BRIEFS exactly once.`,
  ].join('\n')
}

/** Output budget: title+keyword+3 secondaries+intent ≈ 200 Hebrew tokens per brief. */
export function synthesisOutputBudget(briefCount: number): number {
  return Math.max(1536, Math.min(12288, briefCount * 260 + 800))
}

/** Reconcile the model response against the EXACT brief batch. */
export function reconcileSynthesis(text: string, briefs: OpportunityBrief[]): SynthesisReconciliation {
  const ids = new Set(briefs.map((b) => b.opportunityId))
  const out: SynthesisReconciliation = { polished: [], skipped: [], missing: [], droppedItems: 0, parseFailed: false, emitted: 0 }
  let parsed: { topics?: unknown }
  try { parsed = JSON.parse(text) } catch {
    const m = (text || '').match(/\{[\s\S]*\}/)
    if (!m) { out.parseFailed = true; out.missing = briefs.map((b) => b.opportunityId); return out }
    try { parsed = JSON.parse(m[0]) } catch { out.parseFailed = true; out.missing = briefs.map((b) => b.opportunityId); return out }
  }
  const arr = Array.isArray((parsed as { topics?: unknown }).topics) ? (parsed as { topics: unknown[] }).topics : []
  out.emitted = arr.length
  const seen = new Set<string>()
  for (const t of arr) {
    const o = t as Record<string, unknown>
    const briefId = String(o.briefId ?? '').trim()
    if (!briefId || !ids.has(briefId) || seen.has(briefId)) { out.droppedItems++; continue }
    if (o.skip === true) { seen.add(briefId); out.skipped.push({ briefId, why: String(o.why ?? '').slice(0, 120) }); continue }
    const title = String(o.title ?? '').trim()
    const primaryKeyword = String(o.primaryKeyword ?? '').trim()
    if (!title || !primaryKeyword) { out.droppedItems++; continue }
    seen.add(briefId)
    out.polished.push({
      briefId, title, primaryKeyword,
      secondaryKeywords: Array.isArray(o.secondaryKeywords) ? o.secondaryKeywords.filter((s): s is string => typeof s === 'string' && !!s.trim()).slice(0, 3) : [],
      intent: typeof o.intent === 'string' ? o.intent : 'informational',
    })
  }
  for (const b of briefs) if (!seen.has(b.opportunityId)) out.missing.push(b.opportunityId)
  return out
}

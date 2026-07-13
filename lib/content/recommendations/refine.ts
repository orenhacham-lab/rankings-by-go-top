/**
 * Recommendation refine pipeline — preserve the requested count via REPAIR +
 * bounded REFILL instead of over-discarding. Deterministic given deterministic
 * repair/refill callbacks (the Gemini calls are injected, so this is unit-
 * testable and stable). Never fabricates filler to reach N; returns fewer only
 * with an explicit reason. Does not reopen Hybrid ranking.
 */

import type { TopicSuggestion } from './types'
import {
  repairStaleYear, repairReason, cannibalizes, isUnsupportedClaim,
  needsTitleRepair, isPureGenericTitle, subjectKey, primaryEntityKey, selectDiverse,
  hebrewFallbackReason,
  type CandidateOutcome,
} from './quality'
import {
  sanitizeReason, isNonEvidenceReason, hasUnsupportedClaim, cannibalizesAnswer, buildEvidenceReason,
  type GroundingResult,
} from './grounding'

export interface RefineCtx {
  existingTitles: string[]
  language: 'he' | 'en'
  year: number
  /** Corpus near-duplicate test (wraps ExistingCorpus.isDuplicate); title + subject. */
  isDuplicate: (title: string) => boolean
  /** Grounding gate — is the topic backed by a real indexed entity / query /
   *  distinct gap? Carries canonical entity identity. Optional (single-generation
   *  sources without an evidence package skip it). */
  assessGrounding?: (c: TopicSuggestion) => GroundingResult
  /** Evidence text (indexed entity titles + keyword) used to test whether a
   *  superlative/attribute claim is supported before neutralizing it. */
  evidenceTextFor?: (c: TopicSuggestion) => string
  /** Existing topics (with intent) for answer-level cannibalization. */
  existingTopics?: { title: string; primaryKeyword?: string; searchIntent?: string }[]
}

/** ONE bounded Gemini title-repair for a valid-but-weak title (topic preserved). */
export type RepairTitleFn = (c: TopicSuggestion) => Promise<{ title: string; reason?: string } | null>
/** ONE bounded Gemini refill for the missing count, avoiding given subjects/entities. */
export type RefillFn = (need: number, avoidSubjects: string[], overrepEntities: string[]) => Promise<TopicSuggestion[]>

export interface RefineFunnel {
  requested: number
  initialCandidates: number
  validNoRepair: number
  repaired: number
  discardedDuplicate: number
  discardedCannibalization: number
  discardedUnsupported: number
  discardedUnrecoverableGeneric: number
  refillRequested: number
  refillAccepted: number
  finalCount: number
  reason?: string
}

const emptyFunnel = (requested: number, initial: number): RefineFunnel => ({
  requested, initialCandidates: initial, validNoRepair: 0, repaired: 0,
  discardedDuplicate: 0, discardedCannibalization: 0, discardedUnsupported: 0, discardedUnrecoverableGeneric: 0,
  refillRequested: 0, refillAccepted: 0, finalCount: 0,
})

/**
 * Evaluate one candidate: apply deterministic repairs (year, reason language),
 * then classify keep / repair_title / discard_*. A repair_title triggers ONE
 * bounded Gemini call; the repaired title is re-checked (still generic → discard
 * as unrecoverable; now a duplicate → discard). Mutates only the passed COPY.
 * Returns the outcome + (kept) the finalized suggestion.
 */
async function evaluateCandidate(
  src: TopicSuggestion, ctx: RefineCtx, repairTitle: RepairTitleFn,
): Promise<{ outcome: CandidateOutcome; item?: TopicSuggestion; wasRepaired: boolean }> {
  // Work on a copy — never mutate the source object.
  const c: TopicSuggestion = { ...src, secondaryKeywords: [...(src.secondaryKeywords || [])] }
  let wasRepaired = false

  // Deterministic repairs (do not consume the title-repair budget).
  const yr = repairStaleYear(c.title, ctx.year)
  if (yr.changed) { c.title = yr.title; wasRepaired = true }

  // Reason cleanup: strip cluster ids / internal labels ("cluster 8", "מותגים
  // פופולריים", "קהל יעד חדש") from the user-facing reason, THEN fix language.
  const cleaned = sanitizeReason(c.suggestionReason ?? '')
  if (cleaned !== (c.suggestionReason ?? '')) { c.suggestionReason = cleaned; wasRepaired = true }
  const fixedReason = repairReason(c.suggestionReason ?? '', ctx.language, c.title)
  if (fixedReason !== (c.suggestionReason ?? '')) { c.suggestionReason = fixedReason; wasRepaired = true }

  // Grounding gate: a brand topic needs a matching indexed entity, a comparison
  // needs both products, an audience-safety claim needs evidence. Carry canonical
  // identity onto the kept suggestion, and build the reason from STRUCTURED
  // evidence (entity/type/count/keyword) rather than the model's own text.
  const evidenceText = ctx.evidenceTextFor ? ctx.evidenceTextFor(c) : ''
  if (ctx.assessGrounding) {
    const g = ctx.assessGrounding(c)
    if (!g.grounded) return { outcome: 'discard_unsupported', wasRepaired }
    if (g.canonicalEntityName) c.canonicalEntityName = g.canonicalEntityName
    if (g.primaryEntityId) c.primaryEntityId = g.primaryEntityId
    if (g.primaryEntityType) c.primaryEntityType = g.primaryEntityType
    if (g.supportingEntityIds?.length) c.supportingEntityIds = g.supportingEntityIds
    if (g.kind === 'entity' || g.kind === 'keyword') { c.suggestionReason = buildEvidenceReason(g, ctx.language, c.primaryKeyword); wasRepaired = true }
  }

  // Hard discards that a title repair cannot fix.
  if (ctx.isDuplicate(c.title)) return { outcome: 'discard_duplicate', wasRepaired }
  if (cannibalizes(c.title, ctx.existingTitles)) return { outcome: 'discard_cannibalization', wasRepaired }
  if (ctx.existingTopics && cannibalizesAnswer(c, ctx.existingTopics)) return { outcome: 'discard_cannibalization', wasRepaired }
  if (isUnsupportedClaim(c.title)) return { outcome: 'discard_unsupported', wasRepaired }
  // A reason that reduced to a bare non-evidence label → grounded fallback.
  if (ctx.language === 'he' && isNonEvidenceReason(c.suggestionReason ?? '')) { c.suggestionReason = hebrewFallbackReason(c.title); wasRepaired = true }

  // Valid topic with a weak title OR an unsupported superlative/attribute claim
  // ("iconic / trends / luxurious / seasonal / oriental") → ONE bounded natural
  // title repair (entity/keyword/intent preserved). NEVER destructive word
  // deletion. Discard only if the claim/weakness survives the repair.
  // Claims are checked whenever grounding is active (an empty evidence string
  // means NOTHING supports the claim, so it is unsupported — not "skip").
  const claimUnsupported = !!ctx.evidenceTextFor && hasUnsupportedClaim(c.title, evidenceText)
  if (needsTitleRepair(c.title) || claimUnsupported) {
    const repaired = await repairTitle(c)
    if (repaired && repaired.title && repaired.title.trim()) {
      c.title = repaired.title.trim()
      if (repaired.reason && repaired.reason.trim() && !(c.suggestionReason && ctx.assessGrounding)) c.suggestionReason = repaired.reason.trim()
      // Keep language consistent after the model repair.
      c.suggestionReason = repairReason(c.suggestionReason ?? '', ctx.language, c.title)
      wasRepaired = true
      // Re-check the repaired title (still weak / still unsupported → discard).
      if (isPureGenericTitle(c.title) || needsTitleRepair(c.title)) return { outcome: 'discard_unrecoverable_generic', wasRepaired }
      if (isUnsupportedClaim(c.title)) return { outcome: 'discard_unsupported', wasRepaired }
      if (ctx.evidenceTextFor && hasUnsupportedClaim(c.title, evidenceText)) return { outcome: 'discard_unsupported', wasRepaired }
      if (ctx.assessGrounding && !ctx.assessGrounding(c).grounded) return { outcome: 'discard_unsupported', wasRepaired }
      if (ctx.isDuplicate(c.title)) return { outcome: 'discard_duplicate', wasRepaired }
      if (cannibalizes(c.title, ctx.existingTitles)) return { outcome: 'discard_cannibalization', wasRepaired }
      if (ctx.existingTopics && cannibalizesAnswer(c, ctx.existingTopics)) return { outcome: 'discard_cannibalization', wasRepaired }
      return { outcome: 'repair_title', item: c, wasRepaired }
    }
    // No repair produced → discard the unrecoverable weak title (never keep it).
    return { outcome: 'discard_unrecoverable_generic', wasRepaired }
  }

  return { outcome: wasRepaired ? 'repair_year' : 'keep', item: c, wasRepaired }
}

async function refinePool(
  items: TopicSuggestion[], ctx: RefineCtx, repairTitle: RepairTitleFn, seenTitles: Set<string>, rejectedSubjects: Set<string>, funnel: RefineFunnel,
): Promise<TopicSuggestion[]> {
  const kept: TopicSuggestion[] = []
  for (const src of items) {
    const key = (src.title || '').trim().toLowerCase()
    if (!key) continue
    const res = await evaluateCandidate(src, ctx, repairTitle)
    if (res.outcome.startsWith('discard_')) {
      rejectedSubjects.add(subjectKey(src.title))
      if (res.outcome === 'discard_duplicate') funnel.discardedDuplicate++
      else if (res.outcome === 'discard_cannibalization') funnel.discardedCannibalization++
      else if (res.outcome === 'discard_unsupported') funnel.discardedUnsupported++
      else funnel.discardedUnrecoverableGeneric++
      continue
    }
    const item = res.item!
    const finalKey = item.title.trim().toLowerCase()
    if (seenTitles.has(finalKey)) continue
    seenTitles.add(finalKey)
    if (res.outcome === 'repair_title') funnel.repaired++
    else if (res.wasRepaired) funnel.repaired++
    else funnel.validNoRepair++
    kept.push(item)
  }
  return kept
}

/**
 * Refine an initial candidate pool to `requested` diversified recommendations,
 * repairing weak titles and running ONE bounded refill when short. Returns the
 * selected set + a full funnel. Fewer than requested only when the refill still
 * can't supply distinct grounded topics (reason: insufficient_distinct_grounded_topics).
 */
export async function refineAndSelect(
  initial: TopicSuggestion[],
  requested: number,
  ctx: RefineCtx,
  repairTitle: RepairTitleFn,
  refill: RefillFn | null,
): Promise<{ selected: TopicSuggestion[]; funnel: RefineFunnel }> {
  const funnel = emptyFunnel(requested, initial.length)
  const seenTitles = new Set<string>()
  const rejectedSubjects = new Set<string>()

  const kept = await refinePool(initial, ctx, repairTitle, seenTitles, rejectedSubjects, funnel)
  let selected = selectDiverse(kept, requested)

  // Bounded refill (one pass) when the diversified set is short of the request.
  if (selected.length < requested && refill) {
    const need = requested - selected.length
    funnel.refillRequested = need
    const selectedSubjects = selected.map((s) => subjectKey(s.title))
    const avoid = Array.from(new Set([...selectedSubjects, ...rejectedSubjects, ...ctx.existingTitles.map((t) => t)]))
    // Overrepresented entities (≥ 2 in the current selection) → refill avoids them.
    const entCount = new Map<string, number>()
    for (const s of selected) { const e = primaryEntityKey(s.title, s.primaryKeyword); entCount.set(e, (entCount.get(e) ?? 0) + 1) }
    const overrep = Array.from(entCount.entries()).filter(([, n]) => n >= 2).map(([e]) => e)

    let refillItems: TopicSuggestion[] = []
    try { refillItems = await refill(need, avoid, overrep) } catch { refillItems = [] }
    const keptRefill = await refinePool(refillItems, ctx, repairTitle, seenTitles, rejectedSubjects, funnel)
    funnel.refillAccepted = keptRefill.length
    selected = selectDiverse([...kept, ...keptRefill], requested)
  }

  funnel.finalCount = selected.length
  if (selected.length < requested) funnel.reason = 'insufficient_distinct_grounded_topics'
  return { selected, funnel }
}

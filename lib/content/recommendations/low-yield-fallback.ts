/**
 * LOW-FINAL-YIELD DISCOVERY-SYNTHESIS fallback (Stage E3A follow-up) — pure
 * seed-inventory / prompt / schema / reconciliation / trigger core.
 *
 * WHY: a project that has already published ~20-30 topics can permanently reach
 * 0-2 NEW recommendations while substantial UNUSED real evidence still exists —
 * the deterministic brief pool re-derives the SAME exhausted subjects, normal
 * synthesis re-processes them, and every candidate is blocked by
 * coverage/ownership/duplicate gates. When that "low final yield" is detected
 * immediately before the final available paid call, this module spends that ONE
 * bounded call on a materially different strategy: it inventories the project's
 * UNUSED evidence into opaque seeds and asks the model, in a SINGLE combined
 * discovery+synthesis call, to expand each seed into a genuinely NEW long-tail
 * search need AND polish it into a publishable title + primary keyword.
 *
 * HARD BOUNDARIES (enforced here + by the engine that calls this):
 *   - never a fourth call: this REPLACES the normal bounded third refill — the two
 *     are mutually exclusive strategies for the same single final slot;
 *   - never filler: seeds are real unused evidence, exclusions are deterministic,
 *     and every produced topic is run through the engine's UNCHANGED validatePolished
 *     path (no relaxed validator, no auto-persist of a failed item);
 *   - never a raw GSC/KR row as a topic: a seed is an ANCHOR the model must expand;
 *     the produced keyword is re-anchored to its seed subject and re-validated;
 *   - every produced topic references exactly one allowed seedId (responseSchema enum
 *     + deterministic re-verification), so an invented/renamed seed is dropped.
 *
 * This module is PURE (no IO, no Date/random) so it is fully unit-testable; the
 * engine wires the guard/coverage closures and makes the single paid call.
 */

import type { EntityNode } from './evidence-cluster'
import { contentTokens } from './evidence-cluster'
import type { SearchIntent } from './opportunity'
import { GENERIC_TOKENS } from './opportunity'
import { normalizePhrase } from './keyword-guard'
import { normalizeText } from './topic-idea-store'
import { distinctiveTokensOf, topicSignature, isHighConfidenceDuplicate, type TopicSignature } from './semantic-dup'
import { hasNamedExternalBusiness, type BrandSafety } from './brand-safety'
import type { OpportunityBrief } from './opportunity-brief'
import type { PolishedTopic } from './brief-synthesis'
import { projectContextBlock, type ProjectContext } from './prompt-guidance'

// ── Tunables (all deterministic; the engine imports the trigger thresholds) ──────
/**
 * Trigger condition (1) — the FLOOR of the accepted-count ceiling.
 *
 * The effective ceiling is `max(LOW_YIELD_ACCEPTED_CEILING, ceil(targetCount / 2))`
 * (see lowYieldAcceptedCeiling), so it scales with the request's targetCount instead of
 * being a fixed absolute. WHY: this trigger and canRunBoundedRefill compete for the SAME
 * single final paid call, but disagreed about what "needs help" means — the fallback used
 * an absolute count (4) while the refill uses a RELATIVE shortfall (targetCount - accepted
 * >= 3). At the production targetCount of 12 a run accepting 5 has a shortfall of 7 — a
 * large miss — yet the fallback declined it and the normal refill took the slot instead.
 *
 * This constant remains the floor, so behavior is IDENTICAL to the previous absolute rule
 * for every targetCount <= 8 (ceil(8/2) === 4); it only widens above that.
 */
export const LOW_YIELD_ACCEPTED_CEILING = 4

/**
 * The effective accepted-count ceiling for a given targetCount (pure).
 * targetCount <= 8 → 4 (unchanged); 12 → 6; 24 → 12.
 * Never affects HOW MANY paid calls a run makes — the fallback and the normal bounded
 * refill are mutually exclusive strategies for the one remaining slot.
 */
export function lowYieldAcceptedCeiling(targetCount: number): number {
  return Math.max(LOW_YIELD_ACCEPTED_CEILING, Math.ceil(targetCount / 2))
}
/** Trigger condition (3): at least this many eligible unused seeds must remain. */
export const MIN_ELIGIBLE_SEEDS = 12
/** Trigger condition (4): at least this share of rejections must be coverage-type. */
export const COVERAGE_REJECTION_MIN_RATIO = 0.5
/** Prompt is limited to the strongest N eligible seeds (schema enum size bound). */
export const MAX_SEEDS_SENT = 30

/** Deterministic reject reasons that mean "an existing/pending page already owns
 *  this need" — the signature of an EXHAUSTED pool (not a one-off malformed title).
 *  Matches the ACTUAL reason strings validatePolished / discovery emit. */
export const COVERAGE_REJECTION_REASONS: ReadonlySet<string> = new Set([
  'existing_content_owns_need',
  'already_covered',
  'covered_by_existing_content',
  'exact_existing_keyword_owner',
  'source_only_entity_expansion',
  'pending_exact_duplicate',
  'primary_keyword_exists', // engine's pending-exact reason
  'pending_semantic_duplicate',
])

export type FallbackSeedSource = 'keywordResearch' | 'searchConsole' | 'tracked' | 'entity' | 'projectFocus'
const ALL_SOURCES: FallbackSeedSource[] = ['keywordResearch', 'searchConsole', 'tracked', 'entity', 'projectFocus']

/** Deterministic evidence-priority base per source (business pillars strongest). */
const SOURCE_BASE: Record<FallbackSeedSource, number> = {
  tracked: 100,
  entity: 90,
  keywordResearch: 70,
  searchConsole: 60,
  projectFocus: 50,
}

const FALLBACK_INTENTS = ['informational', 'commercial', 'comparison', 'transactional', 'local'] as const

/** A raw evidence candidate BEFORE exclusion (one per evidence phrase per source). */
export interface RawSeedCandidate {
  phrase: string
  source: FallbackSeedSource
  /** Exact stored search volume when the phrase itself is a research query (else null). */
  volume?: number | null
}

/** An eligible, deduped, priority-ranked seed with an opaque deterministic id. */
export interface FallbackSeed {
  seedId: string
  phrase: string
  source: FallbackSeedSource
  priority: number
  alignedVolume: number | null
  intentHint: SearchIntent
  relatedEntities: { name: string; url?: string | null; type?: string }[]
}

/** Opaque, deterministic seed id (FNV-1a over source+normalized phrase). No project
 *  vocabulary ever leaks into the id. */
function seedIdFor(source: FallbackSeedSource, norm: string): string {
  const s = `${source}:${norm}`
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return `seed_${(h >>> 0).toString(36)}`
}

export interface SeedInventoryParams {
  rawSeeds: RawSeedCandidate[]
  /** Exact existing CONTENT/tracked/idea keyword owner (guard.keywords / contentKeywords).
   *  Receives the RAW phrase — the closure applies the guard's own normalization. */
  isExactContentKeyword: (phrase: string) => boolean
  /** Exact commercial entity owner (ownedByExistingEntity). */
  isEntityOwner: (phrase: string) => boolean
  /** Existing published content already covers this phrase (coveredByExistingContent). */
  isCoveredByContent: (phrase: string) => boolean
  /** Exact pending idea keys (normalizePhrase-normalized, matching this module's norm). */
  pendingExactKeys: Set<string>
  /** Signatures of published content + pending ideas (high-confidence dup). */
  publishedSignatures: TopicSignature[]
  pendingSignatures: TopicSignature[]
  /** Signatures of recs accepted THIS run (never re-seed an accepted subject). */
  acceptedRunSignatures: TopicSignature[]
  /** Signatures of briefs already CONSUMED this run (never re-seed the exhausted pool). */
  consumedBriefSignatures: TopicSignature[]
  /** Descriptive attribute tokens (colour/size/occasion/recipient) — generic-only seeds out. */
  attributeTokens: Set<string>
  brandSafety: BrandSafety
  /** Entities sharing a distinctive token with the seed (for links + reason). */
  relatedEntitiesFor: (phrase: string) => { name: string; url?: string | null; type?: string }[]
  /** Idea-row statuses of any idea-origin keyword equal to this phrase (raw phrase in). */
  ideaStatusesOf: (phrase: string) => string[]
  maxSeeds?: number
}

export interface SeedInventory {
  /** The strongest ≤ maxSeeds eligible seeds actually sent to the model. */
  eligibleSeeds: FallbackSeed[]
  rawSeedCount: number
  /** Total eligible seeds BEFORE the maxSeeds slice (the trigger's "≥12" count). */
  eligibleSeedCount: number
  seedsSent: number
  excludedBySource: Record<FallbackSeedSource, number>
  excludedByReason: Record<string, number>
  ideaStatusBlocks: { pending: number; approved: number; rejected: number; generated: number; other: number }
}

/**
 * Build the deterministic UNUSED-evidence seed inventory. Every raw candidate is
 * either promoted to an eligible seed (opaque id, priority, aligned volume) or
 * excluded by exactly ONE typed reason (counted by source + reason). Idea-status
 * blocks are counted separately (diagnostics only — the guard rule is untouched).
 */
export function buildSeedInventory(params: SeedInventoryParams): SeedInventory {
  const maxSeeds = params.maxSeeds ?? MAX_SEEDS_SENT
  const excludedBySource: Record<FallbackSeedSource, number> = { keywordResearch: 0, searchConsole: 0, tracked: 0, entity: 0, projectFocus: 0 }
  const excludedByReason: Record<string, number> = {}
  const ideaStatusBlocks = { pending: 0, approved: 0, rejected: 0, generated: 0, other: 0 }
  const exclude = (source: FallbackSeedSource, reason: string) => { excludedBySource[source]++; excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1 }
  const bumpIdeaStatus = (phrase: string) => {
    for (const st of params.ideaStatusesOf(phrase)) {
      const k = (st || '').toLowerCase()
      if (k === 'pending' || k === 'approved' || k === 'rejected' || k === 'generated') ideaStatusBlocks[k]++
      else ideaStatusBlocks.other++
    }
  }

  const seenNorm = new Set<string>()
  const acceptedSigs: TopicSignature[] = []
  const eligible: FallbackSeed[] = []

  for (const raw of params.rawSeeds) {
    const phrase = (raw.phrase || '').trim()
    const norm = normalizePhrase(phrase)
    if (!norm) { exclude(raw.source, 'empty'); continue }
    if (seenNorm.has(norm)) { exclude(raw.source, 'duplicate_seed'); continue }
    seenNorm.add(norm)

    // Malformed / generic / attribute-only — never a real long-tail anchor.
    const toks = distinctiveTokensOf(phrase)
    if (toks.length < 2) { exclude(raw.source, 'malformed_generic'); continue }
    if (toks.every((t) => GENERIC_TOKENS.has(t) || params.attributeTokens.has(t))) { exclude(raw.source, 'modifier_only'); continue }
    // STRICT named-business detection (hasNamedExternalBusiness), NOT the broad
    // classifyKeywordEntity/containsExternalBusiness shape. The broad classifier flags any
    // "[own type token] + [any token not already in the project's vocabulary]" phrase — which
    // is the definition of a NEW topic opportunity, so it excluded essentially every
    // legitimate long-tail seed for a catalogue project whose entity names repeat type words
    // (a florist: 105 of 354 raw seeds, leaving 3 eligible against a threshold of 12). It is
    // also FALSE-NEGATIVE on real competitors: an own-brand-prefixed name ("<own brand> בע\"מ")
    // returns 'own_brand', and a branded phrase with no project type token ("Bloom Ltd")
    // returns 'generic_query' — both kept. brand-safety.ts documents the broad classifier as
    // "catastrophically false-positive" and already provides this strict variant, which
    // requires a real proper-name signal: an explicit business/legal suffix, or a
    // phrase-level single-edit impersonation of an owned name (descriptor/own-vocab exempt).
    // Precision AND recall both improve. The exclusion reason string is unchanged so
    // before/after diagnostics stay directly comparable.
    if (hasNamedExternalBusiness(phrase, params.brandSafety).hit) { exclude(raw.source, 'competitor_branded'); continue }

    // Exact owners — idea-status blocks counted for diagnostics (guard rule unchanged).
    if (params.isExactContentKeyword(phrase)) { bumpIdeaStatus(phrase); exclude(raw.source, 'exact_existing_content_keyword'); continue }
    if (params.isEntityOwner(phrase)) { exclude(raw.source, 'exact_entity_owner'); continue }
    if (params.pendingExactKeys.has(norm)) { bumpIdeaStatus(phrase); exclude(raw.source, 'pending_exact_idea'); continue }
    if (params.isCoveredByContent(phrase)) { exclude(raw.source, 'covered_by_existing_content'); continue }

    // High-confidence semantic duplicate of published / pending / already-accepted /
    // an already-consumed brief (re-seeding the exhausted pool is exactly what to avoid).
    const intentHint: SearchIntent = raw.source === 'entity' ? 'commercial' : 'informational'
    const sig = topicSignature(phrase, intentHint)
    if (params.publishedSignatures.some((p) => isHighConfidenceDuplicate(sig, p))) { exclude(raw.source, 'published_duplicate'); continue }
    if (params.pendingSignatures.some((p) => isHighConfidenceDuplicate(sig, p))) { exclude(raw.source, 'pending_duplicate'); continue }
    if (params.acceptedRunSignatures.some((p) => isHighConfidenceDuplicate(sig, p))) { exclude(raw.source, 'accepted_this_run'); continue }
    if (params.consumedBriefSignatures.some((p) => isHighConfidenceDuplicate(sig, p))) { exclude(raw.source, 'consumed_brief_duplicate'); continue }
    if (acceptedSigs.some((p) => isHighConfidenceDuplicate(sig, p))) { exclude(raw.source, 'duplicate_seed'); continue }

    acceptedSigs.push(sig)
    const volume = (raw.volume ?? 0) > 0 ? (raw.volume as number) : null
    eligible.push({
      seedId: seedIdFor(raw.source, norm),
      phrase,
      source: raw.source,
      priority: SOURCE_BASE[raw.source] + (volume ? Math.min(volume, 10000) / 10000 * 20 : 0),
      alignedVolume: volume,
      intentHint,
      relatedEntities: params.relatedEntitiesFor(phrase).slice(0, 6),
    })
  }

  // Deterministic strength ordering: priority DESC, then phrase ASC (stable, no random).
  eligible.sort((a, b) => b.priority - a.priority || (a.phrase < b.phrase ? -1 : a.phrase > b.phrase ? 1 : 0))
  const sent = eligible.slice(0, maxSeeds)
  return {
    eligibleSeeds: sent,
    rawSeedCount: params.rawSeeds.length,
    eligibleSeedCount: eligible.length,
    seedsSent: sent.length,
    excludedBySource,
    excludedByReason,
    ideaStatusBlocks,
  }
}

// ── Combined discovery+synthesis response schema ─────────────────────────────────
/** `{ topics: [{ seedId(enum), title, primaryKeyword, secondaryKeywords, intent }] }`.
 *  seedId is an ENUM of the exact eligible seed ids — a renamed/invented seed is a
 *  provider-side schema violation, not a silent drop. */
export function fallbackResponseSchema(seedIds: string[]): Record<string, unknown> {
  return {
    type: 'OBJECT',
    properties: {
      topics: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            seedId: { type: 'STRING', enum: seedIds },
            title: { type: 'STRING' },
            primaryKeyword: { type: 'STRING' },
            secondaryKeywords: { type: 'ARRAY', items: { type: 'STRING' } },
            intent: { type: 'STRING', enum: [...FALLBACK_INTENTS] },
          },
          required: ['seedId', 'title', 'primaryKeyword'],
        },
      },
    },
    required: ['topics'],
  }
}

/** Bounded, deterministic BLOCKER context — generation-quality only (changes no
 *  blocking rule). No article bodies, secrets, ids, or raw model output. */
export interface BlockerContext {
  coveredNeeds: string[]
  blockedKeywords: string[]
  acceptedTitles: string[]
  acceptedKeywords: string[]
  topRejectionCategories: { reason: string; count: number }[]
}

export function buildBlockerContext(input: {
  publishedNeedPhrases: string[]
  blockedExactKeywords: string[]
  acceptedRunTitles: string[]
  acceptedRunKeywords: string[]
  rejectionCounts: Record<string, number>
}): BlockerContext {
  const uniq = (arr: string[], limit: number) => {
    const seen = new Set<string>(); const out: string[] = []
    for (const s of arr) { const k = normalizePhrase(s); if (!k || seen.has(k)) continue; seen.add(k); out.push(s.slice(0, 100)); if (out.length >= limit) break }
    return out
  }
  return {
    coveredNeeds: uniq(input.publishedNeedPhrases, 25),
    blockedKeywords: uniq(input.blockedExactKeywords, 15),
    acceptedTitles: uniq(input.acceptedRunTitles, 15),
    acceptedKeywords: uniq(input.acceptedRunKeywords, 15),
    topRejectionCategories: Object.entries(input.rejectionCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0))
      .slice(0, 5),
  }
}

export interface FallbackPromptInput {
  language: 'he' | 'en'
  ctx: ProjectContext
  year: number
  seeds: FallbackSeed[]
  ownedCommercialEntities: string[]
  blocker: BlockerContext
}

export function buildFallbackPrompt(input: FallbackPromptInput): string {
  const langLabel = input.language === 'he' ? 'Hebrew' : 'English'
  const seedPayload = input.seeds.map((s) => ({ id: s.seedId, seed: s.phrase }))
  return [
    `You are an SEO strategist doing CONSTRAINED discovery-and-synthesis. Today's year is ${input.year}. Return ALL text in ${langLabel}.`,
    projectContextBlock(input.ctx),
    ``,
    `SITUATION: normal generation is exhausted — the obvious topics for this project are ALREADY published or pending. Your job is to find genuinely NEW long-tail search needs that are NOT yet covered, using the UNUSED evidence seeds below, and to write each as a finished article topic.`,
    ``,
    `EVIDENCE SEEDS (each is an ANCHOR — a real project term. For each seed you use, invent ONE genuinely NEW long-tail user SEARCH NEED around it):`,
    JSON.stringify(seedPayload),
    ``,
    `OWNED commercial entities (products/categories/services — you MAY reference these; NEVER invent an outside business/brand):`,
    JSON.stringify(input.ownedCommercialEntities.slice(0, 20)),
    `ALREADY-COVERED needs (do NOT propose anything these already answer):`,
    JSON.stringify(input.blocker.coveredNeeds),
    `ALREADY-BLOCKED exact keywords (never use these as the primary keyword):`,
    JSON.stringify(input.blocker.blockedKeywords),
    `ALREADY-ACCEPTED this run (do NOT repeat or closely mirror these):`,
    JSON.stringify(input.blocker.acceptedTitles),
    ``,
    `HARD RULES:`,
    `- Reference EXACTLY ONE seedId from the list for each topic, verbatim.`,
    `- EXPAND the seed into a NEW long-tail need — do NOT merely rename the seed, do NOT output the bare seed, do NOT output seed+"מדריך". Keep a MEANINGFUL subject relationship to the seed (share its core subject word).`,
    `- NO filler: no bare "how to choose X", no colour/size/occasion/recipient-only angle, no generic entity guide with no real question behind it. Fewer defensible topics beat filler.`,
    `- "title": one natural, fluent ${langLabel} article title. Complete words only.`,
    `- "primaryKeyword": a real, concise SEARCH phrase for THIS new need (not the headline). It MUST keep the seed subject's core words.`,
    `- "secondaryKeywords": up to 3 phrases someone searching this exact article would use.`,
    `- "intent": the true intent of the need.`,
    `- NEVER claim search volume, demand or popularity. NEVER mention an external business/brand.`,
    ``,
    `OUTPUT — ONLY valid JSON, no markdown: {"topics":[{"seedId":string,"title":string,"primaryKeyword":string,"secondaryKeywords":string[],"intent":"informational"|"commercial"|"comparison"|"transactional"|"local"}]}.`,
  ].join('\n')
}

// ── Reconciliation → PolishedTopic + OpportunityBrief pairs ───────────────────────
export interface FallbackPair { seedId: string; topic: PolishedTopic; brief: OpportunityBrief }
export interface FallbackReconciliation {
  pairs: FallbackPair[]
  emitted: number
  invalidItems: number
  unknownSeedIds: string[]
  parseFailed: boolean
}

/** Deterministic synthetic brief id for a seed-derived topic (opaque, FNV-1a). */
function fallbackBriefId(seedId: string, norm: string): string {
  const s = `${seedId}|${norm}`
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return `lyf_${(h >>> 0).toString(36)}`
}

/**
 * Reconcile the combined-call response against the EXACT eligible seeds. Each valid
 * item becomes a (PolishedTopic, OpportunityBrief) pair — the brief's subject is the
 * SEED (so validatePolished re-anchors an off-seed keyword back to the seed and its
 * gates enforce the subject relationship). At most ONE topic per seed (extras dropped),
 * so the model cannot dump many filler angles on a single seed.
 */
export function reconcileFallback(text: string, seeds: FallbackSeed[]): FallbackReconciliation {
  const byId = new Map(seeds.map((s) => [s.seedId, s]))
  const out: FallbackReconciliation = { pairs: [], emitted: 0, invalidItems: 0, unknownSeedIds: [], parseFailed: false }
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch {
    const m = (text || '').match(/\{[\s\S]*\}/)
    if (!m) { out.parseFailed = true; return out }
    try { parsed = JSON.parse(m[0]) } catch { out.parseFailed = true; return out }
  }
  const topics = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray((parsed as { topics?: unknown }).topics)
    ? (parsed as { topics: unknown[] }).topics
    : null
  if (!topics) { out.parseFailed = true; return out }
  out.emitted = topics.length
  const usedSeed = new Set<string>()
  for (const t of topics) {
    const o = (t ?? {}) as Record<string, unknown>
    const seedId = String(o.seedId ?? '').trim()
    const title = String(o.title ?? '').trim()
    const primaryKeyword = String(o.primaryKeyword ?? '').trim()
    const seed = byId.get(seedId)
    if (!seed) { out.invalidItems++; if (seedId) out.unknownSeedIds.push(seedId.slice(0, 40)); continue }
    if (!title || !primaryKeyword) { out.invalidItems++; continue }
    if (usedSeed.has(seedId)) { out.invalidItems++; continue }
    usedSeed.add(seedId)
    const intent = typeof o.intent === 'string' && (FALLBACK_INTENTS as readonly string[]).includes(o.intent) ? (o.intent as SearchIntent) : seed.intentHint
    const secondaryKeywords = Array.isArray(o.secondaryKeywords) ? o.secondaryKeywords.filter((s): s is string => typeof s === 'string' && !!s.trim()).slice(0, 3) : []
    const briefId = fallbackBriefId(seedId, normalizePhrase(seed.phrase))
    const family: OpportunityBrief['family'] = intent === 'comparison' ? 'comparison' : intent === 'commercial' || intent === 'transactional' || intent === 'local' ? 'commercial' : 'informational'
    const brief: OpportunityBrief = {
      opportunityId: briefId,
      subject: seed.phrase,
      searchNeed: intent === 'comparison' ? 'comparison' : 'informational',
      family,
      sourceEvidence: [{ kind: seed.source === 'searchConsole' ? 'gsc' : seed.source === 'keywordResearch' ? 'keyword_research' : 'site_scan', text: seed.phrase }],
      alignedDemandQuery: seed.alignedVolume ? { query: seed.phrase, volume: seed.alignedVolume } : null,
      demandVolumeSource: seed.alignedVolume ? 'keyword_research_cache' : null,
      intendedIntent: intent,
      intendedPageType: 'article',
      existingContentGap: true,
      relatedEntities: seed.relatedEntities,
      publishedCoverage: [],
      confidence: seed.alignedVolume ? 0.7 : 0.5,
      briefScore: seed.alignedVolume ? 0.5 : 0.3,
    }
    out.pairs.push({ seedId, topic: { briefId, title, primaryKeyword, secondaryKeywords, intent }, brief })
  }
  return out
}

// ── Trigger ──────────────────────────────────────────────────────────────────────
export interface LowYieldTriggerInput {
  acceptedCount: number
  targetCount: number
  eligibleSeedCount: number
  rejectionCounts: Record<string, number>
  /** Controller authorizes the final call (condition 6). */
  controllerAuthorizes: boolean
  /** The final paid slot is actually available this attempt (condition 7). */
  finalSlotAvailable: boolean
  /** No provider/synthesis/billing/budget failure so far (condition 5). */
  noFailure: boolean
}

export interface LowYieldTriggerResult {
  triggered: boolean
  coverageRejectionRatio: number
  reasons: {
    belowAcceptedCeiling: boolean
    targetNotReached: boolean
    enoughSeeds: boolean
    coverageDominated: boolean
    noFailure: boolean
    controllerAuthorizes: boolean
    finalSlotAvailable: boolean
  }
}

/** Pure evaluation of the 7 low-yield conditions (ALL must hold). */
export function evaluateLowYieldTrigger(input: LowYieldTriggerInput): LowYieldTriggerResult {
  const totalRej = Object.values(input.rejectionCounts).reduce((s, n) => s + n, 0)
  const coverageRej = Object.entries(input.rejectionCounts).reduce((s, [r, n]) => s + (COVERAGE_REJECTION_REASONS.has(r) ? n : 0), 0)
  const coverageRejectionRatio = totalRej > 0 ? coverageRej / totalRej : 0
  const reasons = {
    belowAcceptedCeiling: input.acceptedCount < lowYieldAcceptedCeiling(input.targetCount),
    targetNotReached: input.acceptedCount < input.targetCount,
    enoughSeeds: input.eligibleSeedCount >= MIN_ELIGIBLE_SEEDS,
    coverageDominated: totalRej > 0 && coverageRejectionRatio >= COVERAGE_REJECTION_MIN_RATIO,
    noFailure: input.noFailure,
    controllerAuthorizes: input.controllerAuthorizes,
    finalSlotAvailable: input.finalSlotAvailable,
  }
  return { triggered: Object.values(reasons).every(Boolean), coverageRejectionRatio, reasons }
}

/** Diagnostics record (Preview/operator only — never Production/customer UI). */
export interface LowYieldFallbackDiagnostics {
  eligible: boolean
  used: boolean
  triggerAcceptedCount: number
  coverageRejectionRatio: number
  rawSeedCount: number
  eligibleSeedCount: number
  seedsSent: number
  emitted: number
  engineAccepted: number
  /** ENGINE view = engineAccepted. The route OVERRIDES this in operatorRunDiag with the
   *  real route/blog/persistence-ready count from finalCandidateOutcomes (wouldPersist). */
  finalReady: number
  /** The TRUTHFUL paid-call ordinal this fallback used (controller.callCount + 1 at the
   *  authorized call), never an assumed "third". null when the fallback did not run. */
  callOrdinal: number | null
  excludedBySource: Record<FallbackSeedSource, number>
  excludedByReason: Record<string, number>
  ideaStatusBlocks: { pending: number; approved: number; rejected: number; generated: number; other: number }
}

export type ThirdCallStrategy = 'normal_refill' | 'low_yield_discovery_synthesis' | 'not_used' | 'blocked'

/** A fully "not used" diagnostics record (no fallback evaluated/run). */
export function emptyLowYieldFallbackDiagnostics(): LowYieldFallbackDiagnostics {
  return {
    eligible: false, used: false, triggerAcceptedCount: 0, coverageRejectionRatio: 0,
    rawSeedCount: 0, eligibleSeedCount: 0, seedsSent: 0, emitted: 0, engineAccepted: 0, finalReady: 0, callOrdinal: null,
    excludedBySource: { keywordResearch: 0, searchConsole: 0, tracked: 0, entity: 0, projectFocus: 0 },
    excludedByReason: {}, ideaStatusBlocks: { pending: 0, approved: 0, rejected: 0, generated: 0, other: 0 },
  }
}

/** Entities sharing a distinctive token with a subject — the shared helper the engine
 *  passes as relatedEntitiesFor (kept here so the seed inventory and briefs agree). */
export function relatedEntitiesForSubject(subject: string, entities: EntityNode[]): { name: string; url?: string | null; type?: string }[] {
  const subToks = new Set(contentTokens(subject))
  return entities.filter((e) => contentTokens(e.name).some((t) => subToks.has(t))).map((e) => ({ name: e.name, url: e.url ?? null, type: e.type }))
}

// Re-exports for the engine's convenience (single import site).
export { normalizeText, ALL_SOURCES }

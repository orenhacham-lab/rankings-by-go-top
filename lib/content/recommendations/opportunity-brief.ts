/**
 * OpportunityBrief pool (Phase 4 — evidence-first generation) — PURE, domain-neutral.
 *
 * Replaces generate-and-discard: instead of asking the model to INVENT topics from
 * coarse single-token cluster buckets and then rejecting 90%+ of them, the pool is
 * built DETERMINISTICALLY from the project's own evidence at QUERY granularity,
 * validated (ownership / coverage / duplicates / pending) BEFORE any paid call, and
 * only then handed to one batched synthesis call that POLISHES each brief into a
 * title + keyword. The model never invents the business opportunity.
 *
 * A brief carries its OWN aligned demand query (exact volume source) — never a
 * cluster aggregate — so demand can only ever be claimed for the query it belongs to.
 */

import type { EntityNode, KeywordResearchNode, EvidenceSourceKind } from './evidence-cluster'
import { contentTokens } from './evidence-cluster'
import type { SearchIntent } from './opportunity'
import { GENERIC_TOKENS } from './opportunity'
import { deriveIntent } from './opportunity-validation'
import { normalizePhrase } from './keyword-guard'
import { topicSignature, isHighConfidenceDuplicate, distinctiveTokensOf, canonicalVariants, type TopicSignature } from './semantic-dup'
import type { OpportunityFamily } from './opportunity-synthesis'

export type SearchNeed =
  | 'question'
  | 'comparison'
  | 'selection'
  | 'care_howto'
  | 'local_commercial'
  | 'category_guide'
  | 'informational'

export interface OpportunityBrief {
  opportunityId: string
  /** The supported subject phrase (surface form, from evidence — not invented). */
  subject: string
  searchNeed: SearchNeed
  family: OpportunityFamily
  sourceEvidence: { kind: EvidenceSourceKind; text: string }[]
  /** The EXACT query whose volume this brief may claim — its own, never a bucket. */
  alignedDemandQuery: { query: string; volume: number } | null
  demandVolumeSource: 'keyword_research_cache' | null
  intendedIntent: SearchIntent
  intendedPageType: 'article'
  existingContentGap: boolean
  relatedEntities: { name: string; url?: string | null; type?: string }[]
  publishedCoverage: string[]
  confidence: number
  briefScore: number
  /** SOFT synthesis-batch priority (additive; set by prioritizeBriefsForSynthesis). Never
   *  affects pool membership — only the ORDER briefs are handed to synthesis rounds. */
  priority?: BriefPriority
}

export type PillarType = 'tracked_keyword' | 'category' | 'service' | 'homepage' | 'corroborated_project_focus'
/** A verified NON-product business pillar (owned business evidence). */
export interface BusinessPillar { source: string; type: PillarType; tokens: Set<string> }
export interface BriefPriority {
  /** 0 = pillar-aligned distinct need · 1 = other independent article need · 2 = commercial/product-shaped. */
  tier: 0 | 1 | 2
  reason: string
  matchedPillar: string | null
  matchedPillarType: PillarType | null
  matchedPillarTokens: string[]
  distinctModifierTokens: string[]
  /** The pillar's CORE anchor head that the candidate had to contain for Tier 0. */
  matchedPillarAnchorHead: string | null
  /** Whether that anchor head was corroborated by an independent owned non-product source
   *  (required for a single-token pillar or a project-focus pillar to grant Tier 0). */
  pillarAnchorCorroborated: boolean
  productAffinity: boolean
  /** Index of this brief in the final tier-ordered pool (0-based). */
  finalSynthesisRank: number
}

export interface BriefPoolInput {
  language: 'he' | 'en'
  keywordResearch: KeywordResearchNode[]
  trackedKeywords: string[]
  projectFocus: string[]
  entities: EntityNode[]
  /** PUBLISHED coverage titles only (articles/topics) — pending is separate. */
  publishedCoverage: string[]
  /** Pending idea identity: exact normalized keys + signatures (for semantic dup). */
  pendingExactKeys: Set<string>
  pendingSignatures: TopicSignature[]
  /** Exact ownership / coverage checks (route-grade, published-only). */
  isOwnedByEntity: (phrase: string) => boolean
  isCoveredByContent: (title: string, keyword: string) => boolean
  /** Domain type/attribute words — a subject must have a non-type distinctive token. */
  domainTypeWords: Set<string>
  /** Descriptive ATTRIBUTE tokens (colours/sizes/occasions/recipients — from
   *  deriveAttributeTokens): NEVER eligible inside a theme subject. */
  attributeTokens?: Set<string>
}

export interface BriefPoolDiagnostics {
  raw_query_candidates: number
  raw_theme_candidates: number
  raw_tracked_candidates: number
  /** raw_query + raw_tracked + raw_theme — MUST equal pool_size + Σ rejected. */
  total_raw_candidates: number
  rejected_by_reason: Record<string, number>
  /** Operator-only reviewability: up to 5 rejected candidates per reason. */
  rejected_examples: { subject: string; reason: string; evidenceKind: string }[]
  /** Preview/operator-only: SOFT synthesis-batch priority for EVERY admitted brief (one
   *  entry per pool member, in final tier order). Additive + OPTIONAL — never shown in
   *  normal Production responses; always populated by buildBriefPool. No brief is ever
   *  removed by priority; this only records the deterministic tier/order. */
  brief_priority?: {
    opportunityId: string
    subject: string
    tier: 0 | 1 | 2
    priorityReason: string
    matchedPillar: string | null
    matchedPillarType: PillarType | null
    matchedPillarTokens: string[]
    distinctModifierTokens: string[]
    matchedPillarAnchorHead: string | null
    pillarAnchorCorroborated: boolean
    productAffinity: boolean
    finalSynthesisRank: number
  }[]
  pool_size: number
  by_family: Record<string, number>
  with_demand: number
}

const QUESTION_RE = /(?:^|\s)(?:איך|כיצד|מדוע|למה|מתי|האם|מה |מהו|מהי|כמה|how|what|when|why|which)/i
const COMPARISON_RE = /(?:^|\s)(?:לעומת|מול|או |הבדל|השוואה|vs\.?|versus|difference)(?:\s|$)/i
const SELECTION_RE = /(?:^|\s)(?:לבחור|בחירת|איזה|איזו|אילו|מומלץ|מומלצת|הטוב|הטובה|best|choose|top)(?:\s|$)/i
const CARE_RE = /(?:^|\s)(?:טיפול|טיפוח|תחזוקה|לשמור|שמירה|לנקות|ניקוי|care|maintain|clean)(?:\s|$)/i
const LOCAL_COMM_RE = /(?:^|\s)(?:משלוח|משלוחים|חנות|מחיר|מחירים|קנייה|קניה|לקנות|הזמנת|הזמנה|delivery|shop|store|buy|price|order)(?:\s|$)/i

function needOf(query: string): SearchNeed {
  if (QUESTION_RE.test(query)) return 'question'
  if (COMPARISON_RE.test(query)) return 'comparison'
  if (SELECTION_RE.test(query)) return 'selection'
  if (CARE_RE.test(query)) return 'care_howto'
  if (LOCAL_COMM_RE.test(query)) return 'local_commercial'
  return 'informational'
}
function familyOf(need: SearchNeed): OpportunityFamily {
  if (need === 'comparison' || need === 'selection') return 'comparison'
  if (need === 'local_commercial') return 'commercial'
  return 'informational'
}
function intentOf(query: string, need: SearchNeed): SearchIntent {
  const derived = deriveIntent(query, query, 'informational')
  if (derived !== 'informational') return derived
  if (need === 'comparison' || need === 'selection') return 'comparison'
  return 'informational'
}

// ── Source role: OWNED PRODUCTS ARE SUPPORT EVIDENCE, NOT ARTICLE SUBJECTS ─────
// GENERIC_TOKENS is stored in normalizePhrase form; project it ONCE into the
// distinctiveTokensOf space (canonical tokens) so generic-modifier stripping shares
// the SAME normalization the rest of this module uses (no second matcher).
const GENERIC_CANON = new Set<string>()
for (const g of GENERIC_TOKENS) for (const t of distinctiveTokensOf(g)) GENERIC_CANON.add(t)
/** True when token `t` (or one of its canonical proclitic variants) is in `set`. */
const tokenIn = (t: string, set: Set<string>): boolean => set.has(t) || canonicalVariants(t).some((v) => set.has(v))

export type CandidateSourceRole = 'article_candidate' | 'support_only_product'
export interface SourceRoleClassification {
  role: CandidateSourceRole
  productEntity: { name: string; url: string | null } | null
  matchedEntityTokens: string[]
  /** Candidate tokens NOT explained by the product entity or a generic modifier. */
  candidateOnlyTokens: string[]
  confidenceReason: string | null
}

/**
 * DOMAIN-NEUTRAL product-affinity SIGNAL (pure). Returns `support_only_product` ONLY when
 * ALL hold, using existing helpers only (no domain/industry/project/vocabulary). This is a
 * SOFT signal used ONLY for synthesis-batch priority (Tier 2) — it NEVER removes a brief
 * from the pool. A candidate is product-affine when:
 *   (1) it is grounded in an owned entity whose type is exactly `product` (never
 *       category/service/page/post);
 *   (2) it is a BARE / NEAR-BARE representation of that one product — every distinctive
 *       candidate token is a product-name token or a generic modifier, the HEAD
 *       (construct-state first token) is a product token, AND it shares at least TWO
 *       tokens with the product (so a single incidental shared token — the false-positive
 *       "מארז" ⟵ "מארז כוסות וויסקי" — never qualifies);
 *   (3) it expresses NO independent supported need beyond the product — plain
 *       `informational` searchNeed and no need-bearing token beyond the product.
 * Anything ambiguous → `article_candidate`. The product entity is never removed.
 */
export function classifyCandidateSourceRole(
  candidate: Pick<OpportunityBrief, 'subject' | 'searchNeed' | 'relatedEntities'>,
): SourceRoleClassification {
  const keep: SourceRoleClassification = { role: 'article_candidate', productEntity: null, matchedEntityTokens: [], candidateOnlyTokens: [], confidenceReason: null }
  const toks = distinctiveTokensOf(candidate.subject)
  if (toks.length < 2) return keep // single-token candidates are handled elsewhere; never suppress here
  // (3a) an independent supported need (question/comparison/selection/care/local-commercial)
  // is always a real article opportunity, even if a product is involved.
  if (candidate.searchNeed !== 'informational') return keep
  // (1) only PRODUCT-typed owned entities may make a candidate product-affine.
  const products = candidate.relatedEntities.filter((e) => e.type === 'product')
  if (products.length === 0) return keep
  for (const p of products) {
    const productToks = new Set(distinctiveTokensOf(p.name))
    if (productToks.size === 0) continue
    // (2) the candidate HEAD must itself be a product token (strong single-product grounding).
    if (!tokenIn(toks[0], productToks)) continue
    const matched = toks.filter((t) => tokenIn(t, productToks))
    // (2b) require ≥2 shared tokens — a lone incidental token (מארז) never qualifies.
    if (matched.length < 2) continue
    // (2)+(3b) NEAR-BARE: no candidate token is need-bearing beyond the product/generics.
    const residual = toks.filter((t) => !tokenIn(t, productToks) && !tokenIn(t, GENERIC_CANON))
    if (residual.length === 0) {
      return {
        role: 'support_only_product',
        productEntity: { name: p.name, url: p.url ?? null },
        matchedEntityTokens: matched,
        candidateOnlyTokens: [],
        confidenceReason: 'near_bare_product: head is a product token, ≥2 tokens covered by one owned product entity, and no independent search need is expressed',
      }
    }
  }
  return keep
}

// ── SOFT synthesis-batch priority: business pillars + tiering + tier-ordered interleave ──
/** Root/homepage URL heuristic: pathname is empty or "/". */
function isHomepageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try { const u = new URL(url); return u.pathname === '' || u.pathname === '/' } catch { const s = String(url).trim(); return s === '/' || /^https?:\/\/[^/]+\/?$/.test(s) }
}

/**
 * Verified NON-product business pillars, from OWNED business evidence only (never
 * individual products, never generic pages, never keyword-research alone): tracked
 * keywords, category entities, service entities, the homepage subject (root URL), and
 * project-focus terms ONLY when corroborated by one of the former.
 */
export function buildBusinessPillars(input: Pick<BriefPoolInput, 'trackedKeywords' | 'projectFocus' | 'entities'>): BusinessPillar[] {
  const pillars: BusinessPillar[] = []
  const toks = (s: string) => new Set(distinctiveTokensOf(s))
  for (const k of input.trackedKeywords) { const t = toks(k); if (t.size) pillars.push({ source: k, type: 'tracked_keyword', tokens: t }) }
  for (const e of input.entities) {
    if (e.type === 'category') { const t = toks(e.name); if (t.size) pillars.push({ source: e.name, type: 'category', tokens: t }) }
    else if (e.type === 'service') { const t = toks(e.name); if (t.size) pillars.push({ source: e.name, type: 'service', tokens: t }) }
    else if (isHomepageUrl(e.url)) { const t = toks(e.name); if (t.size) pillars.push({ source: e.name, type: 'homepage', tokens: t }) }
  }
  // corroborated project focus: a focus term is a pillar ONLY when it shares a token with
  // an already-verified NON-focus pillar (tracked/category/service/homepage).
  const corroborating = new Set<string>()
  for (const p of pillars) for (const t of p.tokens) corroborating.add(t)
  for (const f of input.projectFocus) {
    const t = toks(f)
    if (t.size && Array.from(t).some((x) => corroborating.has(x) || canonicalVariants(x).some((v) => corroborating.has(v)))) {
      pillars.push({ source: f, type: 'corroborated_project_focus', tokens: t })
    }
  }
  return pillars
}

/** A pillar's CORE anchor head — the first distinctive (construct-state) token. */
function anchorHeadOf(pillar: BusinessPillar): string | null {
  return topicSignature(pillar.source, 'informational').head
}
/** Two canonical tokens are the same head (proclitic-tolerant, existing helper only). */
function sameHead(a: string, b: string): boolean {
  return a === b || canonicalVariants(a).includes(b) || canonicalVariants(b).includes(a)
}
/** Owned NON-product source types that may corroborate a single-token / focus anchor. */
const CORROBORATING_PILLAR_TYPES = new Set<PillarType>(['tracked_keyword', 'category', 'service', 'homepage'])
/**
 * True when `anchor` ALSO appears in at least one OTHER owned non-product source (a distinct
 * row of type tracked/category/service/homepage). corroborated_project_focus never counts
 * (it cannot corroborate itself or others); products / keyword-research / posts are not
 * pillar sources at all. Deduped by unique source string (repeated duplicate rows count once).
 */
function anchorCorroborated(anchor: string, self: BusinessPillar, pillars: BusinessPillar[]): boolean {
  const sources = new Set<string>()
  for (const q of pillars) {
    if (q === self || q.source === self.source) continue
    if (!CORROBORATING_PILLAR_TYPES.has(q.type)) continue
    if (Array.from(q.tokens).some((t) => sameHead(t, anchor))) sources.add(q.source)
  }
  return sources.size >= 1
}
/** May this pillar grant Tier 0? A SINGLE-token pillar or a project-focus pillar
 *  additionally requires its anchor head to be independently corroborated. */
function pillarEligibleForTier0(pillar: BusinessPillar, anchor: string | null, pillars: BusinessPillar[]): boolean {
  if (!anchor) return false
  const needsCorroboration = pillar.type === 'corroborated_project_focus' || pillar.tokens.size <= 1
  return needsCorroboration ? anchorCorroborated(anchor, pillar, pillars) : true
}
/**
 * Best VALID CORE-HEAD pillar match. Tier-0 alignment requires the candidate to contain the
 * pillar's CORE ANCHOR HEAD (never merely a shared modifier/recipient/audience/attribute
 * token), to add ≥1 distinctive token beyond that anchor, and the pillar to be eligible (a
 * single-token or project-focus pillar must be independently corroborated). Reuses existing
 * topicSignature / distinctiveTokensOf / canonicalVariants only — no new matcher.
 */
function matchCorePillar(subjectToks: string[], pillars: BusinessPillar[]): { pillar: BusinessPillar; anchor: string; shared: string[]; distinct: string[]; corroborated: boolean } | null {
  let best: { pillar: BusinessPillar; anchor: string; shared: string[]; distinct: string[]; corroborated: boolean } | null = null
  for (const p of pillars) {
    const anchor = anchorHeadOf(p)
    if (!anchor || !pillarEligibleForTier0(p, anchor, pillars)) continue
    // (2) the candidate must CONTAIN the pillar core anchor head (bidirectional canonical
    // equivalence — a proclitic-prefixed candidate token like "בניאגרה" folds to "ניאגרה").
    if (!subjectToks.some((t) => sameHead(t, anchor))) continue
    // (3) it must add ≥1 distinctive token BEYOND that anchor (not a bare anchor restatement).
    const distinct = subjectToks.filter((t) => !sameHead(t, anchor))
    if (distinct.length === 0) continue
    const cand = { pillar: p, anchor, shared: [anchor], distinct, corroborated: anchorCorroborated(anchor, p, pillars) }
    // Prefer the most specific pillar (more tokens) for stable, informative diagnostics.
    if (!best || p.tokens.size > best.pillar.tokens.size) best = cand
  }
  return best
}

/**
 * Assign exactly ONE synthesis priority tier to a brief (pure). NEVER removes a brief.
 * Decision order (products/commercial precede pillar alignment):
 *   (1) productAffinity=true                  → Tier 2 / product_shaped
 *   (2) local-commercial OR commercial family → Tier 2 / direct_commercial
 *   (3) valid CORE-HEAD pillar match + query/focus source → Tier 0 / pillar_aligned_distinct_need
 *   (4) otherwise                             → Tier 1 / independent_article_need
 */
export function classifyBriefPriority(b: OpportunityBrief, pillars: BusinessPillar[]): BriefPriority {
  const kind = b.sourceEvidence[0]?.kind ?? 'unknown'
  const fromQueryOrFocus = kind === 'keyword_research' || kind === 'project_data'
  const toks = distinctiveTokensOf(b.subject)
  const productAffinity = classifyCandidateSourceRole(b).role === 'support_only_product'
  const isLocalCommercial = b.searchNeed === 'local_commercial'
  const best = matchCorePillar(toks, pillars)
  const meta = {
    matchedPillar: best?.pillar.source ?? null,
    matchedPillarType: best?.pillar.type ?? null,
    matchedPillarTokens: best?.shared ?? [],
    distinctModifierTokens: best?.distinct ?? [],
    matchedPillarAnchorHead: best?.anchor ?? null,
    pillarAnchorCorroborated: best?.corroborated ?? false,
    productAffinity,
    finalSynthesisRank: -1,
  }
  // (1) product precedence — a product-shaped candidate is NEVER Tier 0.
  if (productAffinity) return { tier: 2, reason: 'product_shaped', ...meta }
  // (2) direct commercial / local precedence.
  if (isLocalCommercial || b.family === 'commercial') return { tier: 2, reason: 'direct_commercial', ...meta }
  // (3) only NOW: a VALID core-head pillar match from a query/focus source → Tier 0.
  if (fromQueryOrFocus && best) return { tier: 0, reason: `pillar_aligned_distinct_need:${best.pillar.type}`, ...meta }
  // (4) otherwise.
  return { tier: 1, reason: 'independent_article_need', ...meta }
}

/** Existing family round-robin (extracted verbatim) — applied INSIDE a single tier. */
function familyInterleave(briefs: OpportunityBrief[]): OpportunityBrief[] {
  const byFamily = new Map<OpportunityFamily, OpportunityBrief[]>()
  for (const b of briefs) { const l = byFamily.get(b.family) ?? []; l.push(b); byFamily.set(b.family, l) }
  const families: OpportunityFamily[] = ['informational', 'comparison', 'commercial']
  const out: OpportunityBrief[] = []
  let added = true
  while (added) { added = false; for (const f of families) { const l = byFamily.get(f); if (l && l.length) { out.push(l.shift() as OpportunityBrief); added = true } } }
  return out
}

/**
 * SOFT priority ordering at the pool→synthesis boundary. Returns the SAME briefs (no
 * additions, no removals) ordered by the tuple: (priorityTier 0<1<2) → existing briefScore
 * desc → existing opportunityId — with the existing family round-robin applied INSIDE each
 * tier (never one global interleave that lets a Tier-2 query jump ahead of Tier-0). Sets
 * each brief's priority + finalSynthesisRank. Identical to the pre-patch order when all
 * briefs share one tier.
 */
export function prioritizeBriefsForSynthesis(pool: OpportunityBrief[], context: { pillars: BusinessPillar[] }): OpportunityBrief[] {
  for (const b of pool) b.priority = classifyBriefPriority(b, context.pillars)
  const ordered: OpportunityBrief[] = []
  for (const tier of [0, 1, 2] as const) {
    const group = pool.filter((b) => b.priority?.tier === tier)
    group.sort((a, b) => b.briefScore - a.briefScore || (a.opportunityId < b.opportunityId ? -1 : 1))
    ordered.push(...familyInterleave(group))
  }
  ordered.forEach((b, i) => { if (b.priority) b.priority.finalSynthesisRank = i })
  return ordered
}

const briefId = (subject: string) => {
  // Stable, collision-resistant id from the normalized subject (FNV-1a 32-bit).
  const s = normalizePhrase(subject)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return `brief_${(h >>> 0).toString(36)}`
}

/**
 * Build + validate + rank the deterministic brief pool. Every rejection is COUNTED
 * (exact reconciliation: raw candidates = pool + rejected). Order: strongest first,
 * round-robin across families so one family can never monopolize a batch.
 */
export function buildBriefPool(input: BriefPoolInput, opts?: { maxPerSubjectHead?: number }): { pool: OpportunityBrief[]; diagnostics: BriefPoolDiagnostics } {
  // Per-head admission cap: OPTIONAL safeguard, no domain-blind default. When a caller
  // does not pass maxPerSubjectHead, NO fixed per-head limit is applied — candidates that
  // already passed the need-aware duplicate checks above (isHighConfidenceDuplicate:
  // shared head AND ≥0.5 modifier overlap AND same intent) are admitted regardless of a
  // shared first-token head. This removes the coarse `maxPerHead = 2` default that
  // over-collapsed broad shared-head families (e.g. "מתנות ל<recipient>": distinct
  // recipient/occasion needs share the head "מתנ" but have NON-overlapping modifiers, so
  // the need-aware gate already keeps them distinct). Narrow near-duplicate variants (e.g.
  // "תיקון ניאגרה סמויה <brand>") are still collapsed by isHighConfidenceDuplicate, which
  // is unchanged. The cap remains available for explicit callers/tests via the option.
  const maxPerHead = opts?.maxPerSubjectHead
  const rejected: Record<string, number> = {}
  const rejectedExamples: { subject: string; reason: string; evidenceKind: string }[] = []
  const reject = (r: string, subject: string, evidenceKind: string) => {
    rejected[r] = (rejected[r] ?? 0) + 1
    if (rejectedExamples.filter((e) => e.reason === r).length < 5) rejectedExamples.push({ subject: subject.slice(0, 120), reason: r, evidenceKind })
  }
  const entityTokenIndex = buildEntityTokenIndex(input.entities)
  const coverageTokenIndex = buildCoverageTokenIndex(input.publishedCoverage)

  const candidates: OpportunityBrief[] = []
  let rawQuery = 0, rawTheme = 0, rawTracked = 0

  // (a) QUERY-granular briefs: each real multi-word keyword-research query is its own
  // candidate opportunity, carrying ITS OWN volume only.
  const seenQuery = new Set<string>()
  for (const kr of input.keywordResearch) {
    const q = (kr.query || '').trim()
    if (!q) continue
    const nq = normalizePhrase(q)
    if (!nq || seenQuery.has(nq)) continue
    seenQuery.add(nq)
    rawQuery++
    const toks = distinctiveTokensOf(q)
    if (toks.length < 2) { reject('subject_too_generic', q, 'keyword_research'); continue }
    const need = needOf(q)
    candidates.push(makeBrief({
      subject: q,
      need,
      evidence: [{ kind: 'keyword_research', text: q }],
      aligned: (kr.volume ?? 0) > 0 ? { query: q, volume: kr.volume as number } : null,
      input, entityTokenIndex, coverageTokenIndex,
    }))
  }

  // (b) TRACKED keywords / project focus: business-priority subjects; demand only
  // when an exact keyword-research query matches.
  const krByNorm = new Map<string, KeywordResearchNode>()
  for (const kr of input.keywordResearch) { const n = normalizePhrase(kr.query || ''); if (n && !krByNorm.has(n)) krByNorm.set(n, kr) }
  for (const t of [...input.trackedKeywords, ...input.projectFocus]) {
    const s = (t || '').trim()
    if (!s) continue
    const ns = normalizePhrase(s)
    if (!ns || seenQuery.has(ns)) continue
    seenQuery.add(ns)
    rawTracked++
    const toks = distinctiveTokensOf(s)
    if (toks.length < 2) { reject('subject_too_generic', s, 'project_data'); continue }
    const exact = krByNorm.get(ns)
    candidates.push(makeBrief({
      subject: s,
      need: needOf(s),
      evidence: [{ kind: 'project_data', text: s }],
      aligned: exact && (exact.volume ?? 0) > 0 ? { query: exact.query, volume: exact.volume as number } : null,
      input, entityTokenIndex, coverageTokenIndex,
    }))
  }

  // (c) ENTITY-THEME briefs: a distinctive subject token shared by >= 2 entities
  // becomes ONE care/selection guide brief (never one article per entity, never a
  // bare entity name as subject). Demand never claimed.
  const themes = entityThemes(input.entities, input.domainTypeWords, input.attributeTokens ?? new Set())
  for (const th of themes) {
    rawTheme++
    if (seenQuery.has(normalizePhrase(th.subject))) { reject('theme_duplicates_query', th.subject, 'site_scan'); continue }
    candidates.push(makeBrief({
      subject: th.subject,
      need: th.need,
      evidence: th.entities.slice(0, 6).map((e) => ({ kind: 'site_scan' as EvidenceSourceKind, text: e.name })),
      aligned: null,
      relatedOverride: th.entities,
      input, entityTokenIndex, coverageTokenIndex,
    }))
  }

  // ── Pre-AI validation (counted) ────────────────────────────────────────────
  // NO product-affinity REJECTION: every brief that passes ownership / coverage / pending
  // / semantic-duplicate (and the optional explicit head cap) stays in the pool. Owned
  // products are demoted only SOFTLY at synthesis-batch ordering below (Tier 2), never
  // removed — they also remain available for relatedEntities / internal links.
  const pool: OpportunityBrief[] = []
  const acceptedSignatures: TopicSignature[] = []
  const perHead = new Map<string, number>()
  for (const b of candidates) {
    const kind = b.sourceEvidence[0]?.kind ?? 'unknown'
    if (input.isOwnedByEntity(b.subject)) { reject('exact_existing_keyword_owner', b.subject, kind); continue }
    if (input.pendingExactKeys.has(normalizePhrase(b.subject))) { reject('pending_exact_duplicate', b.subject, kind); continue }
    if (input.isCoveredByContent(b.subject, b.subject)) { reject('covered_by_existing_content', b.subject, kind); continue }
    const sig = topicSignature(b.subject, b.intendedIntent)
    if (input.pendingSignatures.some((p) => isHighConfidenceDuplicate(sig, p))) { reject('pending_semantic_duplicate', b.subject, kind); continue }
    if (acceptedSignatures.some((a) => isHighConfidenceDuplicate(sig, a))) { reject('brief_semantic_duplicate', b.subject, kind); continue }
    // Head cap is applied ONLY when a caller explicitly supplied maxPerSubjectHead;
    // by default there is no per-head admission limit (need-aware dedup above governs).
    const head = sig.head ?? ''
    if (head && maxPerHead !== undefined) {
      const n = perHead.get(head) ?? 0
      if (n >= maxPerHead) { reject('subject_head_cap', b.subject, kind); continue }
      perHead.set(head, n + 1)
    }
    acceptedSignatures.push(sig)
    pool.push(b)
  }

  // ── Rank + SOFT priority ordering + per-tier family round-robin ─────────────
  // Tier 0 (pillar-aligned distinct need) → Tier 1 (other independent article) → Tier 2
  // (product-shaped / commercial), each ordered by the existing briefScore/opportunityId
  // and family round-robin. No brief is added or removed; only the order changes.
  const pillars = buildBusinessPillars(input)
  const interleaved = prioritizeBriefsForSynthesis(pool, { pillars })

  const by_family: Record<string, number> = {}
  for (const b of interleaved) by_family[b.family] = (by_family[b.family] ?? 0) + 1
  return {
    pool: interleaved,
    diagnostics: {
      raw_query_candidates: rawQuery,
      raw_theme_candidates: rawTheme,
      raw_tracked_candidates: rawTracked,
      total_raw_candidates: rawQuery + rawTracked + rawTheme,
      rejected_by_reason: rejected,
      rejected_examples: rejectedExamples,
      brief_priority: interleaved.map((b) => ({
        opportunityId: b.opportunityId,
        subject: b.subject,
        tier: b.priority?.tier ?? 1,
        priorityReason: b.priority?.reason ?? 'independent_article_need',
        matchedPillar: b.priority?.matchedPillar ?? null,
        matchedPillarType: b.priority?.matchedPillarType ?? null,
        matchedPillarTokens: b.priority?.matchedPillarTokens ?? [],
        distinctModifierTokens: b.priority?.distinctModifierTokens ?? [],
        matchedPillarAnchorHead: b.priority?.matchedPillarAnchorHead ?? null,
        pillarAnchorCorroborated: b.priority?.pillarAnchorCorroborated ?? false,
        productAffinity: b.priority?.productAffinity ?? false,
        finalSynthesisRank: b.priority?.finalSynthesisRank ?? -1,
      })),
      pool_size: interleaved.length,
      by_family,
      with_demand: interleaved.filter((b) => b.alignedDemandQuery).length,
    },
  }
}

function makeBrief(args: {
  subject: string
  need: SearchNeed
  evidence: { kind: EvidenceSourceKind; text: string }[]
  aligned: { query: string; volume: number } | null
  relatedOverride?: EntityNode[]
  input: BriefPoolInput
  entityTokenIndex: Map<string, EntityNode[]>
  coverageTokenIndex: Map<string, string[]>
}): OpportunityBrief {
  const { subject, need, evidence, aligned, input } = args
  const toks = distinctiveTokensOf(subject)
  const related = args.relatedOverride ?? relatedEntitiesFor(toks, args.entityTokenIndex)
  const covered = coverageFor(toks, args.coverageTokenIndex)
  const gap = covered.length === 0
  const intent = intentOf(subject, need)
  const multiSource = related.length > 0 ? 1 : 0
  const demandScore = aligned ? Math.min(1, Math.log10(1 + aligned.volume) / 4) : 0
  const confidence = aligned ? 0.9 : related.length > 0 ? 0.6 : 0.5
  return {
    opportunityId: briefId(subject),
    subject,
    searchNeed: need,
    family: familyOf(need),
    sourceEvidence: evidence,
    alignedDemandQuery: aligned,
    demandVolumeSource: aligned ? 'keyword_research_cache' : null,
    intendedIntent: intent,
    intendedPageType: 'article',
    existingContentGap: gap,
    relatedEntities: related.slice(0, 6).map((e) => ({ name: e.name, url: e.url ?? null, type: e.type })),
    publishedCoverage: covered.slice(0, 4),
    confidence,
    briefScore: Number((demandScore * 0.45 + multiSource * 0.2 + (gap ? 0.2 : 0) + confidence * 0.15).toFixed(4)),
  }
}

function buildEntityTokenIndex(entities: EntityNode[]): Map<string, EntityNode[]> {
  const idx = new Map<string, EntityNode[]>()
  for (const e of entities) for (const t of new Set(contentTokens(e.name))) { const l = idx.get(t) ?? []; if (l.length < 20) l.push(e); idx.set(t, l) }
  return idx
}
function buildCoverageTokenIndex(published: string[]): Map<string, string[]> {
  const idx = new Map<string, string[]>()
  for (const title of published) for (const t of new Set(contentTokens(title))) { const l = idx.get(t) ?? []; if (l.length < 10) l.push(title); idx.set(t, l) }
  return idx
}
function relatedEntitiesFor(subjectToks: string[], idx: Map<string, EntityNode[]>): EntityNode[] {
  const seen = new Set<string>()
  const out: EntityNode[] = []
  for (const t of subjectToks) for (const e of idx.get(t) ?? []) { const k = e.name; if (!seen.has(k)) { seen.add(k); out.push(e) } }
  return out
}
function coverageFor(subjectToks: string[], idx: Map<string, string[]>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of subjectToks) for (const c of idx.get(t) ?? []) if (!seen.has(c)) { seen.add(c); out.push(c) }
  return out
}

/** Entity themes: a distinctive (non-generic, non-type/attribute) token shared by
 *  >= 2 entities → ONE broader guide subject built from the token's surface form. */
const THEMEABLE_TYPES = new Set(['product', 'category', 'service'])
/**
 * RC4 — themes are STANDALONE SEMANTIC SUBJECT CLASSES, never a shared modifier.
 * The old heuristic framed ANY token shared across entities as "איך לבחור X",
 * producing "איך לבחור ורוד/כלה/שוקולד/גיבסניות" live. Now a theme requires a
 * MULTI-TOKEN NOUN PHRASE (an adjacent bigram) appearing consistently across
 * >= 2 commercial entities, where NO token is a generic/attribute/type modifier
 * (colour, size, occasion, recipient, packaging …). Single shared tokens are
 * never themes — creative single-subject needs belong to constrained discovery,
 * which must anchor them explicitly. No forced "איך לבחור" frame: the subject
 * IS the noun phrase; the synthesis stage chooses a fitting structure.
 */
function entityThemes(allEntities: EntityNode[], domainTypeWords: Set<string>, attributeTokens: Set<string>): { subject: string; need: SearchNeed; entities: EntityNode[] }[] {
  const entities = allEntities.filter((e) => THEMEABLE_TYPES.has(e.type ?? 'unknown'))
  const phrases = new Map<string, { surface: string; entities: EntityNode[] }>()
  for (const e of entities) {
    const words = (e.name || '').split(/\s+/).filter(Boolean)
    const seenInEntity = new Set<string>()
    for (let i = 0; i + 1 < words.length; i++) {
      const surface = `${words[i]} ${words[i + 1]}`
      const t1 = contentTokens(words[i])[0]
      const t2 = contentTokens(words[i + 1])[0]
      if (!t1 || !t2 || t1.length < 3 || t2.length < 3) continue
      // NO modifier token may participate: generic commerce words, corpus
      // attributes (colours/sizes/occasions/recipients), numbers.
      if ([t1, t2].some((t) => GENERIC_TOKENS.has(t) || attributeTokens.has(t) || /\d/.test(t))) continue
      const key = `${t1} ${t2}`
      if (seenInEntity.has(key)) continue
      seenInEntity.add(key)
      const cur = phrases.get(key) ?? { surface, entities: [] }
      if (!cur.entities.some((x) => x.name === e.name)) cur.entities.push(e)
      phrases.set(key, cur)
    }
  }
  const themes: { subject: string; need: SearchNeed; entities: EntityNode[] }[] = []
  const ranked = Array.from(phrases.entries()).filter(([, v]) => v.entities.length >= 2).sort((a, b) => b[1].entities.length - a[1].entities.length || (a[0] < b[0] ? -1 : 1))
  for (const [, v] of ranked) {
    if (themes.length >= 8) break
    themes.push({ subject: v.surface, need: 'category_guide', entities: v.entities })
  }
  return themes
}

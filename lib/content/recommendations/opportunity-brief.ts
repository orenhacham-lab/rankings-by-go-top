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
import { topicSignature, isHighConfidenceDuplicate, distinctiveTokensOf, type TopicSignature } from './semantic-dup'
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
  const maxPerHead = opts?.maxPerSubjectHead ?? 2
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
    const head = sig.head ?? ''
    if (head) {
      const n = perHead.get(head) ?? 0
      if (n >= maxPerHead) { reject('subject_head_cap', b.subject, kind); continue }
      perHead.set(head, n + 1)
    }
    acceptedSignatures.push(sig)
    pool.push(b)
  }

  // ── Rank + family round-robin ──────────────────────────────────────────────
  pool.sort((a, b) => b.briefScore - a.briefScore || (a.opportunityId < b.opportunityId ? -1 : 1))
  const byFamily = new Map<OpportunityFamily, OpportunityBrief[]>()
  for (const b of pool) { const l = byFamily.get(b.family) ?? []; l.push(b); byFamily.set(b.family, l) }
  const families: OpportunityFamily[] = ['informational', 'comparison', 'commercial']
  const interleaved: OpportunityBrief[] = []
  let added = true
  while (added) {
    added = false
    for (const f of families) { const l = byFamily.get(f); if (l && l.length) { interleaved.push(l.shift() as OpportunityBrief); added = true } }
  }

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

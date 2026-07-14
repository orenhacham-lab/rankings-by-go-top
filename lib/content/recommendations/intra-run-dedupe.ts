/**
 * Final intra-run semantic dedupe (one focused stage; no model, no embeddings).
 *
 * After keyword salvage, two candidates from the SAME run can describe the same
 * underlying topic with different primary keywords and lexically-divergent titles
 * (below the engine's 0.82 title-jaccard). This collapses such same-topic pairs to
 * ONE deterministic winner, comparing the underlying topic via structured data —
 * a shared DISTINCTIVE entity signature (brand/model + product/qualifier nouns) at
 * a strong overlap AND a compatible search intent. It deliberately does NOT collapse
 * distinct subtopics that merely share a category or entity (different intent,
 * location, lifecycle or sub-service keep both).
 */

import type { RecommendationSource, TopicSuggestion } from './types'

/** Hebrew function/question words + a few generic terms — domain-NEUTRAL. */
const STOPWORDS = new Set([
  'מדוע', 'איך', 'האם', 'מה', 'מתי', 'איפה', 'למה', 'כיצד', 'מהו', 'מהי', 'הוא', 'היא', 'זה', 'זו', 'זאת',
  'של', 'את', 'עם', 'על', 'אל', 'כי', 'גם', 'או', 'אבל', 'יש', 'אין', 'הכי', 'כל', 'כדי', 'בין', 'ללא',
  'the', 'a', 'an', 'to', 'of', 'for', 'and', 'or', 'is', 'how', 'why', 'what', 'best',
])

/** Light Hebrew normalization: strip one leading attached particle + a plural suffix
 *  so "למטבח"→"מטבח" and "תצוגות"→"תצוג" match "מטבח"/"תצוגה". Latin unchanged. */
function normToken(raw: string): string {
  let t = raw.toLowerCase()
  if (/^[א-ת]+$/.test(t)) {
    if (t.length >= 5 && /^[בלמהושכ]/.test(t)) t = t.slice(1)
    t = t.replace(/(ים|ות|יה|ה)$/, '')
  }
  return t
}

function rawTokens(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[?!.,:;"'“”׳״()\-–—/|]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
}

/** DISTINCTIVE tokens: brand/model (latin or digit-bearing) or a content noun
 *  (normalized Hebrew length >= 4). Generic short words are dropped. */
function distinctiveTokens(c: Pick<TopicSuggestion, 'title' | 'primaryKeyword' | 'secondaryKeywords'>): Set<string> {
  const out = new Set<string>()
  const src = [c.title, c.primaryKeyword, ...(c.secondaryKeywords || [])].join(' ')
  for (const w of rawTokens(src)) {
    const isLatinOrNum = /[a-z]/.test(w) || /\d/.test(w)
    const n = normToken(w)
    if (isLatinOrNum) { if (w.length >= 2) out.add(w) }
    else if (n.length >= 4) out.add(n)
  }
  return out
}

type IntentCluster = 'buy' | 'info' | 'local' | 'other'
function intentCluster(intent: string | undefined): IntentCluster {
  const i = (intent || '').toLowerCase()
  if (/transactional|commercial|comparison/.test(i)) return 'buy'
  if (/informational/.test(i)) return 'info'
  if (/local/.test(i)) return 'local'
  return 'other'
}

/** Two candidates describe the SAME topic. Requires a compatible intent AND a
 *  strong shared distinctive-entity signature (≥3 shared distinctive tokens that
 *  also cover a meaningful fraction of the shorter candidate). Divergent intent,
 *  location or lifecycle keeps them distinct. */
export function isSameTopic(
  a: Pick<TopicSuggestion, 'title' | 'primaryKeyword' | 'secondaryKeywords' | 'searchIntent'>,
  b: Pick<TopicSuggestion, 'title' | 'primaryKeyword' | 'secondaryKeywords' | 'searchIntent'>,
): boolean {
  if (intentCluster(a.searchIntent) !== intentCluster(b.searchIntent)) return false
  const da = distinctiveTokens(a)
  const db = distinctiveTokens(b)
  if (da.size < 3 || db.size < 3) return false
  let shared = 0
  for (const t of da) if (db.has(t)) shared++
  // Require a strong shared entity signature: at least 3 shared distinctive tokens
  // (the primary gate — distinct subtopics share ≤2), covering a meaningful fraction
  // of the smaller candidate so two long unrelated titles can't collide incidentally.
  if (shared < 3) return false
  return shared / Math.min(da.size, db.size) >= 0.35
}

export interface IntraRunCollision {
  survivingTitle: string
  rejectedTitle: string
  collisionReason: string
  winnerReason: string
}
export interface IntraRunDedupeResult {
  survivors: TopicSuggestion[]
  collisions: IntraRunCollision[]
  removed: number
  merged: number
}

const INTENT_RANK: Record<string, number> = { transactional: 5, commercial: 4, comparison: 3, local: 2, informational: 1 }
function intentScore(intent: string | undefined): number { return INTENT_RANK[(intent || '').toLowerCase()] ?? 0 }
function kwSpecificity(kw: string): number { return (kw || '').trim().split(/\s+/).filter(Boolean).length }

/**
 * Deterministic winner: (1) more independent supporting sources, (2) higher score,
 * (3) more specific primary keyword, (4) clearer/commercial intent, (5) richer
 * evidence, (6) stable id tie-break. Returns the winner + a short reason.
 */
function pickWinner(a: TopicSuggestion, b: TopicSuggestion): { winner: TopicSuggestion; loser: TopicSuggestion; reason: string } {
  const cmps: [number, number, string][] = [
    [(a.supportingSources?.length ?? 1), (b.supportingSources?.length ?? 1), 'more_supporting_sources'],
    [a.suggestionScore ?? 0, b.suggestionScore ?? 0, 'higher_score'],
    [kwSpecificity(a.primaryKeyword), kwSpecificity(b.primaryKeyword), 'more_specific_keyword'],
    [intentScore(a.searchIntent), intentScore(b.searchIntent), 'clearer_intent'],
    [(a.suggestionReason || '').length, (b.suggestionReason || '').length, 'better_evidence'],
  ]
  for (const [av, bv, reason] of cmps) {
    if (av > bv) return { winner: a, loser: b, reason }
    if (bv > av) return { winner: b, loser: a, reason }
  }
  // Stable deterministic tie-break.
  return a.id <= b.id ? { winner: a, loser: b, reason: 'stable_tiebreak' } : { winner: b, loser: a, reason: 'stable_tiebreak' }
}

/** Merge safe metadata from the rejected twin into the survivor (compatible intents
 *  only — guaranteed by isSameTopic). Never merges incompatible intents. */
function mergeInto(winner: TopicSuggestion, loser: TopicSuggestion): boolean {
  let merged = false
  const srcs = new Set<RecommendationSource>([...(winner.supportingSources ?? [winner.source]), ...(loser.supportingSources ?? [loser.source])])
  if (srcs.size > (winner.supportingSources?.length ?? 1)) { winner.supportingSources = Array.from(srcs); merged = true }
  const sk = new Set<string>([...(winner.secondaryKeywords || []), ...(loser.secondaryKeywords || [])].map((s) => s.trim()).filter(Boolean))
  const capped = Array.from(sk).slice(0, 6)
  if (capped.length > (winner.secondaryKeywords?.length ?? 0)) { winner.secondaryKeywords = capped; merged = true }
  if ((loser.sourceEvidence?.length ?? 0) > 0) {
    winner.sourceEvidence = [...(winner.sourceEvidence ?? []), ...(loser.sourceEvidence ?? [])]
    merged = true
  }
  return merged
}

/**
 * Collapse same-topic candidates from ONE run to a single winner each. Greedy:
 * every candidate is compared against ALL earlier survivors (so cross-source pairs
 * generated milliseconds apart in the same request are caught before persistence).
 */
export function dedupeIntraRunSemantic(candidates: TopicSuggestion[]): IntraRunDedupeResult {
  const survivors: TopicSuggestion[] = []
  const collisions: IntraRunCollision[] = []
  let removed = 0
  let mergedCount = 0
  for (const cand of candidates) {
    const idx = survivors.findIndex((s) => isSameTopic(s, cand))
    if (idx === -1) { survivors.push(cand); continue }
    const existing = survivors[idx]
    const { winner, loser, reason } = pickWinner(existing, cand)
    if (mergeInto(winner, loser)) mergedCount++
    survivors[idx] = winner
    removed++
    collisions.push({ survivingTitle: winner.title, rejectedTitle: loser.title, collisionReason: 'same_entity_intent_topic', winnerReason: reason })
  }
  return { survivors, collisions, removed, merged: mergedCount }
}

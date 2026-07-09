/**
 * Cache-backed internal-link planner — Phase 2B (DRY RUN ONLY).
 *
 * Pure, deterministic, side-effect-free. Given a topic and the project's CACHED
 * scan targets (ScannedTarget[] from wordpress_content_index), it decides which
 * targets WOULD be linked and with which anchor — and WHY each was selected or
 * rejected. Writes nothing, generates nothing, inserts nothing.
 *
 * Safety rules:
 *   - only eligibility === 'yes' targets can be selected; 'caution' excluded by
 *     default (allowCaution → included but with a HIGHER confidence bar);
 *     'no' (utility/contact/legal/cart/tag/api/action/malformed/…) NEVER used.
 *   - anchors come ONLY from the scanner's vetted usableAnchors, or a clean
 *     target keyword when keywordAvailable and the shape is valid.
 *   - priority is a BONUS (hub/category > product > post; homepage penalized),
 *     never a floor override — an irrelevant hub still fails the relevance floor.
 *   - SELF/DUPLICATE guard: never link a topic to itself or to an existing
 *     article/target representing the same topic (exact title/keyword, [ours],
 *     or one title contained in the other). Related pages are NOT blocked.
 *   - de-duplicate by URL + anchor, cap per topic, and ZERO links is valid.
 *
 * No AI. No I/O. Reuses the shared deterministic helpers.
 */

import { tokens, jaccard } from '@/lib/content/recommendations/dedupe'
import { manualAnchorShapeValid, isInternalUrl, normalizeHref, normalizeUrlKey } from '@/lib/content/internal-links'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import type { TopicForPlanning } from '@/lib/content/internal-link-planner'

/** Bump when the cache-planner scoring/guards change (stamped on saved plans). */
export const CACHE_PLANNER_VERSION = '2b.3'

// --- Tunable thresholds (explicit for review) --------------------------------
export const CACHE_PLANNER_RELEVANCE_MIN = 0.3
// Phase 3F.3.4a — slightly lower floors for HIGH-VALUE ecommerce hubs
// (category / product-category / product) but ONLY when there is a REAL token/stem
// overlap with the topic. This recovers "הליכון מתקפל → הליכונים" without ever
// letting an unrelated target through (a matched token is still required).
export const CACHE_PLANNER_RELEVANCE_MIN_ECOM = 0.22
export const CACHE_PLANNER_MIN_CONFIDENCE_ECOM = 0.38
/** Rank-only boost so a strongly-matching category/product outranks related articles. */
export const COMMERCIAL_TARGET_BOOST = 0.2
export const CACHE_PLANNER_SELF_SIMILARITY_MAX = 0.85
export const CACHE_PLANNER_MIN_CONFIDENCE = 0.45
/** Caution targets (homepage/unknown) must clear a higher bar. */
export const CACHE_PLANNER_CAUTION_MIN_CONFIDENCE = 0.6
export const CACHE_PLANNER_MAX_LINKS = 4

/**
 * Priority BONUS applied to relevance — makes higher-value targets rank first
 * among the relevant ones, without ever letting an irrelevant target through
 * (the relevance floor is enforced independently).
 */
export const PRIORITY_BONUS: Record<string, number> = {
  commercial_category_or_service_hub: 0.15,
  content_hub: 0.12,
  strategic_content_page: 0.08,
  product_or_specific_offer: 0.05,
  post_or_article: 0.05,
  homepage: -0.1,
  other_caution: -0.15,
  ineligible: -1, // defensive; ineligible is filtered out anyway
}

export type CacheAnchorSource = 'usable_anchor' | 'target_keyword'

export type RelevanceMethod = 'jaccard' | 'containment' | 'entity_single_token'

export interface CachePlannedLink {
  targetUrl: string
  targetTitle: string
  targetRole: string
  targetPriority: string
  eligibility: string
  anchorText: string | null
  anchorSource: CacheAnchorSource | null
  relevance: number
  priorityBonus: number
  confidence: number
  selected: boolean
  reason: string
  rejectedReasons: string[]
  // Backend diagnostics (additive; not persisted, not required by any UI).
  matchedTokens: string[]
  missingTokens: string[]
  entityMatchedTokens: string[]
  normalizedTopicTokens: string[]
  normalizedCandidateTokens: string[]
  relevanceMethod: RelevanceMethod
  // Phase 3F.3.5 semantic diagnostics (additive; response-only, not persisted):
  //  semanticMatchType = how the topic matched this indexed target; matchedTargetTerms
  //  = the target's own terms that matched; matchedSourceFields = which index fields
  //  produced the match (title/keyword/slug/anchor); commercialRank = 1-based order
  //  among category/product candidates by confidence.
  semanticMatchType?: SemanticMatchType
  matchedTargetTerms?: string[]
  matchedSourceFields?: string[]
  commercialRank?: number | null
  // Phase 3F.3.7 cluster-gate diagnostics (additive; response-only):
  //  clusterCompatibility = same_cluster / parent_child / sibling_same_parent /
  //  exact_unknown / blocked_cross_cluster / blocked_generic_only / unknown_no_exact;
  //  topicCluster / targetCluster = the strong identity terms of each side.
  clusterCompatibility?: string
  topicCluster?: string[]
  targetCluster?: string[]
  // Phase 2I candidate tiers (response-only diagnostics; not persisted):
  //  recommended = auto-selected; reviewable = rejected ONLY for soft scoring
  //  reasons and safe to manually approve; blocked = a hard-safety failure that
  //  must never be manually approvable.
  reviewability: CandidateTier
  canManualApprove: boolean
  blockReason: string | null
  // Phase 3G.5 — true when blocked by a TRUE hard-safety/target failure (worth
  // showing in the review UI's blocked list); false/absent when the candidate is
  // merely irrelevant (cluster gate) — hidden noise, not a "blocked candidate".
  displayBlocked?: boolean
}

export type CandidateTier = 'recommended' | 'reviewable' | 'blocked'

/**
 * Soft rejection reasons a human may override. Anything NOT in this set can
 * never be manually approved.
 *
 * Phase 3G.5 — the manual/selectable tier contains ONLY candidates that share a
 * real cluster-identity match with the topic, point at an ELIGIBLE target, and
 * merely scored under the automatic floors (or fell over the cap). Reverted from
 * 3F.3.7a: the strict CLUSTER-GATE reasons (generic-only / cross-cluster /
 * unknown) are HARD again — a candidate whose only basis is generic-word overlap
 * must never surface as a valid selectable suggestion. `target_caution_excluded`
 * (homepage/unknown pages) is also HARD: insertion requires eligibility 'yes',
 * so approving a caution target could only ever produce a dead
 * approved-but-never-insertable link.
 */
const SOFT_REJECTION_BASES = new Set([
  'low_relevance', 'low_confidence', 'over_cap',
])
/**
 * Strict cluster-gate verdicts (Phase 3F.3.7): the candidate is merely
 * IRRELEVANT to the topic (generic-only overlap / different cluster / unknown
 * identity) — not "unsafe". Never manually approvable, and also not interesting
 * to display in the blocked list (they are noise, not blocked candidates).
 */
const CLUSTER_GATE_BASES = new Set([
  'blocked_cross_cluster', 'blocked_generic_only', 'unknown_no_exact',
])
function isSoftRejection(reason: string): boolean {
  return SOFT_REJECTION_BASES.has(reason.split('(')[0]!)
}
function isClusterGateRejection(reason: string): boolean {
  return CLUSTER_GATE_BASES.has(reason.split('(')[0]!)
}
/** True when EVERY rejection reason is soft (⇒ safe to manually approve). */
export function isReviewableRejection(rejectedReasons: string[]): boolean {
  return rejectedReasons.length > 0 && rejectedReasons.every(isSoftRejection)
}
/**
 * True when the candidate failed a TRUE hard-safety/target check (no anchor,
 * self/duplicate, ineligible or caution target, external URL, duplicate
 * url/anchor) — as opposed to being merely irrelevant (cluster gate) or merely
 * under-scored (soft). Review UIs show ONLY these in the "blocked" section so
 * the list stays accurate instead of dumping every unrelated page on the site.
 */
export function isDisplayBlockedRejection(rejectedReasons: string[]): boolean {
  return rejectedReasons.some((r) => !isSoftRejection(r) && !isClusterGateRejection(r))
}

export interface CacheTopicPlan {
  topicId: string
  topicTitle: string
  primaryKeyword: string | null
  selected: CachePlannedLink[]
  rejected: CachePlannedLink[]
  summary: string
}

const round2 = (n: number) => Math.round(n * 100) / 100
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Normalize a title/keyword for comparison: lowercase, strip punctuation, collapse spaces. */
function normText(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[?!.,:;"“”׳״()[\]{}<>«»\-–—/|]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// --- Planner-local Hebrew/English normalization (RELEVANCE SCORING ONLY) ------
// Deliberately NOT exported and NOT shared with dedupe.ts `tokens()`: topic
// suggestion dedupe must keep its current, un-normalized tokenizer. This feeds
// only the relevance/containment signal below. Goal is CONSISTENCY between the
// topic and target token sets (so morphological variants of the same root
// match), not perfect linguistic stemming.

const HE_FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }
const HE_PREFIXES = new Set(['ב', 'ל', 'מ', 'ה', 'ו', 'ש', 'כ'])

/** Generic connectors / question words / guide-boilerplate — never niche terms. */
const REL_STOPWORDS = new Set([
  // Hebrew
  'של', 'עם', 'על', 'את', 'זה', 'או', 'גם', 'כל', 'יש', 'לא', 'אם', 'כי',
  'איך', 'מה', 'למה', 'מתי', 'איפה', 'איזה', 'מדריך', 'המדריך', 'מלא', 'המלא',
  'בחירה', 'בחירת', 'לבחור', 'טיפים', 'טיפ', 'מומלץ', 'מומלצים', 'מול',
  // English
  'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'with', 'guide', 'best',
  'tips', 'how', 'what', 'why', 'when',
])

const foldFinals = (w: string): string => Array.from(w, (c) => HE_FINALS[c] ?? c).join('')

/** Strip up to 2 stacked 1-letter Hebrew prefixes, keeping the stem ≥3 chars. */
function stripHebrewPrefixes(w: string): string {
  let x = w
  for (let i = 0; i < 2; i++) {
    if (x.length >= 4 && HE_PREFIXES.has(x[0]!)) x = x.slice(1)
    else break
  }
  return x
}

/** Conservative plural/suffix stem: ים/ות when long enough; ה/ת only when longer. */
function stemHebrew(w: string): string {
  if (w.length >= 5 && (w.endsWith('ות') || w.endsWith('ים'))) return w.slice(0, -2)
  if (w.length >= 4 && (w.endsWith('ה') || w.endsWith('ת'))) return w.slice(0, -1)
  return w
}

const stemOne = (w0: string): string => {
  const isHebrew = /[֐-׿]/.test(w0)
  return isHebrew ? foldFinals(stemHebrew(stripHebrewPrefixes(w0))) : w0.toLowerCase()
}

// --- Phase 3F.3.5: generic ecommerce MODIFIER stopwords (site-agnostic) --------
// Words that describe HOW/WHERE/FOR-WHOM a product is used or sold — home/gym/
// training/set/kg/size/price/electric/folding/review… — as opposed to the PRODUCT
// NOUN itself (kettlebell, treadmill, rubber). They're generic across ANY store,
// so treating them as relevance stopwords stops "shared 'gym'/'set 50 kg'" from
// linking unrelated products, WITHOUT naming any site's products. Removed from the
// relevance token sets (topic AND target) so only real product/subject nouns match.
const GENERIC_MODIFIER_STEMS = new Set<string>(
  [
    // Hebrew — use-case / place / audience / commercial / spec modifiers.
    'בית', 'ביתי', 'ביתית', 'ביתיים', 'חדר', 'כושר', 'אימון', 'אימונים', 'לאימון',
    'מקצועי', 'מקצועני', 'סט', 'זוג', 'קילו', 'קג', 'גודל', 'מידה', 'מחיר', 'עלות',
    'קנייה', 'לקנייה', 'לקנות', 'איכותי', 'איכות', 'זול', 'משלוח', 'חשמלי', 'ידני', 'מתקפל',
    'נייד', 'קומפקטי', 'למתחילים', 'מתקדמים', 'סקירה', 'השוואה', 'ביקורת', 'דגם',
    'דגמים', 'מבצע', 'הנחה', 'חדש', 'פופולרי', 'יעיל', 'קל', 'כבד',
    // Phase 3F.3.7 — more generic intent/modifier words that must NOT connect targets.
    'שימוש', 'להשתמש', 'סוגים', 'סוג', 'פתרון', 'פתרונות', 'מתאים', 'מתאימה', 'ציוד',
    'אביזרים', 'אביזר', 'הטוב', 'הטובים', 'כללי', 'שאלות', 'שאלה', 'לפני',
    // English — the same generic modifiers when titles/slugs are transliterated.
    'home', 'gym', 'fitness', 'training', 'workout', 'set', 'pair', 'kg', 'size', 'price',
    'buy', 'cheap', 'electric', 'manual', 'folding', 'portable', 'compact', 'use', 'choose',
    'equipment', 'solution', 'suitable', 'types', 'accessories', 'general', 'questions',
    'pro', 'beginner', 'review', 'model', 'sale', 'discount', 'new', 'best',
  ].map(stemOne),
)

/**
 * Planner-local normalized token set for relevance/containment ONLY. Handles the
 * Hebrew morphology plain token Jaccard misses: 1-letter prefixes (ב/ל/מ/ה/ו/ש/כ),
 * light plural stemming, final-letter folding, and generic stopword removal.
 * English/mixed tokens and useful numbers (len>1) pass through unchanged.
 */
function normTokens(s: string): Set<string> {
  const raw = (s || '')
    .toLowerCase()
    .replace(/[?!.,:;"'“”׳״()[\]{}<>«»\-–—/|]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
  const out = new Set<string>()
  for (const w0 of raw) {
    if (REL_STOPWORDS.has(w0)) continue
    const isHebrew = /[֐-׿]/.test(w0)
    // Stem/strip on the original-final form (so ים/ן are detectable), THEN fold finals.
    const w = isHebrew ? foldFinals(stemHebrew(stripHebrewPrefixes(w0))) : w0
    // Drop generic ecommerce modifiers (home/gym/set/kg/…) and pure spec numbers
    // (a shared "50" must not link a 50kg-weights topic to a 50kg-kettlebell
    // product) so only PRODUCT/subject nouns carry relevance.
    if (w.length > 1 && !/^\d+$/.test(w) && !REL_STOPWORDS.has(w) && !GENERIC_MODIFIER_STEMS.has(w)) out.add(w)
  }
  return out
}

/** Fraction of the SMALLER token set contained in the larger (subset signal). */
function containment(a: Set<string>, b: Set<string>): number {
  const min = Math.min(a.size, b.size)
  if (!min) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / min
}

/** Containment above this ⇒ one title is (almost) fully inside the other ⇒ same subject. */
const SELF_CONTAINMENT_MAX = 0.8

/**
 * Detect when a candidate target IS the topic being planned (self-link) or an
 * existing article/duplicate of the same topic. Generic signals only — never
 * blocks merely-related pages (a broad category, or a different-angle article).
 * Returns a rejection reason, or null.
 */
export function selfOrDuplicateReason(topic: TopicForPlanning, t: ScannedTarget): string | null {
  // Phase 3F.3.5 — a COMMERCIAL target (product category / product) is never the
  // topic's own article: linking the new article to the matching category/product
  // is the whole point (money target). The self/duplicate guard exists to avoid
  // linking a topic to an existing ARTICLE about the same subject, so it must not
  // fire for category/product destinations even when the names coincide. An
  // existing generated article that happens to be classed commercial is still
  // caught below via matchedGeneratedArticleId.
  const isCommercial = t.targetType === 'category' || t.targetType === 'product'
  if (isCommercial && !t.matchedGeneratedArticleId) return null

  const topicTitle = normText(topic.title)
  const targetTitle = normText(t.targetTitle)
  if (topicTitle && targetTitle && topicTitle === targetTitle) return 'self_target'

  const topicKw = normText(topic.primaryKeyword)
  const targetKw = normText(t.primaryKeywordCandidate)
  if (topicKw && targetKw && topicKw === targetKw) {
    return t.matchedGeneratedArticleId ? 'existing_same_topic_article' : 'duplicate_topic_target'
  }

  // One title (almost) fully contained in the other — e.g. the topic title plus a
  // generic subtitle ("…: המדריך המלא"). Needs ≥2 shared-scope tokens so a broad
  // one-word target (e.g. a "קיוטו" hub) is NOT caught.
  const a = tokens(topic.title)
  const b = tokens(t.targetTitle)
  if (Math.min(a.size, b.size) >= 2 && containment(a, b) >= SELF_CONTAINMENT_MAX) {
    return t.matchedGeneratedArticleId ? 'existing_same_topic_article' : 'too_similar_to_planned_topic'
  }
  return null
}

/** Best anchor for a target: vetted usableAnchors first, else a clean keyword. */
function chooseAnchor(t: ScannedTarget): { text: string; source: CacheAnchorSource } | null {
  const usable = Array.isArray(t.usableAnchors) ? t.usableAnchors : []
  for (const a of usable) {
    const text = (a?.text || '').trim()
    if (text && manualAnchorShapeValid(text)) return { text, source: 'usable_anchor' }
  }
  const kw = (t.primaryKeywordCandidate || '').trim()
  if (t.keywordAvailable && kw && manualAnchorShapeValid(kw)) return { text: kw, source: 'target_keyword' }
  return null
}

// --- Entity single-token relevance (2b.3) ------------------------------------
// Generic/broad tokens that must NOT carry a candidate on their own (place-only
// or trip-boilerplate). Normalized through the SAME pipeline as scoring tokens.
const GENERIC_ENTITY_TOKENS = normTokens(
  'יפן יפנ טיול טיולים מדריך המלצה תיירות נסיעה נסיעות טיסה טיסות מחיר מחירים זול זולות חופשה מסלול מסלולים יום ימים עונה עונות',
)
/** A single shared token strong enough to carry relevance: a specific (≥4-char,
 * non-generic) entity like a city/landmark name — never a broad place/topic word. */
function isStrongEntityToken(tk: string): boolean {
  return tk.length >= 4 && !GENERIC_ENTITY_TOKENS.has(tk)
}
/** A single strong entity match still needs to clear the relevance floor. */
const ENTITY_MATCH_RELEVANCE = 0.45

/** Normalized tokens from a URL's last path segment (slug), for entity matching. */
function urlSlugTokens(url: string): Set<string> {
  try {
    const path = (url || '').replace(/[?#].*$/, '').replace(/\/+$/, '')
    let last = path.split('/').pop() || ''
    try { last = decodeURIComponent(last) } catch { /* keep raw on malformed % */ }
    return normTokens(last.replace(/[-_]+/g, ' '))
  } catch {
    return new Set()
  }
}

// --- Phase 3F.3.5: generic near-stem matching (index-derived, NO hardcoded terms)
// A bounded, GENERIC morphology/transliteration slack so a topic term and an
// indexed target term that denote the SAME concept but differ by a letter (e.g.
// קטלבלס vs קטלבל — same word, transliteration variant Hebrew plural stemming
// can't unify) still align. This is NOT a synonym/alias list: it derives the
// relationship purely from the two strings' own shape (length + edit distance),
// so it works for ANY site's index without naming its products. Deliberately
// conservative — only long stems, only a single-edit difference.

/** Bounded Levenshtein: true iff edit distance between a and b is ≤ max. Early-exits. */
function withinEditDistance(a: string, b: string, max: number): boolean {
  const la = a.length, lb = b.length
  if (Math.abs(la - lb) > max) return false
  if (a === b) return true
  // Two-row DP capped at (max) — cheap for the short stems we compare.
  let prev = new Array(lb + 1)
  for (let j = 0; j <= lb; j++) prev[j] = j
  for (let i = 1; i <= la; i++) {
    const cur = new Array(lb + 1)
    cur[0] = i
    let rowMin = cur[0]
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return false // whole row already exceeds budget
    prev = cur
  }
  return prev[lb] <= max
}

/**
 * Two normalized stems denote the same concept — exact, or a GENERIC bounded
 * near-match for sufficiently-long stems (single-edit difference). No hardcoded
 * synonyms; purely a function of the strings' own shape. Returns the match kind.
 */
function stemRelation(a: string, b: string): 'exact' | 'near' | null {
  if (a === b) return 'exact'
  if (a.length >= 5 && b.length >= 5 && Math.abs(a.length - b.length) <= 1 && withinEditDistance(a, b, 1)) return 'near'
  return null
}

/**
 * Semantic match type between a topic and a candidate target — surfaced in dev
 * diagnostics so we can SEE whether the planner is truly reading the site index.
 */
export type SemanticMatchType =
  | 'exact_phrase' | 'stem_phrase' | 'taxonomy_relation' | 'slug_match'
  | 'parent_category' | 'product_match' | 'broad_category_fallback'
  | 'article_fallback' | 'weak_match' | 'none'

/**
 * Plan internal links for ONE topic against the project's CACHED targets. Pure.
 */
export function planFromCachedTargets(
  topic: TopicForPlanning,
  targets: ScannedTarget[],
  hosts: string[],
  opts: { allowCaution?: boolean } = {},
): CacheTopicPlan {
  const allowCaution = opts.allowCaution === true
  const topicTokens = normTokens([topic.primaryKeyword ?? '', topic.title, ...(topic.secondaryKeywords ?? [])].join(' '))
  const topicKeyTokens = normTokens(topic.primaryKeyword || topic.title)
  const topicPhrase = normText(topic.primaryKeyword || topic.title)

  const scored: CachePlannedLink[] = []

  for (const t of targets) {
    const rejectedReasons: string[] = []
    const url = normalizeHref(t.targetUrl)

    // 1) Eligibility gate — ineligible NEVER; caution excluded unless allowed.
    if (t.eligibility === 'no') rejectedReasons.push(`target_ineligible(${t.eligibilityReason})`)
    else if (t.eligibility === 'caution' && !allowCaution) rejectedReasons.push('target_caution_excluded')

    // 2) Internal-only (defensive; scanner already guaranteed it).
    if (!url || !isInternalUrl(url, hosts)) rejectedReasons.push('off_domain_or_empty_url')

    // 2b) Self / duplicate-topic guard — never link a topic to itself or to an
    // existing article/target that represents the SAME topic. (Raw tokenizer —
    // unchanged behavior on purpose.)
    const selfReason = selfOrDuplicateReason(topic, t)
    if (selfReason) rejectedReasons.push(selfReason)

    // 3) Blended relevance topic ↔ target — computed from the target's OWN indexed
    // fields (title, clean keyword, usable anchors, URL slug), so the relationship
    // comes from the site index, not a hardcoded map. Each candidate token is
    // ALIGNED to the topic via exact OR generic near-stem match (see stemRelation);
    // aligned tokens then feed jaccard/containment. Per-field sets let us report
    // WHICH source field(s) produced the match (Part B diagnostics).
    const titleTokens = normTokens(t.targetTitle)
    const keywordTokens = normTokens(t.primaryKeywordCandidate ?? '')
    const anchorTokens = normTokens((t.usableAnchors ?? []).map((a) => a.text).join(' '))
    const slugTokens = urlSlugTokens(url)
    const candTokens = new Set<string>([...titleTokens, ...keywordTokens, ...anchorTokens, ...slugTokens])
    const fieldOf = (tok: string): string[] => {
      const f: string[] = []
      if (titleTokens.has(tok)) f.push('title')
      if (keywordTokens.has(tok)) f.push('keyword')
      if (slugTokens.has(tok)) f.push('slug')
      if (anchorTokens.has(tok)) f.push('anchor')
      return f
    }
    // Align each candidate token onto the topic's vocabulary (exact or near-stem).
    const alignedCand = new Set<string>()
    const matchedTokens: string[] = []        // topic-side terms that matched
    const matchedTargetTerms: string[] = []   // the candidate's own terms that matched
    const missingTokens: string[] = []
    const matchedSourceFields = new Set<string>()
    // Phase 3F.3.7 — topic-side terms that matched via an IDENTITY field
    // (title/keyword/slug), i.e. what the target actually IS — not an anchor word
    // some OTHER page used to link to it. Cluster identity comes from these only.
    const identityMatched: string[] = []
    let hadExactMatch = false
    let hadNearMatch = false
    let matchedOnlyViaSlug = true
    for (const c of candTokens) {
      if (topicTokens.has(c)) {
        alignedCand.add(c); matchedTokens.push(c); matchedTargetTerms.push(c); hadExactMatch = true
        const fields = fieldOf(c)
        for (const f of fields) { matchedSourceFields.add(f); if (f !== 'slug') matchedOnlyViaSlug = false }
        if (fields.some((f) => f !== 'anchor')) identityMatched.push(c)
        continue
      }
      let near: string | null = null
      if (c.length >= 5) { for (const tt of topicTokens) { if (stemRelation(c, tt) === 'near') { near = tt; break } } }
      if (near) {
        alignedCand.add(near); matchedTokens.push(near); matchedTargetTerms.push(c); hadNearMatch = true
        const fields = fieldOf(c)
        for (const f of fields) { matchedSourceFields.add(f); if (f !== 'slug') matchedOnlyViaSlug = false }
        if (fields.some((f) => f !== 'anchor')) identityMatched.push(near)
      } else {
        alignedCand.add(c); missingTokens.push(c)
      }
    }
    const jac = jaccard(topicTokens, alignedCand)
    const cont = containment(topicTokens, alignedCand)

    // --- Phase 3F.3.7: STRICT SITE-DERIVED CLUSTER GATE ------------------------
    // A target's CLUSTER identity is the set of strong (non-generic) nouns in its
    // OWN title / clean keyword / slug. A link is allowed only when the topic and
    // target share such an identity term (same product/service area, or a
    // parent/child that shares the head noun), OR the topic phrase exactly equals
    // the target. Generic-word overlap, or a match only via a peripheral anchor
    // word, can NEVER connect two different clusters — this is a HARD block, so
    // "משקולות → הליכון" and similar cross-cluster links are impossible regardless
    // of score. Precision first: better no link than a wrong link.
    const targetIdentity = new Set<string>([...titleTokens, ...keywordTokens, ...slugTokens])
    const targetTitleNorm = normText(t.targetTitle)
    const targetKwNorm = normText(t.primaryKeywordCandidate)
    const exactPhrase = !!topicPhrase && (topicPhrase === targetTitleNorm || (!!targetKwNorm && topicPhrase === targetKwNorm))
    let clusterCompatibility: string
    if (exactPhrase) {
      clusterCompatibility = 'same_cluster'
    } else if (identityMatched.length >= 1) {
      const smaller = Math.min(topicKeyTokens.size || topicTokens.size, targetIdentity.size)
      clusterCompatibility = smaller > 0 && identityMatched.length >= smaller ? 'parent_child' : 'same_cluster'
    } else if (targetIdentity.size === 0) {
      clusterCompatibility = 'unknown_no_exact'
    } else if (matchedTokens.length >= 1) {
      clusterCompatibility = 'blocked_generic_only'
    } else {
      clusterCompatibility = 'blocked_cross_cluster'
    }
    if (clusterCompatibility.startsWith('blocked_') || clusterCompatibility === 'unknown_no_exact') {
      rejectedReasons.push(clusterCompatibility)
    }

    // Strong-entity single-token match: a specific city/landmark/entity token
    // shared between topic and candidate (any field OR URL slug) may carry
    // relevance even without a 2nd shared token — a generic place word never does.
    const entityMatchedTokens: string[] = []
    for (const x of topicTokens) if (isStrongEntityToken(x) && alignedCand.has(x)) entityMatchedTokens.push(x)

    const useContainment = matchedTokens.length >= 2 && cont > jac
    let relevance = round2(useContainment ? cont : jac)
    let relevanceMethod: RelevanceMethod = useContainment ? 'containment' : 'jaccard'
    // Rescue a strong single-entity match that the ≥2-token rule would reject.
    if (relevance < CACHE_PLANNER_RELEVANCE_MIN && matchedTokens.length < 2 && entityMatchedTokens.length >= 1) {
      relevance = round2(Math.max(relevance, cont, ENTITY_MATCH_RELEVANCE))
      relevanceMethod = 'entity_single_token'
    }
    // High-value ecommerce hub with a REAL token/stem match → slightly lower floor.
    const ecomBoost = (t.targetType === 'category' || t.targetType === 'product') && matchedTokens.length >= 1
    const relMin = ecomBoost ? CACHE_PLANNER_RELEVANCE_MIN_ECOM : CACHE_PLANNER_RELEVANCE_MIN
    if (relevance < relMin) rejectedReasons.push(`low_relevance(${relevance} < ${relMin})`)

    // 4) Near-self guard (normalized, so morphological near-duplicates are still
    // caught) — but NOT for commercial targets: an article whose title matches a
    // product category / product should link to that money page, not be blocked
    // for "looking like itself" (same rationale as selfOrDuplicateReason).
    if (t.targetType !== 'category' && t.targetType !== 'product') {
      const selfSim = round2(jaccard(topicKeyTokens, normTokens(`${t.targetTitle} ${t.primaryKeywordCandidate ?? ''}`)))
      if (selfSim > CACHE_PLANNER_SELF_SIMILARITY_MAX) rejectedReasons.push(`too_similar_self_link(${selfSim})`)
    }

    // 5) Anchor (vetted usable anchor, or a clean available keyword).
    const anchor = chooseAnchor(t)
    if (!anchor) rejectedReasons.push(t.contentSkipped ? 'content_skipped_no_anchors' : 'no_usable_anchor')

    // 6) Confidence = relevance + priority bonus + keyword/anchor bonuses.
    const priorityBonus = PRIORITY_BONUS[t.targetPriority] ?? 0
    const kwBonus = t.keywordAvailable ? 0.1 : 0
    const anchorBonus = anchor?.source === 'usable_anchor' ? 0.1 : 0
    // Phase 3F.3.4b — MONEY-TARGET boost: a category/product target that matches
    // the topic's PRIMARY-KEYWORD tokens (not just a peripheral title word) is the
    // best commercial destination, so lift it above merely-related articles. Only
    // when there is a real key-token match — never forces unrelated commerce.
    const isCommercialTarget = t.targetType === 'category' || t.targetType === 'product'
    const keyMatched = matchedTokens.filter((x) => topicKeyTokens.has(x))
    const commercialBoost = (isCommercialTarget && keyMatched.length >= 1) ? COMMERCIAL_TARGET_BOOST : 0
    const confidence = round2(clamp01(relevance + priorityBonus + kwBonus + anchorBonus + commercialBoost))
    const minConf = t.eligibility === 'caution'
      ? CACHE_PLANNER_CAUTION_MIN_CONFIDENCE
      : ecomBoost ? CACHE_PLANNER_MIN_CONFIDENCE_ECOM : CACHE_PLANNER_MIN_CONFIDENCE
    if (rejectedReasons.length === 0 && confidence < minConf) rejectedReasons.push(`low_confidence(${confidence} < ${minConf})`)

    // Semantic match TYPE (Part B) — a human-readable classification of HOW the
    // topic matched this indexed target, purely from index fields + the alignment.
    let semanticMatchType: SemanticMatchType = 'none'
    if (matchedTokens.length > 0) {
      const targetTitleNorm = normText(t.targetTitle)
      const targetKwNorm = normText(t.primaryKeywordCandidate)
      const exactPhrase = !!topicPhrase && (topicPhrase === targetTitleNorm || (!!targetKwNorm && topicPhrase === targetKwNorm))
      if (exactPhrase) semanticMatchType = 'exact_phrase'
      else if (matchedOnlyViaSlug) semanticMatchType = 'slug_match'
      else if (isCommercialTarget && keyMatched.length > 0) {
        semanticMatchType = t.targetType === 'product'
          ? 'product_match'
          : relevance >= 0.4 ? 'taxonomy_relation' : 'parent_category'
      } else if (isCommercialTarget) {
        semanticMatchType = 'broad_category_fallback'
      } else {
        semanticMatchType = (hadExactMatch || hadNearMatch) && relevance >= 0.4 ? 'stem_phrase' : 'article_fallback'
      }
      // Matched, but under the (non-ecom) floor → genuinely weak.
      if (semanticMatchType !== 'exact_phrase' && relevance < relMin && !ecomBoost) semanticMatchType = 'weak_match'
    }

    const selected = rejectedReasons.length === 0
    const reason = selected
      ? `relevance ${relevance} (${relevanceMethod}, ${semanticMatchType}${hadNearMatch ? ', near-stem' : ''}) + priority ${priorityBonus >= 0 ? '+' : ''}${priorityBonus} (${t.targetPriority})${commercialBoost ? ` + commercial ${commercialBoost} [${t.targetType}, key: ${keyMatched.join(', ')}]` : ''}; anchor "${anchor!.text}" from ${anchor!.source} (confidence ${confidence})`
      : ''

    scored.push({
      targetUrl: url,
      targetTitle: t.targetTitle,
      targetRole: t.targetRole,
      targetPriority: t.targetPriority,
      eligibility: t.eligibility,
      anchorText: anchor?.text ?? null,
      anchorSource: anchor?.source ?? null,
      relevance,
      priorityBonus,
      confidence,
      selected,
      reason,
      rejectedReasons,
      matchedTokens,
      missingTokens,
      entityMatchedTokens,
      normalizedTopicTokens: Array.from(topicTokens),
      normalizedCandidateTokens: Array.from(candTokens),
      relevanceMethod,
      // Phase 3F.3.5 semantic diagnostics (additive; response-only).
      semanticMatchType,
      matchedTargetTerms,
      matchedSourceFields: Array.from(matchedSourceFields),
      commercialRank: null,
      // Phase 3F.3.7 cluster-gate diagnostics.
      clusterCompatibility,
      topicCluster: Array.from(topicKeyTokens),
      targetCluster: Array.from(targetIdentity),
      // Finalized after the dedup/cap pass below (it can add more reasons).
      reviewability: 'recommended',
      canManualApprove: false,
      blockReason: null,
    })
  }

  // Commercial-target RANK (Part B/C) — 1-based order of category/product
  // candidates by confidence, so diagnostics + idea cards can show the best
  // commercial destination first. Uses targetPriority as the commercial signal
  // (the planned link doesn't carry targetType). Computed over all candidates.
  let cr = 0
  for (const s of [...scored].sort((a, b) => b.confidence - a.confidence)) {
    if (s.targetPriority === 'commercial_category_or_service_hub' || s.targetPriority === 'product_or_specific_offer') {
      cr += 1; s.commercialRank = cr
    }
  }

  // Sort selectable by confidence, then de-dup by URL + anchor, then cap.
  const selectedSorted = scored.filter((s) => s.selected).sort((a, b) => b.confidence - a.confidence)
  const seenUrl = new Set<string>()
  const seenAnchor = new Set<string>()
  const finalSelected: CachePlannedLink[] = []
  for (const s of selectedSorted) {
    const urlKey = normalizeUrlKey(s.targetUrl)
    const anchorKey = (s.anchorText ?? '').toLowerCase()
    if (seenUrl.has(urlKey)) { s.selected = false; s.rejectedReasons.push('duplicate_url'); continue }
    if (anchorKey && seenAnchor.has(anchorKey)) { s.selected = false; s.rejectedReasons.push('duplicate_anchor'); continue }
    if (finalSelected.length >= CACHE_PLANNER_MAX_LINKS) { s.selected = false; s.rejectedReasons.push('over_cap'); continue }
    seenUrl.add(urlKey)
    if (anchorKey) seenAnchor.add(anchorKey)
    finalSelected.push(s)
  }

  // Finalize candidate tiers AFTER dedup/cap (which can add duplicate_url /
  // duplicate_anchor / over_cap). recommended = auto-selected; reviewable = soft
  // reasons only (safe manual override); blocked = any hard-safety reason.
  for (const s of scored) {
    if (finalSelected.includes(s)) { s.reviewability = 'recommended'; s.canManualApprove = false; s.blockReason = null; s.displayBlocked = false; continue }
    const soft = isReviewableRejection(s.rejectedReasons)
    s.reviewability = soft ? 'reviewable' : 'blocked'
    s.canManualApprove = soft
    s.blockReason = soft ? null : (s.rejectedReasons.find((r) => !isSoftRejection(r)) ?? 'blocked')
    s.displayBlocked = soft ? false : isDisplayBlockedRejection(s.rejectedReasons)
  }

  const rejected = scored.filter((s) => !finalSelected.includes(s)).sort((a, b) => b.confidence - a.confidence)
  const summary = finalSelected.length
    ? `${finalSelected.length} internal link(s) would be planned (of ${targets.length} cached targets).`
    : `0 relevant internal links — this topic would publish WITHOUT internal links (of ${targets.length} cached targets).`

  return { topicId: topic.id, topicTitle: topic.title, primaryKeyword: topic.primaryKeyword, selected: finalSelected, rejected, summary }
}

/**
 * Phase 2I — promote MANUALLY-selected reviewable candidates into a plan's
 * selected set, SERVER-SIDE VALIDATED. The client only names candidates by
 * (targetUrl, anchorText); a candidate is promoted ONLY if the server's own
 * freshly-computed plan classified it as `reviewable` (soft reasons only) — hard
 * safety (ineligible / external / self-dup / no-anchor / duplicate) is never
 * promotable. Client data is a lookup key, never trusted link content.
 */
export function promoteManualCandidates(
  plan: CacheTopicPlan,
  manual: { targetUrl: string; anchorText: string }[],
): { plan: CacheTopicPlan; promoted: number; rejectedManual: number } {
  if (!Array.isArray(manual) || manual.length === 0) return { plan, promoted: 0, rejectedManual: 0 }
  const keyOf = (u: string, a: string | null | undefined) => `${normalizeUrlKey(u)}::${(a ?? '').trim().toLowerCase()}`
  const selectedKeys = new Set(plan.selected.map((s) => keyOf(s.targetUrl, s.anchorText)))
  const promotedLinks: CachePlannedLink[] = []
  let rejectedManual = 0
  for (const m of manual) {
    const key = keyOf(m.targetUrl, m.anchorText)
    if (selectedKeys.has(key)) continue // already recommended → nothing to do
    const cand = plan.rejected.find((r) => keyOf(r.targetUrl, r.anchorText) === key && r.reviewability === 'reviewable' && r.canManualApprove)
    if (!cand) { rejectedManual++; continue } // not found OR blocked → refuse
    selectedKeys.add(key)
    promotedLinks.push({ ...cand, selected: true, reason: `manual_override (${cand.rejectedReasons.join(', ')})` })
  }
  if (promotedLinks.length === 0) return { plan, promoted: 0, rejectedManual }
  const promotedSet = new Set(promotedLinks.map((p) => keyOf(p.targetUrl, p.anchorText)))
  return {
    plan: {
      ...plan,
      selected: [...plan.selected, ...promotedLinks],
      rejected: plan.rejected.filter((r) => !promotedSet.has(keyOf(r.targetUrl, r.anchorText))),
    },
    promoted: promotedLinks.length,
    rejectedManual,
  }
}

/** Why a user-checked link could not be saved (Phase 3G.5 — never silent). */
export type DroppedSelectionReason = 'blocked' | 'not_in_plan' | 'invalid_anchor' | 'duplicate_target'
export interface DroppedSelection { targetUrl: string; anchorText: string; reason: DroppedSelectionReason }
export interface SelectClientLinksResult { plan: CacheTopicPlan; dropped: DroppedSelection[] }

/**
 * Phase 3B.2 — EXACT client selection: save ONLY the links the user checked.
 * Each desired (targetUrl, anchorText) is kept ONLY if the server's own fresh
 * plan classifies it as a recommended link OR an approvable reviewable candidate
 * — client data is a lookup key, never trusted content, and blocked/hard-safety
 * candidates can never be saved. An empty selection yields an auditable zero-link
 * plan. Deduped by target URL.
 *
 * Phase 3G.5 — exact END-TO-END persistence of the user's choice:
 *  - A desired link whose URL is in the approvable pool but whose anchor text
 *    differs from the fresh plan's chosen anchor (e.g. an idea-stage anchor) is
 *    KEPT with the USER'S anchor — validated by the same shape rule the
 *    insertion evaluator applies — instead of being silently dropped.
 *  - Every desired link that could NOT be saved is reported in `dropped` with a
 *    reason, so callers can surface it. No silent remapping, ever.
 */
export function selectClientLinks(
  plan: CacheTopicPlan,
  desired: { targetUrl: string; anchorText: string }[],
): SelectClientLinksResult {
  const keyOf = (u: string, a: string | null | undefined) => `${normalizeUrlKey(u)}::${(a ?? '').trim().toLowerCase()}`
  const pool = [
    ...plan.selected,
    ...plan.rejected.filter((r) => r.reviewability === 'reviewable' && r.canManualApprove),
  ]
  const poolByKey = new Map<string, CachePlannedLink>()
  const poolByUrl = new Map<string, CachePlannedLink>()
  for (const cand of pool) {
    const k = keyOf(cand.targetUrl, cand.anchorText)
    if (!poolByKey.has(k)) poolByKey.set(k, cand)
    const u = normalizeUrlKey(cand.targetUrl)
    if (!poolByUrl.has(u)) poolByUrl.set(u, cand)
  }

  const seenUrl = new Set<string>()
  const selected: CachePlannedLink[] = []
  const dropped: DroppedSelection[] = []
  const promote = (cand: CachePlannedLink, anchorText: string): CachePlannedLink => ({
    ...cand,
    anchorText,
    selected: true,
    reason: cand.selected ? cand.reason : `manual_override (${cand.rejectedReasons.join(', ')})`,
  })

  for (const d of Array.isArray(desired) ? desired : []) {
    if (!d || typeof d.targetUrl !== 'string' || !d.targetUrl.trim()) continue
    const anchor = (d.anchorText ?? '').trim()
    const urlKey = normalizeUrlKey(d.targetUrl)
    if (seenUrl.has(urlKey)) { dropped.push({ targetUrl: d.targetUrl, anchorText: anchor, reason: 'duplicate_target' }); continue }

    // 1) Exact (url + anchor) match against the approvable pool.
    const exact = poolByKey.get(keyOf(d.targetUrl, anchor))
    if (exact) { seenUrl.add(urlKey); selected.push(promote(exact, exact.anchorText ?? anchor)); continue }

    // 2) Same approvable target, different chosen anchor (e.g. the idea-stage
    // anchor): keep the USER'S anchor when it passes the same shape rule the
    // insertion evaluator uses — the exact selection persists end-to-end.
    const byUrl = poolByUrl.get(urlKey)
    if (byUrl) {
      if (anchor && manualAnchorShapeValid(anchor)) { seenUrl.add(urlKey); selected.push(promote(byUrl, anchor)) }
      else dropped.push({ targetUrl: d.targetUrl, anchorText: anchor, reason: 'invalid_anchor' })
      continue
    }

    // 3) Not approvable: a hard-blocked/irrelevant candidate, or not in the plan.
    const knownRejected = plan.rejected.some((r) => normalizeUrlKey(r.targetUrl) === urlKey)
    dropped.push({ targetUrl: d.targetUrl, anchorText: anchor, reason: knownRejected ? 'blocked' : 'not_in_plan' })
  }

  return {
    plan: { ...plan, selected, rejected: plan.rejected.filter((r) => !seenUrl.has(normalizeUrlKey(r.targetUrl))) },
    dropped,
  }
}

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
  // Phase 2I candidate tiers (response-only diagnostics; not persisted):
  //  recommended = auto-selected; reviewable = rejected ONLY for soft scoring
  //  reasons and safe to manually approve; blocked = a hard-safety failure that
  //  must never be manually approvable.
  reviewability: CandidateTier
  canManualApprove: boolean
  blockReason: string | null
}

export type CandidateTier = 'recommended' | 'reviewable' | 'blocked'

/**
 * Soft rejection reasons a human may override. Anything NOT in this set is a
 * HARD-safety failure (ineligible / external / self-dup / no-anchor / duplicate)
 * and can never be manually approved.
 */
const SOFT_REJECTION_BASES = new Set(['low_relevance', 'low_confidence', 'target_caution_excluded', 'over_cap'])
function isSoftRejection(reason: string): boolean {
  return SOFT_REJECTION_BASES.has(reason.split('(')[0]!)
}
/** True when EVERY rejection reason is soft (⇒ safe to manually approve). */
export function isReviewableRejection(rejectedReasons: string[]): boolean {
  return rejectedReasons.length > 0 && rejectedReasons.every(isSoftRejection)
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
    if (w.length > 1 && !REL_STOPWORDS.has(w)) out.add(w)
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

// --- Phase 3F.3.4b: conservative curated ecommerce alias groups ---------------
// Each group lists SPELLING/TRANSLITERATION VARIANTS of the SAME commercial term
// that Hebrew plural/prefix stemming can't unify (e.g. קטלבלס vs קטלבל — same
// word, different transliteration; ends in ס so no plural rule applies). Used
// ONLY to expand the TOPIC-side token set as an additive relevance signal — never
// a floor override, never fuzzy, never cross-concept (משקולות/weights is a DIFFERENT
// product than a kettlebell and is deliberately NOT grouped here). Keep tiny and
// clearly-equivalent; the aggressive stemmer already covers plural/prefix variants.
const ECOM_ALIAS_GROUPS: string[][] = [
  ['קטלבל', 'קטלבלס', 'קטלבלים', 'kettlebell'],
  ['הליכון', 'הליכונים', 'treadmill'],
  ['פילאטיס', 'pilates'],
]
/** canonical stem → the set of equivalent stems in its alias group (computed once). */
const ECOM_ALIAS_INDEX: Map<string, Set<string>> = (() => {
  const index = new Map<string, Set<string>>()
  for (const group of ECOM_ALIAS_GROUPS) {
    const stems = new Set<string>()
    for (const term of group) for (const s of normTokens(term)) stems.add(s)
    for (const s of stems) {
      const cur = index.get(s) ?? new Set<string>()
      for (const other of stems) cur.add(other)
      index.set(s, cur)
    }
  }
  return index
})()
/** Expand a normalized token set with curated ecommerce alias variants (additive). */
function withAliases(tokenSet: Set<string>): Set<string> {
  let expanded: Set<string> | null = null
  for (const tk of tokenSet) {
    const grp = ECOM_ALIAS_INDEX.get(tk)
    if (grp) { if (!expanded) expanded = new Set(tokenSet); for (const a of grp) expanded.add(a) }
  }
  return expanded ?? tokenSet
}

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
  const topicTokens = withAliases(normTokens([topic.primaryKeyword ?? '', topic.title, ...(topic.secondaryKeywords ?? [])].join(' ')))
  const topicKeyTokens = withAliases(normTokens(topic.primaryKeyword || topic.title))

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

    // 3) Blended relevance topic ↔ target (normalized tokens). Jaccard alone
    // penalizes long descriptive topic titles, so a candidate whose meaningful
    // tokens are largely a SUBSET of the topic's concepts is also credited via
    // containment — but ONLY when ≥2 meaningful tokens overlap, so a shared
    // single entity/place token (e.g. only "יפן") can never carry it through.
    const candTokens = normTokens([t.targetTitle, t.primaryKeywordCandidate ?? '', ...(t.usableAnchors ?? []).map((a) => a.text)].join(' '))
    const matchedTokens: string[] = []
    for (const x of candTokens) if (topicTokens.has(x)) matchedTokens.push(x)
    const missingTokens: string[] = []
    for (const x of candTokens) if (!topicTokens.has(x)) missingTokens.push(x)
    const jac = jaccard(topicTokens, candTokens)
    const cont = containment(topicTokens, candTokens)

    // Strong-entity single-token match: a specific city/landmark/entity token
    // shared between topic and candidate (title/keyword/anchor OR URL slug) may
    // carry relevance even without a 2nd shared token — but a generic place word
    // (e.g. "יפן") never does (excluded by GENERIC_ENTITY_TOKENS + ≥4-char rule).
    const candEntityTokens = new Set([...candTokens, ...urlSlugTokens(url)])
    const entityMatchedTokens: string[] = []
    for (const x of topicTokens) if (isStrongEntityToken(x) && candEntityTokens.has(x)) entityMatchedTokens.push(x)

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

    // 4) Near-self guard (normalized, so morphological near-duplicates are still caught).
    const selfSim = round2(jaccard(topicKeyTokens, normTokens(`${t.targetTitle} ${t.primaryKeywordCandidate ?? ''}`)))
    if (selfSim > CACHE_PLANNER_SELF_SIMILARITY_MAX) rejectedReasons.push(`too_similar_self_link(${selfSim})`)

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

    const selected = rejectedReasons.length === 0
    const reason = selected
      ? `relevance ${relevance} (${relevanceMethod}) + priority ${priorityBonus >= 0 ? '+' : ''}${priorityBonus} (${t.targetPriority})${commercialBoost ? ` + commercial ${commercialBoost} [${t.targetType}, key: ${keyMatched.join(', ')}]` : ''}; anchor "${anchor!.text}" from ${anchor!.source} (confidence ${confidence})`
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
      // Finalized after the dedup/cap pass below (it can add more reasons).
      reviewability: 'recommended',
      canManualApprove: false,
      blockReason: null,
    })
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
    if (finalSelected.includes(s)) { s.reviewability = 'recommended'; s.canManualApprove = false; s.blockReason = null; continue }
    const soft = isReviewableRejection(s.rejectedReasons)
    s.reviewability = soft ? 'reviewable' : 'blocked'
    s.canManualApprove = soft
    s.blockReason = soft ? null : (s.rejectedReasons.find((r) => !isSoftRejection(r)) ?? 'blocked')
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

/**
 * Phase 3B.2 — EXACT client selection: save ONLY the links the user checked.
 * Each desired (targetUrl, anchorText) is kept ONLY if the server's own fresh
 * plan classifies it as a recommended link OR an approvable reviewable candidate
 * — client data is a lookup key, never trusted content, and blocked/hard-safety
 * candidates can never be saved. An empty selection yields an auditable zero-link
 * plan. Deduped by URL+anchor.
 */
export function selectClientLinks(
  plan: CacheTopicPlan,
  desired: { targetUrl: string; anchorText: string }[],
): CacheTopicPlan {
  const keyOf = (u: string, a: string | null | undefined) => `${normalizeUrlKey(u)}::${(a ?? '').trim().toLowerCase()}`
  const desiredKeys = new Set((Array.isArray(desired) ? desired : []).map((d) => keyOf(d.targetUrl, d.anchorText)))
  const pool = [
    ...plan.selected,
    ...plan.rejected.filter((r) => r.reviewability === 'reviewable' && r.canManualApprove),
  ]
  const seen = new Set<string>()
  const selected: CachePlannedLink[] = []
  for (const cand of pool) {
    const k = keyOf(cand.targetUrl, cand.anchorText)
    if (desiredKeys.has(k) && !seen.has(k)) { seen.add(k); selected.push({ ...cand, selected: true }) }
  }
  return { ...plan, selected, rejected: plan.rejected.filter((r) => !seen.has(keyOf(r.targetUrl, r.anchorText))) }
}

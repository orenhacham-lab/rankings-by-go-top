/**
 * Internal-link planner — Phase 1 (DRY RUN ONLY).
 *
 * Pure, deterministic, side-effect-free. Given a topic and the project's existing
 * internal-link candidates (from loadInternalLinkCandidates), it decides which
 * targets WOULD be linked and with which anchor — and, crucially, WHY each
 * candidate was selected or rejected. It writes nothing, generates nothing, and
 * inserts nothing. It only produces an explainable plan for manual review.
 *
 * Safety rules (see the constants below):
 *   - same-domain/internal targets only,
 *   - strict topic↔target token relevance floor,
 *   - anchors must be natural 2–6 word phrases (never generic: "כאן", "מוצרים",
 *     "עמוד", "אתר", "לחצו כאן", …),
 *   - de-duplicate by URL, cap at MAX links per topic,
 *   - reject near-self targets (linking to essentially the same subject),
 *   - return ZERO links when nothing is clearly relevant.
 *
 * No AI. No I/O. Reuses the same deterministic helpers the rest of the content
 * module already uses (token-set Jaccard, anchor-shape validation, URL keys).
 */

import { tokens, jaccard } from '@/lib/content/recommendations/dedupe'
import { manualAnchorShapeValid, isInternalUrl, normalizeHref, normalizeUrlKey } from '@/lib/content/internal-links'
import type { InternalLinkCandidate } from '@/lib/content/internal-link-candidates'

// --- Tunable thresholds (kept explicit so we can tune during review) ----------
/** Minimum topic↔target token overlap for a candidate to be considered at all. */
export const PLANNER_RELEVANCE_MIN = 0.3
/** Above this topic↔target similarity we treat it as the SAME subject (self-ish). */
export const PLANNER_SELF_SIMILARITY_MAX = 0.85
/** Final confidence a candidate must reach to be SELECTED (relevance + source bonus). */
export const PLANNER_MIN_CONFIDENCE = 0.45
/** Hard cap on links per topic (0 is always allowed). */
export const PLANNER_MAX_LINKS = 4

/**
 * Weak/generic anchors rejected outright (in addition to the 2–6 word shape
 * check). Matches the phrases the product explicitly does not want as anchors.
 */
const WEAK_ANCHORS = new Set([
  'כאן', 'לחצו כאן', 'לחץ כאן', 'מוצרים', 'עמוד', 'דף', 'אתר', 'עוד', 'קרא עוד', 'קראו עוד',
  'למידע נוסף', 'מידע נוסף', 'לפרטים', 'לפרטים נוספים', 'להמשך', 'להמשך קריאה',
  'here', 'click here', 'read more', 'products', 'page', 'site', 'link', 'more', 'learn more',
])

export interface TopicForPlanning {
  id: string
  title: string
  primaryKeyword: string | null
  secondaryKeywords: string[]
}

export type AnchorSource = 'target_keyword' | 'historical_anchor' | 'secondary_keyword' | 'target_title'

export interface PlannedLinkDebug {
  targetId: string
  targetTitle: string
  targetUrl: string
  kind: InternalLinkCandidate['kind']
  anchorText: string | null
  anchorSource: AnchorSource | null
  /** 0..1 token overlap between the topic and the target. */
  relevance: number
  /** 0..1 final score = relevance + anchor-source bonus (clamped). */
  confidence: number
  selected: boolean
  /** Plain-language why-selected note (empty when rejected). */
  reason: string
  /** Plain-language why-not notes (empty when selected). */
  rejectedReasons: string[]
}

export interface TopicInternalLinkPlan {
  topicId: string
  topicTitle: string
  primaryKeyword: string | null
  selected: PlannedLinkDebug[]
  rejected: PlannedLinkDebug[]
  summary: string
}

const round2 = (n: number) => Math.round(n * 100) / 100
const isWeakAnchor = (s: string) => WEAK_ANCHORS.has(s.trim().toLowerCase())
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/** Bonus applied to relevance based on where the chosen anchor came from. */
const SOURCE_BONUS: Record<AnchorSource, number> = {
  target_keyword: 0.15, // the target's own defined keyword — strongest descriptor
  historical_anchor: 0.1, // a phrase already used to link this target — proven natural
  secondary_keyword: 0.05,
  target_title: -0.05, // weakest — the raw title/slug
}

/**
 * Pick the best natural anchor for a target, in priority order, applying the
 * shape + generic-word rules. Returns null when no acceptable anchor exists.
 */
function chooseAnchor(cand: InternalLinkCandidate): { text: string; source: AnchorSource } | null {
  const ordered: { text: string; source: AnchorSource }[] = []
  if (cand.keyword?.trim()) ordered.push({ text: cand.keyword.trim(), source: 'target_keyword' })
  for (const a of cand.historicalAnchors) {
    if (wordCount(a) >= 2) ordered.push({ text: a.trim(), source: 'historical_anchor' })
  }
  for (const s of cand.secondaryKeywords) {
    if (s?.trim()) ordered.push({ text: s.trim(), source: 'secondary_keyword' })
  }
  if (cand.title?.trim()) ordered.push({ text: cand.title.trim(), source: 'target_title' })

  const seen = new Set<string>()
  for (const opt of ordered) {
    const key = opt.text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (isWeakAnchor(opt.text)) continue
    if (!manualAnchorShapeValid(opt.text)) continue // enforces 2–6 content words, no generic single word
    return opt
  }
  return null
}

/**
 * Produce the dry-run internal-link plan for ONE topic against the project's
 * candidate targets. Pure — no writes, no I/O.
 */
export function planInternalLinksForTopic(
  topic: TopicForPlanning,
  candidates: InternalLinkCandidate[],
  hosts: string[],
): TopicInternalLinkPlan {
  const topicTokens = tokens([topic.primaryKeyword ?? '', topic.title, ...(topic.secondaryKeywords ?? [])].join(' '))
  const topicKeyTokens = tokens(topic.primaryKeyword || topic.title)

  const scored: PlannedLinkDebug[] = []

  for (const cand of candidates) {
    const rejectedReasons: string[] = []
    const targetUrl = normalizeHref(cand.url)

    // 1) Internal-only (loader already same-site; verify defensively).
    if (!targetUrl || !isInternalUrl(targetUrl, hosts)) rejectedReasons.push('off_domain_or_empty_url')

    // 2) Token relevance topic ↔ target.
    const candTokens = tokens([cand.title, cand.keyword ?? '', ...(cand.secondaryKeywords ?? [])].join(' '))
    const relevance = round2(jaccard(topicTokens, candTokens))
    if (relevance < PLANNER_RELEVANCE_MIN) rejectedReasons.push(`low_relevance(${relevance} < ${PLANNER_RELEVANCE_MIN})`)

    // 3) Near-self guard: don't link to essentially the same subject.
    const selfSim = round2(jaccard(topicKeyTokens, tokens(`${cand.title} ${cand.keyword ?? ''}`)))
    if (selfSim > PLANNER_SELF_SIMILARITY_MAX) rejectedReasons.push(`too_similar_self_link(${selfSim})`)

    // 4) Anchor selection (natural 2–6 word phrase, never generic).
    const anchor = chooseAnchor(cand)
    if (!anchor) rejectedReasons.push('no_natural_anchor')

    // 5) Confidence = relevance + anchor-source bonus, clamped.
    const bonus = anchor ? SOURCE_BONUS[anchor.source] : 0
    const keywordMatch = !!cand.keyword && jaccard(topicKeyTokens, tokens(cand.keyword)) >= 0.3
    const confidence = round2(Math.max(0, Math.min(1, relevance + bonus + (keywordMatch ? 0.1 : 0))))
    if (rejectedReasons.length === 0 && confidence < PLANNER_MIN_CONFIDENCE) {
      rejectedReasons.push(`low_confidence(${confidence} < ${PLANNER_MIN_CONFIDENCE})`)
    }

    const selected = rejectedReasons.length === 0
    const reason = selected
      ? `relevance ${relevance}${keywordMatch ? ' + keyword match' : ''}; anchor "${anchor!.text}" from ${anchor!.source} (confidence ${confidence})`
      : ''

    scored.push({
      targetId: cand.id,
      targetTitle: cand.title,
      targetUrl,
      kind: cand.kind,
      anchorText: anchor?.text ?? null,
      anchorSource: anchor?.source ?? null,
      relevance,
      confidence,
      selected,
      reason,
      rejectedReasons,
    })
  }

  // De-duplicate SELECTED by normalized URL (keep highest confidence) and by
  // anchor text (never repeat the same anchor phrase).
  const selectedSorted = scored.filter((s) => s.selected).sort((a, b) => b.confidence - a.confidence)
  const seenUrl = new Set<string>()
  const seenAnchor = new Set<string>()
  const finalSelected: PlannedLinkDebug[] = []
  for (const s of selectedSorted) {
    const urlKey = normalizeUrlKey(s.targetUrl)
    const anchorKey = (s.anchorText ?? '').toLowerCase()
    if (seenUrl.has(urlKey)) { s.selected = false; s.rejectedReasons.push('duplicate_url'); continue }
    if (anchorKey && seenAnchor.has(anchorKey)) { s.selected = false; s.rejectedReasons.push('duplicate_anchor'); continue }
    if (finalSelected.length >= PLANNER_MAX_LINKS) { s.selected = false; s.rejectedReasons.push('over_cap'); continue }
    seenUrl.add(urlKey)
    if (anchorKey) seenAnchor.add(anchorKey)
    finalSelected.push(s)
  }

  const rejected = scored
    .filter((s) => !finalSelected.includes(s))
    .sort((a, b) => b.confidence - a.confidence)

  const summary = finalSelected.length
    ? `${finalSelected.length} internal link(s) would be planned (of ${candidates.length} candidates).`
    : `0 relevant internal links — this topic would publish WITHOUT internal links (of ${candidates.length} candidates).`

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    primaryKeyword: topic.primaryKeyword,
    selected: finalSelected,
    rejected,
    summary,
  }
}

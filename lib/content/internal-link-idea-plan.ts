/**
 * Phase 3F.3.2 — turn a topic idea's USER-SELECTED suggested internal links into
 * validated PLANNED plan links for the newly-created topic.
 *
 * Pure validation against the cached scan (no rescan, no planner-scoring change,
 * no insertion): a selected link is kept only when its target exists in the
 * cache, is an internal URL, is eligible (not blocked/ineligible), is not a
 * self/duplicate target, and has a safe anchor. Duplicates are removed. The
 * result is saved as PLANNED links (never approved/inserted) via savePlanBatch.
 */

import { normalizeUrlKey, isInternalUrl, manualAnchorShapeValid } from '@/lib/content/internal-links'
import { selfOrDuplicateReason, type CachePlannedLink, type CacheTopicPlan } from '@/lib/content/internal-link-planner-cache'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'

export interface SelectedIdeaLink { url: string; anchor: string }

export interface TopicForPlan {
  id: string
  title: string
  primaryKeyword: string | null
  secondaryKeywords: string[]
}

/** Best safe anchor for a target from the selection: the chosen anchor if valid,
 *  else a vetted usable anchor, else the target's clean keyword. Null = unusable. */
function resolveAnchor(target: ScannedTarget, chosen: string): { text: string; source: 'usable_anchor' | 'target_keyword' } | null {
  const c = (chosen || '').trim()
  const usable = (target.usableAnchors ?? []).filter((a) => a?.usability === 'yes' && (a.text || '').trim())
  if (c && (usable.some((a) => a.text.toLowerCase() === c.toLowerCase()) || manualAnchorShapeValid(c))) {
    return { text: c, source: 'usable_anchor' }
  }
  const firstUsable = usable[0]?.text?.trim()
  if (firstUsable && manualAnchorShapeValid(firstUsable)) return { text: firstUsable, source: 'usable_anchor' }
  const kw = (target.primaryKeywordCandidate || '').trim()
  if (target.keywordAvailable && kw && manualAnchorShapeValid(kw)) return { text: kw, source: 'target_keyword' }
  return null
}

/**
 * Build validated PLANNED links from the idea-stage selection. Returns the
 * CachePlannedLink[] (may be empty when nothing is valid). Pure.
 */
export function buildIdeaSelectedPlanLinks(
  topic: TopicForPlan,
  selected: SelectedIdeaLink[],
  targets: ScannedTarget[],
  hosts: string[],
): CachePlannedLink[] {
  const targetByKey = new Map<string, ScannedTarget>()
  for (const t of targets) targetByKey.set(normalizeUrlKey(t.targetUrl), t)
  const topicForPlanning = { id: topic.id, title: topic.title, primaryKeyword: topic.primaryKeyword, secondaryKeywords: topic.secondaryKeywords }

  const out: CachePlannedLink[] = []
  const seen = new Set<string>()
  for (const sel of Array.isArray(selected) ? selected : []) {
    const url = (sel?.url || '').trim()
    if (!url) continue
    const key = normalizeUrlKey(url)
    if (seen.has(key)) continue // no duplicate targets
    const target = targetByKey.get(key)
    if (!target) continue // must exist in the current scan
    if (!isInternalUrl(url, hosts)) continue // must be internal
    if (target.eligibility !== 'yes') continue // not blocked/ineligible
    if (selfOrDuplicateReason(topicForPlanning, target)) continue // not self/duplicate
    const anchor = resolveAnchor(target, sel.anchor || '')
    if (!anchor) continue // no safe anchor

    seen.add(key)
    out.push({
      targetUrl: target.targetUrl,
      targetTitle: target.targetTitle,
      targetRole: target.targetRole,
      targetPriority: target.targetPriority,
      eligibility: target.eligibility,
      anchorText: anchor.text,
      anchorSource: anchor.source,
      relevance: 0.5,
      priorityBonus: 0,
      confidence: 0.6,
      selected: true,
      reason: 'topic_idea_selection',
      rejectedReasons: [],
      matchedTokens: [],
      missingTokens: [],
      entityMatchedTokens: [],
      normalizedTopicTokens: [],
      normalizedCandidateTokens: [],
      relevanceMethod: 'jaccard',
      reviewability: 'recommended',
      canManualApprove: true,
      blockReason: null,
    })
  }
  return out
}

/** Assemble a CacheTopicPlan from validated selection (for savePlanBatch). */
export function ideaSelectedPlan(topic: TopicForPlan, links: CachePlannedLink[]): CacheTopicPlan {
  return { topicId: topic.id, topicTitle: topic.title, primaryKeyword: topic.primaryKeyword, selected: links, rejected: [], summary: 'topic_idea_selection' }
}

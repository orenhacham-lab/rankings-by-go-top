/**
 * Re-anchor recovery for approved internal links whose anchor text is missing
 * from a generated draft — Phase 3B.4 (READ-ONLY suggestion, no mutation).
 *
 * When a topic's links were approved AFTER the article was generated, the
 * generator never received the approved anchors as writing guidance, so the
 * exact anchor phrase may not occur in the draft and the insertion preview skips
 * the link with `anchor_not_found_in_safe_prose`. This module suggests SAFE
 * ALTERNATIVE anchors that ALREADY exist in the draft body — never inventing
 * text, never rewriting the article, never inserting anything.
 *
 * A candidate alternative is only offered when:
 *   - it is one of the target's scanner-VETTED anchors (usableAnchors, usability
 *     'yes') or the target's clean primary-keyword candidate, AND
 *   - it occurs as safe natural prose in the draft per findNaturalAnchorPlacement
 *     (no headings/tables/buttons/nav, not inside an existing link, past the
 *     opening snippet, and not too close to another link).
 *
 * The actual insertion still goes through the existing preview → confirmed apply
 * → rollback flow; this only proposes/records a better anchor phrase.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { reassembleReport } from '@/lib/content/wordpress-content-index'
import { evaluateApprovedLinks, type EvalArticle } from '@/lib/content/internal-link-insertion-eval'
import { findNaturalAnchorPlacement, existingLinkWordOffsets, INTERNAL_LINK_APPLY_MIN_WORD_GAP } from '@/lib/content/internal-link-insertion'
import { normalizeUrlKey, manualAnchorShapeValid } from '@/lib/content/internal-links'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import type { InternalLinkPlanBatchRow } from '@/lib/supabase/types'

type Admin = ReturnType<typeof createAdminClient>

/** The specific skip reason this recovery flow is for (anchor missing from body). */
export const REANCHOR_SKIP_REASON = 'anchor_not_found_in_safe_prose'

export interface ReanchorSuggestion {
  anchorText: string
  sentence: string | null
  wordOffset: number | null
}

export interface ReanchorLink {
  linkId: string
  targetUrl: string
  targetTitle: string | null
  originalAnchor: string
  suggestions: ReanchorSuggestion[]
}

export interface ReanchorResult {
  batch: InternalLinkPlanBatchRow | null
  reason?: 'no_plan_batch' | 'no_approved_links'
  /** Approved links whose anchor is missing from the draft (the recovery set). */
  links: ReanchorLink[]
  /** Approved links that already place normally (unchanged by this flow). */
  insertableCount: number
  /** Approved links skipped for a NON-anchor reason (stale/ineligible/etc.). */
  otherSkippedCount: number
}

const MAX_SUGGESTIONS_PER_LINK = 5

/** Vetted candidate anchor phrases for a target (never invented). */
function candidateAnchorsForTarget(target: ScannedTarget, exclude: string): string[] {
  const pool: string[] = []
  const seen = new Set<string>()
  const excludeKey = exclude.trim().toLowerCase()
  const push = (raw: string | null | undefined) => {
    const text = (raw || '').trim()
    const key = text.toLowerCase()
    if (!text || key === excludeKey || seen.has(key) || !manualAnchorShapeValid(text)) return
    seen.add(key)
    pool.push(text)
  }
  for (const a of target.usableAnchors ?? []) if (a?.usability === 'yes') push(a.text)
  if (target.keywordAvailable) push(target.primaryKeywordCandidate)
  return pool
}

/**
 * Suggest safe in-draft alternative anchors for approved links whose original
 * anchor text is missing from the body. Pure aside from the read calls inside
 * evaluateApprovedLinks; writes nothing.
 */
export async function suggestReanchors(admin: Admin, projectId: string, article: EvalArticle): Promise<ReanchorResult> {
  const evalRes = await evaluateApprovedLinks(admin, projectId, article)
  if (evalRes.reason) return { batch: evalRes.batch, reason: evalRes.reason, links: [], insertableCount: 0, otherSkippedCount: 0 }

  const html = article.contentHtml || ''
  const report = evalRes.cacheRow ? reassembleReport(evalRes.cacheRow) : null
  const targets = (report?.targets ?? []) as ScannedTarget[]
  const targetByKey = new Map<string, ScannedTarget>()
  for (const t of targets) targetByKey.set(normalizeUrlKey(t.targetUrl), t)

  // Seed spacing with existing links AND the links that already place normally,
  // so a suggested alternative isn't offered at a spot the min gap forbids.
  const seed: number[] = existingLinkWordOffsets(html)
  for (const it of evalRes.items) {
    if (it.status === 'would_insert' && typeof it.placement?.wordCountBefore === 'number') seed.push(it.placement.wordCountBefore)
  }

  const links: ReanchorLink[] = []
  let otherSkippedCount = 0
  for (const it of evalRes.items) {
    if (it.status !== 'skipped') continue
    if (it.reason !== REANCHOR_SKIP_REASON) { otherSkippedCount++; continue }
    const target = targetByKey.get(normalizeUrlKey(it.targetUrl))
    if (!target) { otherSkippedCount++; continue }

    const suggestions: ReanchorSuggestion[] = []
    for (const cand of candidateAnchorsForTarget(target, it.anchorText)) {
      const placement = findNaturalAnchorPlacement(html, cand, seed, { minWordGap: INTERNAL_LINK_APPLY_MIN_WORD_GAP })
      if (placement.found) suggestions.push({ anchorText: cand, sentence: placement.sentence ?? null, wordOffset: placement.wordOffset ?? null })
      if (suggestions.length >= MAX_SUGGESTIONS_PER_LINK) break
    }
    // Reserve the top suggestion's slot so a different target isn't offered the
    // exact same spot (the final real preview still enforces full spacing).
    if (suggestions.length && typeof suggestions[0]!.wordOffset === 'number') seed.push(suggestions[0]!.wordOffset)

    links.push({ linkId: it.linkId, targetUrl: it.targetUrl, targetTitle: target.targetTitle ?? null, originalAnchor: it.anchorText, suggestions })
  }

  const insertableCount = evalRes.items.filter((i) => i.status === 'would_insert').length
  return { batch: evalRes.batch, links, insertableCount, otherSkippedCount }
}

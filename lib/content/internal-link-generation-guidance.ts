/**
 * Phase 2F.2 — approved internal-link plan anchors as GENERATION GUIDANCE.
 *
 * Loads a topic's latest active saved plan (Phase 2C), keeps ONLY approved links,
 * drops stale plans (reusing evaluateStaleness), and returns up to `max` anchor
 * PHRASES (highest-confidence first) to weave into the article as plain text.
 *
 * This is prompt guidance only. It NEVER inserts <a> tags, never writes
 * internal_links_json, and never calls insert/apply — the returned phrases are
 * fed to `ArticleBrief.plannedInternalAnchors`, which the generator includes as
 * verbatim plain text so a later MANUAL apply has a natural occurrence to link.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getCachedIndex, reassembleReport } from '@/lib/content/wordpress-content-index'
import { getLatestBatchForTopic, getBatchLinks, evaluateStaleness } from '@/lib/content/internal-link-plan-store'
import { normalizeUrlKey } from '@/lib/content/internal-links'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'

type Admin = ReturnType<typeof createAdminClient>

export interface ApprovedAnchorGuidance {
  anchors: string[]
  diagnostics: {
    approvedPlanLinksLoaded: number
    approvedAnchorsPassedToPrompt: number
    anchorsRequestedInPrompt: number
    planStale: boolean
  }
}

const EMPTY = (planStale = false): ApprovedAnchorGuidance => ({
  anchors: [],
  diagnostics: { approvedPlanLinksLoaded: 0, approvedAnchorsPassedToPrompt: 0, anchorsRequestedInPrompt: 0, planStale },
})

/**
 * Read-only. Returns approved anchor phrases for a topic (capped, stale-filtered).
 * Never throws — on any issue it returns no anchors so generation proceeds normally.
 */
export async function loadApprovedPlanAnchors(
  admin: Admin,
  projectId: string,
  topicId: string,
  topicMeta: { title: string; primaryKeyword: string | null },
  max = 3,
): Promise<ApprovedAnchorGuidance> {
  try {
    const batch = await getLatestBatchForTopic(admin, projectId, topicId)
    if (!batch) return EMPTY()
    const allLinks = await getBatchLinks(admin, batch.id)
    const approved = allLinks.filter((l) => l.status === 'approved')
    if (approved.length === 0) return EMPTY()

    // Drop stale plans (same logic the manual apply flow uses).
    const cacheRow = await getCachedIndex(admin, projectId)
    const targets = (cacheRow ? (reassembleReport(cacheRow).targets ?? []) : []) as ScannedTarget[]
    const staleness = evaluateStaleness(batch, allLinks, {
      cacheScanCompletedAt: cacheRow?.scan_completed_at ?? null,
      cacheScannerVersion: cacheRow?.scanner_version ?? null,
      topicTitle: topicMeta.title,
      topicPrimaryKeyword: topicMeta.primaryKeyword,
      targets,
    })
    if (staleness.stale) {
      return { ...EMPTY(true), diagnostics: { approvedPlanLinksLoaded: approved.length, approvedAnchorsPassedToPrompt: 0, anchorsRequestedInPrompt: 0, planStale: true } }
    }

    // Phase 3G.5 — PER-LINK target health (plan-level staleness no longer covers
    // it): skip an approved link whose target is missing from the current cache
    // or not eligible ('yes'), so a phrase whose link can never be inserted is
    // not woven into the article — while every healthy anchor still flows.
    const targetByKey = new Map<string, ScannedTarget>()
    for (const t of targets) targetByKey.set(normalizeUrlKey(t.targetUrl), t)

    // Approved links are already confidence-sorted (getBatchLinks). Dedupe by
    // lowercased phrase, keep original order, cap.
    const seen = new Set<string>()
    const anchors: string[] = []
    for (const l of approved) {
      const text = (l.anchor_text || '').trim()
      const key = text.toLowerCase()
      if (!text || seen.has(key)) continue
      const target = targetByKey.get(normalizeUrlKey(l.target_url))
      if (!target || target.eligibility !== 'yes') continue
      seen.add(key)
      anchors.push(text)
      if (anchors.length >= max) break
    }

    return {
      anchors,
      diagnostics: { approvedPlanLinksLoaded: approved.length, approvedAnchorsPassedToPrompt: anchors.length, anchorsRequestedInPrompt: anchors.length, planStale: false },
    }
  } catch {
    return EMPTY()
  }
}

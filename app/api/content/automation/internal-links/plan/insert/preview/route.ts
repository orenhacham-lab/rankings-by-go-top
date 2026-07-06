/**
 * Content automation — POST /api/content/automation/internal-links/plan/insert/preview
 *
 * READ-ONLY natural-only insertion PREVIEW (Phase 2D.1). For a generated draft
 * article, shows which APPROVED internal-link plans could be inserted (natural
 * existing-phrase placement) and which would be skipped, with revalidation — and
 * writes NOTHING (no content_html, internal_links_json, plan tables, cache, etc).
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING + project ownership.
 * Body: { projectId, generatedArticleId, topicId? }.
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { getCachedIndex, reassembleReport, isStale, isVersionStale, SCAN_INDEX_VERSION } from '@/lib/content/wordpress-content-index'
import { getLatestBatchForTopic, getBatchLinks, evaluateStaleness } from '@/lib/content/internal-link-plan-store'
import { selfOrDuplicateReason } from '@/lib/content/internal-link-planner-cache'
import { findNaturalAnchorPlacement } from '@/lib/content/internal-link-insertion'
import { isInternalUrl, isUrlAlreadyLinked, normalizeUrlKey, manualAnchorShapeValid } from '@/lib/content/internal-links'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; generatedArticleId?: unknown; topicId?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const generatedArticleId = typeof body.generatedArticleId === 'string' ? body.generatedArticleId : null
  let topicId = typeof body.topicId === 'string' ? body.topicId : null

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project } = auth
  if (!generatedArticleId) return Response.json({ error: 'generatedArticleId_required' }, { status: 400 })

  // Load the draft article (read-only).
  const { data: artData } = await admin
    .from('generated_articles')
    .select('id, project_id, topic_id, content_html, title')
    .eq('id', generatedArticleId)
    .eq('project_id', project.id)
    .maybeSingle()
  const article = artData as { id: string; topic_id: string | null; content_html: string | null; title: string | null } | null
  if (!article) return Response.json({ error: 'article_not_found' }, { status: 404 })
  const html = article.content_html || ''
  topicId = topicId || article.topic_id

  const base = { dryRun: true, projectId: project.id, generatedArticleId, contentChanged: false }
  if (!topicId) return Response.json({ ...base, batchId: null, approvedLinks: 0, wouldInsert: 0, wouldSkip: 0, reason: 'no_topic_for_article', items: [] })

  // Latest active plan batch + its approved links.
  const batch = await getLatestBatchForTopic(admin, project.id, topicId)
  if (!batch) return Response.json({ ...base, batchId: null, approvedLinks: 0, wouldInsert: 0, wouldSkip: 0, reason: 'no_plan_batch', items: [] })
  const allLinks = await getBatchLinks(admin, batch.id)
  const approved = allLinks.filter((l) => l.status === 'approved')
  if (approved.length === 0) {
    return Response.json({ ...base, batchId: batch.id, approvedLinks: 0, wouldInsert: 0, wouldSkip: 0, reason: 'no_approved_links', items: [] })
  }

  // Current cache + topic for revalidation.
  const cacheRow = await getCachedIndex(admin, project.id)
  const targets = cacheRow ? ((reassembleReport(cacheRow).targets ?? []) as ScannedTarget[]) : []
  const hosts = cacheRow ? (reassembleReport(cacheRow).hosts ?? []) : []
  const targetByKey = new Map<string, ScannedTarget>()
  for (const t of targets) targetByKey.set(normalizeUrlKey(t.targetUrl), t)

  const cacheStale = !cacheRow || isStale(cacheRow)
  const cacheVersionStale = !cacheRow || isVersionStale(cacheRow)

  const { data: topicRow } = await admin.from('article_topics').select('id, topic, primary_keyword, secondary_keywords, updated_at').eq('id', topicId).maybeSingle()
  const topic = topicRow as { topic: string; primary_keyword: string | null; secondary_keywords: string[] | null; updated_at: string } | null
  const topicForPlanning = { id: topicId, title: topic?.topic ?? '', primaryKeyword: topic?.primary_keyword ?? null, secondaryKeywords: Array.isArray(topic?.secondary_keywords) ? topic!.secondary_keywords! : [] }

  const staleness = evaluateStaleness(batch, allLinks, {
    cacheScanCompletedAt: cacheRow?.scan_completed_at ?? null,
    cacheScannerVersion: cacheRow?.scanner_version ?? null,
    topicUpdatedAt: topic?.updated_at ?? null,
    targets,
  })

  const usedWordOffsets: number[] = []
  const items = approved
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .map((l) => {
      const url = l.target_url
      const anchor = l.anchor_text || ''
      const target = targetByKey.get(normalizeUrlKey(url))
      const selfReason = target && topic ? selfOrDuplicateReason(topicForPlanning, target) : null
      const anchorClean = !!target && ((target.usableAnchors ?? []).some((a) => a.text.toLowerCase() === anchor.toLowerCase()) || manualAnchorShapeValid(anchor))

      const checks = {
        status_approved: l.status === 'approved',
        batch_latest: batch.status === 'planned' || batch.status === 'approved' || batch.status === 'rejected',
        plan_not_stale: !staleness.stale,
        cache_not_stale: !cacheStale,
        cache_version_ok: !cacheVersionStale,
        target_in_cache: !!target,
        target_eligible: target?.eligibility === 'yes',
        not_self_or_duplicate: !selfReason,
        anchor_clean: anchorClean,
        url_internal: isInternalUrl(url, hosts),
        not_already_linked: !isUrlAlreadyLinked(html, url),
        natural_placement: false,
      }

      // First failing pre-placement check → skip with its reason.
      let skipReason: string | null = null
      if (!checks.plan_not_stale) skipReason = 'plan_stale'
      else if (!checks.cache_not_stale) skipReason = 'cache_stale'
      else if (!checks.cache_version_ok) skipReason = 'cache_version_stale'
      else if (!checks.target_in_cache) skipReason = 'target_missing_from_cache'
      else if (!checks.target_eligible) skipReason = 'target_now_ineligible'
      else if (!checks.not_self_or_duplicate) skipReason = `self_or_duplicate_target(${selfReason})`
      else if (!checks.anchor_clean) skipReason = 'anchor_no_longer_clean'
      else if (!checks.url_internal) skipReason = 'target_not_internal'
      else if (!checks.not_already_linked) skipReason = 'target_already_linked'

      if (skipReason) {
        return { linkId: l.id, targetUrl: url, anchorText: anchor, status: 'skipped', reason: skipReason, sentencePreview: null, checks }
      }

      const placement = findNaturalAnchorPlacement(html, anchor, usedWordOffsets)
      if (!placement.found) {
        return { linkId: l.id, targetUrl: url, anchorText: anchor, status: 'skipped', reason: placement.skipReason, sentencePreview: null, checks }
      }
      checks.natural_placement = true
      usedWordOffsets.push(placement.wordOffset ?? 0)
      return { linkId: l.id, targetUrl: url, anchorText: anchor, status: 'would_insert', reason: 'safe_prose_occurrence_found', sentencePreview: placement.sentence ?? null, checks }
    })

  const wouldInsert = items.filter((i) => i.status === 'would_insert').length
  return Response.json({
    ...base,
    batchId: batch.id,
    currentScannerVersion: SCAN_INDEX_VERSION,
    planStale: staleness.stale,
    planStaleReasons: staleness.reasons,
    cacheStale,
    cacheVersionStale,
    approvedLinks: approved.length,
    wouldInsert,
    wouldSkip: items.length - wouldInsert,
    items,
  })
}

/**
 * Content automation — GET /api/content/automation/internal-links/plan/saved
 *
 * Read-only: returns the latest ACTIVE saved plan batch + its links for a topic,
 * with computed staleness vs the CURRENT cache + topic. Reads ONLY the plan
 * tables + the cache + the topic row. Writes nothing.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING + project ownership.
 * Query: projectId (required), topicId (required)  [or articlePoolItemId / generatedArticleId]
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { getCachedIndex, reassembleReport, SCAN_INDEX_VERSION } from '@/lib/content/wordpress-content-index'
import { getLatestBatchForTopic, getBatchLinks, evaluateStaleness } from '@/lib/content/internal-link-plan-store'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  let topicId = url.searchParams.get('topicId')
  const articlePoolItemId = url.searchParams.get('articlePoolItemId')
  const generatedArticleId = url.searchParams.get('generatedArticleId')

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project } = auth

  if (!topicId && articlePoolItemId) {
    const { data } = await admin.from('article_pool_items').select('topic_id').eq('id', articlePoolItemId).eq('project_id', project.id).maybeSingle()
    topicId = (data as { topic_id: string | null } | null)?.topic_id ?? null
  } else if (!topicId && generatedArticleId) {
    const { data } = await admin.from('generated_articles').select('topic_id').eq('id', generatedArticleId).eq('project_id', project.id).maybeSingle()
    topicId = (data as { topic_id: string | null } | null)?.topic_id ?? null
  }
  if (!topicId) return Response.json({ error: 'topicId_required' }, { status: 400 })

  const batch = await getLatestBatchForTopic(admin, project.id, topicId)
  if (!batch) return Response.json({ exists: false, topicId })
  const links = await getBatchLinks(admin, batch.id)

  // Current cache + topic for staleness comparison.
  const row = await getCachedIndex(admin, project.id)
  const targets = row ? ((reassembleReport(row).targets ?? []) as ScannedTarget[]) : []
  const { data: topicRow } = await admin.from('article_topics').select('updated_at').eq('id', topicId).maybeSingle()

  const staleness = evaluateStaleness(batch, links, {
    cacheScanCompletedAt: row?.scan_completed_at ?? null,
    cacheScannerVersion: row?.scanner_version ?? null,
    topicUpdatedAt: (topicRow as { updated_at?: string } | null)?.updated_at ?? null,
    targets,
  })

  return Response.json({
    exists: true,
    topicId,
    batch: {
      id: batch.id,
      status: batch.status,
      subjectType: batch.subject_type,
      subjectTitle: batch.subject_title_snapshot,
      primaryKeyword: batch.primary_keyword_snapshot,
      plannerVersion: batch.planner_version,
      cacheScannerVersion: batch.cache_scanner_version,
      currentScannerVersion: SCAN_INDEX_VERSION,
      cacheScanCompletedAt: batch.cache_scan_completed_at,
      cacheState: batch.cache_state,
      allowCaution: batch.allow_caution,
      staleAtCreation: batch.stale_at_creation,
      linkCount: batch.link_count,
      selectedCount: batch.selected_count,
      rejectedCount: batch.rejected_count,
      warnings: batch.warnings,
      diagnosticsSummary: batch.diagnostics_summary,
      createdAt: batch.created_at,
    },
    stale: staleness.stale,
    staleReasons: staleness.reasons,
    links,
  })
}

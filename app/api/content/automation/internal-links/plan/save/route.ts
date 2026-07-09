/**
 * Content automation — POST /api/content/automation/internal-links/plan/save
 *
 * Persists a reviewed internal-link PLAN for ONE subject (topic / pool item /
 * generated article) into the INERT plan tables. Re-runs the Phase 2B planner
 * server-side and persists ONLY its selected links — client link payloads are
 * never trusted. Zero selected links → a batch with link_count 0 (auditable).
 *
 * Writes ONLY article_internal_link_plan_batches/_links. Does NOT touch article
 * content, brief_notes, anchors_json, generated_articles.internal_links_json,
 * generation, publishing, cron, queue, or approval. 'approved' is review-only.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING + project ownership.
 * Body: { projectId, topicId? , articlePoolItemId?, generatedArticleId?, allowCaution?, force?, approve? }
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { getCachedIndex, reassembleReport, isStale, isVersionStale } from '@/lib/content/wordpress-content-index'
import { planFromCachedTargets, promoteManualCandidates, CACHE_PLANNER_VERSION } from '@/lib/content/internal-link-planner-cache'
import { savePlanBatch, getBatchLinks, approveBatchLinks, type PlanSubject } from '@/lib/content/internal-link-plan-store'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import type { InternalLinkPlanSubjectType } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

interface TopicRow {
  id: string
  topic: string
  primary_keyword: string | null
  secondary_keywords: string[] | null
}

export async function POST(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; topicId?: unknown; articlePoolItemId?: unknown; generatedArticleId?: unknown; allowCaution?: unknown; force?: unknown; manualCandidates?: unknown; approve?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const allowCaution = body.allowCaution === true
  const force = body.force === true
  // Phase 3G.7 — enqueue-intent saves must APPROVE the saved links (generation
  // only auto-inserts approved links). Plain saves keep the default (planned).
  const approve = body.approve === true
  // Phase 2I — optional manually-selected reviewable candidates (server re-validated).
  const manualCandidates: { targetUrl: string; anchorText: string }[] = Array.isArray(body.manualCandidates)
    ? body.manualCandidates
        .slice(0, 50)
        .map((raw) => raw as { targetUrl?: unknown; anchorText?: unknown })
        .filter((m): m is { targetUrl: string; anchorText: string } => typeof m?.targetUrl === 'string' && typeof m.anchorText === 'string')
        .map((m) => ({ targetUrl: m.targetUrl, anchorText: m.anchorText }))
    : []
  let topicId = typeof body.topicId === 'string' ? body.topicId : null
  const articlePoolItemId = typeof body.articlePoolItemId === 'string' ? body.articlePoolItemId : null
  const generatedArticleId = typeof body.generatedArticleId === 'string' ? body.generatedArticleId : null

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project, user } = auth

  // Resolve the topic (subject). Accept a topic id, or derive it from a pool item
  // / generated article. subject_type = the most specific provided.
  let subjectType: InternalLinkPlanSubjectType = 'topic'
  if (!topicId && articlePoolItemId) {
    const { data } = await admin.from('article_pool_items').select('topic_id').eq('id', articlePoolItemId).eq('project_id', project.id).maybeSingle()
    topicId = (data as { topic_id: string | null } | null)?.topic_id ?? null
    subjectType = 'pool_item'
  } else if (!topicId && generatedArticleId) {
    const { data } = await admin.from('generated_articles').select('topic_id').eq('id', generatedArticleId).eq('project_id', project.id).maybeSingle()
    topicId = (data as { topic_id: string | null } | null)?.topic_id ?? null
    subjectType = 'generated_article'
  } else if (generatedArticleId) subjectType = 'generated_article'
  else if (articlePoolItemId) subjectType = 'pool_item'
  if (!topicId) return Response.json({ error: 'no_topic_for_subject' }, { status: 400 })

  const { data: topicData } = await admin
    .from('article_topics')
    .select('id, topic, primary_keyword, secondary_keywords')
    .eq('id', topicId)
    .eq('project_id', project.id)
    .maybeSingle()
  const topicRow = topicData as TopicRow | null
  if (!topicRow) return Response.json({ error: 'topic_not_found' }, { status: 404 })

  // Cache-only: read the stored index (NEVER a live scan).
  const row = await getCachedIndex(admin, project.id)
  if (!row) return Response.json({ ok: false, cacheState: 'missing', warning: 'no_cache_refresh_first' }, { status: 409 })

  const stale = isStale(row)
  const versionStale = isVersionStale(row)
  const warnings: string[] = []
  let cacheState = 'ok'
  if (row.scan_status === 'running') { cacheState = 'running'; warnings.push('refresh_in_progress') }
  if (row.scan_status === 'failed') { cacheState = 'failed_last_refresh'; warnings.push('last_refresh_failed') }
  if (versionStale) { cacheState = 'version_stale'; warnings.push('cache_version_stale') }
  if (stale) { cacheState = 'stale'; warnings.push('cache_stale') }

  if ((stale || versionStale) && !force) {
    return Response.json({ ok: false, cacheState, warnings, hint: 'refresh the index (force=true) or pass force=true to save anyway' }, { status: 409 })
  }
  const staleAtCreation = stale || versionStale

  const report = reassembleReport(row)
  const targets = (report.targets ?? []) as ScannedTarget[]
  const hosts = report.hosts ?? []

  const basePlan = planFromCachedTargets(
    { id: topicRow.id, title: topicRow.topic, primaryKeyword: topicRow.primary_keyword, secondaryKeywords: Array.isArray(topicRow.secondary_keywords) ? topicRow.secondary_keywords : [] },
    targets, hosts, { allowCaution },
  )
  // Merge server-validated manual reviewable overrides (if the client sent any).
  const { plan, promoted: manualApplied } = promoteManualCandidates(basePlan, manualCandidates)

  const subject: PlanSubject = { subjectType, topicId, articlePoolItemId, generatedArticleId }
  const batchId = await savePlanBatch(admin, {
    projectId: project.id,
    userId: user.id,
    subject,
    topicTitle: topicRow.topic,
    primaryKeyword: topicRow.primary_keyword,
    plan,
    plannerVersion: CACHE_PLANNER_VERSION,
    cacheScannerVersion: row.scanner_version,
    cacheScanCompletedAt: row.scan_completed_at,
    cacheState,
    allowCaution,
    strict: false,
    staleAtCreation,
    warnings,
  })
  if (!batchId) return Response.json({ error: 'save_failed' }, { status: 500 })

  // Phase 3G.7 — approval-count VERIFICATION: report exactly how many rows were
  // approved; an incomplete approval is surfaced as a warning, never silent.
  let approvedCount = 0
  if (approve && plan.selected.length > 0) {
    approvedCount = await approveBatchLinks(admin, project.id, batchId)
    if (approvedCount < plan.selected.length) {
      warnings.push('approval_incomplete')
      console.warn('[ilp-save] approval incomplete', { batchId, saved: plan.selected.length, approved: approvedCount })
    }
  }

  const links = await getBatchLinks(admin, batchId)
  return Response.json({
    ok: true,
    batchId,
    subjectType,
    topicId,
    cacheState,
    staleAtCreation,
    warnings,
    linkCount: plan.selected.length,
    approvedCount,
    unapprovedCount: plan.selected.length - approvedCount,
    rejectedCount: plan.rejected.length,
    manualApplied,
    summary: plan.summary,
    links,
  })
}

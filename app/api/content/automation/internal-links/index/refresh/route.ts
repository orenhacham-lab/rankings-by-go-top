/**
 * Content automation — POST /api/content/automation/internal-links/index/refresh
 *
 * Runs the READ-ONLY WordPress site scan and PERSISTS it into the per-project
 * content index cache (Phase 2A). Cache-only: does NOT touch the planner,
 * generation, publishing, cron, queue, or the approval flow.
 *
 * Ownership is verified (authContentProject) BEFORE any cache read/write or WP
 * scan; the service-role client is used only afterwards. A failed refresh never
 * clobbers a project's last good cached index.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING. Body: { projectId, force? }.
 */

import { authContentProject, isInternalLinkPlanningEnabled, loadWordPressCredentials } from '@/lib/content/api-auth'
import { scanWordPressSite } from '@/lib/content/wordpress-content-scan'
import {
  getCachedIndex, claimRefresh, writeSuccess, writeFailure,
  isStale, isVersionStale, indexTtlDays,
} from '@/lib/content/wordpress-content-index'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; force?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const force = body.force === true

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project, user } = auth

  // Fresh-cache short-circuit (skipped when force=true).
  const existing = await getCachedIndex(admin, project.id)
  if (!force && existing && (existing.scan_status === 'completed' || existing.scan_status === 'partial') && !isStale(existing) && !isVersionStale(existing)) {
    return Response.json({ refreshed: false, reason: 'fresh', status: existing.scan_status, scanCompletedAt: existing.scan_completed_at, expiresAt: existing.expires_at })
  }

  // WordPress credentials (decrypted transiently; never returned/logged).
  const wp = await loadWordPressCredentials(admin, project.id)
  if ('error' in wp) {
    await writeFailure(admin, { projectId: project.id, userId: user.id, errorMessage: `wordpress_connection: ${wp.error}`, startedAtMs: Date.now(), durationMs: 0 })
    return Response.json({ refreshed: false, status: 'failed', error: wp.error, preservedPriorIndex: !!existing && existing.scan_status !== 'failed' }, { status: wp.status })
  }

  // Claim a refresh slot (10-min stale-lock recovery). Preserves prior blobs.
  const claim = await claimRefresh(admin, project.id, user.id, wp.creds.siteUrl)
  if (!claim.ok && claim.inProgress) {
    return Response.json({ refreshed: false, status: 'running', reason: 'in_progress' }, { status: 202 })
  }

  // Read-only: our own published articles, for target↔generated_article matching.
  const { data: articleRows } = await admin
    .from('generated_articles')
    .select('id, title, wp_post_url, topic_id')
    .eq('project_id', project.id)
    .not('wp_post_url', 'is', null)
    .limit(500)
  const articles = ((articleRows ?? []) as { id: string; title: string | null; wp_post_url: string | null; topic_id: string | null }[]).filter((r) => r.wp_post_url)
  const topicIds = Array.from(new Set(articles.map((a) => a.topic_id).filter((x): x is string => !!x)))
  const kwByTopic = new Map<string, string>()
  if (topicIds.length > 0) {
    const { data: topicRows } = await admin.from('article_topics').select('id, primary_keyword').in('id', topicIds)
    for (const t of (topicRows ?? []) as { id: string; primary_keyword: string | null }[]) {
      if (t.primary_keyword) kwByTopic.set(t.id, t.primary_keyword)
    }
  }
  const generatedArticles = articles.map((r) => ({ url: r.wp_post_url as string, id: r.id, title: r.title ?? '', primaryKeyword: r.topic_id ? kwByTopic.get(r.topic_id) ?? null : null }))

  const scanParams = { includePages: true, maxItems: 200 }
  const startedAtMs = Date.now()
  try {
    const report = await scanWordPressSite(wp.creds, { ...scanParams, generatedArticles })
    const status = await writeSuccess(admin, { projectId: project.id, userId: user.id, report, scanParams, startedAtMs, durationMs: Date.now() - startedAtMs })
    return Response.json({
      refreshed: true,
      status,
      scannerVersionTtlDays: indexTtlDays(),
      summary: {
        uniqueTargets: report.uniqueTargets,
        targetsEligible: report.targetsEligible,
        targetsWithUsableAnchors: report.targetsWithUsableAnchors,
        truncated: report.truncated,
        contentItemsSkipped: report.contentItemsSkipped,
        internalLinksExtracted: report.internalLinksExtracted,
      },
    })
  } catch (e) {
    await writeFailure(admin, { projectId: project.id, userId: user.id, errorMessage: e instanceof Error ? e.message : 'scan_failed', startedAtMs, durationMs: Date.now() - startedAtMs, siteUrl: wp.creds.siteUrl })
    console.error('[wp-index-refresh] scan failed', { projectId: project.id, message: e instanceof Error ? e.message : String(e) })
    return Response.json({ refreshed: false, status: 'failed', error: 'scan_failed', preservedPriorIndex: !!existing && existing.scan_status !== 'failed' }, { status: 502 })
  }
}

/**
 * Content automation — GET /api/content/automation/internal-links/site-scan
 *
 * READ-ONLY WordPress site content/anchor scan (Phase 1, REPORT ONLY). Uses the
 * connected project's saved WordPress credentials + the existing SSRF-guarded
 * client to fetch PUBLISHED posts/pages, extract INTERNAL links/anchors, and
 * return an in-memory report. It writes NOTHING — no article_topics,
 * article_pool_items, generated_articles, brief_notes, anchors_json, or any
 * WordPress content is modified. Purely a diagnostic to review anchor/target
 * quality before we decide to persist or wire it into the planner.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING (default off) + content automation +
 * project ownership. Query params:
 *   - projectId (required)
 *   - includePages = '0' to skip pages (default: include)
 *   - maxItems = combined posts+pages cap (default 200, max 500)
 *   - modifiedAfter = ISO date (incremental)
 *   - format = 'html' for a debug table; pretty = '1' for indented JSON
 */

import { authContentProject, isInternalLinkPlanningEnabled, loadWordPressCredentials } from '@/lib/content/api-auth'
import { scanWordPressSite, type SiteScanReport } from '@/lib/content/wordpress-content-scan'
import { renderScanReportHtml } from '@/lib/content/wordpress-scan-report-html'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const includePages = url.searchParams.get('includePages') !== '0'
  const maxItems = Math.min(Math.max(Number(url.searchParams.get('maxItems')) || 200, 1), 500)
  const modifiedAfter = url.searchParams.get('modifiedAfter') || undefined
  const format = url.searchParams.get('format')
  const pretty = url.searchParams.get('pretty') === '1'

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project } = auth

  // Load the saved WordPress credentials (decrypted at call time; never returned).
  const wp = await loadWordPressCredentials(admin, project.id)
  if ('error' in wp) return Response.json({ error: wp.error }, { status: wp.status })

  // Read-only: our own published articles, for target↔generated_article matching
  // (+ their topic's primary_keyword as a high-priority keyword signal).
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
  const generatedArticles = articles.map((r) => ({
    url: r.wp_post_url as string,
    id: r.id,
    title: r.title ?? '',
    primaryKeyword: r.topic_id ? kwByTopic.get(r.topic_id) ?? null : null,
  }))

  let report: SiteScanReport
  try {
    report = await scanWordPressSite(wp.creds, { includePages, maxItems, modifiedAfter, generatedArticles })
  } catch (e) {
    console.error('[wp-site-scan] scan failed', { message: e instanceof Error ? e.message : String(e) })
    return Response.json({ error: 'scan_failed' }, { status: 502 })
  }

  const payload = { dryRun: true, projectId: project.id, ...report }

  if (format === 'html') {
    return new Response(renderScanReportHtml(payload), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  if (pretty) {
    return new Response(JSON.stringify(payload, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }
  return Response.json(payload)
}

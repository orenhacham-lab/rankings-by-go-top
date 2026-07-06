/**
 * Content automation — GET /api/content/automation/internal-links/index
 *
 * Returns the CACHED WordPress content/link index for a project (Phase 2A).
 * Read-only; never triggers a live scan. Use the /refresh endpoint to rebuild.
 *
 * Ownership-gated (authContentProject) + flag-gated (ENABLE_INTERNAL_LINK_PLANNING).
 * Query: projectId (required), format=html | pretty=1 (parity with live scan).
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { getCachedIndex, reassembleReport, isStale, isVersionStale, SCAN_INDEX_VERSION } from '@/lib/content/wordpress-content-index'
import { renderScanReportHtml } from '@/lib/content/wordpress-scan-report-html'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const format = url.searchParams.get('format')
  const pretty = url.searchParams.get('pretty') === '1'

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const row = await getCachedIndex(auth.admin, auth.project.id)
  if (!row) return Response.json({ error: 'no_cached_index', hint: 'POST …/index/refresh first' }, { status: 404 })

  const report = reassembleReport(row)
  const stale = isStale(row)
  const versionStale = isVersionStale(row)
  const meta = {
    cached: true,
    scanStatus: row.scan_status,
    scannerVersion: row.scanner_version,
    currentScannerVersion: SCAN_INDEX_VERSION,
    stale,
    versionStale,
    scanCompletedAt: row.scan_completed_at,
    expiresAt: row.expires_at,
    errorMessage: row.error_message,
  }

  if (format === 'html') {
    const html = renderScanReportHtml(report, {
      cached: true, scanStatus: row.scan_status, scannerVersion: row.scanner_version ?? undefined,
      stale, versionStale, scanCompletedAt: row.scan_completed_at, expiresAt: row.expires_at, errorMessage: row.error_message,
    })
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  const payload = { ...meta, ...report }
  if (pretty) return new Response(JSON.stringify(payload, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  return Response.json(payload)
}

/**
 * Content automation — GET /api/content/automation/internal-links/index/status
 *
 * Lightweight status of the cached content index (Phase 2A). No large jsonb
 * blobs — just timestamps, status, staleness, and headline counts (for UI
 * polling / a "last scanned" indicator). Read-only.
 *
 * Ownership-gated + flag-gated. Query: projectId (required).
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { getCachedIndex, isStale, isVersionStale, SCAN_INDEX_VERSION, indexTtlDays } from '@/lib/content/wordpress-content-index'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const row = await getCachedIndex(auth.admin, auth.project.id)
  if (!row) {
    return Response.json({ exists: false, currentScannerVersion: SCAN_INDEX_VERSION, ttlDays: indexTtlDays() })
  }

  const summary = (row.summary || {}) as Record<string, unknown>
  const num = (k: string) => (typeof summary[k] === 'number' ? (summary[k] as number) : null)
  return Response.json({
    exists: true,
    scanStatus: row.scan_status,
    scannerVersion: row.scanner_version,
    currentScannerVersion: SCAN_INDEX_VERSION,
    stale: isStale(row),
    versionStale: isVersionStale(row),
    ttlDays: indexTtlDays(),
    scanStartedAt: row.scan_started_at,
    scanCompletedAt: row.scan_completed_at,
    scanDurationMs: row.scan_duration_ms,
    expiresAt: row.expires_at,
    errorMessage: row.error_message,
    siteUrl: row.site_url,
    truncated: summary.truncated ?? null,
    // Phase 3I.1 — why products are (or are not) in the index.
    storeEntityDiscovery: summary.storeEntityDiscovery ?? null,
    // Phase 3I.2 — skip breakdown + type mix (site-type-aware diagnostics).
    contentSkipBreakdown: summary.contentSkipBreakdown ?? null,
    targetsByType: summary.targetsByType ?? null,
    counts: {
      targetsStored: Array.isArray(row.targets) ? row.targets.length : 0,
      uniqueTargets: num('uniqueTargets'),
      targetsEligible: num('targetsEligible'),
      targetsWithUsableAnchors: num('targetsWithUsableAnchors'),
      contentItemsSkipped: num('contentItemsSkipped'),
    },
  })
}

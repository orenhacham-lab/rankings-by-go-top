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
 * Phase 3H — the scan itself lives in lib/content/wordpress-index-refresh so
 * the WordPress-connection save can trigger the FIRST scan automatically.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING. Body: { projectId, force? }.
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { runProjectIndexRefresh } from '@/lib/content/wordpress-index-refresh'
import { indexTtlDays } from '@/lib/content/wordpress-content-index'

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

  const res = await runProjectIndexRefresh(auth.admin, { projectId: auth.project.id, userId: auth.user.id, force })
  switch (res.outcome) {
    case 'fresh':
      return Response.json({ refreshed: false, reason: 'fresh', status: res.status, scanCompletedAt: res.scanCompletedAt, expiresAt: res.expiresAt })
    case 'running':
      return Response.json({ refreshed: false, status: 'running', reason: 'in_progress' }, { status: 202 })
    case 'no_credentials':
      return Response.json({ refreshed: false, status: 'failed', error: res.error, preservedPriorIndex: res.preservedPriorIndex }, { status: res.httpStatus })
    case 'scan_failed':
      return Response.json({ refreshed: false, status: 'failed', error: 'scan_failed', preservedPriorIndex: res.preservedPriorIndex }, { status: 502 })
    case 'refreshed':
      return Response.json({ refreshed: true, status: res.status, scannerVersionTtlDays: indexTtlDays(), summary: res.summary })
  }
}

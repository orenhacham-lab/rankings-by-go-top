/**
 * Content automation — PATCH /api/content/automation/internal-links/plan/link/[id]
 *
 * Per-link REVIEW status update (Phase 2C). Allowed transitions only:
 *   planned → approved | rejected,  approved → rejected,  rejected → approved.
 *
 * REVIEW-ONLY: 'approved' does NOT insert links or change article content. Writes
 * ONLY the plan-link row (and its batch's counters). Ownership is verified via
 * authContentProject(projectId) and the update is scoped to that project.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING. Body: { projectId, status }.
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import type { InternalLinkPlanStatus } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

const ALLOWED: Record<string, InternalLinkPlanStatus[]> = {
  planned: ['approved', 'rejected'],
  approved: ['rejected'],
  rejected: ['approved'],
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  let body: { projectId?: unknown; status?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const next = body.status
  if (next !== 'approved' && next !== 'rejected') return Response.json({ error: 'invalid_status' }, { status: 400 })

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project } = auth

  // Load the link scoped to the owned project (so a spoofed projectId can't touch
  // another project's link — auth already proved ownership of THIS project).
  const { data: linkRow } = await admin
    .from('article_internal_link_plan_links')
    .select('id, status, batch_id')
    .eq('id', id)
    .eq('project_id', project.id)
    .maybeSingle()
  const link = linkRow as { id: string; status: string; batch_id: string } | null
  if (!link) return Response.json({ error: 'link_not_found' }, { status: 404 })

  if (link.status === next) return Response.json({ ok: true, id, status: next, unchanged: true })
  if (!(ALLOWED[link.status] ?? []).includes(next)) {
    return Response.json({ error: 'invalid_transition', from: link.status, to: next }, { status: 409 })
  }

  const nowIso = new Date().toISOString()
  const { error } = await admin
    .from('article_internal_link_plan_links')
    .update({ status: next, updated_at: nowIso })
    .eq('id', id)
    .eq('project_id', project.id)
  if (error) {
    console.error('[ilp-link-patch] update failed', { message: error.message })
    return Response.json({ error: 'update_failed' }, { status: 500 })
  }

  // Best-effort: bump the batch's updated_at (does not change article content).
  try { await admin.from('article_internal_link_plan_batches').update({ updated_at: nowIso }).eq('id', link.batch_id) } catch { /* non-fatal */ }

  return Response.json({ ok: true, id, from: link.status, status: next })
}

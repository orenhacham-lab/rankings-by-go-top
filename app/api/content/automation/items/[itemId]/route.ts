/**
 * Content automation — /api/content/automation/items/:itemId
 *
 * PATCH  { status } → user-settable queue transitions: 'queued' (retry/reset),
 *         'skipped', 'paused'. Resetting a failed/quality_check_failed item to
 *         'queued' clears last_error. No generation/publishing here.
 * DELETE → remove a queue item.
 *
 * Gated by ENABLE_CONTENT_AUTOMATION + ownership (via the item's project).
 */

import { isContentAutomationEnabled } from '@/lib/content/api-auth'
import { authItem } from '@/lib/content/automation/api'

// Statuses a user may set by hand in Phase 4 (no generating/publishing states).
const USER_SETTABLE = ['queued', 'skipped', 'paused'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { itemId } = await params

  let body: { status?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const status = String(body.status ?? '')
  if (!(USER_SETTABLE as readonly string[]).includes(status)) {
    return Response.json({ error: 'invalid_status', allowed: USER_SETTABLE }, { status: 400 })
  }

  const owned = await authItem(itemId)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  // Retry/reset clears the previous error + lock. Phase 4B.1 — it ALSO resets the
  // attempt counter to 0 so a MANUAL retry makes a maxed-out (failed at
  // AUTOMATION_MAX_ATTEMPTS) item eligible again; without this reset the runner /
  // publish-item cap would immediately no-op the retry. wp_post_id reconciliation
  // still prevents any duplicate WordPress post on the subsequent publish.
  if (status === 'queued') { patch.last_error = null; patch.locked_at = null; patch.attempts = 0 }

  const { error } = await owned.auth.admin.from('article_pool_items').update(patch).eq('id', itemId)
  if (error) {
    console.error('[automation-item] update failed', { message: error.message })
    return Response.json({ error: 'Failed to update item' }, { status: 500 })
  }
  return Response.json({ success: true, status })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { itemId } = await params

  const owned = await authItem(itemId)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

  const { error } = await owned.auth.admin.from('article_pool_items').delete().eq('id', itemId)
  if (error) {
    console.error('[automation-item] delete failed', { message: error.message })
    return Response.json({ error: 'Failed to remove item' }, { status: 500 })
  }
  return Response.json({ success: true })
}

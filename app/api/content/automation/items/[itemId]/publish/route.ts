/**
 * Content automation — POST /api/content/automation/items/:itemId/publish
 *
 * Manually publish ONE generated item to WordPress (Phase 6 testing, before the
 * cron runner exists). Atomic lock + dedupe + publish-time quality gate + crash
 * recovery live in the service. This route only gates + verifies ownership.
 * Never uses force.
 */

import { isContentAutomationEnabled } from '@/lib/content/api-auth'
import { authItem } from '@/lib/content/automation/api'
import { publishPoolItem } from '@/lib/content/automation/publish-item'

// Image upload + WordPress createPost can take longer than the default budget.
export const maxDuration = 300

export async function POST(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { itemId } = await params

  const owned = await authItem(itemId)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

  const result = await publishPoolItem(owned.auth.admin, itemId)
  return Response.json(result)
}

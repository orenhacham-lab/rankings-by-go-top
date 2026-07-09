/**
 * Content automation — POST /api/content/automation/items/:itemId/generate
 *
 * Manually trigger headless generation for ONE queued/failed/quality_check_failed
 * item (Phase 5 testing, before the cron runner exists). Atomic claim + quality
 * gate live in the service; this route only gates + verifies ownership. NO
 * WordPress publishing.
 */

import { isContentAutomationEnabled } from '@/lib/content/api-auth'
import { authItem } from '@/lib/content/automation/api'
import { generatePoolItem } from '@/lib/content/automation/generate-item'

// Synchronous Gemini generation (+ image) can take 1-2 minutes.
export const maxDuration = 300

export async function POST(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { itemId } = await params

  const owned = await authItem(itemId)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

  // Manual trigger allows retrying failed/quality_check_failed items, and (Phase
  // 3G.1) auto-inserts the topic's APPROVED internal links into the draft — the
  // same behavior as the per-topic manual generate. (Cron never opts in.)
  const result = await generatePoolItem(owned.auth.admin, itemId, { allowRetry: true, autoApplyInternalLinks: true })
  return Response.json(result)
}

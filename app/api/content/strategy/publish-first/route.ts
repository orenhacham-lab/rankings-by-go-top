/**
 * POST /api/content/strategy/publish-first — "publish now", for the project's first
 * article only. The contract lives in lib/content/strategy/schedule-http.ts (exercised by
 * lib/content/strategy/__qa__/approve-schedules.qa.ts); this file only wires the real
 * dependencies in.
 */
import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { handlePublishFirstPost } from '@/lib/content/strategy/schedule-http'
import { loadActivePlatform } from '@/lib/content/platform/load-active-platform'
import { publishPoolItem } from '@/lib/content/automation/publish-item'

export const dynamic = 'force-dynamic'
// Image upload + the site's createPost can take longer than the default budget.
export const maxDuration = 300

export async function POST(request: Request) {
  return handlePublishFirstPost(request, {
    enabled: () => isContentAutomationEnabled(),
    auth: (projectId) => authContentProject(projectId),
    platform: (admin, projectId) => loadActivePlatform(admin, projectId),
    publish: (admin, itemId) => publishPoolItem(admin, itemId),
  })
}

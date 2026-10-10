/**
 * POST /api/content/strategy/schedule — "approve" puts the topic in the publishing
 * queue with its date, and the first approval on a project writes its first article.
 * The contract lives in lib/content/strategy/schedule-http.ts (exercised by
 * lib/content/strategy/__qa__/approve-schedules.qa.ts); this file only wires the real
 * dependencies in.
 */
import { after } from 'next/server'
import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { handleSchedulePost } from '@/lib/content/strategy/schedule-http'
import { scheduleApprovedTopics, writeFirstArticle } from '@/lib/content/strategy/approve-schedule'
import { ensureSiteMapForProject } from '@/lib/content/existing-content/ensure-site-map'
import { liveWalk, liveWordPress } from '@/lib/content/existing-content/site-map-run'

export const dynamic = 'force-dynamic'
// The site mapping then the first article, both after the answer (the mapping's
// work window plus generation and its image).
export const maxDuration = 300

export async function POST(request: Request) {
  return handleSchedulePost(request, {
    enabled: () => isContentAutomationEnabled(),
    auth: (projectId) => authContentProject(projectId),
    schedule: (admin, input) => scheduleApprovedTopics(admin, input),
    later: (task) => after(task),
    prepareLinks: (admin, scope) => ensureSiteMapForProject(admin, scope, {
      now: () => Date.now(),
      runDeps: (a, sc) => ({ now: () => Date.now(), walk: liveWalk, platform: liveWordPress(a, sc.projectId, () => Date.now(), sc.userId) }),
    }),
    writeFirst: (admin, itemId) => writeFirstArticle(admin, itemId),
  })
}

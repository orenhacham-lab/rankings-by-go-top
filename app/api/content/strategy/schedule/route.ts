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

export const dynamic = 'force-dynamic'
// The first article is written after the answer (generation and its image take 1-2 minutes).
export const maxDuration = 300

export async function POST(request: Request) {
  return handleSchedulePost(request, {
    enabled: () => isContentAutomationEnabled(),
    auth: (projectId) => authContentProject(projectId),
    schedule: (admin, input) => scheduleApprovedTopics(admin, input),
    later: (task) => after(task),
    writeFirst: (admin, itemId) => writeFirstArticle(admin, itemId),
  })
}

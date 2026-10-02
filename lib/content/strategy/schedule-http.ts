/**
 * The two routes of "approve" on the content strategy screen (the routes only wire the
 * real dependencies in; the contract is here, and lib/content/strategy/__qa__/
 * approve-schedules.qa.ts exercises it):
 *
 *   POST /api/content/strategy/schedule       { projectId, topicIds? }
 *       puts the approved topics in the project's publishing queue with their dates
 *       (scheduleApprovedTopics); when the project has no article yet, writes the first
 *       one after answering (after()), so it survives the merchant leaving the page.
 *       Sent on every approval (topicIds: what was just approved) and when the screen
 *       opens with approved topics the queue does not hold (no topicIds).
 *   POST /api/content/strategy/publish-first  { projectId, itemId }
 *       "publish now", for the project's FIRST article only (canPublishFirstNow, the same
 *       rule the screen offers the button by); every other article goes out on the plan's
 *       rhythm. With no site connected it answers `no_site` and leaves the item alone.
 *
 * proxy.ts does not cover /api/*, so each checks, in order: the content automation is on
 * for this deployment (404 not_found), the caller is signed in and owns the project
 * (authContentProject's 400/401/403/404). Every service-role query filters by the
 * project. Nothing a provider or the database says is ever sent back: only stable codes.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { canPublishFirstNow, hasPublishingSite, type FirstArticleItem, type PublishFirstAnswer, type ScheduleAnswer } from './first-article'
import type { ScheduleResult } from './approve-schedule'

export type ScheduleAuth =
  | { error: string; status: number }
  | { user: { id: string }; admin: ServiceRoleClient; project: { id: string; user_id: string } }

export type ScheduleRouteDeps = {
  enabled: () => boolean
  auth: (projectId: string | null) => Promise<ScheduleAuth>
  schedule: (admin: ServiceRoleClient, input: { projectId: string; ownerId: string; approveNow: string[] }) => Promise<ScheduleResult>
  /** Runs after the answer is sent (next/server after()). */
  later: (task: () => Promise<unknown>) => void
  writeFirst: (admin: ServiceRoleClient, itemId: string) => Promise<unknown>
}

export type PublishFirstDeps = {
  enabled: () => boolean
  auth: (projectId: string | null) => Promise<ScheduleAuth>
  platform: (admin: ServiceRoleClient, projectId: string) => Promise<{ platform: string; shopifyNeedsScope?: boolean }>
  publish: (admin: ServiceRoleClient, itemId: string) => Promise<{ status: string }>
}

const NO_STORE = { 'cache-control': 'no-store' }
const AUTH_CODES: Record<number, 'invalid_request' | 'unauthorized' | 'forbidden' | 'not_found'> = {
  400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found',
}
const ID = /^[0-9A-Za-z_-]{1,64}$/

function answer(body: ScheduleAnswer | PublishFirstAnswer, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE })
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json()
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function handleSchedulePost(request: Request, deps: ScheduleRouteDeps): Promise<Response> {
  if (!deps.enabled()) return answer({ ok: false, code: 'not_found' }, 404)
  const body = await readBody(request)
  if (!body) return answer({ ok: false, code: 'invalid_request' }, 400)
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const approveNow = Array.isArray(body.topicIds)
    ? Array.from(new Set(body.topicIds.filter((x): x is string => typeof x === 'string' && ID.test(x)))).slice(0, 50)
    : []
  const auth = await deps.auth(projectId)
  if ('error' in auth) return answer({ ok: false, code: AUTH_CODES[auth.status] ?? 'internal' }, auth.status)

  const res = await deps.schedule(auth.admin, { projectId: auth.project.id, ownerId: auth.project.user_id, approveNow })
  if (!res.ok) return answer({ ok: false, code: res.code }, res.code === 'migration_required' ? 503 : 500)
  const firstItemId = res.firstItemId
  if (firstItemId) {
    deps.later(async () => {
      try {
        await deps.writeFirst(auth.admin, firstItemId)
      } catch (e) {
        console.error('[strategy-schedule] first article failed', { projectId: auth.project.id, message: e instanceof Error ? e.message.slice(0, 120) : 'unknown' })
      }
    })
  }
  return answer({ ok: true, queued: res.queued, poolActive: res.poolActive, writingFirst: !!firstItemId })
}

export async function handlePublishFirstPost(request: Request, deps: PublishFirstDeps): Promise<Response> {
  if (!deps.enabled()) return answer({ ok: false, code: 'not_found' }, 404)
  const body = await readBody(request)
  const projectId = body && typeof body.projectId === 'string' ? body.projectId : null
  const itemId = body && typeof body.itemId === 'string' && ID.test(body.itemId) ? body.itemId : null
  if (!body || !itemId) return answer({ ok: false, code: 'invalid_request' }, 400)
  const auth = await deps.auth(projectId)
  if ('error' in auth) return answer({ ok: false, code: AUTH_CODES[auth.status] ?? 'failed' }, auth.status)
  const { admin, project } = auth

  // The same rule the screen offers the button by: the project's only article, the
  // queue's first item, written and not published. Anything else is "not the first".
  const [articlesRes, itemsRes] = await Promise.all([
    admin.from('generated_articles').select('id, status').eq('project_id', project.id),
    admin.from('article_pool_items').select('id, status, position, article_id').eq('project_id', project.id),
  ])
  if (articlesRes.error || itemsRes.error) return answer({ ok: false, code: 'failed' }, 500)
  const articles = (articlesRes.data ?? []) as { id: string; status: string }[]
  const queue: FirstArticleItem[] = ((itemsRes.data ?? []) as { id: string; status: string; position: number; article_id: string | null }[])
    .map((i) => ({ id: i.id, status: i.status, position: i.position, articleId: i.article_id }))
  if (!canPublishFirstNow({ articles, queue, itemId })) return answer({ ok: false, code: 'not_first' }, 409)

  // No site to publish to: say so, and leave the item where it is (publishing it would pause it).
  const site: { platform: string; shopifyNeedsScope?: boolean } = await deps.platform(admin, project.id).catch(() => ({ platform: 'none' }))
  if (!hasPublishingSite(site.platform, { shopifyNeedsScope: site.shopifyNeedsScope })) return answer({ ok: false, code: 'no_site' }, 409)

  const res = await deps.publish(admin, itemId).catch(() => ({ status: 'failed' }))
  return res.status === 'published' ? answer({ ok: true }) : answer({ ok: false, code: 'failed' }, 502)
}

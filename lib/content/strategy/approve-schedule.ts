/**
 * "Approve" = in the publishing queue, with its date (server side).
 *
 * The content strategy screen used to approve a topic into article_topics and stop
 * there: the queue (article_pool_items) was a second, separate step ("add to the
 * queue", in the list view), and a project that never took it had approved topics the
 * board listed as "planned" while the next-article card said "not in the publishing
 * queue yet" (the owner's report, 2026-10-02: five approved topics, no pool at all).
 * Two sources of truth that disagreed. Now an approval goes straight into the queue,
 * so the queue is the one place a topic's date comes from:
 *
 *   1. the project's pool: the existing one, or a new ACTIVE one on the plan's rhythm
 *      (lib/content/automation/plan-rhythm.ts), its first slot by the same slot maker
 *      the pools route and the runner use, so never on a Friday or Saturday;
 *   2. every approved topic without an article that the pool does not hold yet is
 *      queued, oldest approval first (what was approved before this change is queued
 *      the next time the screen opens or anything is approved: no data migration);
 *      a manual topic the merchant approves right now ('suggested') is approved first,
 *      as the list view's approve-and-queue route does; a topic the research marked as
 *      a non-article page keeps that route's block and is not queued;
 *   3. when the project has no article at all, the queue's first item is returned so
 *      the route can write the first article (firstItemToWrite).
 *
 * Every query filters by the project; the caller has already checked that the
 * signed-in user owns it (authContentProject). Nothing here touches billing, plans or
 * the allowance: the first article is written by generatePoolItem, which goes through
 * the one generation gate every path uses.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { makeSlotAfter, DEFAULT_PUBLISH_TIME, DEFAULT_TIMEZONE } from '@/lib/content/automation/schedule'
import { readPublishRhythm } from '@/lib/content/automation/plan-rhythm'
import { generatePoolItem } from '@/lib/content/automation/generate-item'
import { firstItemToWrite, type FirstArticleItem } from './first-article'

type Admin = ServiceRoleClient
type QErr = { code?: string; message?: string } | null

const MISSING = new Set(['42P01', 'PGRST205', '42703'])
/** The name the list view's pool gets (app/api/content/automation/pools POST). */
export const DEFAULT_POOL_NAME = 'תזמון פרסום אוטומטי'
/** Weekly when the plan gives no rhythm (an admin, a trial): the owner's schedule, without Friday/Saturday. */
export const DEFAULT_INTERVAL_DAYS = 7

export type ScheduleResult =
  | { ok: true; poolId: string; poolActive: boolean; created: boolean; queued: number; firstItemId: string | null }
  | { ok: false; code: 'migration_required' | 'internal' }

type TopicRow = { id: string; status: string; source: string | null; created_at: string | null }
type ItemRow = { id: string; topic_id: string | null; article_id: string | null; status: string; position: number }

/** PURE: the topics to queue, in the order they go in. */
export function topicsToQueue(input: {
  topics: readonly TopicRow[]
  /** Topics the merchant approves in this request (a manual 'suggested' one is approved first). */
  approveNow: ReadonlySet<string>
  withArticle: ReadonlySet<string>
  inQueue: ReadonlySet<string>
  nonArticle: ReadonlySet<string>
}): string[] {
  const eligible = input.topics.filter((t) => {
    if (input.withArticle.has(t.id) || input.inQueue.has(t.id) || input.nonArticle.has(t.id)) return false
    return t.status === 'approved' || (input.approveNow.has(t.id) && t.source === 'manual' && t.status === 'suggested')
  })
  const at = (t: TopicRow) => Date.parse(t.created_at ?? '') || 0
  return [...eligible].sort((a, b) => at(a) - at(b) || (a.id < b.id ? -1 : 1)).map((t) => t.id)
}

/** The pool's first slot: the plan's rhythm when it has one, else weekly; never Friday or Saturday. */
export function firstPoolSlot(perDay: number[] | null, nowMs: number): string {
  return makeSlotAfter({ publishTime: DEFAULT_PUBLISH_TIME, timeZone: DEFAULT_TIMEZONE, perDay, publishDays: null, intervalDays: DEFAULT_INTERVAL_DAYS, anchorIso: null })(nowMs)
}

async function ensurePool(admin: Admin, projectId: string, ownerId: string, nowMs: number): Promise<{ id: string; active: boolean; created: boolean } | { error: QErr }> {
  const { data, error } = await admin.from('article_pools').select('id, is_active').eq('project_id', projectId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (error) return { error: error as QErr }
  if (data) {
    // An existing pool keeps its state: a queue the owner paused stays paused.
    const row = data as { id: string; is_active: boolean | null }
    return { id: row.id, active: row.is_active === true, created: false }
  }
  // countThisQueue: the new queue shares the account's weekly rhythm with the others.
  const rhythm = await readPublishRhythm(admin, ownerId, { countThisQueue: true })
  const nowIso = new Date(nowMs).toISOString()
  const { data: made, error: insErr } = await admin.from('article_pools').insert({
    user_id: ownerId, project_id: projectId, name: DEFAULT_POOL_NAME, cadence: 'weekly', interval_days: DEFAULT_INTERVAL_DAYS,
    publish_time: DEFAULT_PUBLISH_TIME, timezone: DEFAULT_TIMEZONE, is_active: true, publish_days: null,
    next_publish_at: firstPoolSlot(rhythm.plan?.perDay ?? null, nowMs), updated_at: nowIso,
  }).select('id, is_active').single()
  if (insErr || !made) {
    // A pool made by a concurrent request in the meantime is the pool.
    const again = await admin.from('article_pools').select('id, is_active').eq('project_id', projectId).order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (again.data) return { id: (again.data as { id: string }).id, active: (again.data as { is_active: boolean | null }).is_active === true, created: false }
    return { error: (insErr ?? { code: 'insert_failed' }) as QErr }
  }
  return { id: (made as { id: string }).id, active: true, created: true }
}

/** Topics the research recommends as another kind of page (approve-and-queue's own block). */
async function nonArticleTopics(admin: Admin, projectId: string, topicIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (topicIds.length === 0) return out
  try {
    const { data } = await admin.from('content_topic_ideas').select('approved_topic_id, link_plan').eq('project_id', projectId).in('approved_topic_id', topicIds)
    for (const r of (data ?? []) as { approved_topic_id: string | null; link_plan: unknown }[]) {
      const pt = r.link_plan && typeof r.link_plan === 'object' ? (r.link_plan as { recommendedPageType?: unknown }).recommendedPageType : undefined
      if (r.approved_topic_id && typeof pt === 'string' && pt !== 'article') out.add(r.approved_topic_id)
    }
  } catch { /* a missing column reads as "articles" */ }
  return out
}

export async function scheduleApprovedTopics(admin: Admin, input: {
  projectId: string
  ownerId: string
  approveNow?: readonly string[]
  nowMs?: number
}): Promise<ScheduleResult> {
  const nowMs = input.nowMs ?? Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const { projectId, ownerId } = input
  const fail = (e: QErr): ScheduleResult => ({ ok: false, code: e && MISSING.has(e.code ?? '') ? 'migration_required' : 'internal' })

  const pool = await ensurePool(admin, projectId, ownerId, nowMs)
  if ('error' in pool) return fail(pool.error)

  const [topicsRes, articlesRes, itemsRes] = await Promise.all([
    admin.from('article_topics').select('id, status, source, created_at').eq('project_id', projectId),
    admin.from('generated_articles').select('id, topic_id, status').eq('project_id', projectId),
    admin.from('article_pool_items').select('id, topic_id, article_id, status, position').eq('pool_id', pool.id).eq('project_id', projectId),
  ])
  if (topicsRes.error) return fail(topicsRes.error as QErr)
  if (articlesRes.error) return fail(articlesRes.error as QErr)
  if (itemsRes.error) return fail(itemsRes.error as QErr)
  const topics = (topicsRes.data ?? []) as TopicRow[]
  const articles = (articlesRes.data ?? []) as { id: string; topic_id: string | null; status: string }[]
  const items = (itemsRes.data ?? []) as ItemRow[]

  const approveNow = new Set(input.approveNow ?? [])
  const withArticle = new Set(articles.map((a) => a.topic_id).filter((x): x is string => !!x))
  const inQueue = new Set(items.map((i) => i.topic_id).filter((x): x is string => !!x))
  const candidates = topics.filter((t) => !withArticle.has(t.id) && !inQueue.has(t.id)).map((t) => t.id)
  const nonArticle = await nonArticleTopics(admin, projectId, candidates)
  const order = topicsToQueue({ topics, approveNow, withArticle, inQueue, nonArticle })

  let position = items.reduce((m, r) => Math.max(m, r.position), -1)
  let queued = 0
  for (const topicId of order) {
    const topic = topics.find((t) => t.id === topicId)!
    if (topic.status === 'suggested') {
      const { data: upd } = await admin.from('article_topics').update({ status: 'approved', updated_at: nowIso })
        .eq('id', topicId).eq('project_id', projectId).eq('source', 'manual').eq('status', 'suggested').select('id, status')
      if (!((upd ?? []) as { status: string }[]).some((r) => r.status === 'approved')) continue
    }
    const { data: ins, error } = await admin.from('article_pool_items').insert({
      user_id: ownerId, project_id: projectId, pool_id: pool.id, topic_id: topicId, article_id: null,
      position: position + 1, status: 'queued', updated_at: nowIso,
    }).select('id, topic_id, article_id, status, position').maybeSingle()
    if (error) {
      // unique(pool_id, topic_id): another request queued it first, which is the same outcome.
      if ((error as QErr)?.code === '23505') continue
      return fail(error as QErr)
    }
    if (ins) { items.push(ins as ItemRow); position += 1; queued += 1 }
  }

  const queue: FirstArticleItem[] = items.map((i) => ({ id: i.id, status: i.status, position: i.position, articleId: i.article_id }))
  return { ok: true, poolId: pool.id, poolActive: pool.active, created: pool.created, queued, firstItemId: firstItemToWrite({ articleCount: articles.length, queue }) }
}

/**
 * Write the first article from its queue item, through the queue's own generation path
 * (generatePoolItem: its atomic claim, the one generation gate with the plan, the trial
 * and the allowance, its quality gate), and leave it READY rather than a draft. Only a
 * 'queued' item is claimed, so a failure is left for the runner's retries, not retried
 * here. Runs after the answer (after()), so leaving the page does not stop it.
 */
export async function writeFirstArticle(admin: Admin, itemId: string, deps: { generate?: typeof generatePoolItem } = {}): Promise<{ status: string; articleId: string | null }> {
  const generate = deps.generate ?? generatePoolItem
  const res = await generate(admin, itemId, { allowRetry: false, autoApplyInternalLinks: true })
  if (res.status === 'generated' && res.articleId && !res.noop) {
    await admin.from('generated_articles').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', res.articleId).eq('status', 'draft')
  }
  return { status: res.status, articleId: res.articleId }
}

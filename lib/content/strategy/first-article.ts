/**
 * "Approve" on the content strategy screen, and the project's first article.
 *
 * Approving a topic puts it in the project's publishing queue with its real date
 * (lib/content/strategy/approve-schedule.ts, POST /api/content/strategy/schedule). The
 * FIRST approval on a project that has no article yet also writes that first article
 * right away, on the server, through the queue's own generation path; it comes back
 * READY (not a draft), on the queue's first slot. That one article, and only that one,
 * can be published at once ("publish now"); every later article goes out on the plan's
 * rhythm, with no button.
 *
 * Everything here is PURE and shared by the screen and the routes, so the screen offers
 * "publish now" exactly when the server accepts it, and no other time.
 */

/** The fields of an article this needs (the strategy route's rows, or generated_articles). */
export type FirstArticleRow = { id: string; status: string }
/** The fields of a queue item this needs (the pools route's DTO, or article_pool_items). */
export type FirstArticleItem = { id: string; status: string; position: number; articleId: string | null; lastError?: string | null }

/** Why writing the first article stopped, in the screen's own words (never the route's text). */
export type FirstArticleFailure = 'quota' | 'billing' | 'unavailable' | 'details' | 'quality' | 'generic'

export type FirstArticleView =
  | { kind: 'none' }
  /** The first article is being written (or was just asked for). */
  | { kind: 'writing' }
  /** Written, ready, waiting for its slot; the one article "publish now" is offered for. */
  | { kind: 'ready'; itemId: string; articleId: string }
  | { kind: 'failed'; reason: FirstArticleFailure }

/** Queue states that no longer hold a place in the line. */
const OUT_OF_LINE = new Set(['skipped'])

/** The queue's first item: the lowest position still in the line. */
export function firstQueueItem<T extends FirstArticleItem>(items: readonly T[] | null | undefined): T | null {
  const inLine = (items ?? []).filter((i) => !OUT_OF_LINE.has(i.status))
  inLine.sort((a, b) => a.position - b.position)
  return inLine[0] ?? null
}

/** A stored failure reason (article_pool_items.last_error), as one of the screen's few cases. */
export function firstArticleFailure(lastError: string | null | undefined): FirstArticleFailure {
  const r = (lastError ?? '').trim()
  if (r === 'quota_exceeded') return 'quota'
  if (r === 'billing_required') return 'billing'
  if (['entitlement_unavailable', 'usage_period_unavailable', 'reservation_error', 'generation_in_progress'].includes(r)) return 'unavailable'
  if (r === 'cta_details_missing' || r === 'required_anchor_missing_url') return 'details'
  if (r === 'article_quality_gate_failed' || r === 'required_anchor_missing') return 'quality'
  return 'generic'
}

/**
 * Where the project's first article stands.
 *   none     the project already published, or has more than one article, or nothing
 *            is queued: no first-article moment (and no "publish now")
 *   writing  the first queue item is being written, or the approval just asked for it
 *   ready    the project's only article is the first queue item's, generated and not
 *            published: "publish now" is offered for it
 *   failed   writing it stopped (the allowance, the plan, a pause on our side)
 */
export function firstArticleView(input: {
  articles: readonly FirstArticleRow[]
  queue: readonly FirstArticleItem[] | null
  /** The approval answered that it started writing the first article, and no read shows it yet. */
  starting?: boolean
}): FirstArticleView {
  const { articles } = input
  if (articles.some((a) => a.status === 'published' || a.status === 'publishing')) return { kind: 'none' }
  if (articles.length > 1) return { kind: 'none' }
  const first = firstQueueItem(input.queue)
  if (articles.length === 1) {
    const only = articles[0]
    if (first && first.articleId === only.id && first.status === 'generated') return { kind: 'ready', itemId: first.id, articleId: only.id }
    return { kind: 'none' }
  }
  if (!first) return input.starting ? { kind: 'writing' } : { kind: 'none' }
  if (first.status === 'generating') return { kind: 'writing' }
  if (first.status === 'queued') return input.starting ? { kind: 'writing' } : { kind: 'none' }
  if (!first.articleId && (first.status === 'failed' || first.status === 'quality_check_failed')) {
    return { kind: 'failed', reason: firstArticleFailure(first.lastError) }
  }
  return { kind: 'none' }
}

/** Whether "publish now" applies to this queue item: it is the project's first article, ready. */
export function canPublishFirstNow(input: { articles: readonly FirstArticleRow[]; queue: readonly FirstArticleItem[] | null; itemId: string }): boolean {
  const v = firstArticleView({ articles: input.articles, queue: input.queue })
  return v.kind === 'ready' && v.itemId === input.itemId
}

/**
 * The queue item the first article is written from, right after an approval: the
 * queue's first item, only while the project has no article at all and that item is
 * still waiting ('queued'). Anything else (an article exists, the first item is being
 * written or already failed) writes nothing, so two approvals never write two.
 */
export function firstItemToWrite(input: { articleCount: number; queue: readonly FirstArticleItem[] }): string | null {
  if (input.articleCount > 0) return null
  const first = firstQueueItem(input.queue)
  return first && first.status === 'queued' && !first.articleId ? first.id : null
}

/** The publishing platforms "publish now" can reach (lib/content/platform/active-platform.ts). */
export function hasPublishingSite(platform: string | null | undefined, opts: { shopifyNeedsScope?: boolean } = {}): boolean {
  if (!platform || platform === 'none' || platform === 'conflict') return false
  if (platform === 'shopify' && opts.shopifyNeedsScope) return false
  return true
}

export const STRATEGY_SCHEDULE_ENDPOINTS = {
  schedule: '/api/content/strategy/schedule',
  publishFirst: '/api/content/strategy/publish-first',
} as const

/** What POST /api/content/strategy/schedule answers. */
export type ScheduleAnswer =
  | { ok: true; queued: number; poolActive: boolean; writingFirst: boolean }
  | { ok: false; code: string }

/** What POST /api/content/strategy/publish-first answers. */
export type PublishFirstAnswer =
  | { ok: true }
  | { ok: false; code: 'not_first' | 'no_site' | 'failed' | 'invalid_request' | 'unauthorized' | 'forbidden' | 'not_found' }

export function readScheduleAnswer(ok: boolean, body: unknown): { writingFirst: boolean } | null {
  if (!ok || !body || typeof body !== 'object' || (body as { ok?: unknown }).ok !== true) return null
  return { writingFirst: (body as { writingFirst?: unknown }).writingFirst === true }
}

export function readPublishFirstAnswer(ok: boolean, body: unknown): 'published' | 'no_site' | 'failed' {
  if (ok && body && typeof body === 'object' && (body as { ok?: unknown }).ok === true) return 'published'
  return body && typeof body === 'object' && (body as { code?: unknown }).code === 'no_site' ? 'no_site' : 'failed'
}

/**
 * Approved topics the queue does not hold yet: what the screen sends to the queue when
 * it opens (an approval made before approving meant queueing). Only status 'approved'
 * counts; a manual brief ('suggested') waits for its own approval.
 */
export function approvedNotQueued(input: {
  topics: readonly { id: string; status: string }[]
  articles: readonly { topicId: string | null }[]
  queue: readonly { topicId: string | null }[] | null
}): string[] {
  const withArticle = new Set(input.articles.map((a) => a.topicId).filter((x): x is string => !!x))
  const queued = new Set((input.queue ?? []).map((q) => q.topicId).filter((x): x is string => !!x))
  return input.topics.filter((t) => t.status === 'approved' && !withArticle.has(t.id) && !queued.has(t.id) && !t.id.startsWith('pending:')).map((t) => t.id)
}

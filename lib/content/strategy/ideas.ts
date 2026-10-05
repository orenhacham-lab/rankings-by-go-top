/**
 * Acting on an idea from the content strategy board, without leaving it: approve it,
 * say it is not a fit, swap it for the next one, or add a keyword of your own.
 *
 * Every action goes through a route that already exists, and that already checks the
 * session and the project's owner (lib/content/api-auth.ts authContentProject) before
 * its service-role client touches a row of that project:
 *
 *   approve an idea of the content plan (it has an ideaId), automation on
 *       POST /api/content/automation/topics/bulk  { status: 'approved', topics: [{ ideaId, ... }] }
 *       the same call the list view's ideas screen makes: it dedupes against the
 *       project's topics and articles, runs the keyword guard against existing site
 *       content, creates the approved topic and marks the idea approved.
 *   approve an idea with no ideaId (the scan's stage-A topics, the rankings), or any
 *   idea while automation is off
 *       POST /api/content/topics  { topic, primary_keyword }
 *       the dashboard's "create topic" call (components/dashboard/ContentOpportunities).
 *   not a fit (only an idea with an ideaId: nothing else is stored to reject)
 *       POST /api/content/automation/topic-ideas/reject  { ideaIds: [id] }
 *       its fingerprint is remembered, so the engine does not suggest it again.
 *   add a keyword
 *       POST /api/content/automation/topics/bulk  { status: 'approved', topics: [{ source: 'keyword', ... }] }
 *       the route's own `source: 'keyword'`; no model is asked, so it costs nothing.
 *
 * Everything here is PURE: the requests to send, how to read an answer, and how the
 * board looks while an answer is on its way (applyIdeaOverrides). Nothing a route or a
 * provider says is ever shown: an answer becomes one of a few outcomes, and the screen
 * says each in its own words.
 */
import { sameTopicKey, type StrategyCard, type StrategyData, type StrategyOrigin } from './board'
import { readOverlap, type OverlapPayload } from '@/lib/content/cannibalization/client'

export const IDEA_ENDPOINTS = {
  approve: '/api/content/automation/topics/bulk',
  reject: '/api/content/automation/topic-ideas/reject',
  topic: '/api/content/topics',
} as const

/** What an action needs to know about the idea it acts on (a board card, or the next article). */
export type IdeaTarget = {
  key: string
  origin: StrategyOrigin
  title: string
  keyword: string | null
  reason: string | null
  ideaId: string | null
  score: number | null
  source: string | null
}

export type IdeaRequest = { url: string; body: Record<string, unknown> }

export function ideaTargetFromCard(card: StrategyCard): IdeaTarget | null {
  if (card.column !== 'ideas') return null
  return {
    key: card.key, origin: card.origin, title: card.title, keyword: card.keyword, reason: card.reason,
    ideaId: card.ideaId ?? null, score: card.score ?? null, source: card.source ?? null,
  }
}

/** Approval goes through the ideas route only for a stored idea, and only where that route exists. */
export function approvesThroughIdeas(t: IdeaTarget, automation: boolean): boolean {
  return automation && t.origin === 'plan' && !!t.ideaId
}

/** "Not a fit" needs a stored idea to remember; the scan's topics and the rankings have none. */
export function canRejectIdea(t: IdeaTarget, automation: boolean): boolean {
  return approvesThroughIdeas(t, automation)
}

export function approveRequest(t: IdeaTarget, projectId: string, automation: boolean): IdeaRequest {
  if (approvesThroughIdeas(t, automation)) {
    return {
      url: IDEA_ENDPOINTS.approve,
      body: {
        projectId,
        status: 'approved',
        topics: [{
          ideaId: t.ideaId,
          title: t.title,
          primaryKeyword: t.keyword ?? t.title,
          suggestionReason: t.reason ?? '',
          ...(typeof t.score === 'number' ? { suggestionScore: t.score } : {}),
          ...(t.source ? { source: t.source } : {}),
        }],
      },
    }
  }
  // A ranking's title IS the keyword the site ranks for.
  const keyword = t.keyword ?? (t.origin === 'ranking' ? t.title : null)
  return { url: IDEA_ENDPOINTS.topic, body: { projectId, topic: t.title, ...(keyword ? { primary_keyword: keyword } : {}) } }
}

export function rejectRequest(ideaId: string, projectId: string): IdeaRequest {
  return { url: IDEA_ENDPOINTS.reject, body: { projectId, ideaIds: [ideaId] } }
}

export const KEYWORD_MIN = 2
export const KEYWORD_MAX = 80

/** A keyword as typed, tidied; null when it is too short or too long to be one. */
export function normalizeKeyword(raw: string): string | null {
  const k = raw.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (k.length < KEYWORD_MIN || k.length > KEYWORD_MAX) return null
  return k
}

export function keywordRequest(keyword: string, projectId: string): IdeaRequest {
  return {
    url: IDEA_ENDPOINTS.approve,
    body: { projectId, status: 'approved', topics: [{ title: keyword, primaryKeyword: keyword, source: 'keyword' }] },
  }
}

/**
 *   created   a new topic, in "planned"
 *   existing  the project already had that topic; the idea now points at it
 *   covered   the site already has content on it, so no topic was made (the route
 *             marks the idea a duplicate, and it leaves the ideas column)
 *   failed    anything else, said in our words
 */
export type IdeaOutcome = 'created' | 'existing' | 'covered' | 'failed'

export function readApproveOutcome(url: string, ok: boolean, body: unknown): IdeaOutcome {
  if (!ok || !body || typeof body !== 'object') return 'failed'
  if (url === IDEA_ENDPOINTS.topic) {
    const topic = (body as { topic?: unknown }).topic
    return topic && typeof topic === 'object' ? 'created' : 'failed'
  }
  const resolved = (body as { resolvedTopics?: unknown }).resolvedTopics
  const first = Array.isArray(resolved) ? resolved[0] : null
  if (!first || typeof first !== 'object') return 'failed'
  const r = first as { topicId?: unknown; source?: unknown; unresolvedReason?: unknown }
  if (typeof r.topicId === 'string' && r.topicId) return r.source === 'existing' ? 'existing' : 'created'
  if (r.unresolvedReason === 'covered_by_existing_content') return 'covered'
  return 'failed'
}

/**
 * What the cannibalization check found for a topic the answer just created: the
 * topics route's `overlap`, or the bulk route's first resolved topic's. Null otherwise.
 */
export function readCreatedOverlap(url: string, body: unknown): OverlapPayload | null {
  if (!body || typeof body !== 'object') return null
  if (url === IDEA_ENDPOINTS.topic) return readOverlap((body as { overlap?: unknown }).overlap)
  const resolved = (body as { resolvedTopics?: unknown }).resolvedTopics
  const first = Array.isArray(resolved) ? resolved[0] : null
  return first && typeof first === 'object' ? readOverlap((first as { overlap?: unknown }).overlap) : null
}

export function readRejectOutcome(ok: boolean, body: unknown): boolean {
  return ok && !!body && typeof body === 'object' && (body as { ok?: unknown }).ok === true
}

// ── The board while an answer is on its way ────────────────────────────────

/**
 * What the merchant just did, applied to the board's rows until a fresh read shows it:
 *   approve  the idea leaves the ideas column and a topic with its title is planned
 *   reject   the idea leaves the ideas column
 *   keyword  a topic with the keyword is planned
 * Applying one twice, or to rows that already show it, changes nothing.
 */
export type IdeaOverride =
  | { kind: 'approve'; key: string; ideaId: string | null; title: string; keyword: string | null; reason: string | null; at: string }
  | { kind: 'reject'; key: string; ideaId: string }
  | { kind: 'keyword'; key: string; title: string; at: string }

export const PENDING_TOPIC_PREFIX = 'pending:'

function hasTopic(data: StrategyData, title: string): boolean {
  const k = sameTopicKey(title)
  return data.topics.some((t) => t.status !== 'rejected' && sameTopicKey(t.title) === k)
}

export function applyIdeaOverrides(data: StrategyData, overrides: readonly IdeaOverride[]): StrategyData {
  if (overrides.length === 0) return data
  let ideas = data.ideas
  let topics = data.topics
  for (const o of overrides) {
    if ((o.kind === 'approve' || o.kind === 'reject') && o.ideaId) {
      const id = o.ideaId
      ideas = ideas.filter((i) => i.id !== id)
    }
    if (o.kind === 'approve' || o.kind === 'keyword') {
      if (hasTopic({ ideas, topics, articles: data.articles }, o.title)) continue
      topics = [...topics, {
        id: `${PENDING_TOPIC_PREFIX}${o.key}`,
        title: o.title,
        primaryKeyword: o.kind === 'approve' ? o.keyword : o.title,
        status: 'approved',
        source: o.kind === 'keyword' ? 'keyword' : 'pending',
        reason: o.kind === 'approve' ? o.reason : null,
        createdAt: o.at,
      }]
    }
  }
  return { ideas, topics, articles: data.articles }
}

/** Whether the rows the server sent already show what the override stands in for. */
export function overrideSettled(data: StrategyData, o: IdeaOverride): boolean {
  const ideaGone = !('ideaId' in o) || !o.ideaId || !data.ideas.some((i) => i.id === o.ideaId)
  if (o.kind === 'reject') return ideaGone
  return ideaGone && hasTopic(data, o.title)
}

/**
 * The topic an approval created or found (the topics route's `topic.id`, or the bulk
 * route's first resolved topic): what is then sent to the publishing queue
 * (lib/content/strategy/first-article.ts, POST /api/content/strategy/schedule).
 */
export function readApprovedTopicId(url: string, body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  if (url === IDEA_ENDPOINTS.topic) {
    const topic = (body as { topic?: unknown }).topic
    const id = topic && typeof topic === 'object' ? (topic as { id?: unknown }).id : null
    return typeof id === 'string' && id ? id : null
  }
  const resolved = (body as { resolvedTopics?: unknown }).resolvedTopics
  const first = Array.isArray(resolved) ? resolved[0] : null
  const id = first && typeof first === 'object' ? (first as { topicId?: unknown }).topicId : null
  return typeof id === 'string' && id ? id : null
}

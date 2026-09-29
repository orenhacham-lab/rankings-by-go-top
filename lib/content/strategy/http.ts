/**
 * GET /api/content/strategy?projectId= — the rows the content strategy tab's board is
 * built from: the pending ideas (content_topic_ideas, which is where the scan's step b4
 * leaves its plan), the topics (article_topics, with the reason each was suggested)
 * and the articles (generated_articles, without their bodies).
 *
 * READ-ONLY. It writes nothing, calls no model and no third party, so opening the tab
 * costs nothing. The publishing queue is not read here: the tab reads it from the
 * queue's own route (GET /api/content/automation/pools), which already projects every
 * item's publish slot, so there is one projection and not two.
 *
 * proxy.ts does not cover /api/*, so this checks everything itself, in this order:
 *   the content module is on for this deployment        404 not_found
 *   the caller is signed in and owns the project          the content auth's own 400/401/403/404
 *   (lib/content/api-auth.ts authContentProject, as every /api/content route)
 * Every service-role query then filters by the project AND its owner, so a row is
 * returned only when both match. A missing table (a migration not run yet) reads as
 * empty; any other database failure is one stable code, never its text.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { StrategyArticle, StrategyData, StrategyIdea, StrategyTopic } from './board'
import { TOPUP_SOURCE_CONTEXT } from '@/lib/content/automation/topup-provenance'

type Row = Record<string, unknown>
type QueryError = { code?: string; message?: string } | null
type Result = { data: unknown; error: QueryError }

export type StrategyAuth =
  | { error: string; status: number }
  | { user: { id: string }; admin: ServiceRoleClient; project: { id: string; user_id: string } }

export type StrategyRouteDeps = {
  enabled: () => boolean
  auth: (projectId: string | null) => Promise<StrategyAuth>
}

export type StrategyGetResponse = ({ ok: true } & StrategyData) | { ok: false; code: 'not_found' | 'internal' | 'unauthorized' | 'forbidden' | 'invalid_request' }

const NO_STORE = { 'cache-control': 'no-store' }
/** PostgREST / Postgres "relation does not exist". */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])
/** Enough for a quarter's board; the list view below it shows everything. */
export const MAX_ROWS = 300

const AUTH_CODES: Record<number, 'invalid_request' | 'unauthorized' | 'forbidden' | 'not_found'> = {
  400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found',
}

function refuse(status: number, code: Exclude<StrategyGetResponse, { ok: true }>['code']): Response {
  return Response.json({ ok: false, code } satisfies StrategyGetResponse, { status, headers: NO_STORE })
}

const str = (v: unknown, max = 500): string | null => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null)
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

class ReadFailed extends Error {}

/** Rows of one query; a missing table is no rows, any other failure stops the answer. */
async function rows(q: PromiseLike<Result>): Promise<Row[]> {
  const { data, error } = await q
  if (error) {
    if (error.code && MISSING_TABLE.has(error.code)) return []
    throw new ReadFailed()
  }
  return (Array.isArray(data) ? (data as Row[]) : []).slice(0, MAX_ROWS)
}

export async function handleStrategyGet(request: Request, deps: StrategyRouteDeps): Promise<Response> {
  if (!deps.enabled()) return refuse(404, 'not_found')
  const projectId = new URL(request.url).searchParams.get('projectId')

  let auth: StrategyAuth
  try {
    auth = await deps.auth(projectId)
  } catch {
    return refuse(500, 'internal')
  }
  if ('error' in auth) return refuse(auth.status, AUTH_CODES[auth.status] ?? 'internal')

  const { admin, project, user } = auth
  // The owner is the signed-in user (authContentProject refuses anyone else); both
  // filters are applied anyway, so this route never depends on that being true.
  const owned = (table: string, cols: string) => admin.from(table).select(cols).eq('project_id', project.id).eq('user_id', user.id)

  try {
    const [ideaRows, approvedRows, topicRows, articleRows] = await Promise.all([
      rows(owned('content_topic_ideas', 'id, title, primary_keyword, suggestion_reason, score, source, created_at').eq('status', 'pending')),
      // An approved idea became a topic: its reason is that topic's "why".
      // source_context 'auto_topup' marks the topics the monthly top-up prepared.
      rows(owned('content_topic_ideas', 'approved_topic_id, suggestion_reason, source, source_context, approved_at').eq('status', 'approved')),
      rows(owned('article_topics', 'id, topic, primary_keyword, status, source, suggestion_reason, created_at').neq('status', 'rejected')),
      rows(owned('generated_articles', 'id, topic_id, title, status, scheduled_at, published_at, created_at')),
    ])

    const approvedReason = new Map<string, string>()
    const prepared = new Map<string, { at: string; source: string | null }>()
    for (const r of approvedRows) {
      const topicId = str(r.approved_topic_id, 64)
      const reason = str(r.suggestion_reason, 1_000)
      if (topicId && reason && !approvedReason.has(topicId)) approvedReason.set(topicId, reason)
      const at = str(r.approved_at, 40)
      if (topicId && at && r.source_context === TOPUP_SOURCE_CONTEXT) prepared.set(topicId, { at, source: str(r.source, 40) })
    }

    const ideas: StrategyIdea[] = []
    for (const r of ideaRows) {
      const id = str(r.id, 64), title = str(r.title), createdAt = str(r.created_at, 40)
      if (!id || !title || !createdAt) continue
      ideas.push({ id, title, primaryKeyword: str(r.primary_keyword, 200), reason: str(r.suggestion_reason, 1_000), score: num(r.score), source: str(r.source, 40), createdAt })
    }

    const topics: StrategyTopic[] = []
    for (const r of topicRows) {
      const id = str(r.id, 64), title = str(r.topic), createdAt = str(r.created_at, 40)
      if (!id || !title || !createdAt) continue
      topics.push({
        id, title, primaryKeyword: str(r.primary_keyword, 200),
        status: str(r.status, 20) ?? 'suggested', source: str(r.source, 40) ?? 'manual',
        reason: str(r.suggestion_reason, 1_000) ?? approvedReason.get(id) ?? null,
        createdAt,
        ...(prepared.has(id) ? { autoPrepared: prepared.get(id) } : {}),
      })
    }

    const articles: StrategyArticle[] = []
    for (const r of articleRows) {
      const id = str(r.id, 64), title = str(r.title), createdAt = str(r.created_at, 40)
      if (!id || !title || !createdAt) continue
      articles.push({
        id, topicId: str(r.topic_id, 64), title, status: str(r.status, 20) ?? 'draft',
        scheduledAt: str(r.scheduled_at, 40), publishedAt: str(r.published_at, 40), createdAt,
      })
    }

    return Response.json({ ok: true, ideas, topics, articles } satisfies StrategyGetResponse, { status: 200, headers: NO_STORE })
  } catch {
    return refuse(500, 'internal')
  }
}

/**
 * GET /api/projects/[id]/waiting — what is waiting for the owner of one project:
 * the counts behind the dashboard's "waiting for you" card and the sidebar's count
 * pills. Framework-free, so the whole contract runs under test; the route file only
 * wires the real dependencies in.
 *
 * ORDER OF CHECKS (proxy.ts does not cover /api/*, so this does it all):
 *   1. signed in                                  401 unauthorized
 *   2. a well-formed project id                   404 not_found
 *   3. the project is theirs (session client AND  404 not_found
 *      owner filter)
 * Only then is anything else read, and every read is filtered by the project AND its
 * owner (the service-role client, used for the plugin link only, bypasses RLS).
 *
 * READ ONLY, NUMBERS ONLY. It reads existing tables and writes nothing: no model, no
 * provider, no email. The answer carries counts and one date; a failed read of one
 * source is that source counting as 0 (the nudge stays hidden), never an error text.
 * No database or provider text is part of the answer or a log line.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceRoleClient } from '@/lib/supabase/admin'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'cache-control': 'no-store' }

/** Queue statuses that still hold an approved topic on its way to the site. */
export const QUEUE_STATUSES = ['queued', 'scheduled', 'generating', 'generated'] as const
/** Fewer approved topics than this in the queue: the card says when it runs dry. */
export const LOW_QUEUE = 2

export interface WaitingAnswer {
  ok: true
  /**
   * The site connection dropped. `platform`: the WordPress / Wix / custom-site connection
   * failed a check (fix it in the project's settings); `plugin`: the Go Top plugin stopped
   * answering (fix it in site health). Null while nothing is down.
   */
  connectionDown: 'platform' | 'plugin' | null
  /** Articles written and marked ready that have no publishing date: waiting for the owner's OK. */
  articles: number
  /** Topic ideas the engine suggested that the owner has not approved. */
  topics: number
  /** Topics already approved and on their way. */
  queued: number
  /** When the approved queue's last article goes out (ISO), or null when nothing is dated. */
  queueEndsAt: string | null
  /** The Go Top plugin is paired and answering: safe fixes can be written to the site. */
  pluginConnected: boolean
}

export interface WaitingDeps {
  session: () => Promise<{ userId: string | null; db: SupabaseClient }>
  admin: () => ServiceRoleClient
  env: Record<string, string | undefined>
}

const refuse = (status: number, code: string) => Response.json({ ok: false, code }, { status, headers: NO_STORE })

type Scope = { projectId: string; userId: string }

const count = (res: { count?: number | null; error?: unknown }): number =>
  !res.error && typeof res.count === 'number' && res.count > 0 ? res.count : 0

/** Articles the owner has not yet approved for the site. */
async function readArticles({ projectId, userId }: Scope, db: SupabaseClient): Promise<number> {
  try {
    return count(await db.from('generated_articles')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId).eq('user_id', userId)
      .eq('status', 'ready').is('scheduled_at', null))
  } catch { return 0 }
}

async function readTopics({ projectId, userId }: Scope, db: SupabaseClient): Promise<number> {
  try {
    return count(await db.from('content_topic_ideas')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId).eq('user_id', userId)
      .eq('status', 'pending'))
  } catch { return 0 }
}

async function readQueue({ projectId, userId }: Scope, db: SupabaseClient): Promise<{ queued: number; endsAt: string | null }> {
  try {
    const res = await db.from('article_pool_items')
      .select('id, scheduled_at')
      .eq('project_id', projectId).eq('user_id', userId)
      .in('status', [...QUEUE_STATUSES])
      .limit(200)
    if (res.error) return { queued: 0, endsAt: null }
    const rows = (res.data ?? []) as Array<{ scheduled_at?: unknown }>
    let last = -Infinity
    for (const r of rows) {
      const t = typeof r.scheduled_at === 'string' ? Date.parse(r.scheduled_at) : NaN
      if (Number.isFinite(t) && t > last) last = t
    }
    return { queued: rows.length, endsAt: Number.isFinite(last) ? new Date(last).toISOString() : null }
  } catch { return { queued: 0, endsAt: null } }
}

/** A connection row that is there and FAILED a check; a row never tested is not "lost". */
async function readConnection({ projectId, userId }: Scope, db: SupabaseClient, admin: () => ServiceRoleClient):
  Promise<{ down: 'platform' | 'plugin' | null; pluginConnected: boolean }> {
  const [wp, site, plugin] = await Promise.all([
    db.from('wordpress_connections').select('connection_status').eq('project_id', projectId).eq('user_id', userId).maybeSingle()
      .then((r) => r, () => ({ data: null, error: true })),
    db.from('site_platform_connections').select('connection_status').eq('project_id', projectId).eq('user_id', userId).maybeSingle()
      .then((r) => r, () => ({ data: null, error: true })),
    // The plugin link's secret is never granted to browser roles: read the status only, by
    // the service role, filtered by project AND owner.
    Promise.resolve().then(() => admin().from('site_fix_plugin_links').select('status').eq('project_id', projectId).eq('user_id', userId).maybeSingle())
      .then((r) => r, () => ({ data: null, error: true })),
  ])
  const status = (r: { data?: unknown; error?: unknown }, key: string) =>
    !r.error && r.data && typeof (r.data as Record<string, unknown>)[key] === 'string' ? String((r.data as Record<string, unknown>)[key]) : null
  const platformFailed = status(wp, 'connection_status') === 'failed' || status(site, 'connection_status') === 'failed'
  const pluginStatus = status(plugin, 'status')
  return {
    down: platformFailed ? 'platform' : pluginStatus === 'disconnected' ? 'plugin' : null,
    pluginConnected: pluginStatus === 'connected',
  }
}

export async function handleWaitingGet(projectId: string, deps: WaitingDeps): Promise<Response> {
  let session: { userId: string | null; db: SupabaseClient }
  try {
    session = await deps.session()
  } catch {
    return refuse(503, 'unavailable')
  }
  const userId = session.userId
  if (!userId) return refuse(401, 'unauthorized')
  if (!UUID.test(projectId)) return refuse(404, 'not_found')

  try {
    const { data, error } = await session.db
      .from('projects').select('id, user_id').eq('id', projectId).eq('user_id', userId).maybeSingle()
    if (error) return refuse(500, 'internal')
    const project = data as { id: string; user_id: string } | null
    if (!project || project.user_id !== userId) return refuse(404, 'not_found')

    const scope: Scope = { projectId: project.id, userId }
    const content = deps.env.ENABLE_CONTENT === 'true'
    const [connection, articles, topics, queue] = await Promise.all([
      readConnection(scope, session.db, deps.admin),
      content ? readArticles(scope, session.db) : Promise.resolve(0),
      content ? readTopics(scope, session.db) : Promise.resolve(0),
      content ? readQueue(scope, session.db) : Promise.resolve({ queued: 0, endsAt: null }),
    ])
    const answer: WaitingAnswer = {
      ok: true,
      connectionDown: connection.down,
      articles,
      topics,
      queued: queue.queued,
      queueEndsAt: queue.endsAt,
      pluginConnected: connection.pluginConnected,
    }
    return Response.json(answer, { status: 200, headers: NO_STORE })
  } catch {
    console.error('[waiting] read failed', { projectId })
    return refuse(500, 'internal')
  }
}

/**
 * GET /api/projects/[id]/dashboard — the parts of the dashboard that are not the
 * keywords (the page reads those itself) and not the seeding scan (GET
 * /api/projects/[id]/seed). Framework-free, so the whole contract runs under
 * test; app/api/projects/[id]/dashboard/route.ts only wires the real
 * dependencies in.
 *
 * ORDER OF CHECKS. proxy.ts does not cover /api/*, so this does it all:
 *   1. signed in                                   401 unauthorized
 *   2. a well-formed project id                    404 not_found
 *   3. the project is theirs — read through their  404 not_found
 *      own RLS-scoped client AND filtered by owner
 * Only then is anything else read, and every read is filtered by that project
 * (and, where the table has one, by the owner too).
 *
 * READ ONLY. Nothing here writes, reserves, consumes or calls out: no Google
 * Ads, no search API, no model, no Shopify. The account section reads the
 * entitlement and the article allowance through the service role (the
 * entitlement reads billing_governance, which the merchant's own client may not
 * read), keyed by the user id this request just verified and nothing else.
 *
 * ONE SECTION FAILING IS THAT SECTION'S STATE. Each section is read on its own
 * and a failed read becomes `{ state: 'error' }` for that widget alone, so a
 * slow AI-visibility table never blanks the publishing board. No database or
 * provider text is ever part of the answer or a log line.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { resolveActivePlatform, siteConnectionState } from '@/lib/content/platform/active-platform'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'cache-control': 'no-store' }

/** The article statuses the publishing board counts as "on its way". */
export const UPCOMING_POOL_STATUSES = ['queued', 'scheduled', 'generating', 'generated', 'publishing'] as const
/** How many lines each list carries. */
export const LIST_SIZE = 5
/** How many events of each kind the activity feed may take from one table. */
const EVENTS_PER_SOURCE = 6
/** Published articles read to count this month and the last; a bound, not a sample. */
const PUBLISHED_READ_CAP = 2000

// ── The answer ──────────────────────────────────────────────────────────────

export type Section<T> = { state: 'ready'; data: T } | { state: 'error' } | { state: 'disabled' }

export type ArticleStatus = 'draft' | 'ready' | 'scheduled' | 'publishing' | 'published' | 'failed'
export interface ArticleLine { id: string; title: string; status: ArticleStatus; at: string }
export interface ArticlesData {
  total: number
  live: number
  publishedThisMonth: number
  publishedLastMonth: number
  latest: { title: string; at: string } | null
  recent: ArticleLine[]
}

export type BoardStatus = 'queued' | 'scheduled' | 'generating' | 'generated' | 'publishing' | 'published'
export interface BoardLine { id: string; title: string; status: BoardStatus; at: string | null }
export interface BoardData { upcoming: BoardLine[]; published: BoardLine[] }

export interface AiData {
  /** null until a check has finished with at least one answer. */
  score: number | null
  mentions: number
  citations: number
  answers: number
  /** Points against the check before it; null without one. */
  change: number | null
  lastCheckAt: string | null
}

export interface SetupData {
  /** The business is described: a scanned or typed description, or a business name. */
  business: boolean
  /** A publishing platform (WordPress, Shopify, Wix or a webhook site) is connected to this project. */
  platform: boolean
}

export type ActivityKind = 'article_created' | 'article_published' | 'topic_created' | 'rank_check' | 'ai_check'
export interface ActivityEvent { kind: ActivityKind; at: string; title: string | null; count: number | null }

export type PlanKind = 'trial' | 'regular' | 'advanced' | 'premium' | 'large_agency' | 'shopify_billing_required' | 'admin' | 'unknown'
export interface Allowance { used: number; limit: number }
export interface AccountData {
  plan: PlanKind
  /** Whole days left of an active trial; null when not in one. */
  trialDaysLeft: number | null
  /** Articles this billing period, account-wide; null when not metered or not knowable. */
  articles: Allowance | null
  /** Active keywords of this project against the plan's per-project limit. */
  keywords: Allowance | null
}

export interface DashboardOverview {
  ok: true
  articles: Section<ArticlesData>
  board: Section<BoardData>
  ai: Section<AiData>
  setup: Section<SetupData>
  activity: Section<ActivityEvent[]>
  account: Section<AccountData>
}
export type DashboardApiCode = 'unauthorized' | 'not_found' | 'internal' | 'unavailable'
export type DashboardResponse = DashboardOverview | { ok: false; code: DashboardApiCode }

// ── Dependencies ────────────────────────────────────────────────────────────

/** What the entitlement says, reduced to what the account card may show. */
export interface EntitlementFacts {
  plan: string
  isAdmin: boolean
  trialActive: boolean
  trialEndsAt: string | null
  maxKeywordsPerProject: number
}
/** readUsageAllowance's answer for articles, reduced to what the card shows. */
export type ArticleAllowance = { state: 'known'; used: number; limit: number } | { state: 'unmetered' } | { state: 'unknown' }

export interface DashboardDeps {
  session: () => Promise<{ userId: string | null; db: SupabaseClient }>
  admin: () => ServiceRoleClient
  entitlement: (admin: ServiceRoleClient, userId: string) => Promise<EntitlementFacts>
  articleAllowance: (admin: ServiceRoleClient, userId: string) => Promise<ArticleAllowance>
  now: () => Date
  env: Record<string, string | undefined>
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function refuse(status: number, code: DashboardApiCode): Response {
  return Response.json({ ok: false, code } satisfies DashboardResponse, { status, headers: NO_STORE })
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)

/** Run one section; anything it throws is that section's error, never the page's. */
async function section<T>(name: string, projectId: string, read: () => Promise<Section<T>>): Promise<Section<T>> {
  try {
    return await read()
  } catch (err) {
    console.error('[dashboard] section read failed', { section: name, projectId, error: errorName(err) })
    return { state: 'error' }
  }
}

const str = (v: unknown, max = 300): string | null => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null)
const ts = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null)
const monthStart = (d: Date, back = 0) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1)

const ARTICLE_STATUSES: readonly ArticleStatus[] = ['draft', 'ready', 'scheduled', 'publishing', 'published', 'failed']
const BOARD_STATUSES: readonly BoardStatus[] = [...UPCOMING_POOL_STATUSES, 'published']

type Scope = { projectId: string; userId: string; db: SupabaseClient }

// ── Sections ────────────────────────────────────────────────────────────────

async function readArticles({ projectId, userId, db }: Scope, now: Date): Promise<Section<ArticlesData>> {
  const [recentRes, publishedRes, totalRes] = await Promise.all([
    db.from('generated_articles')
      .select('id, title, status, created_at, updated_at, published_at')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(LIST_SIZE),
    db.from('generated_articles')
      .select('id, title, published_at')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(PUBLISHED_READ_CAP),
    db.from('generated_articles')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('user_id', userId),
  ])
  if (recentRes.error || publishedRes.error || totalRes.error) return { state: 'error' }

  const thisMonth = monthStart(now)
  const lastMonth = monthStart(now, 1)
  let publishedThisMonth = 0
  let publishedLastMonth = 0
  const published = (publishedRes.data ?? []) as Array<Record<string, unknown>>
  for (const row of published) {
    const at = ts(row.published_at)
    if (!at) continue
    const t = Date.parse(at)
    if (t >= thisMonth) publishedThisMonth++
    else if (t >= lastMonth) publishedLastMonth++
  }

  const recent: ArticleLine[] = []
  for (const row of (recentRes.data ?? []) as Array<Record<string, unknown>>) {
    const status = ARTICLE_STATUSES.find((s) => s === row.status)
    const title = str(row.title)
    const at = ts(row.published_at) ?? ts(row.updated_at) ?? ts(row.created_at)
    if (!status || !title || !at || typeof row.id !== 'string') continue
    recent.push({ id: row.id, title, status, at })
  }
  const newest = [...(recentRes.data ?? []) as Array<Record<string, unknown>>]
    .map((r) => ({ title: str(r.title), at: ts(r.created_at) }))
    .filter((r): r is { title: string; at: string } => !!r.title && !!r.at)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null

  return {
    state: 'ready',
    data: {
      total: totalRes.count ?? recent.length,
      live: published.length,
      publishedThisMonth,
      publishedLastMonth,
      latest: newest,
      recent,
    },
  }
}

async function readBoard({ projectId, userId, db }: Scope): Promise<Section<BoardData>> {
  const [queueRes, publishedRes] = await Promise.all([
    db.from('article_pool_items')
      .select('id, topic_id, article_id, status, scheduled_at, position')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .in('status', [...UPCOMING_POOL_STATUSES])
      .order('position', { ascending: true })
      .limit(LIST_SIZE),
    db.from('generated_articles')
      .select('id, title, published_at')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(LIST_SIZE),
  ])
  if (queueRes.error || publishedRes.error) return { state: 'error' }
  const queue = (queueRes.data ?? []) as Array<Record<string, unknown>>

  // Each queued item is named by its article once written, by its topic before.
  const topicIds = queue.map((q) => q.topic_id).filter((v): v is string => typeof v === 'string')
  const articleIds = queue.map((q) => q.article_id).filter((v): v is string => typeof v === 'string')
  const [topicsRes, articlesRes] = await Promise.all([
    topicIds.length
      ? db.from('article_topics').select('id, topic').eq('project_id', projectId).eq('user_id', userId).in('id', topicIds)
      : Promise.resolve({ data: [], error: null }),
    articleIds.length
      ? db.from('generated_articles').select('id, title').eq('project_id', projectId).eq('user_id', userId).in('id', articleIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (topicsRes.error || articlesRes.error) return { state: 'error' }
  const topicTitle = new Map(((topicsRes.data ?? []) as Array<Record<string, unknown>>).map((t) => [t.id, str(t.topic)]))
  const articleTitle = new Map(((articlesRes.data ?? []) as Array<Record<string, unknown>>).map((a) => [a.id, str(a.title)]))

  const upcoming: BoardLine[] = []
  for (const q of queue) {
    const status = BOARD_STATUSES.find((s) => s === q.status)
    const title = articleTitle.get(q.article_id) ?? topicTitle.get(q.topic_id) ?? null
    if (!status || !title || typeof q.id !== 'string') continue
    upcoming.push({ id: q.id, title, status, at: ts(q.scheduled_at) })
  }
  const published: BoardLine[] = []
  for (const a of (publishedRes.data ?? []) as Array<Record<string, unknown>>) {
    const title = str(a.title)
    if (!title || typeof a.id !== 'string') continue
    published.push({ id: a.id, title, status: 'published', at: ts(a.published_at) })
  }
  return { state: 'ready', data: { upcoming, published } }
}

/**
 * The AI-visibility figures of the latest finished check, and the change against
 * the one before. Read with the service role, as every AI-visibility route does,
 * and only after the project was proven to be this user's: every query is
 * filtered by that project, and the runs by their owner too (only the project's
 * owner can start one). The answers are read only for those runs.
 */
async function readAi(admin: ServiceRoleClient, projectId: string, userId: string): Promise<Section<AiData>> {
  const runsRes = await admin
    .from('ai_scan_runs')
    .select('id, status, completed_at, created_at')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .in('status', ['completed', 'partial'])
    .order('created_at', { ascending: false })
    .limit(2)
  if (runsRes.error) return { state: 'error' }
  const runs = (runsRes.data ?? []) as Array<Record<string, unknown>>
  if (runs.length === 0) return { state: 'ready', data: { score: null, mentions: 0, citations: 0, answers: 0, change: null, lastCheckAt: null } }

  const runIds = runs.map((r) => r.id).filter((v): v is string => typeof v === 'string')
  const resultsRes = await admin
    .from('ai_scan_results')
    .select('run_id, mentioned, citation_count, status, excluded_from_score')
    .eq('project_id', projectId)
    .in('run_id', runIds)
    .limit(5000)
  if (resultsRes.error) return { state: 'error' }
  const byRun = new Map<string, { answers: number; mentions: number; citations: number }>()
  for (const r of (resultsRes.data ?? []) as Array<Record<string, unknown>>) {
    if (r.status !== 'success' || r.excluded_from_score === true || typeof r.run_id !== 'string') continue
    const agg = byRun.get(r.run_id) ?? { answers: 0, mentions: 0, citations: 0 }
    agg.answers++
    if (r.mentioned === true) agg.mentions++
    agg.citations += typeof r.citation_count === 'number' && r.citation_count > 0 ? r.citation_count : 0
    byRun.set(r.run_id, agg)
  }
  const score = (id: unknown) => {
    const agg = typeof id === 'string' ? byRun.get(id) : undefined
    return agg && agg.answers > 0 ? Math.round((agg.mentions / agg.answers) * 100) : null
  }
  const latest = byRun.get(String(runs[0].id)) ?? { answers: 0, mentions: 0, citations: 0 }
  const latestScore = score(runs[0].id)
  const previousScore = runs[1] ? score(runs[1].id) : null
  return {
    state: 'ready',
    data: {
      score: latestScore,
      mentions: latest.mentions,
      citations: latest.citations,
      answers: latest.answers,
      change: latestScore !== null && previousScore !== null ? latestScore - previousScore : null,
      lastCheckAt: ts(runs[0].completed_at) ?? ts(runs[0].created_at),
    },
  }
}

async function readSetup({ projectId, userId, db }: Scope, project: { business_name: string | null }): Promise<Section<SetupData>> {
  const [profileRes, wpRes, shopifyRes, siteRes] = await Promise.all([
    db.from('project_profiles').select('description').eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
    db.from('wordpress_connections').select('connection_status').eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
    db.from('shopify_connections').select('connection_status, granted_scopes').eq('project_id', projectId).eq('user_id', userId).is('archived_at', null).maybeSingle(),
    db.from('site_platform_connections').select('platform, connection_status').eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
  ])
  if (profileRes.error || wpRes.error || shopifyRes.error) return { state: 'error' }
  const wp = wpRes.data as { connection_status?: string } | null
  const shop = shopifyRes.data as { connection_status?: string; granted_scopes?: string[] } | null
  // Wix / webhook: an unreadable (or not yet migrated) table is "not connected",
  // never an error for the whole setup section.
  const site = siteConnectionState(siteRes.error ? null : siteRes.data as { platform?: unknown; connection_status?: unknown } | null)
  const platform = resolveActivePlatform({
    wordpress: { present: !!wp, connectionStatus: wp?.connection_status ?? null },
    shopify: { present: !!shop, connectionStatus: shop?.connection_status ?? null, canPublish: false },
    site,
  })
  const description = str((profileRes.data as { description?: unknown } | null)?.description)
  return {
    state: 'ready',
    data: {
      business: !!description || !!str(project.business_name),
      platform: platform.wordpressActive || platform.shopifyActive || platform.siteActive,
    },
  }
}

async function readActivity(
  { projectId, userId, db }: Scope,
  admin: ServiceRoleClient,
  flags: { content: boolean; ai: boolean },
): Promise<Section<ActivityEvent[]>> {
  const empty = Promise.resolve({ data: [] as unknown[], error: null })
  const [createdRes, publishedRes, topicsRes, scansRes, aiRes] = await Promise.all([
    flags.content
      ? db.from('generated_articles').select('title, created_at').eq('project_id', projectId).eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(EVENTS_PER_SOURCE)
      : empty,
    flags.content
      ? db.from('generated_articles').select('title, published_at').eq('project_id', projectId).eq('user_id', userId)
        .eq('status', 'published').order('published_at', { ascending: false }).limit(EVENTS_PER_SOURCE)
      : empty,
    flags.content
      ? db.from('article_topics').select('topic, created_at').eq('project_id', projectId).eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(EVENTS_PER_SOURCE)
      : empty,
    db.from('scans').select('status, completed_targets, completed_at').eq('project_id', projectId)
      .eq('status', 'completed').order('completed_at', { ascending: false }).limit(EVENTS_PER_SOURCE),
    flags.ai
      ? admin.from('ai_scan_runs').select('status, completed_at').eq('project_id', projectId).eq('user_id', userId)
        .in('status', ['completed', 'partial']).order('completed_at', { ascending: false }).limit(EVENTS_PER_SOURCE)
      : empty,
  ])
  if (createdRes.error || publishedRes.error || topicsRes.error || scansRes.error || aiRes.error) return { state: 'error' }
  const rows = (res: { data: unknown }) => (res.data ?? []) as Array<Record<string, unknown>>
  const events: ActivityEvent[] = []
  const push = (kind: ActivityKind, at: unknown, title: unknown, count: number | null) => {
    const when = ts(at)
    if (when) events.push({ kind, at: when, title: str(title, 200), count })
  }
  for (const r of rows(createdRes)) push('article_created', r.created_at, r.title, null)
  for (const r of rows(publishedRes)) push('article_published', r.published_at, r.title, null)
  for (const r of rows(topicsRes)) push('topic_created', r.created_at, r.topic, null)
  for (const r of rows(scansRes)) push('rank_check', r.completed_at, null, typeof r.completed_targets === 'number' ? r.completed_targets : null)
  for (const r of rows(aiRes)) push('ai_check', r.completed_at, null, null)
  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return { state: 'ready', data: events.slice(0, EVENTS_PER_SOURCE * 2) }
}

const PLAN_KINDS: readonly PlanKind[] = ['trial', 'regular', 'advanced', 'premium', 'large_agency', 'shopify_billing_required']

async function readAccount(
  { projectId, userId, db }: Scope,
  admin: ServiceRoleClient,
  deps: DashboardDeps,
  now: Date,
): Promise<Section<AccountData>> {
  const [facts, allowance, keywordsRes] = await Promise.all([
    deps.entitlement(admin, userId),
    deps.articleAllowance(admin, userId),
    db.from('tracking_targets').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('is_active', true),
  ])
  if (keywordsRes.error) return { state: 'error' }
  // An entitlement that could not be read is NOT a plan with no allowance.
  const plan: PlanKind = facts.isAdmin ? 'admin' : (PLAN_KINDS.find((p) => p === facts.plan) ?? 'unknown')
  const trialEnds = facts.trialActive && facts.trialEndsAt ? Date.parse(facts.trialEndsAt) : NaN
  const metered = plan !== 'admin' && plan !== 'unknown'
  return {
    state: 'ready',
    data: {
      plan,
      trialDaysLeft: Number.isFinite(trialEnds) ? Math.max(0, Math.ceil((trialEnds - now.getTime()) / 86_400_000)) : null,
      articles: metered && allowance.state === 'known' ? { used: allowance.used, limit: allowance.limit } : null,
      keywords: metered ? { used: keywordsRes.count ?? 0, limit: facts.maxKeywordsPerProject } : null,
    },
  }
}

// ── The handler ─────────────────────────────────────────────────────────────

export async function handleDashboardGet(projectId: string, deps: DashboardDeps): Promise<Response> {
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
    // The project, read as its owner: RLS scopes the read and the filter says so too.
    const { data, error } = await session.db
      .from('projects')
      .select('id, user_id, business_name')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return refuse(500, 'internal')
    const project = data as { id: string; user_id: string; business_name: string | null } | null
    if (!project || project.user_id !== userId) return refuse(404, 'not_found')

    const scope: Scope = { projectId: project.id, userId, db: session.db }
    const now = deps.now()
    const flags = { content: deps.env.ENABLE_CONTENT === 'true', ai: deps.env.ENABLE_AI_VISIBILITY === 'true' }
    let admin: ServiceRoleClient | null = null
    const adminClient = () => (admin ??= deps.admin())

    const [articles, board, ai, setup, activity, account] = await Promise.all([
      flags.content ? section('articles', projectId, () => readArticles(scope, now)) : Promise.resolve({ state: 'disabled' } as const),
      flags.content ? section('board', projectId, () => readBoard(scope)) : Promise.resolve({ state: 'disabled' } as const),
      flags.ai ? section('ai', projectId, () => readAi(adminClient(), project.id, userId)) : Promise.resolve({ state: 'disabled' } as const),
      section('setup', projectId, () => readSetup(scope, project)),
      section('activity', projectId, () => readActivity(scope, adminClient(), flags)),
      section('account', projectId, () => readAccount(scope, adminClient(), deps, now)),
    ])
    const answer: DashboardOverview = { ok: true, articles, board, ai, setup, activity, account }
    return Response.json(answer, { status: 200, headers: NO_STORE })
  } catch (err) {
    console.error('[dashboard] read failed', { projectId, error: errorName(err) })
    return refuse(500, 'internal')
  }
}

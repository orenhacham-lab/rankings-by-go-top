/**
 * GET /api/projects/[id]/dashboard (lib/dashboard/overview.ts): who may read it,
 * what it reads, and what it may say.
 *
 *   A) sign-in, a well-formed id and ownership come first, and nothing else is
 *      read before they pass; a refusal carries a code, never database text
 *   B) every query is filtered by the project, and by its owner wherever the
 *      table has one, on the session client and on the service role alike
 *   C) articles and the publishing board, from this project's rows only
 *   D) AI visibility: the stored figures of this owner's runs, and the change
 *   E) setup facts and the activity feed
 *   F) the account card: plan, trial days, allowances; display only
 *   G) the feature switches: off means "disabled" and no read at all
 *   H) one section failing is that section's error, and no database or
 *      provider text reaches the answer or a log line
 *   I) opening the dashboard calls no one: no network, no provider module
 *
 * Fixtures return PostgREST timestamps (`+00:00`). Run: npx tsx lib/dashboard/__qa__/dashboard-overview.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeAdmin, type ErrorHooks } from '@/lib/__qa__/_fake-admin'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { computeDisplayMatches, buildDomainList } from '@/lib/ai-visibility/display-classification'
import { getBrandVariants } from '@/lib/ai-visibility/matching/mention-detector'
import {
  handleDashboardGet, type AccountData, type AiData, type ArticlesData, type BoardData, type DashboardDeps,
  type DashboardOverview, type EntitlementFacts, type ArticleAllowance, type SetupData, type ActivityEvent,
} from '../overview'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Source with comments removed, so a guard reads code and not prose. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const P = 'aaaaaaaa-0000-4000-8000-000000000001'
const P2 = 'aaaaaaaa-0000-4000-8000-000000000002'
const FOREIGN = 'aaaaaaaa-0000-4000-8000-000000000003'
const NOW = new Date('2026-09-15T12:00:00.000Z')
/** A PostgREST timestamp, `days` before NOW. */
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString().replace('Z', '+00:00')
const SECRET = 'relation "billing_governance" leaked-provider-text-7731'

// ── The world ───────────────────────────────────────────────────────────────

function world(): Record<string, Record<string, unknown>[]> {
  return {
    projects: [
      { id: P, user_id: USER, business_name: 'Bloom Florist', target_domain: 'bloom.co.il' },
      { id: P2, user_id: USER, business_name: null },
      { id: FOREIGN, user_id: OTHER, business_name: 'Not yours' },
    ],
    generated_articles: [
      { id: 'ga1', user_id: USER, project_id: P, title: 'Wedding bouquets guide', status: 'published', created_at: ago(40), updated_at: ago(3), published_at: ago(3) },
      { id: 'ga2', user_id: USER, project_id: P, title: 'Autumn flowers', status: 'published', created_at: ago(50), updated_at: ago(20), published_at: ago(20) },
      { id: 'ga3', user_id: USER, project_id: P, title: 'Roses care', status: 'draft', created_at: ago(1), updated_at: ago(1), published_at: null },
      { id: 'ga4', user_id: USER, project_id: P, title: 'Old piece', status: 'published', created_at: ago(200), updated_at: ago(190), published_at: ago(190) },
      // Another project of the same owner, and another owner's row on this project id: never counted.
      { id: 'gx1', user_id: USER, project_id: P2, title: 'Other project', status: 'published', created_at: ago(2), updated_at: ago(2), published_at: ago(2) },
      { id: 'gx2', user_id: OTHER, project_id: P, title: 'Not yours', status: 'published', created_at: ago(2), updated_at: ago(2), published_at: ago(2) },
    ],
    article_topics: [
      { id: 't1', user_id: USER, project_id: P, topic: 'Peonies in winter', created_at: ago(0.5) },
      { id: 't2', user_id: USER, project_id: P, topic: 'Flower delivery tips', created_at: ago(6) },
      { id: 'tx', user_id: OTHER, project_id: P, topic: 'Foreign topic', created_at: ago(0.1) },
    ],
    article_pool_items: [
      { id: 'q1', user_id: USER, project_id: P, topic_id: 't1', article_id: null, status: 'scheduled', scheduled_at: ago(-2), position: 1 },
      { id: 'q2', user_id: USER, project_id: P, topic_id: 't2', article_id: 'ga3', status: 'generated', scheduled_at: null, position: 2 },
      { id: 'q3', user_id: USER, project_id: P, topic_id: 't2', article_id: null, status: 'failed', scheduled_at: null, position: 3 },
      { id: 'qx', user_id: OTHER, project_id: P, topic_id: 'tx', article_id: null, status: 'queued', scheduled_at: null, position: 0 },
    ],
    project_profiles: [{ project_id: P, user_id: USER, description: 'A florist in Tel Aviv' }],
    wordpress_connections: [{ id: 'wp1', user_id: USER, project_id: P, connection_status: 'connected' }],
    shopify_connections: [],
    scans: [
      { id: 's1', project_id: P, status: 'completed', completed_targets: 12, completed_at: ago(2) },
      { id: 's2', project_id: P, status: 'failed', completed_targets: 0, completed_at: ago(1) },
      { id: 'sx', project_id: P2, status: 'completed', completed_targets: 99, completed_at: ago(0.2) },
    ],
    ai_scan_runs: [
      { id: 'r1', project_id: P, user_id: USER, status: 'completed', completed_at: ago(1), created_at: ago(1) },
      { id: 'r0', project_id: P, user_id: USER, status: 'completed', completed_at: ago(30), created_at: ago(30) },
      { id: 'rx', project_id: P2, user_id: USER, status: 'completed', completed_at: ago(0.1), created_at: ago(0.1) },
      { id: 'ry', project_id: P, user_id: OTHER, status: 'completed', completed_at: ago(0.05), created_at: ago(0.05) },
    ],
    ai_scan_results: [
      // r1: 4 scored answers, 3 mentions → 75; an excluded and a failed answer do not count.
      { id: 'r1a', run_id: 'r1', project_id: P, prompt_id: 'p1', engine: 'chatgpt', status: 'success', mentioned: true, citation_count: 2, excluded_from_score: false },
      { id: 'r1b', run_id: 'r1', project_id: P, prompt_id: 'p2', engine: 'chatgpt', status: 'success', mentioned: true, citation_count: 1, excluded_from_score: false },
      { id: 'r1c', run_id: 'r1', project_id: P, prompt_id: 'p3', engine: 'chatgpt', status: 'success', mentioned: true, citation_count: 0, excluded_from_score: false },
      { id: 'r1d', run_id: 'r1', project_id: P, prompt_id: 'p4', engine: 'chatgpt', status: 'success', mentioned: false, citation_count: 0, excluded_from_score: false },
      { id: 'r1e', run_id: 'r1', project_id: P, prompt_id: 'p5', engine: 'chatgpt', status: 'success', mentioned: true, citation_count: 9, excluded_from_score: true },
      { id: 'r1f', run_id: 'r1', project_id: P, prompt_id: 'p6', engine: 'chatgpt', status: 'failed', mentioned: true, citation_count: 9, excluded_from_score: false },
      // r0: the same two questions on the same engine, 1 mention of 2 → 50;
      // r1 checked them again, so its answers replace these in the score.
      { id: 'r0a', run_id: 'r0', project_id: P, prompt_id: 'p1', engine: 'chatgpt', status: 'success', mentioned: true, citation_count: 0, excluded_from_score: false },
      { id: 'r0b', run_id: 'r0', project_id: P, prompt_id: 'p2', engine: 'chatgpt', status: 'success', mentioned: false, citation_count: 0, excluded_from_score: false },
    ],
    // r1a lists the site among its 2 sources; r1b lists 1 other site; the
    // excluded r1e and the failed r1f cite the site but are not scored.
    ai_citations: [
      { id: 'c1', result_id: 'r1a', project_id: P, domain: 'bloom.co.il', url: 'https://bloom.co.il/weddings', is_target_domain: false },
      { id: 'c2', result_id: 'r1a', project_id: P, domain: 'wikipedia.org', url: 'https://wikipedia.org/wiki/Florist', is_target_domain: false },
      { id: 'c3', result_id: 'r1b', project_id: P, domain: 'roselane.com', url: 'https://roselane.com/', is_target_domain: false },
      { id: 'c4', result_id: 'r1e', project_id: P, domain: 'bloom.co.il', url: 'https://bloom.co.il/', is_target_domain: true },
      { id: 'c5', result_id: 'r1f', project_id: P, domain: 'bloom.co.il', url: 'https://bloom.co.il/', is_target_domain: true },
    ],
    tracking_targets: [
      { id: 'k1', project_id: P, is_active: true },
      { id: 'k2', project_id: P, is_active: true },
      { id: 'k3', project_id: P, is_active: false },
      { id: 'kx', project_id: P2, is_active: true },
    ],
  }
}

type Recorded = { client: 'session' | 'admin'; table: string; calls: { op: string; args: unknown[] }[] }

/** Wrap a fake so every query records its table and its filters. */
function recording(fake: FakeAdmin, client: Recorded['client'], log: Recorded[]) {
  const inner = fake.from.bind(fake)
  fake.from = ((name: string) => {
    const q = inner(name) as unknown as Record<string, (...a: unknown[]) => unknown>
    const entry: Recorded = { client, table: name, calls: [] }
    log.push(entry)
    for (const op of ['select', 'eq', 'in', 'is', 'order', 'limit', 'insert', 'update', 'upsert', 'delete']) {
      const original = q[op]
      q[op] = (...args: unknown[]) => { entry.calls.push({ op, args }); return original.apply(q, args) }
    }
    return q
  }) as unknown as typeof fake.from
  return fake
}

interface Setup {
  user?: string | null
  sessionThrows?: boolean
  env?: Record<string, string | undefined>
  hooks?: Record<string, ErrorHooks>
  adminHooks?: Record<string, ErrorHooks>
  entitlement?: Partial<EntitlementFacts> | 'throw'
  allowance?: ArticleAllowance | 'throw'
  tables?: (t: Record<string, Record<string, unknown>[]>) => void
}

async function call(projectId: string, s: Setup = {}) {
  const tables = world()
  s.tables?.(tables)
  const log: Recorded[] = []
  // One store behind both clients, as in production: RLS narrows the session
  // client, and the handler's own filters must narrow both.
  const sessionDb = recording(new FakeAdmin(tables, s.hooks ?? {}), 'session', log)
  const adminDb = recording(new FakeAdmin(tables, s.adminHooks ?? {}), 'admin', log)
  let adminCreated = 0
  const entitlementCalls: string[] = []
  const deps: DashboardDeps = {
    session: async () => {
      if (s.sessionThrows) throw new Error(SECRET)
      return { userId: s.user === undefined ? USER : s.user, db: sessionDb as unknown as SupabaseClient }
    },
    admin: () => { adminCreated++; return adminDb as unknown as ServiceRoleClient },
    entitlement: async (_a, userId) => {
      entitlementCalls.push(userId)
      if (s.entitlement === 'throw') throw new Error(SECRET)
      return { plan: 'regular', isAdmin: false, trialActive: false, trialEndsAt: null, maxKeywordsPerProject: 50, ...s.entitlement }
    },
    articleAllowance: async () => {
      if (s.allowance === 'throw') throw new Error(SECRET)
      return s.allowance ?? { state: 'known', used: 3, limit: 10 }
    },
    now: () => NOW,
    env: s.env ?? { ENABLE_CONTENT: 'true', ENABLE_AI_VISIBILITY: 'true' },
  }
  const errors: string[] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => { errors.push(JSON.stringify(args)) }
  let res: Response
  try {
    res = await handleDashboardGet(projectId, deps)
  } finally {
    console.error = originalError
  }
  const text = await res.text()
  const body = JSON.parse(text) as DashboardOverview & { code?: string }
  return { res, text, body, log, adminCreated, entitlementCalls, errors }
}

const eqOf = (q: Recorded, col: string) => q.calls.filter((c) => c.op === 'eq' && c.args[0] === col).map((c) => c.args[1])
const ready = <T,>(s: { state: string; data?: T }) => (s.state === 'ready' ? (s as { data: T }).data : null)

async function main() {
  // ── A) auth and ownership first ─────────────────────────────────────────
  console.log('\nA) sign-in, id and ownership come first')
  {
    const a = await call(P, { sessionThrows: true })
    check('A1: an unreadable session is 503 unavailable, with no query', a.res.status === 503 && a.body.code === 'unavailable' && a.log.length === 0, a.res.status)
    const b = await call(P, { user: null })
    check('A2: signed out is 401 unauthorized, with no query and no service role', b.res.status === 401 && b.body.code === 'unauthorized' && b.log.length === 0 && b.adminCreated === 0)
    const c = await call('not-a-uuid')
    check('A3: a malformed id is 404, with no query', c.res.status === 404 && c.body.code === 'not_found' && c.log.length === 0)
    const d = await call(FOREIGN)
    check('A4: another owner\'s project is 404 not_found', d.res.status === 404 && d.body.code === 'not_found')
    check('A5: ...and nothing but the project itself was read, and no service role was made',
      d.log.every((q) => q.table === 'projects') && d.adminCreated === 0 && d.entitlementCalls.length === 0, d.log.map((q) => q.table))
    const projectRead = d.log.find((q) => q.table === 'projects')
    check('A6: the project is read as its owner: filtered by id AND user_id on the session client',
      !!projectRead && projectRead.client === 'session' && eqOf(projectRead, 'id')[0] === FOREIGN && eqOf(projectRead, 'user_id')[0] === USER)
    const e = await call(P, { hooks: { projects: { select: () => ({ code: '42P01', message: SECRET }) } } })
    check('A7: a failed project read is 500 internal, and its text is not in the answer',
      e.res.status === 500 && e.body.code === 'internal' && !e.text.includes('leaked-provider-text'))
    const ok = await call(P)
    check('A8: the owner gets 200 ok with every section', ok.res.status === 200 && ok.body.ok === true
      && ['articles', 'board', 'ai', 'setup', 'activity', 'account'].every((k) => k in ok.body))
    check('A9: every answer is no-store', [a, b, c, d, e, ok].every((r) => r.res.headers.get('cache-control') === 'no-store'))
  }

  // ── B) filters ──────────────────────────────────────────────────────────
  console.log('\nB) every query is filtered by the project and its owner')
  {
    const r = await call(P)
    const OWNED = new Set(['generated_articles', 'article_pool_items', 'article_topics', 'project_profiles', 'wordpress_connections', 'shopify_connections', 'ai_scan_runs', 'site_fix_plugin_links'])
    const rest = r.log.filter((q) => q.table !== 'projects')
    check('B1: the handler reads the expected tables', ['generated_articles', 'article_pool_items', 'article_topics', 'project_profiles', 'wordpress_connections', 'shopify_connections', 'scans', 'ai_scan_runs', 'ai_scan_results', 'tracking_targets']
      .every((t) => rest.some((q) => q.table === t)), [...new Set(rest.map((q) => q.table))])
    const unscoped = rest.filter((q) => !eqOf(q, 'project_id').every((v) => v === P) || eqOf(q, 'project_id').length === 0)
    check('B2: every query past the ownership check is filtered to this project', unscoped.length === 0, unscoped.map((q) => q.table))
    const noOwner = rest.filter((q) => OWNED.has(q.table) && eqOf(q, 'user_id')[0] !== USER)
    check('B3: every query of a table with an owner column is filtered to the signed-in owner', noOwner.length === 0, noOwner.map((q) => `${q.client}:${q.table}`))
    const adminTables = [...new Set(rest.filter((q) => q.client === 'admin').map((q) => q.table))].sort()
    check('B4: the service role reads only the AI-visibility tables and the plugin link\'s status (billing goes through the injected entitlement)',
      JSON.stringify(adminTables) === JSON.stringify(['ai_citations', 'ai_scan_results', 'ai_scan_runs', 'site_fix_plugin_links']), adminTables)
    const linkReads = rest.filter((q) => q.table === 'site_fix_plugin_links')
    check('B4b: the plugin link is read for its status only (never its key), by the service role',
      linkReads.length > 0 && linkReads.every((q) => q.client === 'admin' && q.calls.some((c) => c.op === 'select' && c.args[0] === 'status')), linkReads.map((q) => JSON.stringify(q.calls[0])))
    const cites = rest.filter((q) => q.table === 'ai_citations')
    // The counted answers now (r1's four) and in the picture before the newest check (r0's two).
    check('B5b: sources are read only for this project\'s counted answers of those runs',
      cites.length > 0 && cites.every((q) => q.calls.some((c) => c.op === 'in' && c.args[0] === 'result_id' && JSON.stringify([...(c.args[1] as string[])].sort()) === JSON.stringify(['r0a', 'r0b', 'r1a', 'r1b', 'r1c', 'r1d']))),
      cites.map((q) => q.calls))
    const aiResults = rest.filter((q) => q.table === 'ai_scan_results')
    check('B5: AI answers are read only for this owner\'s runs of this project',
      aiResults.every((q) => q.calls.some((c) => c.op === 'in' && c.args[0] === 'run_id' && JSON.stringify(c.args[1]) === JSON.stringify(['r1', 'r0']))))
    check('B6: the entitlement is asked about the signed-in user only', JSON.stringify(r.entitlementCalls) === JSON.stringify([USER]))
    check('B7: the handler only reads: no insert, update, upsert or delete', r.log.every((q) => q.calls.every((c) => !['insert', 'update', 'upsert', 'delete'].includes(c.op))))
    const shop = rest.find((q) => q.table === 'shopify_connections')
    check('B8: an archived Shopify connection is not this project\'s platform', !!shop && shop.calls.some((c) => c.op === 'is' && c.args[0] === 'archived_at' && c.args[1] === null))
  }

  // ── C) articles and board ───────────────────────────────────────────────
  console.log('\nC) articles and the publishing board')
  {
    const r = await call(P)
    const a = ready<ArticlesData>(r.body.articles)
    check('C1: articles count this project\'s own rows only (4 written, 3 live)', !!a && a.total === 4 && a.live === 3, a)
    check('C2: published this month and last month are split by the calendar month (UTC)', !!a && a.publishedThisMonth === 1 && a.publishedLastMonth === 1, a && [a.publishedThisMonth, a.publishedLastMonth])
    check('C3: the latest article is the newest written, not another project\'s', a?.latest?.title === 'Roses care', a?.latest)
    check('C4: recent articles carry a known status and a timestamp', !!a && a.recent.length === 4 && a.recent.every((l) => l.at.endsWith('+00:00')) && a.recent[0].title === 'Roses care')
    const b = ready<BoardData>(r.body.board)
    check('C5: the board lists this owner\'s upcoming items in order, named by article or topic',
      !!b && JSON.stringify(b.upcoming.map((l) => [l.title, l.status])) === JSON.stringify([['Peonies in winter', 'scheduled'], ['Roses care', 'generated']]), b?.upcoming)
    check('C6: a failed pool item is not "upcoming"', !!b && !b.upcoming.some((l) => l.id === 'q3'))
    check('C7: the published side lists this project\'s live articles, newest first', !!b && b.published.map((l) => l.id).join() === 'ga1,ga2,ga4', b?.published)
  }

  // ── D) AI visibility ────────────────────────────────────────────────────
  console.log('\nD) AI visibility')
  {
    const r = await call(P)
    const ai = ready<AiData>(r.body.ai)
    check('D1: the score is the share of scored answers that mention the business (3 of 4)', ai?.score === 75, ai)
    check('D2: mentions exclude excluded and failed answers; citations are the scored answers that cite the site (1), not the sum of their sources (3)', ai?.mentions === 3 && ai.citations === 1 && ai.answers === 4, ai)
    check('D3: the change is against the same picture without the newest check (+25)', ai?.change === 25)
    check('D4: the last check time is the run\'s own', ai?.lastCheckAt === ago(1))
    const none = await call(P, { tables: (t) => { t.ai_scan_runs = [] } })
    const n = ready<AiData>(none.body.ai)
    check('D5: without a finished check the score is null, never zero', !!n && n.score === null && n.change === null)

    // The owner's report: the dashboard said 33/100 and 32 citations while the
    // AI tab said 0. The stored `mentioned` flag and `citation_count` (every
    // source in the answer, whoever's) are not the business's own figures; the
    // AI tab re-reads each answer with computeDisplayMatches. Same run, same rule.
    const citing = (result: string, domains: string[]) => domains.map((d, i) => ({
      id: `${result}-c${i}`, result_id: result, project_id: P, domain: d, url: `https://${d}/page-${i}`, is_target_domain: false,
    }))
    const other = ['petalhouse.co.il', 'roselane.com', 'wikipedia.org', 'yelp.com', 'flowers.net', 'easy.co.il', 'zap.co.il', 'b144.co.il']
    const answers = [
      // Stored as "mentioned" at scan time, but the answer names only others; 8 sources, none the site.
      { id: 'a1', run_id: 'r2', project_id: P, prompt_id: 'q1', engine: 'chatgpt', status: 'success', excluded_from_score: false, mentioned: true, target_cited: false, citation_count: 8,
        response_text: 'The best florists in Tel Aviv are Petal House and Rose Lane.' },
      // Names the business in the answer and cites the site among 2 sources.
      { id: 'a2', run_id: 'r2', project_id: P, prompt_id: 'q2', engine: 'chatgpt', status: 'success', excluded_from_score: false, mentioned: false, target_cited: false, citation_count: 2,
        response_text: 'For wedding flowers, Bloom Florist on Dizengoff is a good choice.' },
      // Stored as "mentioned", names no one; 3 sources, none the site.
      { id: 'a3', run_id: 'r2', project_id: P, prompt_id: 'q3', engine: 'chatgpt', status: 'success', excluded_from_score: false, mentioned: true, target_cited: false, citation_count: 3,
        response_text: 'Flower prices depend on the season.' },
    ]
    const allCitations = [...citing('a1', other), ...citing('a2', ['bloom.co.il', 'roselane.com']), ...citing('a3', other.slice(0, 3))]
    const aiWorld = (t: Record<string, Record<string, unknown>[]>) => {
      t.projects[0] = { ...t.projects[0], target_domain: 'bloom.co.il', brand_aliases: [], domain_aliases: [] }
      t.ai_scan_runs = [{ id: 'r2', project_id: P, user_id: USER, status: 'completed', completed_at: ago(0.5), created_at: ago(0.5) }]
      t.ai_scan_results = answers
      t.ai_citations = allCitations
    }
    const own = ready<AiData>((await call(P, { tables: aiWorld })).body.ai)
    // The AI tab's rule, applied here independently to the same rows (app/api/ai-visibility/runs/route.ts).
    const probe = { ...world().projects[0], target_domain: 'bloom.co.il' } as { business_name: string; target_domain: string }
    const variants = getBrandVariants(probe.business_name, probe.target_domain, [], [])
    const tab =answers.map((r) => computeDisplayMatches({
      responseText: r.response_text, brandVariants: variants, targetDomain: probe.target_domain,
      domainList: buildDomainList(probe.target_domain, []), mentioned: r.mentioned, cited: r.target_cited,
      citations: allCitations.filter((c) => c.result_id === r.id),
    }))
    const tabMentions = tab.filter((d) => d.displayMentioned).length
    const tabCited = tab.filter((d) => d.displayCited).length
    check('D6: mentions are the answers that name the business, as the AI tab counts them (1, not the 2 stored flags)',
      own?.mentions === 1 && own.mentions === tabMentions, { own, tabMentions })
    check('D7: citations are the answers that cite the site as a source (1), never every source in the answers (13)',
      own?.citations === 1 && own.citations === tabCited, { own, tabCited })
    check('D8: the score is the AI tab\'s share: answers naming the business out of scored answers (33)',
      own?.score === Math.round((tabMentions / 3) * 100) && own?.score === 33, own)

    // One definition of the score (lib/ai-visibility/score.ts): the latest answer per question x engine.
    const rechecked = ready<AiData>((await call(P, { tables: (t) => {
      t.ai_scan_runs = [
        { id: 'n2', project_id: P, user_id: USER, status: 'completed', completed_at: ago(0.2), created_at: ago(0.2) },
        { id: 'n1', project_id: P, user_id: USER, status: 'completed', completed_at: ago(3), created_at: ago(3) },
      ]
      t.ai_scan_results = [
        { id: 'n2a', run_id: 'n2', project_id: P, prompt_id: 'p1', engine: 'gemini', status: 'success', mentioned: true, excluded_from_score: false },
        { id: 'n1a', run_id: 'n1', project_id: P, prompt_id: 'p1', engine: 'gemini', status: 'success', mentioned: false, excluded_from_score: false },
        { id: 'n1b', run_id: 'n1', project_id: P, prompt_id: 'p1', engine: 'google_ai_overview', status: 'success', mentioned: true, excluded_from_score: false },
      ]
      t.ai_citations = []
    } })).body.ai)
    check('D9: checking a question again replaces its answer (1 answer, 100), and the change is against the answer it replaced (+100)',
      rechecked?.answers === 1 && rechecked.score === 100 && rechecked.change === 100, rechecked)
    check('D10: a retired engine\'s answer never counts toward the score', rechecked?.mentions === 1, rechecked)
  }

  // ── E) setup and activity ───────────────────────────────────────────────
  console.log('\nE) setup facts and activity')
  {
    const r = await call(P)
    const s = ready<SetupData>(r.body.setup)
    check('E1: a described business with a connected WordPress site is set up', s?.business === true && s.platform === true, s)
    const bare = await call(P2)
    const s2 = ready<SetupData>(bare.body.setup)
    check('E2: no description, no business name and no platform are all open', s2?.business === false && s2.platform === false, s2)
    const pending = await call(P, { tables: (t) => { t.wordpress_connections = [{ id: 'wp1', user_id: USER, project_id: P, connection_status: 'untested' }] } })
    check('E3: a WordPress row that is not connected is not a connected platform', ready<SetupData>(pending.body.setup)?.platform === false)
    const pluginOnly = await call(P, { tables: (t) => {
      t.wordpress_connections = []
      t.site_fix_plugin_links = [{ project_id: P, user_id: USER, status: 'connected', secret_encrypted: 'x' }]
    } })
    check('E3b: a WordPress site connected by the GO TOP plugin alone is a connected platform', ready<SetupData>(pluginOnly.body.setup)?.platform === true, pluginOnly.body.setup)
    const otherOwner = await call(P, { tables: (t) => {
      t.wordpress_connections = []
      t.site_fix_plugin_links = [{ project_id: P, user_id: 'someone-else', status: 'connected', secret_encrypted: 'x' }]
    } })
    check('E3c: ... never another owner\'s plugin link (so E3b is not vacuous)', ready<SetupData>(otherOwner.body.setup)?.platform === false)
    const named = await call(P, { tables: (t) => { t.project_profiles = [] } })
    check('E4: a business name alone describes the business', ready<SetupData>(named.body.setup)?.business === true)
    const events = ready<ActivityEvent[]>(r.body.activity) ?? []
    check('E5: activity is newest first', events.every((e, i) => i === 0 || Date.parse(events[i - 1].at) >= Date.parse(e.at)))
    check('E6: activity holds articles, topics, the completed rank check with its count, and AI checks',
      ['article_created', 'article_published', 'topic_created', 'rank_check', 'ai_check'].every((k) => events.some((e) => e.kind === k))
      && events.find((e) => e.kind === 'rank_check')?.count === 12, events.map((e) => e.kind))
    check('E7: no event of another project or another owner reaches the feed',
      !events.some((e) => e.title === 'Other project' || e.title === 'Not yours' || e.title === 'Foreign topic' || e.count === 99))
  }

  // ── F) account ──────────────────────────────────────────────────────────
  console.log('\nF) the account card')
  {
    const r = await call(P)
    const acc = ready<AccountData>(r.body.account)
    check('F1: a paid plan shows its article allowance and this project\'s active keywords against the limit',
      acc?.plan === 'regular' && acc.articles?.used === 3 && acc.articles.limit === 10 && acc.keywords?.used === 2 && acc.keywords.limit === 50, acc)
    const admin = ready<AccountData>((await call(P, { entitlement: { plan: 'regular', isAdmin: true } })).body.account)
    check('F2: an administrator is "admin", with no allowance to show', admin?.plan === 'admin' && admin.articles === null && admin.keywords === null, admin)
    const trial = ready<AccountData>((await call(P, { entitlement: { plan: 'trial', trialActive: true, trialEndsAt: new Date(NOW.getTime() + 3.2 * 86_400_000).toISOString() } })).body.account)
    check('F3: a trial shows its whole days left (3.2 → 4)', trial?.plan === 'trial' && trial.trialDaysLeft === 4, trial)
    const odd = ready<AccountData>((await call(P, { entitlement: { plan: 'weird_future_plan' } })).body.account)
    check('F4: an unknown plan is "unknown", with no allowance invented', odd?.plan === 'unknown' && odd.articles === null && odd.keywords === null, odd)
    const unmetered = ready<AccountData>((await call(P, { allowance: { state: 'unmetered' } })).body.account)
    check('F5: an unmetered or unknown article allowance is left out, never shown as zero', unmetered?.articles === null)
  }

  // ── G) switches ─────────────────────────────────────────────────────────
  console.log('\nG) the feature switches')
  {
    const off = await call(P, { env: {} })
    check('G1: content off: articles and board are disabled', off.body.articles.state === 'disabled' && off.body.board.state === 'disabled')
    check('G2: AI visibility off: the brief is disabled', off.body.ai.state === 'disabled')
    check('G3: ...and no content or AI table is read at all',
      !off.log.some((q) => ['generated_articles', 'article_pool_items', 'article_topics', 'ai_scan_runs', 'ai_scan_results'].includes(q.table)), [...new Set(off.log.map((q) => q.table))])
    check('G4: setup, activity and account still answer', ['setup', 'activity', 'account'].every((k) => (off.body as unknown as Record<string, { state: string }>)[k].state === 'ready'))
    const loose = await call(P, { env: { ENABLE_CONTENT: '1', ENABLE_AI_VISIBILITY: 'yes' } })
    check('G5: only the exact "true" switches a feature on', loose.body.articles.state === 'disabled' && loose.body.ai.state === 'disabled')
  }

  // ── H) failure isolation and no leaked text ─────────────────────────────
  console.log('\nH) one section failing is that section\'s error')
  {
    const leak = { select: () => ({ code: '42501', message: SECRET }) }
    const board = await call(P, { hooks: { article_pool_items: leak } })
    check('H1: a failed board read errors the board alone', board.body.board?.state === 'error'
      && ['articles', 'ai', 'setup', 'activity', 'account'].every((k) => (board.body as unknown as Record<string, { state: string } | undefined>)[k]?.state === 'ready'))
    const ai = await call(P, { adminHooks: { ai_scan_runs: leak } })
    check('H2: a failed AI read errors the AI brief and the feed, not the articles', ai.body.ai?.state === 'error' && ai.body.activity?.state === 'error' && ai.body.articles?.state === 'ready')
    const ent = await call(P, { entitlement: 'throw' })
    check('H3: an entitlement that cannot be read errors the account card alone', ent.body.account?.state === 'error' && ent.body.setup?.state === 'ready')
    const all = [board, ai, ent, await call(P, { allowance: 'throw' })]
    check('H4: no database or provider text is in any answer', all.every((r) => !r.text.includes('leaked-provider-text') && !r.text.includes('billing_governance')))
    check('H5: ...nor in any log line: a log names the section, the project and the error\'s type',
      all.every((r) => r.errors.every((l) => !l.includes('leaked-provider-text'))) && all.some((r) => r.errors.some((l) => l.includes('"section":"account"'))), all.flatMap((r) => r.errors))
    const thrown = await call(P, { hooks: { project_profiles: { select: () => { throw new Error(SECRET) } } } })
    check('H6: a read that throws is still only its section\'s error', thrown.res.status === 200 && thrown.body.setup?.state === 'error' && !thrown.text.includes('leaked'))
  }

  // ── I) no outside calls ─────────────────────────────────────────────────
  console.log('\nI) opening the dashboard calls no one')
  {
    const originalFetch = globalThis.fetch
    let fetched = 0
    globalThis.fetch = (async () => { fetched++; throw new Error('network') }) as typeof fetch
    try {
      const r = await call(P)
      check('I1: a full answer makes no network request', r.res.status === 200 && fetched === 0, fetched)
    } finally {
      globalThis.fetch = originalFetch
    }
    const FORBIDDEN = /google-ads|googleads|serper|openai|anthropic|@ai-sdk|lib\/ai\/|lib\/llm|scrapellm|dataforseo|lib\/shopify\/(?!.*types)|lib\/free-check\/(?!copy)|reserveUsage|consumeUsage|finalizeUsage/i
    const importsOf = (src: string) => [...strip(src).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
    const handler = code('lib/dashboard/overview.ts')
    const route = code('app/api/projects/[id]/dashboard/route.ts')
    const handlerOk = (src: string) => importsOf(src).every((m) => !FORBIDDEN.test(m)) && !FORBIDDEN.test(strip(src).replace(/from\s+'[^']+'/g, ''))
    check('I2: the handler imports no provider, model or usage-writing module', handlerOk(handler), importsOf(handler))
    check('I3: the route wires only the session, the service role, the entitlement and the allowance read',
      JSON.stringify(importsOf(route).sort()) === JSON.stringify(['@/lib/billing/usage-allowance', '@/lib/dashboard/overview', '@/lib/subscription', '@/lib/supabase/admin', '@/lib/supabase/server']), importsOf(route))
    check('I4: the route exports GET only (no write verb)', /export async function GET\b/.test(strip(route)) && !/export async function (POST|PUT|PATCH|DELETE)\b/.test(strip(route)))
    check('I-MUT: a model import in the handler fails I2', !handlerOk(`import { ask } from '@/lib/ai/openai'\n${handler}`))
    check('I-MUT: a POST in the route fails I4', /export async function POST\b/.test(strip(route + '\nexport async function POST() {}')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })

export {}

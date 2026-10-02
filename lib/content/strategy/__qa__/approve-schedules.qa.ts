/**
 * "APPROVE" PUTS THE TOPIC ON THE SCHEDULE; THE FIRST ONE WRITES THE FIRST ARTICLE — the guard
 * (owner, 2026-10-02, a brand-new account on the live site).
 *
 *   A) approve → queued + scheduled: a project with no queue gets an ACTIVE pool on the
 *      plan's rhythm, every approved topic is queued in approval order, again is a no-op,
 *      a paused queue stays paused, a non-article page is not queued, a manual brief is
 *      queued only when approved now;
 *   B) no Friday/Saturday: the new pool's first slot, for every day of two weeks, with and
 *      without a plan rhythm;
 *   C) the first approval writes the first article, READY (not a draft), once: only when
 *      the project has no article, only the queue's first item, only while it waits;
 *   D) "publish now" only for that first article: the screen's rule and the route's rule
 *      are one function; a later topic, a second article, a published project: none; with
 *      no site the route answers no_site and never touches the item;
 *   E) the allowance / trial path unchanged: the article is written by generatePoolItem
 *      (the one generation gate); nothing here reads or writes billing, plans or usage;
 *   F) the strategy screen and the queue agree: after scheduling, no approved topic is
 *      left outside the queue, every planned card is queued with its date, the next card
 *      is the queue's first item with its date, and a dateless queued card says "paused",
 *      never "not in the publishing queue";
 *   G) the screen: approving schedules from the click, the screen sweeps approved-but-
 *      unqueued topics on open, "publish now" (strategy card and the queue screen) only
 *      for the first article, reduced motion, he/en copy for everything new.
 *
 * Every guard has a mutation control (the code broken on purpose, the guard failing).
 * Source guards strip comments first.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { localWeekday, isNoPublishWeekday, weeklyRhythm } from '@/lib/content/automation/schedule'
import { buildStrategyBoard, NO_SEED_PLAN, type StrategyData, type StrategyQueueItem } from '@/lib/content/strategy/board'
import * as FA from '@/lib/content/strategy/first-article'
import * as AS from '@/lib/content/strategy/approve-schedule'
import * as HTTP from '@/lib/content/strategy/schedule-http'
import { dashboardHe as he } from '@/lib/i18n/dashboard/he'
import { dashboardEn as en } from '@/lib/i18n/dashboard/en'

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) passed++
  else { failed++; failures.push(`FAIL ${name} ${got === undefined ? '' : JSON.stringify(got)}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const TZ = 'Asia/Jerusalem'
const admin = (f: FakeAdmin) => f as unknown as ServiceRoleClient

/**
 * The module with one line broken on purpose, imported from a temp file OUTSIDE the
 * tree (so no suite that scans the tree, running in parallel, ever sees it): its
 * imports are rewritten to absolute paths so they still resolve.
 */
async function mutated<T>(rel: string, from: string, to: string): Promise<T> {
  const src = read(rel)
  if (!src.includes(from)) throw new Error(`mutation anchor missing in ${rel}: ${from}`)
  const dir = dirname(join(ROOT, rel))
  const body = src.replace(from, to)
    .replace(/from '@\/([^']+)'/g, (_m, p: string) => `from '${join(ROOT, p)}'`)
    .replace(/from '\.\/([^']+)'/g, (_m, p: string) => `from '${join(dir, p)}'`)
  const tmp = mkdtempSync(join(tmpdir(), 'w13-mut-'))
  const file = join(tmp, 'mutated.ts')
  writeFileSync(file, body)
  try { return (await import(file)) as T } finally { rmSync(tmp, { recursive: true, force: true }) }
}
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const l = console.log, e = console.error, w = console.warn
  console.log = () => {}; console.error = () => {}; console.warn = () => {}
  try { return await fn() } finally { console.log = l; console.error = e; console.warn = w }
}

// A Thursday morning in Jerusalem: the next slot must skip Friday and Saturday.
const NOW = Date.parse('2026-10-01T07:00:00Z')

function project(opts: { plan?: string | null; pool?: Record<string, unknown> | null; articles?: Record<string, unknown>[]; extraTopics?: Record<string, unknown>[] } = {}) {
  const plan = opts.plan === undefined ? 'regular' : opts.plan
  return new FakeAdmin({
    profiles: [{ id: 'u1', role: 'user', email: 'u1@example.com' }],
    subscriptions: plan ? [{ id: 's1', user_id: 'u1', plan_code: plan, status: 'active', trial_ends_at: null, current_period_start: '2026-09-20T00:00:00Z', current_period_end: '2026-10-20T00:00:00Z', created_at: '2026-09-01T00:00:00Z' }] : [],
    usage_reservations: [],
    projects: [{ id: 'p1', user_id: 'u1' }, { id: 'p2', user_id: 'u2' }],
    article_pools: opts.pool ? [opts.pool] : [],
    article_pool_items: [],
    article_topics: [
      { id: 't3', project_id: 'p1', status: 'approved', source: 'project_data', created_at: '2026-10-01T06:00:03Z' },
      { id: 't1', project_id: 'p1', status: 'approved', source: 'project_data', created_at: '2026-10-01T06:00:01Z' },
      { id: 't2', project_id: 'p1', status: 'approved', source: 'project_data', created_at: '2026-10-01T06:00:02Z' },
      { id: 'tm', project_id: 'p1', status: 'suggested', source: 'manual', created_at: '2026-10-01T05:00:00Z' },
      { id: 'tx', project_id: 'p2', status: 'approved', source: 'project_data', created_at: '2026-10-01T05:00:00Z' },
      ...(opts.extraTopics ?? []),
    ],
    generated_articles: opts.articles ?? [],
    content_topic_ideas: [],
  })
}
const items = (f: FakeAdmin) => (f.tables.article_pool_items as { id: string; topic_id: string; status: string; position: number; article_id: string | null; project_id: string }[])
  .slice().sort((a, b) => a.position - b.position)

async function main() {
  // ── A) approve → queued + scheduled ───────────────────────────────────────
  {
    const f = project()
    const r = await AS.scheduleApprovedTopics(admin(f), { projectId: 'p1', ownerId: 'u1', nowMs: NOW })
    const pool = (f.tables.article_pools as { is_active: boolean; next_publish_at: string; project_id: string; user_id: string }[])[0]
    check('A1: a project with no queue gets one, active, owned by the project\'s owner', r.ok && !!pool && pool.is_active === true && pool.project_id === 'p1' && pool.user_id === 'u1', pool)
    check('A2: it has a real first date', !!pool?.next_publish_at && Number.isFinite(Date.parse(pool.next_publish_at)), pool?.next_publish_at)
    check('A3: on the plan\'s rhythm (4 a month → one a week, on Sunday)', !!pool && localWeekday(Date.parse(pool.next_publish_at), TZ) === 0, pool?.next_publish_at)
    check('A4: every approved topic is queued, oldest approval first, and only this project\'s', JSON.stringify(items(f).map((i) => i.topic_id)) === '["t1","t2","t3"]' && items(f).every((i) => i.project_id === 'p1' && i.status === 'queued'), items(f))
    check('A5: a manual brief is not queued by itself', !items(f).some((i) => i.topic_id === 'tm'))
    const again = await AS.scheduleApprovedTopics(admin(f), { projectId: 'p1', ownerId: 'u1', nowMs: NOW })
    check('A6: again is a no-op (no duplicate, one pool)', again.ok && again.queued === 0 && items(f).length === 3 && f.tables.article_pools.length === 1)
    const now = await AS.scheduleApprovedTopics(admin(f), { projectId: 'p1', ownerId: 'u1', approveNow: ['tm'], nowMs: NOW })
    const tm = (f.tables.article_topics as { id: string; status: string }[]).find((t) => t.id === 'tm')
    check('A7: a manual brief approved now is approved and queued last', now.ok && now.queued === 1 && tm?.status === 'approved' && items(f).at(-1)?.topic_id === 'tm')

    const paused = project({ pool: { id: 'pp', project_id: 'p1', user_id: 'u1', is_active: false, created_at: '2026-09-01T00:00:00Z', next_publish_at: null } })
    const pr = await AS.scheduleApprovedTopics(admin(paused), { projectId: 'p1', ownerId: 'u1', nowMs: NOW })
    check('A8: a queue the owner paused stays paused, and still holds the approved topics', pr.ok && pr.poolActive === false && (paused.tables.article_pools[0] as { is_active: boolean }).is_active === false && items(paused).length === 3)

    const blocked = project()
    ;(blocked.tables.content_topic_ideas as unknown[]).push({ project_id: 'p1', approved_topic_id: 't2', link_plan: { recommendedPageType: 'category' } })
    await AS.scheduleApprovedTopics(admin(blocked), { projectId: 'p1', ownerId: 'u1', nowMs: NOW })
    check('A9: a topic the research marks as another kind of page keeps the queue\'s block', !items(blocked).some((i) => i.topic_id === 't2') && items(blocked).length === 2)

    const M = await mutated<typeof AS>('lib/content/strategy/approve-schedule.ts', "publish_time: DEFAULT_PUBLISH_TIME, timezone: DEFAULT_TIMEZONE, is_active: true,", "publish_time: DEFAULT_PUBLISH_TIME, timezone: DEFAULT_TIMEZONE, is_active: false,")
    const fm = project()
    await M.scheduleApprovedTopics(admin(fm), { projectId: 'p1', ownerId: 'u1', nowMs: NOW })
    check('A1-MUT: a new queue created paused fails A1', (fm.tables.article_pools[0] as { is_active: boolean }).is_active === false)
    const M2 = await mutated<typeof AS>('lib/content/strategy/approve-schedule.ts', "return t.status === 'approved' ||", "return t.status === 'rejected' ||")
    const fm2 = project()
    await M2.scheduleApprovedTopics(admin(fm2), { projectId: 'p1', ownerId: 'u1', nowMs: NOW })
    check('A4-MUT: an approval that does not queue fails A4', items(fm2).length === 0)
  }

  // ── B) never Friday or Saturday ───────────────────────────────────────────
  {
    const offDays = (slotOf: (perDay: number[] | null, now: number) => string) => {
      const bad: string[] = []
      for (const perDay of [null, weeklyRhythm(1), weeklyRhythm(3), weeklyRhythm(5)]) {
        for (let h = 0; h < 14 * 24; h += 5) {
          const iso = slotOf(perDay, NOW + h * 3_600_000)
          if (isNoPublishWeekday(localWeekday(Date.parse(iso), TZ))) bad.push(iso)
        }
      }
      return bad
    }
    const bad = offDays(AS.firstPoolSlot)
    check('B1: the new queue\'s first slot is never a Friday or a Saturday (two weeks, every rhythm)', bad.length === 0, bad.slice(0, 3))
    const M = await mutated<typeof AS>('lib/content/strategy/approve-schedule.ts', 'anchorIso: null })(nowMs)', 'anchorIso: null })(nowMs) && new Date(nowMs + 86_400_000).toISOString()')
    check('B1-MUT: a slot of "tomorrow, whatever day" fails B1', offDays(M.firstPoolSlot).length > 0)
  }

  // ── C) the first approval writes the first article, ready, once ───────────
  {
    const f = project()
    const r = await AS.scheduleApprovedTopics(admin(f), { projectId: 'p1', ownerId: 'u1', nowMs: NOW })
    check('C1: the first approval returns the queue\'s first item to write', r.ok && r.firstItemId === items(f)[0].id)
    const withArticle = project({ articles: [{ id: 'a0', project_id: 'p1', topic_id: 'tz', status: 'draft' }] })
    const r2 = await AS.scheduleApprovedTopics(admin(withArticle), { projectId: 'p1', ownerId: 'u1', nowMs: NOW })
    check('C2: a project that already has an article writes nothing', r2.ok && r2.firstItemId === null)
    check('C3: a first item already being written is not written twice', FA.firstItemToWrite({ articleCount: 0, queue: [{ id: 'i1', status: 'generating', position: 0, articleId: null }, { id: 'i2', status: 'queued', position: 1, articleId: null }] }) === null)
    check('C3b: a first item that failed is left to the runner, not written again here', FA.firstItemToWrite({ articleCount: 0, queue: [{ id: 'i1', status: 'failed', position: 0, articleId: null }] }) === null)
    const MF = await mutated<typeof FA>('lib/content/strategy/first-article.ts', 'if (input.articleCount > 0) return null', 'if (input.articleCount > 99) return null')
    check('C2-MUT: writing even when an article exists fails C2', MF.firstItemToWrite({ articleCount: 1, queue: [{ id: 'i1', status: 'queued', position: 0, articleId: null }] }) === 'i1')

    // writeFirstArticle: through the queue's generator, then READY.
    const g = new FakeAdmin({ generated_articles: [{ id: 'a1', project_id: 'p1', status: 'draft' }] })
    const calls: { itemId: string; opts: unknown }[] = []
    const gen = (async (_a: unknown, itemId: string, opts: unknown) => { calls.push({ itemId, opts }); return { itemId, status: 'generated', articleId: 'a1' } }) as never
    await AS.writeFirstArticle(admin(g), 'i1', { generate: gen })
    check('C4: the first article is written by the queue\'s own generator, for that item, with no retry', calls.length === 1 && calls[0].itemId === 'i1' && (calls[0].opts as { allowRetry?: boolean }).allowRetry === false)
    check('C5: and it is left READY, not a draft', (g.tables.generated_articles[0] as { status: string }).status === 'ready')
    const g2 = new FakeAdmin({ generated_articles: [{ id: 'a1', project_id: 'p1', status: 'draft' }] })
    await AS.writeFirstArticle(admin(g2), 'i1', { generate: (async () => ({ itemId: 'i1', status: 'failed', articleId: null, reason: 'quota_exceeded' })) as never })
    check('C6: a refused generation (the allowance) changes no article', (g2.tables.generated_articles[0] as { status: string }).status === 'draft')
    const MW = await mutated<typeof AS>('lib/content/strategy/approve-schedule.ts', ".update({ status: 'ready',", ".update({ status: 'draft',")
    const g3 = new FakeAdmin({ generated_articles: [{ id: 'a1', project_id: 'p1', status: 'draft' }] })
    await MW.writeFirstArticle(admin(g3), 'i1', { generate: gen })
    check('C5-MUT: a first article left as a draft fails C5', (g3.tables.generated_articles[0] as { status: string }).status === 'draft')

    // The route writes it after answering, only when there is one to write.
    const later: (() => Promise<unknown>)[] = []
    const written: string[] = []
    const deps = (firstItemId: string | null): HTTP.ScheduleRouteDeps => ({
      enabled: () => true,
      auth: async () => ({ user: { id: 'u1' }, admin: admin(new FakeAdmin()), project: { id: 'p1', user_id: 'u1' } }),
      schedule: async () => ({ ok: true, poolId: 'pool', poolActive: true, created: true, queued: 1, firstItemId }),
      later: (t) => { later.push(t) },
      writeFirst: async (_a, id) => { written.push(id) },
    })
    const req = (b: unknown) => new Request('http://x/api/content/strategy/schedule', { method: 'POST', body: JSON.stringify(b) })
    const res = await HTTP.handleSchedulePost(req({ projectId: 'p1', topicIds: ['t1'] }), deps('i1'))
    const body = await res.json() as { ok: boolean; writingFirst: boolean }
    for (const t of later.splice(0)) await t()
    check('C7: the route answers first and writes the first article after (after())', res.status === 200 && body.writingFirst === true && JSON.stringify(written) === '["i1"]')
    const res2 = await HTTP.handleSchedulePost(req({ projectId: 'p1' }), deps(null))
    const b2 = await res2.json() as { writingFirst: boolean }
    check('C8: nothing to write → nothing scheduled after the answer', b2.writingFirst === false && later.length === 0)
    const off = await HTTP.handleSchedulePost(req({ projectId: 'p1' }), { ...deps('i1'), enabled: () => false })
    check('C9: automation off → 404, nothing queued', off.status === 404 && later.length === 0)
    const denied = await HTTP.handleSchedulePost(req({ projectId: 'p2' }), { ...deps('i1'), auth: async () => ({ error: 'Forbidden', status: 403 }) })
    check('C10: someone else\'s project → 403 forbidden, nothing queued', denied.status === 403 && ((await denied.json()) as { code: string }).code === 'forbidden' && later.length === 0)
  }

  // ── D) "publish now" only for the first article ───────────────────────────
  {
    const q = (s0: string, art0: string | null, s1 = 'queued'): FA.FirstArticleItem[] => [
      { id: 'i1', status: s0, position: 0, articleId: art0 }, { id: 'i2', status: s1, position: 1, articleId: null },
    ]
    const ready = FA.firstArticleView({ articles: [{ id: 'a1', status: 'ready' }], queue: q('generated', 'a1') })
    check('D1: the first article, generated and ready → "ready", for its item', ready.kind === 'ready' && ready.itemId === 'i1' && ready.articleId === 'a1')
    check('D2: "publish now" applies to it', FA.canPublishFirstNow({ articles: [{ id: 'a1', status: 'ready' }], queue: q('generated', 'a1'), itemId: 'i1' }))
    check('D3: never to a later topic', !FA.canPublishFirstNow({ articles: [{ id: 'a1', status: 'ready' }], queue: q('generated', 'a1'), itemId: 'i2' }))
    check('D4: never once a second article exists', !FA.canPublishFirstNow({ articles: [{ id: 'a1', status: 'ready' }, { id: 'a2', status: 'ready' }], queue: [{ id: 'i1', status: 'generated', position: 0, articleId: 'a1' }, { id: 'i2', status: 'generated', position: 1, articleId: 'a2' }], itemId: 'i2' }))
    check('D5: never once the project published', FA.firstArticleView({ articles: [{ id: 'a1', status: 'published' }], queue: [{ id: 'i1', status: 'published', position: 0, articleId: 'a1' }, { id: 'i2', status: 'generated', position: 1, articleId: null }] }).kind === 'none')
    check('D6: while it is written → "writing"; a quota stop → the friendly quota line', FA.firstArticleView({ articles: [], queue: q('generating', null) }).kind === 'writing'
      && JSON.stringify(FA.firstArticleView({ articles: [], queue: [{ id: 'i1', status: 'failed', position: 0, articleId: null, lastError: 'quota_exceeded' }] })) === '{"kind":"failed","reason":"quota"}')
    check('D7: a raw provider text is never a reason of its own', FA.firstArticleFailure('Gemini 503: upstream connect error') === 'generic' && FA.firstArticleFailure('billing_required') === 'billing')
    const MF = await mutated<typeof FA>('lib/content/strategy/first-article.ts', "return v.kind === 'ready' && v.itemId === input.itemId", "return v.kind === 'ready'")
    check('D3-MUT: "publish now" for whichever item is asked fails D3', MF.canPublishFirstNow({ articles: [{ id: 'a1', status: 'ready' }], queue: q('generated', 'a1'), itemId: 'i2' }))

    // The route keeps the same rule, and never pauses an item for want of a site.
    const published: string[] = []
    const db = (arts: Record<string, unknown>[], its: Record<string, unknown>[]) => new FakeAdmin({ generated_articles: arts, article_pool_items: its })
    const pdeps = (f: FakeAdmin, platform = 'wordpress'): HTTP.PublishFirstDeps => ({
      enabled: () => true,
      auth: async () => ({ user: { id: 'u1' }, admin: admin(f), project: { id: 'p1', user_id: 'u1' } }),
      platform: async () => ({ platform }),
      publish: async (_a, id) => { published.push(id); return { status: 'published' } },
    })
    const preq = (itemId: string) => new Request('http://x/api/content/strategy/publish-first', { method: 'POST', body: JSON.stringify({ projectId: 'p1', itemId }) })
    const firstDb = () => db([{ id: 'a1', project_id: 'p1', status: 'ready' }], [{ id: 'i1', project_id: 'p1', status: 'generated', position: 0, article_id: 'a1' }, { id: 'i2', project_id: 'p1', status: 'queued', position: 1, article_id: null }])
    const ok = await HTTP.handlePublishFirstPost(preq('i1'), pdeps(firstDb()))
    check('D8: the first article publishes now', ok.status === 200 && JSON.stringify(published) === '["i1"]')
    const later = await HTTP.handlePublishFirstPost(preq('i2'), pdeps(firstDb()))
    check('D9: a later topic is refused (not_first), nothing published', later.status === 409 && ((await later.json()) as { code: string }).code === 'not_first' && published.length === 1)
    const noSite = await HTTP.handlePublishFirstPost(preq('i1'), pdeps(firstDb(), 'none'))
    check('D10: no site connected → no_site, and the item is not touched', noSite.status === 409 && ((await noSite.json()) as { code: string }).code === 'no_site' && published.length === 1)
    const second = db([{ id: 'a1', project_id: 'p1', status: 'published' }, { id: 'a2', project_id: 'p1', status: 'ready' }], [{ id: 'i1', project_id: 'p1', status: 'published', position: 0, article_id: 'a1' }, { id: 'i2', project_id: 'p1', status: 'generated', position: 1, article_id: 'a2' }])
    const sec = await HTTP.handlePublishFirstPost(preq('i2'), pdeps(second))
    check('D11: after the first one, the next article has no "publish now"', sec.status === 409 && published.length === 1)
    const MH = await mutated<typeof HTTP>('lib/content/strategy/schedule-http.ts', 'if (!canPublishFirstNow({ articles, queue, itemId }))', 'if (false)')
    await MH.handlePublishFirstPost(preq('i2'), pdeps(second))
    check('D9-MUT: a route without the first-article rule publishes a later article (fails D11)', published.at(-1) === 'i2')
    const MS = await mutated<typeof HTTP>('lib/content/strategy/schedule-http.ts', "if (!hasPublishingSite(site.platform, { shopifyNeedsScope: site.shopifyNeedsScope }))", 'if (false)')
    const n = published.length
    await MS.handlePublishFirstPost(preq('i1'), pdeps(firstDb(), 'none'))
    check('D10-MUT: a route that publishes with no site fails D10', published.length === n + 1)
    check('D12: a connected Shopify store without the content scope counts as no site', !FA.hasPublishingSite('shopify', { shopifyNeedsScope: true }) && FA.hasPublishingSite('shopify') && !FA.hasPublishingSite('conflict'))
  }

  // ── E) the allowance / trial path unchanged ───────────────────────────────
  {
    const src = strip(read('lib/content/strategy/approve-schedule.ts'))
    const throughGate = (s: string) => /import \{ generatePoolItem \} from '@\/lib\/content\/automation\/generate-item'/.test(s)
      && /deps\.generate \?\? generatePoolItem/.test(s)
      && !/billing|subscriptions|usage_reservations|usage_ledger|entitlement|reserve_usage|plan_code|\.rpc\(/.test(s)
    check('E1: the first article goes through generatePoolItem (the one gate: plan, trial, allowance); nothing here touches billing or usage', throughGate(src))
    check('E1-MUT: a module that writes the article itself, past the gate, fails E1', !throughGate(src.replace('deps.generate ?? generatePoolItem', "deps.generate ?? (async () => admin.from('usage_reservations').insert({}))")))
    const gen = strip(read('lib/content/automation/generate-item.ts'))
    const gated = (s: string) => /await generateArticleForTopic\(admin, \{ topicId: item\.topic_id, userId: ownerId/.test(s)
    check('E2: generatePoolItem still writes through generateArticleForTopic (its entitlement + allowance gate)', gated(gen))
    check('E2-MUT: a generator that skips it fails E2', !gated(gen.replace('await generateArticleForTopic(admin, {', 'await (async (..._a: unknown[]) => ({ ok: true }))(admin, {')))
    const core = strip(read('lib/content/article-generation.ts'))
    check('E3: the gate itself is untouched: first thing in generateArticleForTopic', /const gate = await assertContentGenerationAllowedForUser\(admin, userId, deps\.now\)\s*if \(!gate\.allowed\)/.test(core))
    const card = strip(read('components/content-strategy/NextArticleCard.tsx'))
    const friendly = (s: string) => /dict\.seedOnboarding\.firstArticle\.errors/.test(s) && /errors\[first\.reason\]/.test(s) && !/lastError/.test(s)
    check('E4: a stop is said in the onboarding\'s friendly words, never the stored text', friendly(card))
    check('E4-MUT: showing the stored error fails E4', !friendly(card.replace('errors[first.reason]', 'first.lastError')))
  }

  // ── F) the strategy screen and the queue agree ────────────────────────────
  {
    const f = project()
    await AS.scheduleApprovedTopics(admin(f), { projectId: 'p1', ownerId: 'u1', nowMs: NOW })
    const t = (f.tables.article_topics as { id: string; project_id: string; status: string; source: string; created_at: string }[]).filter((x) => x.project_id === 'p1')
    const data: StrategyData = {
      ideas: [],
      topics: t.map((x) => ({ id: x.id, title: `Topic ${x.id}`, primaryKeyword: null, status: x.status, source: x.source, reason: null, createdAt: x.created_at })),
      articles: [],
    }
    const dates = ['2026-10-04T06:00:00Z', '2026-10-11T06:00:00Z', '2026-10-18T06:00:00Z']
    const queue: StrategyQueueItem[] = items(f).map((i, n) => ({ id: i.id, topicId: i.topic_id, articleId: null, status: i.status, position: i.position, projectedPublishAt: dates[n] ?? null }))
    check('F1: after scheduling, no approved topic is outside the queue', FA.approvedNotQueued({ topics: data.topics, articles: data.articles, queue }).length === 0)
    check('F1-MUT: before scheduling (the owner\'s project), the screen finds them to queue', FA.approvedNotQueued({ topics: data.topics, articles: data.articles, queue: [] }).length === 3)
    const board = buildStrategyBoard({ data, queue, seed: NO_SEED_PLAN })
    const planned = board.cards.filter((c) => c.column === 'planned' && c.topicId !== 'tm')
    check('F2: every approved planned card is queued with its publish date', planned.length === 3 && planned.every((c) => c.queued && c.dateKind === 'publishTarget' && !!c.date), planned.map((c) => [c.topicId, c.queued, c.dateKind]))
    check('F3: the next article is the queue\'s first item, with its date', board.next?.kind === 'queued' && board.next.topicId === 't1' && board.next.date === dates[0])
    const card = strip(read('components/content-strategy/NextArticleCard.tsx'))
    const pausedNotUnqueued = (s: string) => /\{next\.kind === 'queued' \? s\.nextPaused : firstStopped \? s\.first\.stoppedTile : s\.nextNotScheduled\}/.test(s)
    check('F4: a queued article without a date says the queue is paused, never "not in the publishing queue"', pausedNotUnqueued(card))
    check('F4-MUT: the old label for every dateless card fails F4', !pausedNotUnqueued(card.replace("{next.kind === 'queued' ? s.nextPaused : firstStopped ? s.first.stoppedTile : s.nextNotScheduled}", '{s.nextNotScheduled}')))
    const noQueueStep = (s: string) => /next\.kind === 'topic' && !automation\s*\?\s*\{ href: strategyHref\('list', STRATEGY_ANCHORS\.topics\), label: s\.queueIt \}/.test(s)
    check('F5: with automation there is no separate "add it to the queue" step', noQueueStep(card))
    check('F5-MUT: the link back for every topic fails F5', !noQueueStep(card.replace("next.kind === 'topic' && !automation", "next.kind === 'topic'")))
  }

  // ── G) the screen ─────────────────────────────────────────────────────────
  {
    const hook = strip(read('components/content-strategy/useIdeaActions.ts'))
    const schedulesOnApprove = (s: string) => {
      const approve = s.slice(s.indexOf('const approve = useCallback'), s.indexOf('const reject = useCallback'))
      const keyword = s.slice(s.indexOf('const addKeyword = useCallback'), s.indexOf('const { overrides } = scope'))
      return /automation && \(outcome === 'created' \|\| outcome === 'existing'\)\s*\? await scheduleApproved\(projectId, readApprovedTopicId\(req\.url, body\)\)/.test(approve)
        && /await scheduleApproved\(projectId, readApprovedTopicId\(req\.url, body\)\)/.test(keyword)
    }
    check('G1: approving (and adding a keyword) puts the topic in the queue, from the click', schedulesOnApprove(hook))
    check('G1-MUT: an approval that stops at "approved" fails G1', !schedulesOnApprove(hook.replace("? await scheduleApproved(projectId, readApprovedTopicId(req.url, body))\n      : null", '? null : null')))
    const screen = strip(read('components/content-strategy/ContentStrategyScreen.tsx'))
    const sweeps = (s: string) => /approvedNotQueued\(\{ topics: strategy\.data\.topics, articles: strategy\.data\.articles, queue: strategy\.queue \}\)/.test(s)
      && /fetch\(STRATEGY_SCHEDULE_ENDPOINTS\.schedule/.test(s) && /swept === projectId/.test(s)
    check('G2: opening the screen queues approved topics the queue does not hold, once per project', sweeps(screen))
    check('G2-MUT: no sweep fails G2', !sweeps(screen.replace('fetch(STRATEGY_SCHEDULE_ENDPOINTS.schedule', 'fetch(String')))
    const wired = (s: string) => /first=\{first\}/.test(s) && /queuePaused=\{strategy\.queueActive === false\}/.test(s) && /automation=\{automationEnabled\}/.test(s)
      && /fetch\(STRATEGY_SCHEDULE_ENDPOINTS\.publishFirst/.test(s) && /itemId: first\.itemId/.test(s)
    check('G3: the card gets the first article, the queue state, and "publish now" for the first article\'s item', wired(screen))
    check('G3-MUT: a card without the first article fails G3', !wired(screen.replace('first={first}', '')))
    const card = strip(read('components/content-strategy/NextArticleCard.tsx'))
    const onlyFirst = (s: string) => (s.match(/data-first-article-publish/g) ?? []).length === 1
      && (s.match(/onPublishFirst/g) ?? []).length >= 1 && /const firstShown = first\.kind !== 'none' && \(next\.kind === 'queued' \|\| \(first\.kind === 'failed' && next\.kind === 'topic'\)\)/.test(s)
      && /\{firstShown && \(\s*<FirstArticlePanel/.test(s)
    check('G4: "publish now" lives only in the first article\'s panel', onlyFirst(card))
    check('G4-MUT: a panel for every queued article fails G4', !onlyFirst(card.replace("const firstShown = first.kind !== 'none' && (next.kind === 'queued'", "const firstShown = (next.kind === 'queued'")))
    const reduced = (s: string) => /motion-safe:animate-spin/.test(s) && /progress-sweep/.test(s) && !/(?<!motion-safe:)animate-spin/.test(s.replace(/motion-safe:animate-spin/g, ''))
    check('G5: its motion respects prefers-reduced-motion', reduced(card))
    check('G5-MUT: a spinner that always spins fails G5', !reduced(card.replace('motion-safe:animate-spin', 'animate-spin')))

    const queueScreen = strip(read('components/content/AutomationSchedule.tsx'))
    const queueFirstOnly = (s: string) => /it\.status === 'generated' && canPublishFirstNow\(\{ articles: articlesForFirst, queue: items, itemId: it\.id \}\) && \(/.test(s)
      && (s.match(/t\.publishNow\}/g) ?? []).length === 1 && !/it\.status === 'generated' \|\| \(it\.status === 'failed' && it\.articleId\)/.test(s)
      && /articles=\{data\?\.articles\}/.test(strip(read('components/content/workspace/AutomationScreen.tsx')))
    check('G8: the queue screen offers "publish now" only for the first article too (a failed publish keeps its retry)', queueFirstOnly(queueScreen))
    check('G8-MUT: "publish now" on every ready item of the queue fails G8', !queueFirstOnly(queueScreen.replace("it.status === 'generated' && canPublishFirstNow({ articles: articlesForFirst, queue: items, itemId: it.id }) && (", "it.status === 'generated' && (")))

    // Copy: he and en for everything new; Hebrew screens fully Hebrew.
    const keys = ['approveHint', 'writingTitle', 'writingBody', 'readyTitle', 'readyBody', 'readyBodyNoDate', 'publishNow', 'publishing', 'published', 'publishError', 'noSite', 'connect', 'open', 'rhythm', 'pausedHint', 'stoppedTile'] as const
    const full = (d: typeof he) => keys.every((k) => typeof d.contentStrategy.first[k] === 'string' && d.contentStrategy.first[k].length > 2)
      && typeof d.contentStrategy.nextPaused === 'string' && typeof d.contentStrategy.ideaActions.approvedFirst === 'string'
    check('G6: he and en say everything new', full(he) && full(en as unknown as typeof he))
    const hebrew = keys.every((k) => /[֐-׿]/.test(he.contentStrategy.first[k]) && !/[A-Za-z]{3,}/.test(he.contentStrategy.first[k].replace('{date}', '')))
    check('G7: the Hebrew copy is Hebrew', hebrew && /[֐-׿]/.test(he.contentStrategy.ideaActions.approvedFirst))
    check('G7-MUT: an English line in Hebrew fails G7', !keys.every((k) => !/[A-Za-z]{3,}/.test({ ...he.contentStrategy.first, publishNow: 'Publish now' }[k])))
  }
}

quiet(main).catch((e) => { failed++; failures.push(`ERROR ${e instanceof Error ? e.stack : String(e)}`) }).finally(() => {
  for (const f of failures) console.log(f)
  console.log(`${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
})

export {}

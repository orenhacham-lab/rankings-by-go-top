/**
 * THE MONTHLY TOPIC TOP-UP (lib/content/automation/topic-topup.ts): topics never run out.
 *
 *   M) the math: a pool's monthly rate, the target, the window's quarter hours
 *   G) the gates: kill switch, Production only, the daily window, all before a read
 *   R) a run on a fake database: entitled projects only, enough supply is skipped,
 *      ideas already in the plan first (best score, articles only), the
 *      cannibalization check skips a subject the site or the plan has (also inside
 *      the run), topics queued into the ACTIVE pool only, provenance marked, no
 *      article generated, no quota, plan, billing, pool setting or project touched
 *   I) idempotent: a second run changes nothing and says nothing; two overlapping
 *      runs never make one idea twice
 *   F) failures: a topic insert that fails gives the idea back; entitlement errors
 *      skip the owner; the isolated start never throws and never leaks a message
 *   X) the model: never in the window's first quarter hour, one project, only when
 *      the existing AI gate allows it and time remains; its duplicates skipped
 *   S) source guards (each with a MUTATION CONTROL): the cron calls it last and
 *      isolated, no new cron schedule, the tables it may write, the gate order
 *   P) provenance on the strategy tab: the route marks the top-up's topics and the
 *      notice lists this month's, in both dictionaries
 *
 * Run: npx tsx lib/content/automation/__qa__/topic-topup.qa.ts
 */
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import {
  poolMonthlyRate, topUpTarget, windowSlot, runTopicTopUp, startIsolatedTopUp, TOPUP_SOURCE_CONTEXT, MIN_MS_FOR_MODEL,
  type TopUpDeps, type GeneratedIdeas,
} from '../topic-topup'
import { buildOverlapIndex, type OverlapIndexData } from '../../cannibalization/check'
import { handleStrategyGet } from '../../strategy/http'
import { preparedThisMonth, topUpOrigin, topUpDismissKey } from '../../strategy/topup-notice'
import type { StrategyTopic } from '../../strategy/board'
import { dashboardHe } from '../../../i18n/dashboard/he'
import { dashboardEn } from '../../../i18n/dashboard/en'
import { execSync } from 'child_process'
import { code, readSrc, ROOT } from '../../cannibalization/__qa__/_strip'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Row = Record<string, unknown>
const T0 = Date.parse('2026-09-29T07:20:00Z') // slot 1 of the window
const PROD = { VERCEL_ENV: 'production' }

let upserted = 0
/** A FakeAdmin whose every table access and write is recorded. */
function tracked(fa: FakeAdmin) {
  const froms: string[] = []
  const writes: { table: string; op: string; payload: unknown }[] = []
  const admin = {
    from(table: string) {
      froms.push(table)
      const q = fa.from(table) as unknown as Record<string, (...a: unknown[]) => unknown>
      for (const op of ['insert', 'update', 'upsert', 'delete']) {
        const orig = q[op].bind(q)
        q[op] = (...a: unknown[]) => {
          writes.push({ table, op, payload: a[0] })
          // A real upsert gets its id from the column default; FakeAdmin's upsert does not assign one.
          if (op === 'upsert' && Array.isArray(a[0])) a[0] = (a[0] as Row[]).map((r) => ({ id: `up-${++upserted}`, ...r }))
          return orig(...a)
        }
      }
      return q
    },
  }
  return { admin: admin as never, froms, writes, fa }
}

const SITE: OverlapIndexData = {
  homeHosts: ['japan4u.co.il'],
  pages: [{ title: 'קנזאווה', url: 'https://japan4u.co.il/קנזאווה/' }],
  articles: [{ id: 'a1', title: 'טוקיו מול קיוטו: המדריך המלא', url: 'https://japan4u.co.il/tokyo-vs-kyoto/' }],
  gsc: [], topics: [], ideas: [],
}

const idea = (id: string, project: string, user: string, title: string, score: number, extra: Row = {}): Row => ({
  id, project_id: project, user_id: user, title, primary_keyword: title, secondary_keywords: ['א'], search_intent: 'informational',
  angle: 'זווית', recommended_word_count: 1200, suggestion_reason: 'סיבה', score, source: 'hybrid', link_plan: null,
  status: 'pending', source_context: null, approved_topic_id: null, created_at: '2026-09-01T00:00:00Z', ...extra,
})

function world(): Record<string, Row[]> {
  return {
    projects: [
      { id: 'p1', user_id: 'u1', language: 'he', is_active: true, created_at: '2026-01-01' },
      { id: 'p2', user_id: 'u1', language: 'he', is_active: true, created_at: '2026-01-02' },
      { id: 'p3', user_id: 'u2', language: 'he', is_active: true, created_at: '2026-01-03' },
      { id: 'p4', user_id: 'u1', language: 'he', is_active: false, created_at: '2026-01-04' },
    ],
    article_pools: [
      { id: 'pool1', project_id: 'p1', user_id: 'u1', is_active: true, cadence: 'weekly', interval_days: null, publish_days: [1, 4], next_publish_at: '2026-10-01T06:00:00Z' },
      { id: 'pool4', project_id: 'p4', user_id: 'u1', is_active: true, cadence: 'daily', interval_days: null, publish_days: null },
    ],
    article_pool_items: [
      { id: 'it1', pool_id: 'pool1', project_id: 'p1', user_id: 'u1', topic_id: 'old1', status: 'queued', position: 5 },
      { id: 'it2', pool_id: 'pool1', project_id: 'p1', user_id: 'u1', topic_id: 'old2', status: 'published', position: 2 },
    ],
    article_topics: [
      { id: 'old1', project_id: 'p1', user_id: 'u1', topic: 'רכבות ביפן', primary_keyword: 'רכבות ביפן', status: 'approved' },
    ],
    content_topic_ideas: [
      idea('i1', 'p1', 'u1', 'מה לראות בקנזאווה', 0.99),
      idea('i7', 'p1', 'u1', 'דף נחיתה לטיולים', 0.98, { link_plan: { recommendedPageType: 'landing' } }),
      idea('i2', 'p1', 'u1', 'האקונה למשפחות', 0.8),
      idea('i3', 'p1', 'u1', 'אונסן פרטי ביפן', 0.7),
      idea('i4', 'p1', 'u1', 'אונסנים פרטיים ביפן', 0.6),
      idea('i5', 'p1', 'u1', 'טיול מאורגן ליפן לזוגות', 0.5, { source: 'keyword_research_url' }),
      idea('i6', 'p1', 'u1', 'שופינג באוסקה', 0.4),
      idea('j1', 'p2', 'u1', 'גינון בחורף', 0.9),
      idea('j2', 'p2', 'u1', 'השקיה חכמה', 0.8),
      idea('j3', 'p2', 'u1', 'דשן אורגני', 0.7),
      idea('k1', 'p3', 'u2', 'נושא של בעלים אחר', 0.9),
    ],
    generated_articles: [], subscriptions: [], usage_reservations: [], ai_usage_logs: [],
  }
}

function deps(over: Partial<TopUpDeps> = {}, calls: { generate: string[]; modelAsked: string[] } = { generate: [], modelAsked: [] }): Partial<TopUpDeps> {
  return {
    now: () => T0,
    entitlement: async (userId) => (userId === 'u1' ? { entitled: true, monthlyArticles: 4 } : { entitled: false, monthlyArticles: 4 }),
    modelAllowed: async (userId) => { calls.modelAsked.push(userId); return true },
    loadIndex: async () => buildOverlapIndex(SITE),
    generate: async (scope) => { calls.generate.push(scope.projectId); return { suggestions: [], modelUsed: null } },
    ...over,
  }
}

/** The index as the real loader would build it from this fake database: the site, plus the project's topics and ideas. */
const indexFrom = (fa: FakeAdmin) => async (scope: { projectId: string; userId: string }) => buildOverlapIndex({
  ...SITE,
  topics: (fa.tables.article_topics ?? []).filter((r) => r.project_id === scope.projectId && r.user_id === scope.userId)
    .map((r) => ({ id: String(r.id), topic: String(r.topic), primaryKeyword: (r.primary_keyword as string) ?? null, status: String(r.status) })),
  ideas: (fa.tables.content_topic_ideas ?? []).filter((r) => r.project_id === scope.projectId && r.user_id === scope.userId)
    .map((r) => ({ id: String(r.id), title: String(r.title), primaryKeyword: (r.primary_keyword as string) ?? null, status: String(r.status) })),
})

async function capture<T>(fn: () => Promise<T>): Promise<{ value: T; lines: string[] }> {
  const lines: string[] = []
  const log = console.log, err = console.error, warn = console.warn
  console.log = (...a: unknown[]) => { lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')) }
  console.error = console.log; console.warn = console.log
  try { return { value: await fn(), lines } } finally { console.log = log; console.error = err; console.warn = warn }
}

async function main() {
  console.log('M) the math')
  check('a pool on two weekdays publishes 9 in 30 days; weekly 5; daily 30', poolMonthlyRate({ id: 'x', cadence: 'weekly', interval_days: null, publish_days: [1, 4] }) === 9
    && poolMonthlyRate({ id: 'x', cadence: 'weekly', interval_days: null, publish_days: null }) === 5
    && poolMonthlyRate({ id: 'x', cadence: 'daily', interval_days: null, publish_days: null }) === 30)
  const pool = { id: 'x', cadence: 'weekly', interval_days: null, publish_days: [1, 4] }
  check('the regular plan (4 a month) with a pool on two weekdays: 4', topUpTarget({ monthlyArticles: 4, ownerProjects: 2, pool }) === 4)
  check('a weekly pool on a large plan: what the pool publishes (5)', topUpTarget({ monthlyArticles: 50, ownerProjects: 1, pool: { ...pool, publish_days: null } }) === 5)
  check('no pool: the project\'s share of the plan (12 over 3 projects = 4)', topUpTarget({ monthlyArticles: 12, ownerProjects: 3, pool: null }) === 4)
  check('capped at 12 a project; at least 1; nothing without articles', topUpTarget({ monthlyArticles: 200, ownerProjects: 1, pool: { ...pool, cadence: 'daily', publish_days: null } }) === 12
    && topUpTarget({ monthlyArticles: 4, ownerProjects: 9, pool: null }) === 1 && topUpTarget({ monthlyArticles: 0, ownerProjects: 1, pool: null }) === 0)
  check('the window: 07:00 is slot 0, 07:15 slot 1, 08:59 slot 7; 06:59 and 09:00 outside',
    windowSlot(Date.parse('2026-09-29T07:00:00Z')) === 0 && windowSlot(Date.parse('2026-09-29T07:15:00Z')) === 1
    && windowSlot(Date.parse('2026-09-29T08:59:59Z')) === 7 && windowSlot(Date.parse('2026-09-29T06:59:59Z')) === -1 && windowSlot(Date.parse('2026-09-29T09:00:00Z')) === -1)

  console.log('\nG) the gates come before any read')
  for (const [name, env, now, state] of [
    ['kill switch', { ...PROD, CONTENT_TOPUP_DISABLED: '1' }, T0, 'disabled'],
    ['Preview', { VERCEL_ENV: 'preview' }, T0, 'not_production'],
    ['local (no VERCEL_ENV)', {}, T0, 'not_production'],
    ['06:59 UTC', PROD, Date.parse('2026-09-29T06:59:00Z'), 'outside_window'],
    ['13:00 UTC', PROD, Date.parse('2026-09-29T13:00:00Z'), 'outside_window'],
  ] as const) {
    const t = tracked(new FakeAdmin(world()))
    const { value, lines } = await capture(() => runTopicTopUp(t.admin, { env: env as Record<string, string>, deadlineAt: T0 + 280_000, deps: deps({ now: () => now }) }))
    check(`${name}: ${state}, not one read, not one line`, value.state === state && t.froms.length === 0 && lines.length === 0, `${value.state} reads=${t.froms.length}`)
  }

  console.log('\nR) one run')
  const calls = { generate: [] as string[], modelAsked: [] as string[] }
  const t = tracked(new FakeAdmin(world()))
  const before = JSON.parse(JSON.stringify(t.fa.tables)) as Record<string, Row[]>
  const { value: s1, lines: l1 } = await capture(() => runTopicTopUp(t.admin, { env: PROD, deadlineAt: T0 + 280_000, deps: deps({}, calls) }))
  const tb = t.fa.tables
  const p1Ideas = (id: string) => tb.content_topic_ideas.find((r) => r.id === id)!
  const promotedP1 = ['i2', 'i3', 'i5'].map(p1Ideas)
  check('p1 (active pool, 1 waiting, target 4): 3 ideas become approved topics, best first, articles only',
    promotedP1.every((r) => r.status === 'approved' && r.source_context === TOPUP_SOURCE_CONTEXT && typeof r.approved_topic_id === 'string'),
    JSON.stringify(tb.content_topic_ideas.filter((r) => r.project_id === 'p1').map((r) => [r.id, r.status])))
  check('…the site\'s subject (קנזאווה) and the in-run near-duplicate (אונסנים פרטיים) are skipped; a landing page is not an article',
    p1Ideas('i1').status === 'pending' && p1Ideas('i4').status === 'pending' && p1Ideas('i7').status === 'pending' && p1Ideas('i6').status === 'pending')
  const newItems = tb.article_pool_items.filter((r) => !['it1', 'it2'].includes(String(r.id)))
  check('…and join the ACTIVE pool\'s queue after its last position, as queued items with no article',
    newItems.length === 3 && newItems.every((r) => r.pool_id === 'pool1' && r.status === 'queued' && r.article_id === null && r.user_id === 'u1' && r.project_id === 'p1')
    && newItems.map((r) => r.position).join(',') === '6,7,8', JSON.stringify(newItems.map((r) => r.position)))
  const topicOf = (ideaId: string) => tb.article_topics.find((r) => r.id === p1Ideas(ideaId).approved_topic_id)!
  check('the topics carry the idea\'s brief: title, keyword, reason, score, word count, the angle; the source mapped',
    topicOf('i2').topic === 'האקונה למשפחות' && topicOf('i2').status === 'approved' && topicOf('i2').source === 'project_data' && topicOf('i5').source === 'keyword_research_url'
    && topicOf('i2').suggestion_reason === 'סיבה' && topicOf('i2').desired_word_count === 1200 && String(topicOf('i2').brief_notes ?? '').includes('זווית') && topicOf('i2').language === 'he')
  const p2Topics = tb.article_topics.filter((r) => r.project_id === 'p2')
  check('p2 (no pool, its share 4/2 = 2): two approved topics, planned only, nothing queued',
    p2Topics.length === 2 && tb.article_pool_items.every((r) => r.project_id !== 'p2'), String(p2Topics.length))
  check('p3 (owner not entitled) and p4 (inactive project) are untouched',
    tb.content_topic_ideas.find((r) => r.id === 'k1')!.status === 'pending' && !t.writes.some((w) => JSON.stringify(w.payload).includes('"p3"') || JSON.stringify(w.payload).includes('"p4"') || JSON.stringify(w.payload).includes('pool4')))
  const tables = new Set(t.writes.map((w) => `${w.table}.${w.op}`))
  check('it writes only ideas, topics and queue items; never deletes', [...tables].every((x) => ['content_topic_ideas.update', 'article_topics.insert', 'article_pool_items.insert'].includes(x)), [...tables].join(','))
  check('no article, quota, subscription, usage, pool setting or project changed',
    ['generated_articles', 'subscriptions', 'usage_reservations', 'ai_usage_logs', 'article_pools', 'projects'].every((k) => JSON.stringify(tb[k]) === JSON.stringify(before[k])))
  check('…and the merchant\'s own topic and queue item are as they were',
    JSON.stringify(tb.article_topics.find((r) => r.id === 'old1')) === JSON.stringify(before.article_topics[0]) && JSON.stringify(tb.article_pool_items.slice(0, 2)) === JSON.stringify(before.article_pool_items))
  check('no model: the plan\'s own ideas were enough', calls.generate.length === 0 && s1.modelProjects === 0)
  check('the summary counts it', s1.state === 'ran' && s1.promoted === 5 && s1.queued === 3 && s1.notEntitled === 1 && s1.skippedOverlap >= 2, JSON.stringify(s1))
  check('one log line, with counts and no titles', l1.length === 1 && l1[0].startsWith('[topic-topup] run') && !l1[0].includes('האקונה'), l1.join(' | '))

  console.log('\nI) idempotent')
  const writesBefore = t.writes.length
  const { value: s2, lines: l2 } = await capture(() => runTopicTopUp(t.admin, { env: PROD, deadlineAt: T0 + 280_000, deps: deps({}, calls) }))
  check('a second run finds enough everywhere: no write, no line', t.writes.length === writesBefore && s2.promoted === 0 && s2.enough === 2 && l2.length === 0, JSON.stringify(s2))
  const race = tracked(new FakeAdmin(world()))
  await capture(() => Promise.all([
    runTopicTopUp(race.admin, { env: PROD, deadlineAt: T0 + 280_000, deps: deps() }),
    runTopicTopUp(race.admin, { env: PROD, deadlineAt: T0 + 280_000, deps: deps() }),
  ]))
  const rt = race.fa.tables
  const approvedIds = rt.content_topic_ideas.filter((r) => r.status === 'approved').map((r) => String(r.approved_topic_id))
  const autoTopics = rt.article_topics.filter((r) => r.id !== 'old1')
  check('two overlapping runs: every idea at most once, one topic per claimed idea', new Set(approvedIds).size === approvedIds.length && autoTopics.length === approvedIds.length
    && autoTopics.every((tp) => approvedIds.includes(String(tp.id))), `${approvedIds.length} ideas, ${autoTopics.length} topics`)
  const waiting = rt.article_pool_items.filter((r) => r.pool_id === 'pool1' && ['queued', 'scheduled', 'generated'].includes(String(r.status))).length
  check('…and the queue stays near its target (never more than one over per run)', waiting <= 4 + 1, String(waiting))

  console.log('\nF) failures')
  const broken = tracked(new FakeAdmin(world(), { article_topics: { insert: () => ({ code: '23514' }) } }))
  const { value: sf, lines: lf } = await capture(() => runTopicTopUp(broken.admin, { env: PROD, deadlineAt: T0 + 280_000, deps: deps() }))
  const bt = broken.fa.tables.content_topic_ideas
  check('a topic that cannot be inserted gives its idea back to the plan, exactly as it was',
    bt.every((r) => r.status === 'pending' && r.source_context === null && r.approved_topic_id === null) && sf.failures > 0 && broken.fa.tables.article_pool_items.length === 2, JSON.stringify(sf))
  check('…and the line says only counts', lf.length === 1 && !/23514|constraint/.test(lf[0]), lf.join(' | '))
  const entErr = tracked(new FakeAdmin(world()))
  const { value: se } = await capture(() => runTopicTopUp(entErr.admin, { env: PROD, deadlineAt: T0 + 280_000, deps: deps({ entitlement: async () => { throw new Error('db down') } }) }))
  check('an entitlement that cannot be read is "not entitled": nothing written', se.notEntitled === 3 && entErr.writes.length === 0, JSON.stringify(se))
  const foreign = world()
  foreign.article_pools[0].user_id = 'u9'
  const fp = tracked(new FakeAdmin(foreign))
  await capture(() => runTopicTopUp(fp.admin, { env: PROD, deadlineAt: T0 + 280_000, deps: deps() }))
  check('a pool that is not its project owner\'s: the project is left alone', !fp.writes.some((w) => JSON.stringify(w.payload).includes('pool1')) && fp.fa.tables.content_topic_ideas.filter((r) => r.project_id === 'p1').every((r) => r.status === 'pending'))
  const late = await capture(() => startIsolatedTopUp(async () => { throw new Error('secret db text') }, { startedAtMs: Date.now(), maxDurationMs: 300_000 }))
  check('the isolated start never throws, and its line names the error\'s kind only', late.lines.length === 1 && late.lines[0].includes('[topic-topup] failed') && !late.lines[0].includes('secret'), late.lines.join(' | '))
  let ran = false
  const none = await capture(() => startIsolatedTopUp(async () => { ran = true }, { startedAtMs: Date.now() - 295_000, maxDurationMs: 300_000 }))
  check('with the cron\'s time used up it does not start', !ran && none.lines.length === 0)

  console.log('\nX) the model, for a project whose plan ran dry')
  const dry = () => { const w = world(); w.content_topic_ideas = w.content_topic_ideas.filter((r) => r.project_id !== 'p1'); return w }
  const fresh: GeneratedIdeas = {
    modelUsed: 'm', suggestions: [
      { title: 'מה לראות בקנזאווה בסתיו', primaryKeyword: 'קנזאווה' },
      { title: 'טירות ביפן', primaryKeyword: 'טירות ביפן' },
      { title: 'טירה יפנית עתיקה', primaryKeyword: 'טירות ביפן' },
      { title: 'רכבות ביפן: המדריך', primaryKeyword: 'רכבות ביפן' },
      { title: 'גני תה בקיוטו', primaryKeyword: 'גני תה בקיוטו' },
    ].map((s) => ({ ...s, secondaryKeywords: [], searchIntent: 'informational', angle: '', suggestionReason: 'r', suggestionScore: 0.5, recommendedPageType: 'article', source: 'hybrid' })) as unknown as GeneratedIdeas['suggestions'],
  }
  const m1 = { generate: [] as string[], modelAsked: [] as string[] }
  const x1 = tracked(new FakeAdmin(dry()))
  const { value: sx } = await capture(() => runTopicTopUp(x1.admin, { env: PROD, deadlineAt: T0 + 280_000, deps: deps({ loadIndex: indexFrom(x1.fa), generate: async (sc) => { m1.generate.push(sc.projectId); return fresh } }, m1) }))
  const newIdeas = x1.fa.tables.content_topic_ideas.filter((r) => r.project_id === 'p1')
  check('one batch, for one project, after the existing AI gate said yes', m1.generate.join() === 'p1' && m1.modelAsked.join() === 'u1' && sx.modelProjects === 1)
  check('its duplicates of the site, the plan and each other are never stored', newIdeas.map((r) => r.title).sort().join('|') === ['גני תה בקיוטו', 'טירות ביפן'].sort().join('|'), newIdeas.map((r) => r.title).join('|'))
  check('…the new ideas refill the queue like any idea, and are marked as the top-up\'s', newIdeas.every((r) => r.status === 'approved' && r.source_context === TOPUP_SOURCE_CONTEXT)
    && x1.fa.tables.article_pool_items.filter((r) => r.status === 'queued').length === 3)
  for (const [name, now, over] of [
    ['07:05 (the first quarter hour, when both schedulers fire)', Date.parse('2026-09-29T07:05:00Z'), {}],
    ['the AI gate says no', T0, { modelAllowed: async () => false }],
  ] as const) {
    const m = { generate: [] as string[], modelAsked: [] as string[] }
    const x = tracked(new FakeAdmin(dry()))
    await capture(() => runTopicTopUp(x.admin, { env: PROD, deadlineAt: now + 280_000, deps: { ...deps({ now: () => now, generate: async (sc) => { m.generate.push(sc.projectId); return fresh } }, m), ...over } }))
    check(`${name}: no model`, m.generate.length === 0)
  }
  {
    const m = { generate: [] as string[], modelAsked: [] as string[] }
    const x = tracked(new FakeAdmin(dry()))
    await capture(() => runTopicTopUp(x.admin, { env: PROD, deadlineAt: T0 + MIN_MS_FOR_MODEL - 1_000, deps: deps({ generate: async (sc) => { m.generate.push(sc.projectId); return fresh } }, m) }))
    check('under 150 seconds left: no model', m.generate.length === 0)
  }

  sourceGuards()
  await provenance()
}

function sourceGuards() {
  console.log('\nS) source guards')
  const CRON = 'app/api/content/automation/cron/route.ts'
  const cron = code(CRON)
  const cronOk = (s: string) => {
    const resume = s.indexOf('await startIsolatedSeedResume(')
    const topup = s.indexOf('await startIsolatedTopUp(')
    const wrapper = topup > 0 ? s.slice(topup, topup + 260) : ''
    return resume > 0 && topup > resume
      && s.split('runTopicTopUp(').length - 1 === 1
      && wrapper.includes('(deadlineAt) => runTopicTopUp(createAdminClient(), { env: process.env, deadlineAt })')
      && wrapper.includes('{ startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 }')
      && s.indexOf("const denied = authorizeCronRequest(request, 'automation-cron')") < s.indexOf('after(async () => {')
  }
  check('S1 the cron runs it last (after the runner and the seed resume), isolated, in its own time budget, behind the cron secret', cronOk(cron))
  const BLOCK = '    await startIsolatedTopUp(\n      (deadlineAt) => runTopicTopUp(createAdminClient(), { env: process.env, deadlineAt }),\n      { startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 },\n    )\n'
  const moved = cron.replace(BLOCK, '').replace('  after(async () => {\n', `  after(async () => {\n${BLOCK}`)
  check('S1 MUTATION CONTROL: the top-up before the runner is caught', moved !== cron && !cronOk(moved))
  check('S1 MUTATION CONTROL: a direct, unisolated call is caught', !cronOk(cron.replace(BLOCK, '    await runTopicTopUp(createAdminClient(), { env: process.env, deadlineAt: 0 })\n')))
  const everywhere = ['app', 'lib'].length && readSrc(CRON)
  check('S1b nothing else starts it (the cron route is its only caller)', !!everywhere && onlyCaller())
  const vercel = JSON.parse(readSrc('vercel.json')) as { crons: { path: string; schedule: string }[] }
  const cronsOk = (v: typeof vercel) => v.crons.length === 4 && v.crons.some((c) => c.path === '/api/content/automation/cron' && c.schedule === '0 7 * * *') && !v.crons.some((c) => /topup|topic/i.test(c.path))
  check('S2 no new cron schedule: the automation cron at 07:00 carries it', cronsOk(vercel))
  check('S2 MUTATION CONTROL: a new cron is caught', !cronsOk({ crons: [...vercel.crons, { path: '/api/content/topics/topup', schedule: '0 7 * * *' }] }))
  const topup = code('lib/content/automation/topic-topup.ts')
  const tableOffenders = (s: string): string[] => {
    const out: string[] = []
    const allowed = new Set(['projects', 'article_pools', 'article_pool_items', 'content_topic_ideas', 'article_topics'])
    for (const m of s.matchAll(/\.from\('([a-z_]+)'\)/g)) if (!allowed.has(m[1])) out.push(m[1])
    for (const m of s.matchAll(/\.from\('([a-z_]+)'\)\s*\.(insert|update|upsert|delete)\(/g)) {
      if (m[2] === 'delete' || !['content_topic_ideas', 'article_topics', 'article_pool_items'].includes(m[1])) out.push(`${m[1]}.${m[2]}`)
    }
    if (/\.rpc\(|reserve_usage|finalize_article_generation|generateArticle|publish/i.test(s.replace(/publish_days/g, ''))) out.push('generation, usage or publishing')
    if (/lib\/shopify|billing|paypal/i.test(s)) out.push('billing or Shopify')
    return out
  }
  const off = tableOffenders(topup)
  check('S3 it reads five tables, writes ideas, topics and queue items, never generates, reserves usage, publishes or touches billing', off.length === 0, off.join(', '))
  check('S3 MUTATION CONTROL: a write to subscriptions is caught', tableOffenders(topup + "\nadmin.from('subscriptions').update({})").length > 0)
  check('S3 MUTATION CONTROL: deleting an idea is caught', tableOffenders(topup + "\nadmin.from('content_topic_ideas').delete()").length > 0)
  const fn = topup.slice(topup.indexOf('export async function runTopicTopUp('))
  const gatesOk = (f: string) => {
    const first = f.indexOf('admin.from(')
    const k = f.indexOf("options.env.CONTENT_TOPUP_DISABLED === '1'"), p = f.indexOf("options.env.VERCEL_ENV !== 'production'"), w = f.indexOf("if (slot < 0) return EMPTY('outside_window')")
    return k >= 0 && p > k && w > p && first > w
  }
  check('S4 kill switch, Production, window: all before the first read', gatesOk(fn))
  check('S4 MUTATION CONTROL: a run outside Production is caught', !gatesOk(fn.replace("if (options.env.VERCEL_ENV !== 'production') return EMPTY('not_production')", '')))
  const modelOk = (f: string) => /if \(slot > 0 && stillShort\.length > 0\)/.test(f) && /timeLeft >= MIN_MS_FOR_MODEL && summary\.modelProjects < MODEL_PROJECTS_PER_RUN/.test(f)
    && f.indexOf('await deps.modelAllowed(scope.userId)') > 0 && f.indexOf('await deps.modelAllowed(scope.userId)') < f.indexOf('await deps.generate(scope)')
  check('S5 the model: not in the first quarter hour, one project, time left, the AI gate first', modelOk(fn))
  check('S5 MUTATION CONTROL: a model call without the AI gate is caught', !modelOk(fn.replace('if (await deps.modelAllowed(scope.userId)) {', 'if (true) {')))
  const entOk = (s: string) => /entitled: e\.isAdmin \|\| e\.hasActiveSubscription, monthlyArticles: e\.limits\.maxArticlesPerPeriodAccountWide/.test(s) && /getUserEntitlement\(userId, admin/.test(s) && /assertContentGenerationAllowedForUser\(admin, userId\)/.test(s)
  check('S6 entitlement from the existing checks, read only (trial and unpaid owners skipped)', entOk(topup))
  check('S6 MUTATION CONTROL: letting trials in is caught', !entOk(topup.replace('e.isAdmin || e.hasActiveSubscription', 'e.isAdmin || e.hasActiveSubscription || e.trialActive')))
  const claimOk = (s: string) => /\.update\(\{ status: 'approved', approved_at: nowIso, source_context: TOPUP_SOURCE_CONTEXT, updated_at: nowIso \}\)\s*\.eq\('id', idea\.id\)\.eq\('project_id', scope\.projectId\)\.eq\('user_id', scope\.userId\)\.eq\('status', 'pending'\)/.test(s)
  check('S7 an idea is claimed only while still pending, by its project and owner', claimOk(topup))
  check('S7 MUTATION CONTROL: an unconditional claim is caught', !claimOk(topup.replace(".eq('user_id', scope.userId).eq('status', 'pending')\n    .select('id')", ".eq('user_id', scope.userId)\n    .select('id')")))
}

function onlyCaller(): boolean {
  const out = execSync("grep -rl --include=*.ts --include=*.tsx 'runTopicTopUp' app lib components || true", { cwd: ROOT, encoding: 'utf8' })
  const files = out.split('\n').filter(Boolean).filter((f) => !f.includes('__qa__')).sort()
  return files.join(',') === 'app/api/content/automation/cron/route.ts,lib/content/automation/topic-topup.ts'
}

async function provenance() {
  console.log('\nP) where the new topics came from, on the strategy tab')
  const fa = new FakeAdmin({
    content_topic_ideas: [
      { id: 'i1', project_id: 'p1', user_id: 'u1', status: 'approved', approved_topic_id: 't1', suggestion_reason: 'r1', source: 'site_scan', source_context: TOPUP_SOURCE_CONTEXT, approved_at: '2026-09-29T07:20:00Z', title: 'x', created_at: '2026-09-01' },
      { id: 'i2', project_id: 'p1', user_id: 'u1', status: 'approved', approved_topic_id: 't2', suggestion_reason: 'r2', source: 'hybrid', source_context: null, approved_at: '2026-09-29T07:20:00Z', title: 'y', created_at: '2026-09-01' },
      { id: 'i3', project_id: 'p1', user_id: 'u9', status: 'approved', approved_topic_id: 't3', source_context: TOPUP_SOURCE_CONTEXT, approved_at: '2026-09-29T07:20:00Z', title: 'z', created_at: '2026-09-01' },
    ],
    article_topics: [
      { id: 't1', project_id: 'p1', user_id: 'u1', topic: 'האקונה למשפחות', status: 'approved', source: 'project_data', created_at: '2026-09-29' },
      { id: 't2', project_id: 'p1', user_id: 'u1', topic: 'נושא שאישרתם', status: 'approved', source: 'project_data', created_at: '2026-09-29' },
      { id: 't3', project_id: 'p1', user_id: 'u1', topic: 'נושא אחר', status: 'approved', source: 'manual', created_at: '2026-09-29' },
    ],
    generated_articles: [],
  })
  const res = await handleStrategyGet(new Request('http://localhost/api/content/strategy?projectId=p1'), {
    enabled: () => true,
    auth: async () => ({ admin: fa as never, project: { id: 'p1', user_id: 'u1' }, user: { id: 'u1' } }),
  } as never)
  const body = await res.json() as { ok: boolean; topics: StrategyTopic[] }
  const byId = new Map(body.topics.map((tp) => [tp.id, tp]))
  check('the route marks the top-up\'s topic (when, and the plan\'s source), and only it', byId.get('t1')?.autoPrepared?.source === 'site_scan' && byId.get('t1')?.autoPrepared?.at === '2026-09-29T07:20:00Z'
    && !byId.get('t2')?.autoPrepared && !byId.get('t3')?.autoPrepared, JSON.stringify(body.topics))
  const now = new Date('2026-09-30T10:00:00')
  const topics: StrategyTopic[] = [
    { id: 'a', title: 'A', primaryKeyword: null, status: 'approved', source: 'project_data', reason: null, createdAt: '2026-09-29', autoPrepared: { at: '2026-09-29T07:20:00Z', source: 'keyword_research_url' } },
    { id: 'b', title: 'B', primaryKeyword: null, status: 'approved', source: 'project_data', reason: null, createdAt: '2026-08-29', autoPrepared: { at: '2026-08-29T07:20:00Z', source: 'hybrid' } },
    { id: 'c', title: 'C', primaryKeyword: null, status: 'used', source: 'project_data', reason: null, createdAt: '2026-09-29', autoPrepared: { at: '2026-09-29T07:20:00Z', source: 'hybrid' } },
    { id: 'd', title: 'D', primaryKeyword: null, status: 'approved', source: 'manual', reason: null, createdAt: '2026-09-29' },
    { id: 'e', title: 'E', primaryKeyword: null, status: 'approved', source: 'project_data', reason: null, createdAt: '2026-09-29', autoPrepared: { at: '2026-09-30T07:20:00Z', source: 'site_scan' } },
  ]
  const shown = preparedThisMonth(topics, new Set(['e']), now)
  check('the notice lists this month\'s, not yet written, newest first; not last month\'s, not the merchant\'s own', shown.map((p) => p.id).join() === 'a' && shown[0].origin === 'research',
    shown.map((p) => p.id).join())
  check('origins read in three words the merchant knows', topUpOrigin('site_scan') === 'scan' && topUpOrigin('hybrid') === 'scan' && topUpOrigin('keyword') === 'keywords' && topUpOrigin('project_data') === 'plan')
  check('closing it is remembered per project and month', topUpDismissKey('p1', now) === 'gotop:topup-notice:p1:2026-09')
  const he = dashboardHe.contentStrategy.topup, en = dashboardEn.contentStrategy.topup
  check('the owner\'s title, in Hebrew; English beside it; the same keys', he.title === 'נושאים חדשים שהכנו לכם החודש' && en.title === 'New topics we prepared for you this month'
    && JSON.stringify(Object.keys(he).sort()) === JSON.stringify(Object.keys(en).sort()) && JSON.stringify(Object.keys(he.origins).sort()) === JSON.stringify(Object.keys(en.origins).sort()))
  const heTexts = [he.title, he.body, he.bodyOne, ...Object.values(he.origins)]
  check('Hebrew is fully Hebrew', heTexts.every((v) => !/[A-Za-z]/.test(v.replace('{count}', ''))))
  const notice = code('components/content-strategy/TopUpNotice.tsx')
  const noticeOk = (s: string) => /preparedThisMonth\(data\.topics, written, now\)/.test(s) && /try \{ return window\.localStorage\.getItem\(key\) === '1' \} catch \{ return false \}/.test(s) && /try \{ window\.localStorage\.setItem\(key, '1'\) \} catch/.test(s)
  check('the notice: only this month\'s, and browser storage never breaks it', noticeOk(notice) && /<TopUpNotice data=\{strategy\.data\} projectId=\{projectId\} dict=\{dict\} \/>/.test(code('components/content-strategy/ContentStrategyScreen.tsx')))
  check('MUTATION CONTROL: unguarded storage is caught', !noticeOk(notice.replace("try { return window.localStorage.getItem(key) === '1' } catch { return false }", "return window.localStorage.getItem(key) === '1'")))
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}).catch((e) => { console.error(e); process.exit(1) })

export {}

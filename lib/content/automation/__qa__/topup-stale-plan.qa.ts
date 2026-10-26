/**
 * THE MONTHLY TOP-UP STOPS LIVING OFF OLD STOCK (18 October 2026).
 *
 * The refill reads the plan's ideas first, free, and asks the model only when they run
 * out. A plan with hundreds of ideas never runs out: on 18 Oct 2026 fourteen active
 * projects had no idea newer than 10 July 2026 and were still being given a topic a
 * day, every one of them from that July batch — written before the relevance rules,
 * the business profile and the site mapping improved.
 *
 *   A) a plan that holds nothing newer than STALE_IDEA_DAYS gets the model's batch
 *      even though its target was met, and the new ideas land in the plan;
 *   B) a plan with fresh ideas asks no model, exactly as before;
 *   C) a plan that ran dry still comes first for the model (an empty queue stops
 *      publishing, which is more urgent than fresh research);
 *   D) the old ideas are left where they are: nothing is deleted or rejected, and
 *      they are still promoted, so no queue runs dry for this;
 *   E) within one refill, a fresh idea is promoted before an older one with a
 *      higher score;
 *   F) the guards: the kill switch, Production, the window, the AI gate and the
 *      one-project-a-run cap still come first, and an unreadable count behaves
 *      exactly as before.
 *
 * Every guard has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/content/automation/__qa__/topup-stale-plan.qa.ts
 */
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import { runTopicTopUp, STALE_IDEA_DAYS, type TopUpDeps, type TopUpSummary } from '../topic-topup'
import { buildOverlapIndex, type OverlapIndexData } from '../../cannibalization/check'
import type { TopicSuggestion } from '../../recommendations/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Row = Record<string, unknown>
const T0 = Date.parse('2026-10-18T07:20:00Z') // slot 1 of the window
const PROD = { VERCEL_ENV: 'production' }
const DAY = 24 * 60 * 60 * 1000
const OLD = new Date(T0 - (STALE_IDEA_DAYS + 10) * DAY).toISOString()
const NEW = new Date(T0 - 3 * DAY).toISOString()

/** Six unrelated subjects: the overlap check must not call them duplicates of each other. */
const OLD_TITLES = ['מזרן לכלבים', 'חטיפי קולגן', 'קרן צבי ללעיסה', 'שמפו יבש', 'רתמת הליכה', 'קערה איטית']
const FRESH_TITLES = ['ביטנה לכלוב', 'צינון בקיץ', 'משחק אינטליגנציה']

const SITE: OverlapIndexData = { homeHosts: ['4dogsoriginal.co.il'], pages: [], articles: [], gsc: [], topics: [], ideas: [] }

const idea = (id: string, project: string, title: string, score: number, createdAt: string): Row => ({
  id, project_id: project, user_id: 'u1', title, primary_keyword: title, secondary_keywords: [], search_intent: 'informational',
  angle: null, recommended_word_count: null, suggestion_reason: null, score, source: 'hybrid', link_plan: null,
  status: 'pending', source_context: null, approved_topic_id: null, created_at: createdAt,
})

/** One owner, one active project with an active pool, and the ideas the case needs. */
function world(ideas: Row[]): Record<string, Row[]> {
  return {
    projects: [{ id: 'p1', user_id: 'u1', language: 'he', is_active: true, created_at: '2026-07-01' }],
    article_pools: [{ id: 'pool1', project_id: 'p1', user_id: 'u1', is_active: true, cadence: 'weekly', interval_days: null, publish_days: [1, 4] }],
    article_pool_items: [],
    article_topics: [],
    content_topic_ideas: ideas,
    generated_articles: [], subscriptions: [], usage_reservations: [], ai_usage_logs: [],
  }
}

const suggestion = (title: string): TopicSuggestion => ({
  title, primaryKeyword: title, secondaryKeywords: [], searchIntent: 'informational', suggestionReason: 'טרי',
  score: 0.5, recommendedWordCount: 900, articleAngle: null, recommendedPageType: 'article',
} as unknown as TopicSuggestion)

function deps(fa: FakeAdmin, calls: { generate: string[] }, over: Partial<TopUpDeps> = {}): Partial<TopUpDeps> {
  return {
    now: () => T0,
    entitlement: async () => ({ entitled: true, monthlyArticles: 4 }),
    modelAllowed: async () => true,
    loadIndex: async () => buildOverlapIndex(SITE),
    siteVocab: async () => new Set<string>(),
    generate: async (scope) => { calls.generate.push(scope.projectId); return { suggestions: [suggestion('מזרן אורתופדי לכלבים')], modelUsed: 'test' } },
    ...over,
  }
}

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const log = console.log, err = console.error, warn = console.warn
  console.log = () => {}; console.error = () => {}; console.warn = () => {}
  try { return await fn() } finally { console.log = log; console.error = err; console.warn = warn }
}

const run = async (fa: FakeAdmin, calls: { generate: string[] }, over: Partial<TopUpDeps> = {}): Promise<TopUpSummary> =>
  quiet(() => runTopicTopUp(fa as never, { env: PROD, deadlineAt: T0 + 280_000, deps: deps(fa, calls, over) }))

async function main() {
  console.log('The monthly top-up and a plan of old ideas')

  // ── A) old stock only ───────────────────────────────────────────────────
  console.log('\nA) a plan whose newest idea is old stock')
  {
    const old = OLD_TITLES.map((t, n) => idea(`o${n + 1}`, 'p1', t, 0.9 - n / 100, OLD))
    const fa = new FakeAdmin(world(old))
    const calls = { generate: [] as string[] }
    const s = await run(fa, calls)
    check('A1: the target was met from the plan', s.promoted > 0 && s.queued > 0, JSON.stringify(s))
    // 26 Oct 2026 — six ideas against a target of four leave two for the merchant to
    // approve, which is less than a month, so this plan is now counted as a THIN plan
    // and the model runs for that reason first (topup-idea-stock.qa.ts). The old-stock
    // rule still decides where a plan holds a month of ideas, as B) below proves.
    check('A2: the run names it a plan with nothing left to approve', s.thinPlans === 1, JSON.stringify(s))
    check('A3: the model was asked anyway, for that project', calls.generate.length === 1 && calls.generate[0] === 'p1')
    check('A4: the fresh ideas are in the plan for the next months',
      (fa.tables.content_topic_ideas ?? []).some((r) => r.title === 'מזרן אורתופדי לכלבים' && r.status === 'pending'))
    check('A5: not one old idea was deleted or rejected',
      (fa.tables.content_topic_ideas ?? []).filter((r) => String(r.id).startsWith('o')).length === 6
      && !(fa.tables.content_topic_ideas ?? []).some((r) => r.status === 'rejected'))
    // MUTATION CONTROL A — the very same plan, dated within the window, is the old
    // behaviour: its target is met and nothing asks the model.
    // MUTATION CONTROL A — a month's worth of ideas, dated within the window: not old
    // stock, nothing thin, and no model. Dating the SAME ideas before the window is
    // what makes the run ask, which is the rule under test.
    const monthOfIdeas = (when: string) => [...OLD_TITLES, ...FRESH_TITLES].map((t, n) => idea(`m${n + 1}`, 'p1', `${t} לכל ימות השנה`, 0.5 - n / 100, when))
    const faB = new FakeAdmin(world(monthOfIdeas(NEW)))
    const callsB = { generate: [] as string[] }
    const sB = await run(faB, callsB)
    check('A2-MUT: the same ideas dated today are not old stock and ask no model',
      sB.stalePlans === 0 && sB.thinPlans === 0 && callsB.generate.length === 0, JSON.stringify(sB))
    const faC = new FakeAdmin(world(monthOfIdeas(OLD)))
    const callsC = { generate: [] as string[] }
    const sC = await run(faC, callsC)
    check('A2-MUT2: dated before the window, the very same plan IS old stock and asks',
      sC.stalePlans === 1 && callsC.generate.length === 1, JSON.stringify(sC))
  }

  // ── B) a fresh plan is untouched ────────────────────────────────────────
  console.log('\nB) a plan with fresh ideas')
  {
    // The steady state after a model batch: more fresh ideas than one month promotes.
    const mixed = [
      ...[...FRESH_TITLES, ...OLD_TITLES].map((t, n) => idea(`f${n + 1}`, 'p1', `${t} לכל ימות השנה`, 0.5 - n / 100, NEW)),
      ...OLD_TITLES.slice(0, 3).map((t, n) => idea(`o${n + 1}`, 'p1', t, 0.9 - n / 100, OLD)),
    ]
    const fa = new FakeAdmin(world(mixed))
    const calls = { generate: [] as string[] }
    const s = await run(fa, calls)
    check('B1: no model, exactly as before', calls.generate.length === 0 && s.modelProjects === 0)
    check('B2: and it is not counted as an old-stock plan', s.stalePlans === 0, JSON.stringify(s))
    check('B3: the fresh ideas are the ones promoted', (fa.tables.article_topics ?? []).every((t) => String(t.topic).includes('לכל ימות השנה')))
  }

  // ── C) a dry plan still comes first ─────────────────────────────────────
  console.log('\nC) a plan that ran dry')
  {
    const fa = new FakeAdmin(world([idea('o1', 'p1', OLD_TITLES[0], 0.9, OLD)]))
    const calls = { generate: [] as string[] }
    const s = await run(fa, calls)
    check('C1: one idea cannot meet the target, so the plan ran dry', s.promoted >= 1, JSON.stringify(s))
    check('C2: the model ran for it', calls.generate.length === 1 && s.modelProjects === 1)
    check('C3: it is the dry plan that was picked, not counted twice', s.stalePlans === 0, String(s.stalePlans))
  }

  // ── D) the old ideas are still used ─────────────────────────────────────
  console.log('\nD) nothing stops publishing for this')
  {
    const old = OLD_TITLES.map((t, n) => idea(`o${n + 1}`, 'p1', t, 0.9 - n / 100, OLD))
    const fa = new FakeAdmin(world(old))
    const calls = { generate: [] as string[] }
    await run(fa, calls)
    const items = fa.tables.article_pool_items ?? []
    check('D1: the queue was filled from the old ideas', items.length > 0 && items.every((r) => r.status === 'queued'), String(items.length))
    check('D2: every queued topic is the project owner\'s own', items.every((r) => r.user_id === 'u1' && r.project_id === 'p1'))
    check('D3: the promoted ideas are marked as the top-up\'s, not deleted',
      (fa.tables.content_topic_ideas ?? []).filter((r) => r.status === 'approved').every((r) => r.source_context === 'auto_topup'))
  }

  // ── E) a fresh idea goes first ──────────────────────────────────────────
  console.log('\nE) order inside the refill')
  {
    const ideas = [
      idea('old-high', 'p1', OLD_TITLES[0], 0.99, OLD),
      idea('fresh-low', 'p1', FRESH_TITLES[0], 0.10, NEW),
    ]
    const fa = new FakeAdmin(world(ideas))
    const calls = { generate: [] as string[] }
    await run(fa, calls)
    const queued = (fa.tables.article_pool_items ?? []).slice().sort((a, b) => Number(a.position) - Number(b.position))
    const topics = fa.tables.article_topics ?? []
    const titleOf = (itemId: unknown) => String(topics.find((t) => t.id === itemId)?.topic ?? '')
    check('E1: the fresh idea is the first topic queued', titleOf(queued[0]?.topic_id) === FRESH_TITLES[0], queued.map((q) => titleOf(q.topic_id)).join(' | '))
    check('E2: the older one with the higher score is still used', topics.some((t) => t.topic === OLD_TITLES[0]), topics.map((t) => t.topic).join('|'))
  }

  // ── F) the guards ───────────────────────────────────────────────────────
  console.log('\nF) the guards still come first')
  {
    const old = OLD_TITLES.map((t, n) => idea(`o${n + 1}`, 'p1', t, 0.9 - n / 100, OLD))
    for (const [name, env, now, state] of [
      ['kill switch', { ...PROD, CONTENT_TOPUP_DISABLED: '1' }, T0, 'disabled'],
      ['Preview', { VERCEL_ENV: 'preview' }, T0, 'not_production'],
      ['06:59 UTC', PROD, Date.parse('2026-10-18T06:59:00Z'), 'outside_window'],
    ] as const) {
      const fa = new FakeAdmin(world(old))
      const calls = { generate: [] as string[] }
      const s = await quiet(() => runTopicTopUp(fa as never, { env: env as Record<string, string>, deadlineAt: T0 + 280_000, deps: deps(fa, calls, { now: () => now }) }))
      check(`F1 (${name}): ${state}, and no model`, s.state === state && calls.generate.length === 0)
    }
    const faSlot0 = new FakeAdmin(world(old))
    const calls0 = { generate: [] as string[] }
    const s0 = await quiet(() => runTopicTopUp(faSlot0 as never, {
      env: PROD, deadlineAt: Date.parse('2026-10-18T07:00:00Z') + 280_000,
      deps: deps(faSlot0, calls0, { now: () => Date.parse('2026-10-18T07:00:00Z') }),
    }))
    check('F2: never in the window\'s first quarter hour', s0.thinPlans === 1 && calls0.generate.length === 0)
    const faGate = new FakeAdmin(world(old))
    const callsG = { generate: [] as string[] }
    const sG = await run(faGate, callsG, { modelAllowed: async () => false })
    check('F3: the existing AI gate is asked first and is final', callsG.generate.length === 0 && sG.modelProjects === 0)
    const faTime = new FakeAdmin(world(old))
    const callsT = { generate: [] as string[] }
    const sT = await quiet(() => runTopicTopUp(faTime as never, { env: PROD, deadlineAt: T0 + 20_000, deps: deps(faTime, callsT) }))
    check('F4: too little time left before the cron\'s deadline: no model', callsT.generate.length === 0 && sT.modelProjects === 0)
    // MUTATION CONTROL F — the stale count must never be the thing that decides to run.
    const faTwo = new FakeAdmin({ ...world(old), projects: [
      { id: 'p1', user_id: 'u1', language: 'he', is_active: true, created_at: '2026-07-01' },
      { id: 'p2', user_id: 'u1', language: 'he', is_active: true, created_at: '2026-07-02' },
    ] })
    const callsTwo = { generate: [] as string[] }
    const sTwo = await run(faTwo, callsTwo)
    check('F5: two old-stock plans, still one model call in the run', sTwo.modelProjects <= 1 && callsTwo.generate.length <= 1, JSON.stringify(sTwo))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}

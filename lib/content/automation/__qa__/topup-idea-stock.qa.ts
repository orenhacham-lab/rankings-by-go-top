/**
 * A MONTH OF IDEAS TO APPROVE, EVEN WHEN THE QUEUE IS FULL (26 October 2026).
 *
 * Oren, in the UX thread: "if topics were created and the customer does not approve
 * them, it must create enough topics for approval to cover the month at least".
 *
 * WHAT WAS WRONG. The top-up measured ONE thing, the publish queue. The plan's pending
 * ideas were its refill SOURCE, never a target of their own, so a project whose queue
 * was covered was skipped after a single count — and a merchant who had rejected every
 * idea we prepared found the strategy tab empty for as long as the queue lasted. On
 * be-cln.co.il that was four queued topics, about a month at its weekly cadence.
 *
 * WHAT THIS PROVES.
 *   A) the queue is full and the plan holds less than a month of ideas → the model is
 *      asked, the new ideas land in the plan as PENDING, and the queue is untouched;
 *   B) the queue is full and the plan holds a month of ideas → nothing happens, exactly
 *      as before (so the rule cannot run away with the model budget);
 *   C) an idea the merchant REJECTED is never offered again, and does not count as
 *      stock either, which is what makes the model produce other subjects;
 *   D) an empty queue still comes first: publishing stops, which is more urgent;
 *   E) the existing guards (kill switch, Production, the window's first quarter hour,
 *      the AI gate, the one-project cap, the deadline) all still decide first.
 *
 * Every rule has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/content/automation/__qa__/topup-idea-stock.qa.ts
 */
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import { runTopicTopUp, type TopUpDeps, type TopUpSummary } from '../topic-topup'
import { buildOverlapIndex, type OverlapIndexData } from '../../cannibalization/check'
import type { TopicSuggestion } from '../../recommendations/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Row = Record<string, unknown>
const T0 = Date.parse('2026-10-26T07:20:00Z') // slot 1 of the window
const PROD = { VERCEL_ENV: 'production' }
const NOW = new Date(T0 - 2 * 24 * 60 * 60 * 1000).toISOString()

/** Unrelated office-cleaning subjects: the overlap check must not read them as duplicates. */
const SUBJECTS = [
  'חוזה ניקיון משרדים', 'תקנים בניקיון קליניקה', 'ציוד לניקיון אולם תצוגה',
  'רשימת בדיקה לניקיון מבנה', 'הכנת המקום לפני ניקיון', 'בטיחות בחומרי ניקוי',
  'הסמכת עובדי ניקיון', 'תדירות החלפת מטליות', 'איכות אוויר במשרד סגור',
]
const SITE: OverlapIndexData = { homeHosts: ['be-cln.co.il'], pages: [], articles: [], gsc: [], topics: [], ideas: [] }

const idea = (id: string, title: string, score: number, status = 'pending'): Row => ({
  id, project_id: 'p1', user_id: 'u1', title, primary_keyword: title, secondary_keywords: [], search_intent: 'informational',
  angle: null, recommended_word_count: null, suggestion_reason: null, score, source: 'hybrid', link_plan: null,
  status, source_context: null, approved_topic_id: null, created_at: NOW,
})

/** A queue item already waiting to publish. */
const queued = (n: number): Row => ({
  id: `it${n}`, pool_id: 'pool1', project_id: 'p1', user_id: 'u1', position: n, status: 'queued', article_id: null,
})

/**
 * One owner, one active project, a WEEKLY pool (target 4 on the regular plan) and a
 * queue that already covers the month — so only the idea stock can decide.
 */
function world(ideas: Row[], waiting = 4): Record<string, Row[]> {
  return {
    projects: [{ id: 'p1', user_id: 'u1', language: 'he', is_active: true, created_at: '2026-10-01' }],
    article_pools: [{ id: 'pool1', project_id: 'p1', user_id: 'u1', is_active: true, cadence: 'weekly', interval_days: null, publish_days: null }],
    article_pool_items: Array.from({ length: waiting }, (_, i) => queued(i + 1)),
    article_topics: [],
    content_topic_ideas: ideas,
    generated_articles: [], subscriptions: [], usage_reservations: [], ai_usage_logs: [],
  }
}

const suggestion = (title: string): TopicSuggestion => ({
  title, primaryKeyword: title, secondaryKeywords: [], searchIntent: 'informational', suggestionReason: 'חדש',
  score: 0.5, recommendedWordCount: 900, articleAngle: null, recommendedPageType: 'article',
} as unknown as TopicSuggestion)

const GENERATED = 'ניקיון מטבחונים במשרד'

function deps(calls: { generate: string[] }, over: Partial<TopUpDeps> = {}): Partial<TopUpDeps> {
  return {
    now: () => T0,
    entitlement: async () => ({ entitled: true, monthlyArticles: 4 }),
    modelAllowed: async () => true,
    loadIndex: async () => buildOverlapIndex(SITE),
    siteVocab: async () => new Set<string>(),
    generate: async (scope) => { calls.generate.push(scope.projectId); return { suggestions: [suggestion(GENERATED)], modelUsed: 'test' } },
    ...over,
  }
}

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const log = console.log, err = console.error, warn = console.warn
  console.log = () => {}; console.error = () => {}; console.warn = () => {}
  try { return await fn() } finally { console.log = log; console.error = err; console.warn = warn }
}

const run = async (fa: FakeAdmin, calls: { generate: string[] }, over: Partial<TopUpDeps> = {}): Promise<TopUpSummary> =>
  quiet(() => runTopicTopUp(fa as never, { env: PROD, deadlineAt: T0 + 280_000, deps: deps(calls, over) }))

const pending = (fa: FakeAdmin) => (fa.tables.content_topic_ideas ?? []).filter((r) => r.status === 'pending')

async function main() {
  console.log('A month of ideas to approve, even when the queue is full')

  // ── A) the queue is covered, the plan is thin ────────────────────────────
  console.log('\nA) a full queue and two ideas left to approve')
  {
    const fa = new FakeAdmin(world(SUBJECTS.slice(0, 2).map((t, n) => idea(`i${n + 1}`, t, 0.9))))
    const calls = { generate: [] as string[] }
    const s = await run(fa, calls)
    check('A1: the run names it a plan with nothing left to approve', s.thinPlans === 1, JSON.stringify(s))
    check('A2: the model was asked, for that project', calls.generate.length === 1 && calls.generate[0] === 'p1' && s.modelProjects === 1)
    check('A3: the new ideas are in the plan, PENDING, for the merchant to approve',
      pending(fa).some((r) => r.title === GENERATED), JSON.stringify(pending(fa).map((r) => r.title)))
    check('A4: the queue is untouched — nothing was promoted past the month it already holds',
      (fa.tables.article_pool_items ?? []).length === 4 && s.promoted === 0 && s.queued === 0, JSON.stringify(s))
    check('A5: the two ideas it already had are still pending, not deleted or rejected',
      pending(fa).filter((r) => String(r.id).startsWith('i')).length === 2 &&
      !(fa.tables.content_topic_ideas ?? []).some((r) => r.status === 'rejected'))
  }

  // ── B) the plan already holds a month ────────────────────────────────────
  console.log('\nB) a full queue and a month of ideas')
  {
    const fa = new FakeAdmin(world(SUBJECTS.map((t, n) => idea(`i${n + 1}`, t, 0.9 - n / 100))))
    const calls = { generate: [] as string[] }
    const s = await run(fa, calls)
    check('B1: nothing happens — no model, no write', calls.generate.length === 0 && s.modelProjects === 0 && s.thinPlans === 0, JSON.stringify(s))
    check('B2: it is simply counted as having enough', s.enough === 1, JSON.stringify(s))
    // MUTATION CONTROL B — the SAME world with the stock below the month asks.
    const faThin = new FakeAdmin(world(SUBJECTS.slice(0, 3).map((t, n) => idea(`i${n + 1}`, t, 0.9))))
    const callsThin = { generate: [] as string[] }
    const sThin = await run(faThin, callsThin)
    check('B3 MUTATION CONTROL: one idea fewer than the month and the model IS asked',
      sThin.thinPlans === 1 && callsThin.generate.length === 1, JSON.stringify(sThin))
  }

  // ── C) a rejected idea is not stock, and never comes back ────────────────
  console.log('\nC) the ideas the merchant rejected')
  {
    // A month's worth of ideas, but the merchant rejected all but two.
    const ideas = SUBJECTS.map((t, n) => idea(`i${n + 1}`, t, 0.9 - n / 100, n < 2 ? 'pending' : 'rejected'))
    const fa = new FakeAdmin(world(ideas))
    const calls = { generate: [] as string[] }
    const s = await run(fa, calls)
    check('C1: a rejected idea does not count as stock, so the plan is thin',
      s.thinPlans === 1 && calls.generate.length === 1, JSON.stringify(s))
    check('C2: not one rejected idea was promoted or re-opened',
      (fa.tables.content_topic_ideas ?? []).filter((r) => r.status === 'rejected').length === SUBJECTS.length - 2 &&
      (fa.tables.article_topics ?? []).length === 0)
    check('C3: and the model\'s new subjects are what the merchant gets instead',
      pending(fa).some((r) => r.title === GENERATED))
  }

  // ── D) an empty queue still comes first ─────────────────────────────────
  console.log('\nD) priority')
  {
    // Two projects of one owner: p1's queue is empty, p2's queue is full with a thin
    // plan. Only ONE project gets the model in a run, and it must be p1.
    const base = world(SUBJECTS.slice(0, 1).map((t, n) => idea(`i${n + 1}`, t, 0.9)), 0)
    const fa = new FakeAdmin({
      ...base,
      projects: [
        { id: 'p1', user_id: 'u1', language: 'he', is_active: true, created_at: '2026-10-01' },
        { id: 'p2', user_id: 'u1', language: 'he', is_active: true, created_at: '2026-10-02' },
      ],
      article_pools: [
        { id: 'pool1', project_id: 'p1', user_id: 'u1', is_active: true, cadence: 'weekly', interval_days: null, publish_days: null },
        { id: 'pool2', project_id: 'p2', user_id: 'u1', is_active: true, cadence: 'weekly', interval_days: null, publish_days: null },
      ],
      article_pool_items: [
        { id: 'q1', pool_id: 'pool2', project_id: 'p2', user_id: 'u1', position: 1, status: 'queued', article_id: null },
        { id: 'q2', pool_id: 'pool2', project_id: 'p2', user_id: 'u1', position: 2, status: 'queued', article_id: null },
        { id: 'q3', pool_id: 'pool2', project_id: 'p2', user_id: 'u1', position: 3, status: 'queued', article_id: null },
        { id: 'q4', pool_id: 'pool2', project_id: 'p2', user_id: 'u1', position: 4, status: 'queued', article_id: null },
      ],
      content_topic_ideas: [idea('i1', SUBJECTS[0], 0.9), { ...idea('j1', SUBJECTS[1], 0.9), project_id: 'p2' }],
    })
    const calls = { generate: [] as string[] }
    const s = await run(fa, calls)
    check('D1: the model ran once, for the project whose QUEUE is empty',
      calls.generate.length === 1 && calls.generate[0] === 'p1' && s.modelProjects === 1, JSON.stringify(calls.generate))
    check('D2: the other project is still counted as thin, for a later run', s.thinPlans === 1, JSON.stringify(s))
  }

  // ── E) every existing guard still decides first ─────────────────────────
  console.log('\nE) the guards')
  {
    const thin = () => new FakeAdmin(world(SUBJECTS.slice(0, 2).map((t, n) => idea(`i${n + 1}`, t, 0.9))))
    for (const [name, env, now, state] of [
      ['kill switch', { ...PROD, CONTENT_TOPUP_DISABLED: '1' }, T0, 'disabled'],
      ['Preview', { VERCEL_ENV: 'preview' }, T0, 'not_production'],
      ['06:59 UTC', PROD, Date.parse('2026-10-26T06:59:00Z'), 'outside_window'],
    ] as const) {
      const fa = thin()
      const calls = { generate: [] as string[] }
      const s = await quiet(() => runTopicTopUp(fa as never, { env: env as Record<string, string>, deadlineAt: T0 + 280_000, deps: deps(calls, { now: () => now }) }))
      check(`E1 (${name}): ${state}, and no model`, s.state === state && calls.generate.length === 0)
    }
    const fa0 = thin()
    const calls0 = { generate: [] as string[] }
    const s0 = await quiet(() => runTopicTopUp(fa0 as never, {
      env: PROD, deadlineAt: Date.parse('2026-10-26T07:00:00Z') + 280_000,
      deps: deps(calls0, { now: () => Date.parse('2026-10-26T07:00:00Z') }),
    }))
    check('E2: never in the window\'s first quarter hour', s0.thinPlans === 1 && calls0.generate.length === 0)
    const faGate = thin()
    const callsG = { generate: [] as string[] }
    const sG = await run(faGate, callsG, { modelAllowed: async () => false })
    check('E3: the AI gate is asked first and is final', callsG.generate.length === 0 && sG.modelProjects === 0)
    const faTime = thin()
    const callsT = { generate: [] as string[] }
    const sT = await quiet(() => runTopicTopUp(faTime as never, { env: PROD, deadlineAt: T0 + 20_000, deps: deps(callsT) }))
    check('E4: too little time left before the cron\'s deadline: no model', callsT.generate.length === 0 && sT.modelProjects === 0)
    const faUnpaid = thin()
    const callsU = { generate: [] as string[] }
    const sU = await run(faUnpaid, callsU, { entitlement: async () => ({ entitled: false, monthlyArticles: 0 }) })
    check('E5: an owner who is not entitled is skipped before anything is counted',
      sU.notEntitled === 1 && sU.thinPlans === 0 && callsU.generate.length === 0, JSON.stringify(sU))
    const faZero = thin()
    const callsZ = { generate: [] as string[] }
    const sZ = await run(faZero, callsZ, { entitlement: async () => ({ entitled: true, monthlyArticles: 0 }) })
    check('E6: a plan with no articles a month has no target, so nothing is thin',
      sZ.thinPlans === 0 && callsZ.generate.length === 0, JSON.stringify(sZ))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

void main()
export {}

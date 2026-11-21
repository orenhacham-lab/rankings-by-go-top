/**
 * A PUBLISH QUEUE AT ZERO IS NEVER SILENT AGAIN (21 November 2026).
 *
 * Oren: "אסור שיקרה מצב שלא יהיו מספיק נושאים" — a customer is promised a number of
 * articles a month, so a project whose publish queue has run to zero is the one
 * event that must reach the log.
 *
 * MEASURED IN PRODUCTION THAT DAY: 24 of 29 active pools held 9 queued items, and
 * three held NOTHING — Afrodite Decants (0 pending ideas, last queue item 25 Sep),
 * הסוד בלונים ומתנות (7 pending, last item 3 Oct) and ירון סלמון (10 pending, last
 * item 29 Oct). The 24 hours of runtime logs before that measurement held not one
 * `[topic-topup]` line, because the line was printed only when
 * `promoted > 0 || modelProjects > 0 || failures > 0` — which is exactly the state a
 * stuck fleet is NOT in. The outcome worth an alarm was the only one never logged.
 *
 * WHAT THIS PROVES:
 *   A) a pass that found an empty queue counts it, and prints;
 *   B) a healthy pass prints too, with dryQueues 0, so silence means "did not run";
 *   C) a pass that read no project at all stays silent (the cron's hourly gate and
 *      the kill switch must not become eight lines a day of nothing);
 *   D) MUTATION CONTROLS: the OLD condition, run on the same summaries, prints
 *      nothing for A, and the counter is read BEFORE the refill, so it reports the
 *      queues that were found empty rather than the ones still empty at the end.
 *
 * Run: npx tsx lib/content/automation/__qa__/topup-dry-queue-log.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
const SITE: OverlapIndexData = { homeHosts: ['be-cln.co.il'], pages: [], articles: [], gsc: [], topics: [], ideas: [] }

const idea = (id: string, title: string): Row => ({
  id, project_id: 'p1', user_id: 'u1', title, primary_keyword: title, secondary_keywords: [], search_intent: 'informational',
  angle: null, recommended_word_count: null, suggestion_reason: null, score: 0.9, source: 'hybrid', link_plan: null,
  status: 'pending', source_context: null, approved_topic_id: null, created_at: NOW,
})

const queued = (n: number): Row => ({
  id: `it${n}`, pool_id: 'pool1', project_id: 'p1', user_id: 'u1', position: n, status: 'queued', article_id: null,
})

/** One owner, one active project, a weekly pool, and `waiting` items in the queue. */
function world(ideas: Row[], waiting: number): Record<string, Row[]> {
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

function deps(over: Partial<TopUpDeps> = {}): Partial<TopUpDeps> {
  return {
    now: () => T0,
    entitlement: async () => ({ entitled: true, monthlyArticles: 4 }),
    modelAllowed: async () => true,
    loadIndex: async () => buildOverlapIndex(SITE),
    siteVocab: async () => new Set<string>(),
    generate: async () => ({ suggestions: [suggestion('ניקיון מטבחונים במשרד')], modelUsed: 'test' }),
    ...over,
  }
}

/** Runs a pass and KEEPS the `[topic-topup] run` lines, which is what is under test. */
async function runAndCapture(fa: FakeAdmin, over: Partial<TopUpDeps> = {}): Promise<{ s: TopUpSummary; lines: unknown[][] }> {
  const log = console.log, err = console.error, warn = console.warn
  const lines: unknown[][] = []
  console.log = (...args: unknown[]) => { if (args[0] === '[topic-topup] run') lines.push(args) }
  console.error = () => {}; console.warn = () => {}
  try {
    const s = await runTopicTopUp(fa as never, { env: PROD, deadlineAt: T0 + 280_000, deps: deps(over) })
    return { s, lines }
  } finally { console.log = log; console.error = err; console.warn = warn }
}

/** The condition this change replaced, applied to a real summary. */
const OLD_WOULD_PRINT = (s: TopUpSummary) => s.promoted > 0 || s.modelProjects > 0 || s.failures > 0

async function main() {
  console.log('A publish queue at zero is never silent again')

  // ── A) the alarm case ────────────────────────────────────────────────────
  console.log('\nA) an empty publish queue with nothing to promote')
  // No ideas at all, so nothing can be promoted into the queue — the state the three
  // Production pools were actually in.
  const dry = await runAndCapture(new FakeAdmin(world([], 0)), { modelAllowed: async () => false })
  check('A1 the empty queue is counted', dry.s.dryQueues === 1, JSON.stringify(dry.s))
  check('A2 nothing was promoted, so the old condition had nothing to print on',
    dry.s.promoted === 0 && dry.s.modelProjects === 0 && dry.s.failures === 0, JSON.stringify(dry.s))
  check('A3 the pass PRINTS', dry.lines.length === 1, String(dry.lines.length))
  const printed = (dry.lines[0]?.[1] ?? {}) as Record<string, unknown>
  check('A4 and the line carries the empty queue', printed.dryQueues === 1, JSON.stringify(printed))
  check('A5 with the project count, so a reader can tell 1 of 1 from 1 of 29',
    printed.projectsChecked === 1, JSON.stringify(printed))

  // ── B) a healthy pass still prints ──────────────────────────────────────
  console.log('\nB) a covered queue')
  const full = await runAndCapture(new FakeAdmin(world(Array.from({ length: 9 }, (_, i) => idea(`i${i + 1}`, `נושא ${i + 1}`)), 9)))
  check('B1 no empty queue is reported', full.s.dryQueues === 0, JSON.stringify(full.s))
  check('B2 the pass prints anyway, so silence can only mean it did not run', full.lines.length === 1)
  check('B3 the queue was not drained to produce the line',
    (full.s.promoted ?? 0) === 0 && full.s.enough + full.s.thinPlans === 1, JSON.stringify(full.s))

  // ── C) a pass that read nothing stays silent ────────────────────────────
  console.log('\nC) nothing to read')
  const none = await runAndCapture(new FakeAdmin({ ...world([], 0), projects: [] }))
  check('C1 no project, no line', none.lines.length === 0 && none.s.projectsChecked === 0, JSON.stringify(none.s))
  const off = await runAndCapture(new FakeAdmin(world([], 0)), { now: () => T0 })
  check('C2 (control for C1) the same world WITH a project does print', off.lines.length === 1)

  // ── D) mutation controls ────────────────────────────────────────────────
  console.log('\nD) mutation controls')
  check('D1 CONTROL: the OLD condition prints NOTHING for the alarm case', !OLD_WOULD_PRINT(dry.s), JSON.stringify(dry.s))
  check('D2 CONTROL: and it also hid the healthy pass, so the log said nothing either way', !OLD_WOULD_PRINT(full.s))
  // The counter must be read before the refill: a queue that was empty and then
  // filled in the same pass is still a queue that ran to zero, and that is the
  // signal. Nine ideas and an empty queue prove the ordering.
  const refilled = await runAndCapture(new FakeAdmin(world(Array.from({ length: 9 }, (_, i) => idea(`i${i + 1}`, `נושא ${i + 1}`)), 0)))
  check('D3 CONTROL: a queue that was empty and got refilled is STILL reported',
    refilled.s.dryQueues === 1 && refilled.s.promoted > 0, JSON.stringify(refilled.s))

  // ── E) source guards ────────────────────────────────────────────────────
  console.log('\nE) the source')
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const src = strip(readFileSync(join(process.cwd(), 'lib/content/automation/topic-topup.ts'), 'utf8'))
  check('E1 the old log condition is gone', !/promoted > 0 \|\| modelProjects > 0 \|\| failures > 0/.test(src))
  check('E2 the line is printed for every pass that read a project', /if \(summary\.projectsChecked > 0\) \{/.test(src))
  check('E3 the supply is captured once, before the refill decision',
    /const supply = await countSupply\(admin, scope, pool\)[\s\S]{0,200}?if \(supply >= target\)/.test(src))
  check('E4 the counter is the only thing added to the loop — nothing filters on it',
    !/dryQueues[^\n]*continue/.test(src) && !/dryQueues[^\n]*return/.test(src))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exitCode = 1
}

void main()

export {}

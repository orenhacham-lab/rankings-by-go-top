/**
 * The cron's share of the seeding scan (lib/seed-scan/resume.ts) and its place
 * in the content-automation cron (app/api/content/automation/cron/route.ts).
 *
 * A worker is killed at a precise moment — right after it marked a step
 * running — by copying the FakeAdmin tables at that instant: the copy is what
 * a worker that died there left behind. The cron's resume then works on the
 * copy, its clock moved past the lease.
 *
 * What is asserted: a run continues at the first unfinished step of its stage,
 * A or B, without redoing or paying again for a finished step; b4 and b6, which
 * act as the merchant, are skipped by the cron even when it is handed the
 * functions; the cron's day counts from the start of the run's current stage,
 * so a stage B continued days after stage A is still resumed; only lapsed
 * leases are taken, by the store's conditional UPDATE,
 * oldest first, at most MAX_RUNS_PER_TICK a tick, for every account, and every
 * query names the owner of the run it works on; out of time, runs wait or are
 * handed back; not a line when idle or off, one line when it acted or failed,
 * stable codes only; startIsolatedSeedResume's own deadline, cap and catch;
 * and, through the REAL cron route, that the runner's result is logged first
 * and unchanged whatever the resume does (throws, rejects, has no time left),
 * after which the real resume finishes a stage-B run stalled at b5.
 *
 * Only the edges of the cron route are replaced: next/server's `after`
 * (collected, then run by hand), the service-role client (a FakeAdmin), the
 * automation runner (a stub that returns a fixed summary), and — where a test
 * injects a failing resume — resumeStalledSeedRuns as the route sees it.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-resume.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import type { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { ResumeReport, ResumedRun } from '../resume'
import type { StageADepsInput } from '../steps'
import type { StageBDepsInput } from '../steps-b'
import type { Tables } from './_fixtures'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-svc'
process.env.ENABLE_CONTENT = 'true'
process.env.ENABLE_CONTENT_AUTOMATION = 'true'
process.env.CRON_SECRET = 'qa-cron-secret'
for (const k of ['ENABLE_SEED_SCAN', 'ENABLE_AI_VISIBILITY', 'GEMINI_API_KEY', 'SERPER_API_KEY']) delete process.env[k]

/*
 * `require()` is deliberate: tsx runs this file as CommonJS, and the
 * Module._load hook must be installed BEFORE the modules under test load.
 */
const Module: any = require('module')
const origLoad = Module._load
let ADMIN_CLIENT: unknown = null
let RUNNER: () => Promise<unknown> = async () => {
  throw new Error('no runner expected')
}
let RESUME: (...a: any[]) => unknown = () => {
  throw new Error('no resume expected')
}
/** What the cron route handed to `after()`, in order. */
const scheduled: (() => Promise<void>)[] = []
Module._load = function (request: string, parent: any, isMain: boolean) {
  let resolved = request
  try {
    resolved = String(Module._resolveFilename(request, parent, isMain))
  } catch {
    /* virtual */
  }
  if (resolved.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => ADMIN_CLIENT }
  if (resolved.endsWith('lib/content/automation/runner.ts')) return { runAutomation: () => RUNNER() }
  // The cron route's view of the resume only; everything else gets the real module.
  if (resolved.endsWith('lib/seed-scan/resume.ts') && String(parent?.filename ?? '').endsWith('app/api/content/automation/cron/route.ts')) {
    const real = origLoad.call(this, request, parent, isMain)
    return { ...real, resumeStalledSeedRuns: (...a: any[]) => RESUME(...a) }
  }
  if (request === 'next/server') {
    const real = origLoad.call(this, request, parent, isMain)
    return { ...real, after: (task: () => Promise<void>) => void scheduled.push(task) }
  }
  return origLoad.call(this, request, parent, isMain)
}

const fx = require('./_fixtures') as typeof import('./_fixtures')
const bx = require('./_stage-b-fixtures') as typeof import('./_stage-b-fixtures')
const { auditOwners } = require('./_owner-audit') as typeof import('./_owner-audit')
const resumeMod = require('../resume.ts') as typeof import('../resume')
const { runStageA, runSeedStage } = require('../runner.ts') as typeof import('../runner')
const store = require('../store.ts') as typeof import('../store')
const { initialSummary } = require('../summary.ts') as typeof import('../summary')
const cron = require('../../../app/api/content/automation/cron/route.ts') as { GET: (r: Request) => Promise<Response> }

const { check, finish } = fx.makeChecker()
const { USER, OTHER_USER, PROJECT, OTHER_PROJECT, NOW, SECRET, HE_WP, HE_WP_INSIGHT, HE_WP_RESULTS } = fx
const { SCOPE } = bx

// ── Reading the world ───────────────────────────────────────────────────────

type Row = Record<string, unknown>
type Scope = { projectId: string; userId: string }
const MIN = 60_000
const HOUR = 60 * MIN
const ON = { ENABLE_SEED_SCAN: 'true' }
const A_STEPS = ['a1', 'a2', 'a3', 'a4']
const B_STEPS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']
const ALL_A = 'a1:done a2:done a3:done a4:done'
const PENDING_A = 'a1:pending a2:pending a3:pending a4:pending'
const STAGE_B_ENV = { ENABLE_AI_VISIBILITY: 'true', GEMINI_API_KEY: 'qa-key' }

const stepRow = (t: Tables, step: string, runId?: string) =>
  (t.project_seed_steps.find((s) => s.step === step && (!runId || s.run_id === runId)) ?? {}) as Row
const runRow = (t: Tables, runId?: string) => (t.project_seed_runs.find((r) => !runId || r.id === runId) ?? {}) as Row
const line = (t: Tables, steps: string[], runId?: string) =>
  steps
    .map((s) => {
      const r = stepRow(t, s, runId)
      return `${s}:${r.status}${r.error_code ? `(${r.error_code})` : ''}`
    })
    .join(' ')
const tagged = (output: string, tag: string) => output.split('\n').filter((l) => l.startsWith(tag))
const stepsOf = (t: Tables, runId: string) => t.project_seed_steps.filter((s) => s.run_id === runId)
/** The run and its steps exactly as they were. */
const unchanged = (before: Tables, after: Tables, runId: string) =>
  JSON.stringify(runRow(before, runId)) === JSON.stringify(runRow(after, runId)) && JSON.stringify(stepsOf(before, runId)) === JSON.stringify(stepsOf(after, runId))

const workedOf = (r: ResumeReport) => (r.state === 'worked' ? r : null)
const statusOf = (res: ResumedRun['result'] | undefined) => (res?.outcome === 'finished' ? res.status : null)
const reasonOf = (res: ResumedRun['result'] | undefined) => (res?.outcome === 'stopped' ? res.reason : null)
/** The JSON of a `[tag] message {…}` line. */
const payloadOf = (l: string | undefined) => {
  const i = l?.indexOf('{') ?? -1
  return l && i >= 0 ? (JSON.parse(l.slice(i)) as Row) : null
}

// ── Killing a worker ────────────────────────────────────────────────────────

/**
 * The tables as they were right after `step` was marked running: what a worker
 * that died at that instant left behind. (The worker goes on here; the copy
 * does not.)
 */
function killAtMark(fake: FakeAdmin, tables: Tables, step: string): () => Tables | null {
  let snap: Tables | null = null
  const from = (fake as any).from.bind(fake)
  ;(fake as any).from = (name: string) => {
    const q = from(name)
    if (name !== 'project_seed_steps') return q
    let marking = false
    let target: unknown = null
    const update = q.update.bind(q)
    const eq = q.eq.bind(q)
    const then = q.then.bind(q)
    q.update = (patch: Row) => {
      marking = patch?.status === 'running' && typeof patch.started_at === 'string'
      return update(patch)
    }
    q.eq = (col: string, val: unknown) => {
      if (col === 'step') target = val
      return eq(col, val)
    }
    q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      then((res: unknown) => {
        if (!snap && marking && target === step) snap = structuredClone(tables)
        return resolve(res)
      }, reject)
    return q
  }
  return () => snap
}

// ── Workers ─────────────────────────────────────────────────────────────────

function workerFakes() {
  return {
    net: new fx.FakeNetwork(bx.crawlSite()),
    model: fx.fakeModel({ ok: true, insight: HE_WP_INSIGHT }),
    search: fx.fakeSearch(HE_WP_RESULTS),
    ideas: bx.fakeIdeas(),
    questions: bx.fakeQuestions(),
    cache: bx.fakeSuggestionCache(),
    content: bx.fakeRoute<{ projectId: string; runId: string }>(() => ({ status: 200, body: { meta: { newlyAddedCount: 7 } } })),
    rank: bx.fakeRoute<{ projectId: string; targetId: string }>(() => ({ status: 200, body: { ok: true } })),
  }
}
type WorkerFakes = ReturnType<typeof workerFakes>

const depsA = (f: WorkerFakes, now: () => Date): StageADepsInput => ({ fetchImpl: f.net.fetch, insight: f.model.fn, search: f.search.fn, now })
const depsB = (f: WorkerFakes, now: () => Date): StageBDepsInput => ({
  fetchImpl: f.net.fetch,
  keywordIdeas: f.ideas.fn,
  questions: f.questions.fn,
  writeSuggestions: f.cache.fn,
  contentPlan: f.content.fn,
  rankCheck: f.rank.fn,
  env: STAGE_B_ENV,
  now,
})

async function startRunA(admin: ServiceRoleClient, scope: Scope, now: Date): Promise<{ runId: string; lease: string }> {
  const created = await store.createSeedRun(admin, scope, {
    trigger: 'create',
    stage: 'a',
    summary: initialSummary({ source: 'scan', domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', locale: 'he' }),
    now,
  })
  if (!created.ok) throw new Error(`run not created: ${created.reason}`)
  return { runId: created.run.id, lease: created.lease }
}

/**
 * A real stage A begun at `start`, moved on to stage B as `continue` leaves it
 * (two keywords added) — at `continueAt`, or as soon as stage A finished.
 */
async function stageBRun(start: Date = NOW, continueAt?: Date) {
  const { tables, fake, admin } = fx.world(fx.projectRow())
  const clk = fx.clock(start)
  const f = workerFakes()
  const runId = await bx.finishedStageA(admin, f.net, clk.now)
  tables.tracking_targets = [
    { id: 't1', project_id: PROJECT, user_id: USER, keyword: 'פתיחת סתימות' },
    { id: 't2', project_id: PROJECT, user_id: USER, keyword: 'איתור נזילות' },
  ]
  const lease = await bx.continued(admin, runId, continueAt ?? clk.now(), ['t1', 't2'])
  return { tables, fake, admin, clk, f, runId, lease }
}

/** One cron tick on what a dead worker left, `advanceMs` after its clock. */
async function tickOn(snap: Tables, o: { advanceMs: number; deps?: StageADepsInput }) {
  const copy = structuredClone(snap)
  const { tables, fake, admin } = fx.world(copy.projects[0] as Row, copy)
  const clk = fx.clock()
  clk.advance(o.advanceMs)
  const fakes = workerFakes()
  const audit = auditOwners(fake)
  const { value: report, output } = await fx.captureConsole(() =>
    resumeMod.resumeStalledSeedRuns(admin, {
      env: ON,
      now: clk.now,
      deps: { ...depsA(fakes, clk.now), ...o.deps },
      // Handed the merchant's functions as well: the cron must not use them.
      stageB: depsB(fakes, clk.now),
    }),
  )
  return { tables, audit, fakes, report, output }
}

/** Our queries that pair a project with anyone but its owner (filters and written rows alike). */
function crossOwner(audit: ReturnType<typeof auditOwners>, owners: Record<string, string>): string[] {
  const out: string[] = []
  for (const q of audit.ours()) {
    const eqOf = (col: string) => q.calls.find((c) => c.op === 'eq' && c.args[0] === col)?.args[1] as string | undefined
    const p = eqOf('project_id')
    const u = eqOf('user_id')
    if (p !== undefined && u !== undefined && owners[p] !== u) out.push(`${q.fn} ${q.table} ${p}/${u}`)
    const write = q.calls.find((c) => c.op === 'insert' || c.op === 'upsert')
    const rows = write ? ((Array.isArray(write.args[0]) ? write.args[0] : [write.args[0]]) as Row[]) : []
    for (const r of rows) if (typeof r.project_id === 'string' && owners[r.project_id] !== r.user_id) out.push(`${q.fn} ${q.table} row ${r.project_id}/${String(r.user_id)}`)
  }
  return out
}

// ── The cron route ──────────────────────────────────────────────────────────

const BEARER = 'Bearer qa-cron-secret'
const SUMMARY = { poolsChecked: 4, published: 1, generated: 2, staleRecovered: 1, failures: 0, durationMs: 4321, pools: [] }
/** Who ran, in order: the runner, then the resume. */
const order: string[] = []
const RUNNER_OK = async () => {
  order.push('runner')
  return SUMMARY
}
const REAL_RESUME = (...a: any[]) => {
  order.push('resume')
  return (resumeMod.resumeStalledSeedRuns as (...x: any[]) => unknown)(...a)
}

async function callCron(auth: string | null) {
  const request = new Request('http://localhost/api/content/automation/cron', { headers: auth ? { authorization: auth } : {} })
  const { value, output } = await fx.captureConsole(() => cron.GET(request))
  return { status: value.status, body: (await value.json()) as Row, output }
}

/** Run what the route handed to after(); report whether any of it threw. */
async function runScheduled() {
  let threw: unknown = null
  const { output } = await fx.captureConsole(async () => {
    for (const task of scheduled.splice(0)) {
      try {
        await task()
      } catch (err) {
        threw = err
      }
    }
  })
  return { output, threw }
}

/** The runner's line exactly as the route writes it for SUMMARY. */
const runnerLine = (startedAt: unknown) =>
  `[automation-cron] run complete ${JSON.stringify({
    startedAt,
    poolsChecked: SUMMARY.poolsChecked,
    published: SUMMARY.published,
    generated: SUMMARY.generated,
    staleRecovered: SUMMARY.staleRecovered,
    failures: SUMMARY.failures,
    durationMs: SUMMARY.durationMs,
  })}`

async function main() {
  fx.installFakeDns()
  const unhandled: unknown[] = []
  process.on('unhandledRejection', (reason) => void unhandled.push(reason))

  // ── 1. Stage A ────────────────────────────────────────────────────────────
  console.log('1) Stage A: the cron continues a run at its first unfinished step')
  let stageASnapshot: Tables | null = null
  {
    const { tables, fake, admin } = fx.world(fx.projectRow())
    const clk = fx.clock()
    const dead = killAtMark(fake, tables, 'a3')
    const { runId, lease } = await startRunA(admin, SCOPE, clk.now())
    const f = workerFakes()
    await fx.captureConsole(() => runStageA({ admin, scope: SCOPE, runId, lease, deps: depsA(f, clk.now) }))
    const snap = dead()
    stageASnapshot = snap
    check('the worker died as a3 began: a1 and a2 done, a3 running, a4 pending',
      !!snap && line(snap, A_STEPS) === 'a1:done a2:done a3:running a4:pending', snap ? line(snap, A_STEPS) : 'no snapshot')
    if (snap) {
      const early = await tickOn(snap, { advanceMs: 0 })
      check('while its lease is live the cron takes nothing: idle, not a line',
        early.report.state === 'idle' && early.output === '' && line(early.tables, A_STEPS) === line(snap, A_STEPS), `${early.report.state} ${early.output}`)

      const t = await tickOn(snap, { advanceMs: store.LEASE_MS + 1_000 })
      const w = workedOf(t.report)
      check('once it lapses, the cron takes the run and finishes it, in stage A',
        !!w && w.found === 1 && w.runs[0]?.runId === runId && w.runs[0]?.stage === 'a' && statusOf(w.runs[0]?.result) === 'done' && line(t.tables, A_STEPS) === ALL_A,
        `${JSON.stringify(t.report)} ${line(t.tables, A_STEPS)}`)
      check('…from a3: the site is not read again, the model not asked again; a4 searches three times',
        t.fakes.net.requests.length === 0 && t.fakes.model.calls.length === 0 && t.fakes.search.calls.length === 3,
        `${t.fakes.net.requests.length} ${t.fakes.model.calls.length} ${t.fakes.search.calls.length}`)
      check("…a1's and a2's saved results untouched",
        ['a1', 'a2'].every((s) => JSON.stringify(stepRow(t.tables, s)) === JSON.stringify(stepRow(snap, s))))
      check('…the run is done and its lease dropped', runRow(t.tables).status === 'done' && runRow(t.tables).lease_expires_at === null)
      const tick = tagged(t.output, '[seed-resume]')
      check('…one line for the tick, and the run itself logs nothing', tick.length === 1 && tick[0].startsWith('[seed-resume] tick') && !t.output.includes('[seed-scan]'), t.output)
      check('…every query of the resumed worker names the owner', t.audit.offenders(USER).length === 0, t.audit.offenders(USER).join('; '))
    }
  }

  // ── 2. Stage B ────────────────────────────────────────────────────────────
  console.log('\n2) Stage B: continued at its first unfinished step; b4 and b6 need the merchant')
  {
    const s = await stageBRun()
    const dead = killAtMark(s.fake, s.tables, 'b3')
    await fx.captureConsole(() => runSeedStage({ admin: s.admin, scope: SCOPE, runId: s.runId, lease: s.lease, stageB: depsB(s.f, s.clk.now) }))
    const snap = dead()
    check('the worker died as b3 began: b1 and b2 done, b3 running, b4-b6 pending',
      !!snap && line(snap, B_STEPS) === 'b1:done b2:done b3:running b4:pending b5:pending b6:pending', snap ? line(snap, B_STEPS) : 'no snapshot')
    if (snap) {
      const early = await tickOn(snap, { advanceMs: store.LEASE_MS + 1_000 })
      check("stage B's lease is longer: past stage A's, the cron still leaves it", early.report.state === 'idle' && early.fakes.ideas.calls.length === 0)

      const t = await tickOn(snap, { advanceMs: store.STAGE_B_LEASE_MS + 1_000 })
      const w = workedOf(t.report)
      check('once it lapses, the run is taken and finished, in stage B',
        !!w && w.runs[0]?.stage === 'b' && statusOf(w.runs[0]?.result) === 'done' && runRow(t.tables).status === 'done',
        JSON.stringify(t.report))
      check('…b4 and b6 skipped for want of the merchant, although the cron was handed both functions',
        line(t.tables, B_STEPS) === 'b1:done b2:done b3:done b4:skipped(content_session_required) b5:done b6:skipped(rank_check_session_required)'
          && t.fakes.content.calls.length === 0 && t.fakes.rank.calls.length === 0,
        `${line(t.tables, B_STEPS)} content ${t.fakes.content.calls.length} rank ${t.fakes.rank.calls.length}`)
      check('…from b3: no page read again, b2 not asked again; b3 asks its three competitors, b5 its one model call',
        t.fakes.net.requests.length === 0 && t.fakes.ideas.calls.length === 3 && t.fakes.ideas.calls.every((c) => c.researchType === 'site' && c.site !== HE_WP.key)
          && t.fakes.questions.calls.length === 1,
        `${t.fakes.net.requests.length} ${t.fakes.ideas.calls.map((c) => c.site).join(',')} ${t.fakes.questions.calls.length}`)
      check("…stage A's steps and b1's and b2's saved results untouched",
        [...A_STEPS, 'b1', 'b2'].every((st) => JSON.stringify(stepRow(t.tables, st)) === JSON.stringify(stepRow(snap, st))))
      check('…one line, and every query names the owner',
        tagged(t.output, '[seed-resume]').length === 1 && !t.output.includes('[seed-scan]') && t.audit.offenders(USER).length === 0, t.audit.offenders(USER).join('; '))
    }
  }

  {
    // Stage A began three days ago; the merchant continued ten minutes ago, and
    // the worker died before b1: the cron's day counts from the move to stage B.
    const stageAStart = new Date(NOW.getTime() - 72 * HOUR)
    const continuedAt = new Date(NOW.getTime() - 10 * MIN)
    const s = await stageBRun(stageAStart, continuedAt)
    const snap = structuredClone(s.tables)
    check("the move to stage B restarted the run's clock: started_at is the move, finished_at cleared; stage A's times stay on a1-a4",
      runRow(snap).started_at === continuedAt.toISOString() && runRow(snap).finished_at === null
        && stepRow(snap, 'a1').started_at === stageAStart.toISOString() && line(snap, B_STEPS) === 'b1:pending b2:pending b3:pending b4:pending b5:pending b6:pending',
      `${String(runRow(snap).started_at)} ${String(runRow(snap).finished_at)} ${String(stepRow(snap, 'a1').started_at)}`)
    const t = await tickOn(snap, { advanceMs: 0 })
    const w = workedOf(t.report)
    check('stage A three days old, stage B ten minutes: once its lease lapses the cron takes it and finishes stage B',
      !!w && w.runs[0]?.runId === s.runId && w.runs[0]?.stage === 'b' && statusOf(w.runs[0]?.result) === 'done'
        && line(t.tables, B_STEPS) === 'b1:done b2:done b3:done b4:skipped(content_session_required) b5:done b6:skipped(rank_check_session_required)',
      `${JSON.stringify(t.report)} ${line(t.tables, B_STEPS)}`)
    const late = await tickOn(snap, { advanceMs: 24 * HOUR })
    check('…but a stage B begun more than a day ago is left alone: idle, not a line',
      late.report.state === 'idle' && late.output === '' && unchanged(snap, late.tables, s.runId), `${late.report.state} ${late.output}`)
  }

  // ── 3. Which runs ─────────────────────────────────────────────────────────
  console.log('\n3) Only lapsed leases, oldest first, at most two a tick, for every account')
  {
    const P3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const P4 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    const P5 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    const P6 = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    const owners: Record<string, string> = { [PROJECT]: USER, [OTHER_PROJECT]: OTHER_USER, [P3]: USER, [P4]: OTHER_USER, [P5]: USER, [P6]: OTHER_USER }
    const { tables, fake, admin } = fx.world(fx.projectRow(), { projects: Object.entries(owners).map(([id, user_id]) => fx.projectRow({ id, user_id })) })
    const clk = fx.clock()
    const startAt = async (projectId: string, offsetMs: number) => {
      clk.set(new Date(NOW.getTime() + offsetMs))
      return (await startRunA(admin, { projectId, userId: owners[projectId] }, clk.now())).runId
    }
    // The oldest run of all has a live worker: it renewed its lease a moment ago.
    const live = await startAt(P4, -20 * MIN)
    const e1 = await startAt(PROJECT, -10 * MIN)
    const e2 = await startAt(OTHER_PROJECT, -9 * MIN)
    const e3 = await startAt(P3, -8 * MIN)
    const tooOld = await startAt(P5, -25 * HOUR)
    const ended = await startAt(P6, -7 * MIN)
    clk.set(NOW)
    runRow(tables, live).lease_expires_at = new Date(NOW.getTime() + MIN).toISOString()
    Object.assign(runRow(tables, ended), { status: 'done', lease_expires_at: null, finished_at: new Date(NOW.getTime() - 6 * MIN).toISOString() })
    const before = structuredClone(tables)
    const audit = auditOwners(fake)
    const f = workerFakes()

    const first = await fx.captureConsole(() => resumeMod.resumeStalledSeedRuns(admin, { env: ON, now: clk.now, maxRuns: 10, deps: depsA(f, clk.now) }))
    const w1 = workedOf(first.value)
    check(`asked for ten, it takes ${resumeMod.MAX_RUNS_PER_TICK}: the two oldest lapsed runs, whoever owns them`,
      resumeMod.MAX_RUNS_PER_TICK === 2 && !!w1 && w1.found === 2 && w1.runs.map((r) => r.runId).join() === [e1, e2].join(), JSON.stringify(first.value))
    check('…both worked to the end in stage A: one site read, one model call, three searches each',
      !!w1 && w1.runs.every((r) => r.stage === 'a' && statusOf(r.result) === 'done') && line(tables, A_STEPS, e1) === ALL_A && line(tables, A_STEPS, e2) === ALL_A
        && f.model.calls.length === 2 && f.search.calls.length === 6,
      `${line(tables, A_STEPS, e1)} | ${line(tables, A_STEPS, e2)} model ${f.model.calls.length} search ${f.search.calls.length}`)
    check("the oldest run, whose worker is alive: untouched, its worker's lease stands", unchanged(before, tables, live) && line(tables, A_STEPS, live) === PENDING_A)
    check('the third lapsed run waits for the next tick, untouched', unchanged(before, tables, e3))
    check('a run older than a day is left alone', unchanged(before, tables, tooOld))
    check('a finished run is never taken', unchanged(before, tables, ended))
    check('one line for the tick; the runs log nothing themselves', tagged(first.output, '[seed-resume]').length === 1 && !first.output.includes('[seed-scan]'), first.output.slice(0, 300))
    check('every query of ours names an owner; the listing is the one keys-only read',
      audit.offenders([USER, OTHER_USER]).length === 0 && audit.ours().filter((q) => q.fn === 'listStalledSeedRuns').length === 1, audit.offenders([USER, OTHER_USER]).join('; '))
    check("…and it is the run's own owner, never the other account's", crossOwner(audit, owners).length === 0, crossOwner(audit, owners).join('; '))

    const second = await fx.captureConsole(() => resumeMod.resumeStalledSeedRuns(admin, { env: ON, now: clk.now, deps: depsA(f, clk.now) }))
    const w2 = workedOf(second.value)
    check('the next tick takes the third', !!w2 && w2.runs.map((r) => r.runId).join() === e3 && line(tables, A_STEPS, e3) === ALL_A, JSON.stringify(second.value))
    const third = await fx.captureConsole(() => resumeMod.resumeStalledSeedRuns(admin, { env: ON, now: clk.now, deps: depsA(f, clk.now) }))
    check('then there is nothing to do: idle, not a line', third.value.state === 'idle' && third.output === '', third.output)
    check('…the live run still untouched after three ticks', unchanged(before, tables, live))
  }

  // ── 4. The takeover is conditional ────────────────────────────────────────
  console.log("\n4) Taking a run is the store's conditional UPDATE: a worker that renews after the listing keeps it")
  {
    const hooks: Record<string, unknown> = {}
    const { tables, admin } = fx.world(fx.projectRow(), {}, hooks)
    const clk = fx.clock()
    const { runId } = await startRunA(admin, SCOPE, clk.now())
    clk.advance(store.LEASE_MS + MIN)
    const renewed = new Date(clk.now().getTime() + MIN).toISOString()
    let armed = true
    hooks.project_seed_runs = {
      // The listing has matched the run as lapsed; its worker renews right then.
      select: () => {
        if (armed) {
          armed = false
          runRow(tables, runId).lease_expires_at = renewed
        }
        return null
      },
    }
    const f = workerFakes()
    const r = await fx.captureConsole(() => resumeMod.resumeStalledSeedRuns(admin, { env: ON, now: clk.now, deps: depsA(f, clk.now) }))
    const res = workedOf(r.value)?.runs[0]?.result
    check('listed while lapsed, renewed before the takeover: not taken (not_running)', reasonOf(res) === 'not_running', JSON.stringify(r.value))
    check("…the worker's lease stands and nothing was done", runRow(tables, runId).lease_expires_at === renewed && line(tables, A_STEPS, runId) === PENDING_A
      && f.net.requests.length === 0 && f.model.calls.length === 0)
    check('…the tick line says so',
      JSON.stringify(payloadOf(tagged(r.output, '[seed-resume] tick')[0])?.runs) === JSON.stringify([{ runId, projectId: PROJECT, stage: 'a', outcome: 'stopped', reason: 'not_running' }]),
      r.output)
  }

  // ── 5. Time ───────────────────────────────────────────────────────────────
  console.log('\n5) Out of time: runs wait for the next tick, or are handed back before a step that would not fit')
  {
    const { tables, admin } = fx.world(fx.projectRow())
    const clk = fx.clock()
    const { runId } = await startRunA(admin, SCOPE, clk.now())
    clk.advance(store.LEASE_MS + MIN)
    const before = structuredClone(tables)
    const f = workerFakes()
    const passed = await fx.captureConsole(() => resumeMod.resumeStalledSeedRuns(admin, { env: ON, now: clk.now, deadlineAt: clk.now().getTime() - 1, deps: depsA(f, clk.now) }))
    const wp = workedOf(passed.value)
    check('the deadline has passed: the run is left exactly as it is; the line says one is waiting',
      !!wp && wp.runs.length === 0 && wp.deferred === 1 && unchanged(before, tables, runId)
        && JSON.stringify(payloadOf(tagged(passed.output, '[seed-resume] tick')[0])) === JSON.stringify({ found: 1, runs: [], deferred: 1 }),
      passed.output)

    const near = await fx.captureConsole(() => resumeMod.resumeStalledSeedRuns(admin, { env: ON, now: clk.now, deadlineAt: clk.now().getTime() + 10_000, deps: depsA(f, clk.now) }))
    const nr = workedOf(near.value)?.runs[0]?.result
    check('ten seconds left and a1 may need 26: taken, then handed back at once (stopped time_cap), nothing read',
      reasonOf(nr) === 'time_cap' && runRow(tables, runId).status === 'running' && runRow(tables, runId).lease_expires_at === null
        && line(tables, A_STEPS, runId) === PENDING_A && f.net.requests.length === 0,
      `${JSON.stringify(near.value)} ${line(tables, A_STEPS, runId)}`)
    const next = await fx.captureConsole(() => resumeMod.resumeStalledSeedRuns(admin, { env: ON, now: clk.now, deps: depsA(f, clk.now) }))
    check('the next tick takes it at once, without waiting for a lease to lapse, and finishes it',
      statusOf(workedOf(next.value)?.runs[0]?.result) === 'done' && line(tables, A_STEPS, runId) === ALL_A, JSON.stringify(next.value))
  }

  // ── 6. Logs ───────────────────────────────────────────────────────────────
  console.log('\n6) Not a line when off or idle; one line when something fails, codes only')
  {
    const { fake, admin } = fx.world(fx.projectRow())
    const clk = fx.clock()
    await startRunA(admin, SCOPE, clk.now())
    clk.advance(store.LEASE_MS + MIN)
    const audit = auditOwners(fake)
    for (const env of [{}, { ENABLE_SEED_SCAN: 'false' }, { ENABLE_SEED_SCAN: '1' }] as Record<string, string>[]) {
      const r = await fx.captureConsole(() => resumeMod.resumeStalledSeedRuns(admin, { env, now: clk.now }))
      check(`ENABLE_SEED_SCAN=${env.ENABLE_SEED_SCAN ?? '(unset)'}: off — a stalled run is there, yet not one query and not one line`,
        r.value.state === 'disabled' && audit.queries.length === 0 && r.output === '', `${r.value.state} ${audit.queries.length} ${r.output}`)
    }
  }
  {
    const { fake, admin } = fx.world(fx.projectRow())
    const audit = auditOwners(fake)
    const r = await fx.captureConsole(() => resumeMod.resumeStalledSeedRuns(admin, { env: ON, now: fx.clock().now }))
    check('on, nothing stalled: idle — one query (the listing) and not one line',
      r.value.state === 'idle' && audit.queries.length === 1 && r.output === '', `${r.value.state} ${audit.queries.length} ${r.output}`)
  }
  {
    const hooks: Record<string, unknown> = { project_seed_runs: { select: () => ({ code: 'XX000', message: SECRET }) } }
    const { admin } = fx.world(fx.projectRow(), {}, hooks)
    const r = await fx.captureConsole(() => resumeMod.resumeStalledSeedRuns(admin, { env: ON, now: fx.clock().now }))
    check('the listing fails with provider text in its error: failed list_failed, one line, the code only',
      r.value.state === 'failed' && r.output === '[seed-resume] failed {"reason":"list_failed"}', r.output)
  }
  if (stageASnapshot) {
    const t = await tickOn(stageASnapshot, {
      advanceMs: store.LEASE_MS + 1_000,
      deps: {
        buildFindings: () => {
          throw new TypeError(SECRET)
        },
      },
    })
    const res = workedOf(t.report)?.runs[0]?.result
    check('a step throws in a resumed run: it fails internal_error, the next step still runs, the run is partial',
      line(t.tables, A_STEPS) === 'a1:done a2:done a3:failed(internal_error) a4:done' && statusOf(res) === 'partial', `${line(t.tables, A_STEPS)} ${JSON.stringify(res)}`)
    const tick = payloadOf(tagged(t.output, '[seed-resume] tick')[0])
    check("…the tick line names the step and the error's name, nothing more",
      JSON.stringify((tick?.runs as Row[] | undefined)?.[0]?.stepErrors) === '["a3:TypeError"]' && !t.output.includes(SECRET) && !JSON.stringify(t.tables).includes(SECRET),
      t.output.slice(0, 300))
    check('…and the run itself logged nothing (the cron runs it quietly)', !t.output.includes('[seed-scan]'))
  }
  {
    const hooks: Record<string, unknown> = {}
    const { tables, admin } = fx.world(fx.projectRow(), { projects: [fx.projectRow(), fx.projectRow({ id: OTHER_PROJECT, user_id: OTHER_USER })] }, hooks)
    const clk = fx.clock()
    const a = await startRunA(admin, SCOPE, clk.now())
    clk.advance(MIN)
    const b = await startRunA(admin, { projectId: OTHER_PROJECT, userId: OTHER_USER }, clk.now())
    clk.advance(store.LEASE_MS + MIN)
    const before = structuredClone(tables)
    let selects = 0
    // The first run's first read throws (after the listing): its resume throws.
    hooks.project_seed_runs = {
      select: () => {
        if (++selects === 2) throw new RangeError(SECRET)
        return null
      },
    }
    const f = workerFakes()
    const r = await fx.captureConsole(() => resumeMod.resumeStalledSeedRuns(admin, { env: ON, now: clk.now, deps: depsA(f, clk.now) }))
    const w = workedOf(r.value)
    check("the first run's resume throws: reported as threw RangeError; the second run is still worked",
      !!w && w.runs.length === 2 && w.runs[0].runId === a.runId && w.runs[0].result.outcome === 'threw' && (w.runs[0].result as { error: string }).error === 'RangeError'
        && w.runs[1].runId === b.runId && statusOf(w.runs[1].result) === 'done',
      JSON.stringify(r.value))
    check('…the first run is left as it was, for a later tick', unchanged(before, tables, a.runId))
    check('…one line, no provider text in it', tagged(r.output, '[seed-resume]').length === 1 && !r.output.includes(SECRET), r.output.slice(0, 300))
  }

  // ── 7. startIsolatedSeedResume ────────────────────────────────────────────
  console.log('\n7) startIsolatedSeedResume: its own deadline, a hard cap, and nothing escapes it')
  {
    const iso = resumeMod.startIsolatedSeedResume
    let escaped: unknown = null
    let got: number | null = null
    const ok = await fx.captureConsole(() =>
      iso(
        async (deadlineAt) => {
          got = deadlineAt
        },
        { startedAtMs: 1_000_000, maxDurationMs: 300_000, nowMs: () => 1_050_000 },
      ),
    )
    check("the task is given the cron's end less the margin; a task that ends well logs nothing",
      got === 1_000_000 + 300_000 - resumeMod.RESUME_MARGIN_MS && ok.output === '', `${got} ${ok.output}`)

    let called = false
    const late = await fx.captureConsole(() =>
      iso(
        async () => {
          called = true
        },
        { startedAtMs: 1_000_000, maxDurationMs: 300_000, nowMs: () => 1_000_000 + 260_000 },
      ),
    )
    check(`under ${resumeMod.MIN_RESUME_WINDOW_MS / 1000}s left after the runner: not started, not a line`, !called && late.output === '')

    const thrown = await fx.captureConsole(() =>
      iso(
        () => {
          throw new TypeError(SECRET)
        },
        { startedAtMs: Date.now(), maxDurationMs: 300_000 },
      ).catch((err) => {
        escaped = err
      }),
    )
    check("a task that throws at once: resolved all the same, one line with the error's name only",
      escaped === null && thrown.output === '[seed-resume] failed {"reason":"threw","error":"TypeError"}', thrown.output)

    const rejected = await fx.captureConsole(() =>
      iso(async () => {
        throw new Error(SECRET)
      }, { startedAtMs: Date.now(), maxDurationMs: 300_000 }).catch((err) => {
        escaped = err
      }),
    )
    check('a task that rejects: the same', escaped === null && rejected.output === '[seed-resume] failed {"reason":"threw","error":"Error"}', rejected.output)

    let rejectLate: (err: unknown) => void = () => undefined
    const t0 = Date.now()
    const hung = await fx.captureConsole(() =>
      iso(
        () =>
          new Promise((_resolve, reject) => {
            rejectLate = reject
          }),
        { startedAtMs: Date.now(), maxDurationMs: 300, marginMs: 100, minWindowMs: 50 },
      ).catch((err) => {
        escaped = err
      }),
    )
    const took = Date.now() - t0
    check('a task that never ends is abandoned at its cap (its deadline plus half the margin: 250 ms here), one line',
      escaped === null && took >= 200 && took < 2_000 && hung.output === '[seed-resume] failed {"reason":"time_cap"}', `${took}ms ${hung.output}`)
    rejectLate(new Error(SECRET))
    await new Promise((resolve) => setTimeout(resolve, 20))
    check('…and its late rejection surfaces nowhere', unhandled.length === 0)
  }

  // ── 8. The cron route ─────────────────────────────────────────────────────
  console.log("\n8) The cron route: the runner first and its result unchanged; the resume after it, isolated")
  {
    RUNNER = RUNNER_OK
    RESUME = REAL_RESUME
    order.length = 0
    const none = await callCron(null)
    const wrong = await callCron('Bearer not-the-secret')
    check('no bearer, or the wrong one: 401 as before, nothing scheduled, nothing run',
      none.status === 401 && wrong.status === 401 && scheduled.length === 0 && order.length === 0)
    delete process.env.ENABLE_CONTENT_AUTOMATION
    const off = await callCron(BEARER)
    process.env.ENABLE_CONTENT_AUTOMATION = 'true'
    check('content automation off: 404 as before, nothing scheduled', off.status === 404 && scheduled.length === 0)

    // The baseline: the seed scan is off, so the resume is a no-op.
    let resumeArgs: any[] = []
    RESUME = (...a: any[]) => {
      resumeArgs = a
      return REAL_RESUME(...a)
    }
    const base = await callCron(BEARER)
    check('202 at once with { ok, accepted, startedAt }, the work scheduled',
      base.status === 202 && JSON.stringify(Object.keys(base.body).sort()) === '["accepted","ok","startedAt"]' && base.body.ok === true && base.body.accepted === true
        && scheduled.length === 1, JSON.stringify(base.body))
    const baseRun = await runScheduled()
    check('seed scan off: the runner, then the resume, which says nothing — the runner\'s line alone',
      baseRun.threw === null && order.join() === 'runner,resume' && baseRun.output === runnerLine(base.body.startedAt), baseRun.output)
    check('the resume is given what is left of maxDuration less the margin, and the environment',
      resumeArgs[1]?.deadlineAt === Date.parse(String(base.body.startedAt)) + 300_000 - resumeMod.RESUME_MARGIN_MS && resumeArgs[1]?.env === process.env,
      JSON.stringify(resumeArgs[1]?.deadlineAt))

    const failing: { name: string; resume: () => unknown; error: string }[] = [
      {
        name: 'throws',
        resume: () => {
          order.push('resume')
          throw new TypeError(SECRET)
        },
        error: 'TypeError',
      },
      {
        name: 'rejects',
        resume: async () => {
          order.push('resume')
          throw new Error(SECRET)
        },
        error: 'Error',
      },
    ]
    for (const c of failing) {
      RESUME = c.resume
      order.length = 0
      const r = await callCron(BEARER)
      const done = await runScheduled()
      const lines = done.output.split('\n')
      check(`the resume ${c.name}: the answer was 202 all the same and the after() work still resolves`, r.status === 202 && done.threw === null)
      check("…the runner's line is exactly the baseline's, written before the resume began",
        lines[0] === runnerLine(r.body.startedAt) && order.join() === 'runner,resume', lines[0])
      check(`…then one line, the error's name only (${c.error}), no provider text`,
        lines.length === 2 && lines[1] === `[seed-resume] failed {"reason":"threw","error":"${c.error}"}` && !done.output.includes(SECRET) && !r.output.includes(SECRET),
        done.output)
    }

    RESUME = REAL_RESUME
    RUNNER = async () => {
      order.push('runner')
      throw new Error('runner exploded')
    }
    order.length = 0
    await callCron(BEARER)
    const afterFailure = await runScheduled()
    check('the runner fails: its own failure line as before, and the resume still runs after it',
      afterFailure.threw === null && tagged(afterFailure.output, '[automation-cron] run failed').length === 1 && order.join() === 'runner,resume', afterFailure.output)

    const realNow = Date.now
    RUNNER = async () => {
      order.push('runner')
      const t = realNow()
      Date.now = () => t + 290_000
      return SUMMARY
    }
    order.length = 0
    const slow = await callCron(BEARER)
    const slowRun = await runScheduled().finally(() => {
      Date.now = realNow
    })
    check('the runner used 290 of its 300 seconds: the resume does not start; the runner\'s line alone',
      slowRun.threw === null && order.join() === 'runner' && slowRun.output === runnerLine(slow.body.startedAt), slowRun.output)
    RUNNER = RUNNER_OK
  }

  // ── 9. End to end ─────────────────────────────────────────────────────────
  console.log('\n9) End to end: the real cron route and the real resume finish a stage-B run stalled at b5')
  {
    // The worker died ten minutes ago, as b5 began: its lease lapsed long since.
    const s = await stageBRun(new Date(Date.now() - 10 * MIN))
    const dead = killAtMark(s.fake, s.tables, 'b5')
    await fx.captureConsole(() => runSeedStage({ admin: s.admin, scope: SCOPE, runId: s.runId, lease: s.lease, stageB: depsB(s.f, s.clk.now) }))
    const snap = dead()
    check('the worker died as b5 began: b1-b4 done', !!snap && line(snap, B_STEPS) === 'b1:done b2:done b3:done b4:done b5:running b6:pending', snap ? line(snap, B_STEPS) : 'no snapshot')
    if (snap) {
      const copy = structuredClone(snap)
      const { tables, fake } = fx.world(copy.projects[0] as Row, copy)
      const audit = auditOwners(fake)
      ADMIN_CLIENT = fake
      RUNNER = RUNNER_OK
      RESUME = REAL_RESUME
      order.length = 0
      process.env.ENABLE_SEED_SCAN = 'true'
      const requests: string[] = []
      const savedFetch = globalThis.fetch
      globalThis.fetch = (async (input: unknown) => {
        requests.push(String(input))
        throw new Error('no request expected')
      }) as typeof fetch
      try {
        const r = await callCron(BEARER)
        const done = await runScheduled()
        const lines = done.output.split('\n')
        const tick = payloadOf(lines[1])
        check('202, then the runner\'s line, then the one tick line', r.status === 202 && done.threw === null && lines.length === 2
          && lines[0] === runnerLine(r.body.startedAt) && lines[1].startsWith('[seed-resume] tick'), done.output)
        check('…which reports the run finished done in stage B',
          JSON.stringify(tick) === JSON.stringify({ found: 1, runs: [{ runId: s.runId, projectId: PROJECT, stage: 'b', outcome: 'finished', status: 'done', errorCode: null }], deferred: 0 }),
          lines[1])
        check('the run: b5 skipped (AI visibility off here), b6 skipped (no merchant), done, lease dropped',
          line(tables, B_STEPS) === 'b1:done b2:done b3:done b4:done b5:skipped(ai_visibility_disabled) b6:skipped(rank_check_session_required)'
            && runRow(tables).status === 'done' && runRow(tables).lease_expires_at === null,
          line(tables, B_STEPS))
        check('…no request left the process, and every query named the owner', requests.length === 0 && audit.offenders(USER).length === 0,
          `${requests.join(',')} ${audit.offenders(USER).join('; ')}`)
      } finally {
        globalThis.fetch = savedFetch
        delete process.env.ENABLE_SEED_SCAN
      }
    }
  }

  check('no unhandled rejection anywhere in this suite', unhandled.length === 0, String(unhandled.length))
  finish()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}

/**
 * The seed-run store: runs, their steps, the snapshot and the worker lease.
 *
 * What must hold: a run is created with all its steps pending (so a resumed
 * run is "the first step not finished"); two starts for one project agree on a
 * single winner; a run the cron may still resume is in progress, and only one
 * it gave up on is superseded; a lease can be taken only when it is empty or
 * lapsed, and every later write is fenced by the exact lease value, compared
 * as the instant it is (PostgREST reads it back in another form); stage B's
 * rows survive an attempt whose answer was lost; nothing is readable or
 * writable under another owner.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-store.qa.ts
 */
import {
  countAllSeedRunsSince,
  countProjectSeedRuns,
  countUserSeedRunsSince,
  createSeedRun,
  finishSeedRun,
  findRecentCompletedSeedRun,
  findSeedRunInProgress,
  getLatestSeedRun,
  getSeedRun,
  LEASE_MS,
  leaseUntil,
  listSeedSteps,
  MAX_RESUME_AGE_MS,
  nextSeedStep,
  releaseSeedLease,
  renewSeedLease,
  sameInstant,
  seedRunStatus,
  startSeedStageB,
  takeSeedLease,
  updateSeedStep,
  writeSeedSummary,
  type SeedRunRow,
} from '../store'
import { initialSummary, readSummary, withCounters } from '../summary'
import type { SeedStepStatus } from '../types'
import { clock, loseNextAnswer, makeChecker, NOW, OTHER_PROJECT, OTHER_USER, postgrestTimestamp, PROJECT, projectRow, USER, world } from './_fixtures'

const { check, finish } = makeChecker()
const SCOPE = { projectId: PROJECT, userId: USER }
const summary = () => initialSummary({ source: 'scan', domain: 'example.com', url: 'https://example.com/', locale: 'he' })

async function main() {
  console.log('1) A run is created with its lease held and every step pending')
  {
    const { tables, admin } = world(projectRow())
    const created = await createSeedRun(admin, SCOPE, { trigger: 'create', stage: 'a', summary: summary(), now: NOW })
    check('created', created.ok)
    if (!created.ok) return finish()
    const run = tables.project_seed_runs[0]
    check('the run is running, owned, and leased for LEASE_MS', run.status === 'running' && run.user_id === USER && run.project_id === PROJECT
      && run.lease_expires_at === new Date(NOW.getTime() + LEASE_MS).toISOString() && created.lease === run.lease_expires_at)
    const steps = tables.project_seed_steps
    check('four steps a1-a4, all pending, owned', steps.map((s) => `${s.step}:${s.status}`).join(',') === 'a1:pending,a2:pending,a3:pending,a4:pending'
      && steps.every((s) => s.user_id === USER && s.project_id === PROJECT && s.run_id === run.id))
    check('the first step to work is a1', nextSeedStep('a', steps as never) === 'a1')
    const withDetail = await createSeedRun(world(projectRow()).admin, SCOPE, { trigger: 'claim', stage: 'a', summary: summary(), stepDetail: { a1: { claim: { x: 1 } } }, now: NOW })
    check('a step can be created with its initial detail (the claimed scan on a1)', withDetail.ok)
  }

  console.log('\n2) Single flight: one live run per project')
  {
    const { tables, admin } = world(projectRow())
    const [a, b] = await Promise.all([
      createSeedRun(admin, SCOPE, { trigger: 'create', stage: 'a', summary: summary(), now: NOW }),
      createSeedRun(admin, SCOPE, { trigger: 'create', stage: 'a', summary: summary(), now: NOW }),
    ])
    const winners = [a, b].filter((r) => r.ok).length
    const loser = [a, b].find((r) => !r.ok)
    check('two simultaneous starts: exactly one wins', winners === 1, JSON.stringify([a.ok, b.ok]))
    check('…the other is told a run is in progress', !!loser && !loser.ok && loser.reason === 'in_progress')
    check("…and the loser's run and steps are removed", tables.project_seed_runs.length === 1 && tables.project_seed_steps.length === 4)
    const third = await createSeedRun(admin, SCOPE, { trigger: 'rescan', stage: 'a', summary: summary(), now: new Date(NOW.getTime() + 1000) })
    check('a start while a run is live is refused', !third.ok && third.reason === 'in_progress' && tables.project_seed_runs.length === 1)
    // A request that read the clock first but whose insert landed last (slow
    // caps checks): the order is the database's insert order, so it yields.
    const early = await createSeedRun(admin, SCOPE, { trigger: 'rescan', stage: 'a', summary: summary(), now: new Date(NOW.getTime() - 5_000) })
    check('a start that read the clock earlier but inserted later still yields', !early.ok && early.reason === 'in_progress' && tables.project_seed_runs.length === 1)
    check('findSeedRunInProgress sees it', (await findSeedRunInProgress(admin, SCOPE, NOW)) === true)
  }

  console.log('\n2b) A run whose worker is gone is still in progress while the cron may resume it')
  // The cron resumes a run whose lease is empty or lapsed for MAX_RESUME_AGE_MS
  // after its stage began (listStalledSeedRuns). Until then it is neither live
  // nor finished, and a new start must wait for it, not supersede it.
  const expired = new Date(NOW.getTime() + MAX_RESUME_AGE_MS + 1)
  {
    const { tables, admin } = world(projectRow())
    await createSeedRun(admin, SCOPE, { trigger: 'create', stage: 'a', summary: summary(), now: NOW })
    const later = new Date(NOW.getTime() + LEASE_MS + 1)
    check('its lease lapsed: still in progress, the cron will resume it', (await findSeedRunInProgress(admin, SCOPE, later)) === true)
    const blocked = await createSeedRun(admin, SCOPE, { trigger: 'rescan', stage: 'a', summary: summary(), now: later })
    check('…so a new start yields to it, and it stays running',
      !blocked.ok && blocked.reason === 'in_progress' && tables.project_seed_runs.length === 1 && tables.project_seed_runs[0].status === 'running', JSON.stringify(blocked))
    check('once the cron has given up on it (MAX_RESUME_AGE_MS), it is no longer in progress', (await findSeedRunInProgress(admin, SCOPE, expired)) === false)
    const fresh = await createSeedRun(admin, SCOPE, { trigger: 'rescan', stage: 'a', summary: summary(), now: expired })
    check('…and a new start supersedes it', fresh.ok && tables.project_seed_runs[0].status === 'failed' && tables.project_seed_runs[0].error_code === 'superseded'
      && tables.project_seed_runs[0].lease_expires_at === null)
    const released = world(projectRow())
    const r = await createSeedRun(released.admin, SCOPE, { trigger: 'create', stage: 'a', summary: summary(), now: NOW })
    if (r.ok) await releaseSeedLease(released.admin, SCOPE, r.run.id, r.lease)
    const again = await createSeedRun(released.admin, SCOPE, { trigger: 'rescan', stage: 'a', summary: summary(), now: NOW })
    check('a run whose worker handed the lease back is in progress too', !again.ok && again.reason === 'in_progress' && released.tables.project_seed_runs[0].status === 'running')
    const gone = await createSeedRun(released.admin, SCOPE, { trigger: 'rescan', stage: 'a', summary: summary(), now: expired })
    check('…until the cron gives up on it: then it is superseded', gone.ok && released.tables.project_seed_runs[0].error_code === 'superseded')
  }
  {
    // Stage A done; an hour later the merchant continues; the worker hands
    // the run back between two steps (a failed write, or its time cap).
    const { tables, admin } = world(projectRow())
    const created = await createSeedRun(admin, SCOPE, { trigger: 'create', stage: 'a', summary: summary(), now: NOW })
    if (!created.ok) return finish()
    await finishSeedRun(admin, SCOPE, created.run.id, created.lease, { status: 'done', errorCode: null, now: NOW })
    const continuedAt = new Date(NOW.getTime() + 60 * 60 * 1000)
    const moved = await startSeedStageB(admin, SCOPE, (await getSeedRun(admin, SCOPE, created.run.id)) as SeedRunRow, continuedAt)
    if (moved.ok) await releaseSeedLease(admin, SCOPE, created.run.id, moved.lease)
    const next = new Date(continuedAt.getTime() + 5 * 60 * 1000)
    check('a stage B between two workers (no lease) is in progress', moved.ok && (await findSeedRunInProgress(admin, SCOPE, next)) === true)
    const start = await createSeedRun(admin, SCOPE, { trigger: 'rescan', stage: 'a', summary: summary(), now: next })
    check('…and a new start does not supersede it (its keywords are chosen)',
      !start.ok && start.reason === 'in_progress' && tables.project_seed_runs.length === 1 && tables.project_seed_runs[0].stage === 'b' && tables.project_seed_runs[0].status === 'running')
    check('its hours count from the start of stage B, not of the run',
      (await findSeedRunInProgress(admin, SCOPE, expired)) === true
      && (await findSeedRunInProgress(admin, SCOPE, new Date(continuedAt.getTime() + MAX_RESUME_AGE_MS + 1))) === false)
  }
  {
    const { tables, admin } = world(projectRow(), {}, { project_seed_steps: { insert: () => ({ code: 'XX000' }) } })
    const r = await createSeedRun(admin, SCOPE, { trigger: 'create', stage: 'a', summary: summary(), now: NOW })
    check('a run whose steps cannot be written is not left behind', !r.ok && r.reason === 'db_error' && tables.project_seed_runs.length === 0)
  }

  console.log('\n3) The lease: taken only when free, and every write fenced by its exact value')
  {
    const { tables, admin } = world(projectRow())
    const c = clock()
    const created = await createSeedRun(admin, SCOPE, { trigger: 'create', stage: 'a', summary: summary(), now: c.now() })
    if (!created.ok) return finish()
    const id = created.run.id
    check('a held lease cannot be taken', (await takeSeedLease(admin, SCOPE, id, c.now())) === null)
    c.advance(LEASE_MS + 1)
    const first = await takeSeedLease(admin, SCOPE, id, c.now())
    const second = await takeSeedLease(admin, SCOPE, id, c.now())
    check('a lapsed lease is taken by exactly one of two takers', first !== null && second === null)
    check("the old holder's renewal fails", (await renewSeedLease(admin, SCOPE, id, created.lease, c.now())) === null)
    check("the old holder's snapshot write fails", (await writeSeedSummary(admin, SCOPE, id, created.lease, summary())) === false)
    check("the old holder cannot finish the run", (await finishSeedRun(admin, SCOPE, id, created.lease, { status: 'done', errorCode: null, now: c.now() })) === false
      && tables.project_seed_runs[0].status === 'running')
    c.advance(1000)
    const renewed = await renewSeedLease(admin, SCOPE, id, first as string, c.now())
    check('the holder renews, and the lease moves forward', renewed !== null && renewed > (first as string))
    check('…after which the previous value no longer works', (await writeSeedSummary(admin, SCOPE, id, first as string, summary())) === false)
    check('the holder writes the snapshot', await writeSeedSummary(admin, SCOPE, id, renewed as string, withCounters({ ...summary(), seedKeywords: ['k'] })))
    check('…and it reads back', readSummary(tables.project_seed_runs[0].summary)?.seedKeywords[0] === 'k')
    check('the holder finishes the run and the lease is dropped',
      (await finishSeedRun(admin, SCOPE, id, renewed as string, { status: 'partial', errorCode: 'model_failed', now: c.now() }))
      && tables.project_seed_runs[0].status === 'partial' && tables.project_seed_runs[0].lease_expires_at === null && tables.project_seed_runs[0].error_code === 'model_failed')
    check('a finished run cannot be leased again', (await takeSeedLease(admin, SCOPE, id, new Date(c.now().getTime() + 10 * LEASE_MS))) === null)
  }

  console.log('\n4) Steps and verdicts')
  {
    const { admin } = world(projectRow())
    const created = await createSeedRun(admin, SCOPE, { trigger: 'create', stage: 'a', summary: summary(), now: NOW })
    if (!created.ok) return finish()
    const id = created.run.id
    check('a step is updated individually', await updateSeedStep(admin, SCOPE, id, 'a1', { status: 'done', item_count: 12, detail: { k: 1 }, finished_at: NOW.toISOString() }))
    const steps = (await listSeedSteps(admin, SCOPE, id)) as { step: string; status: SeedStepStatus }[]
    check('…and read back with the others untouched', steps.find((s) => s.step === 'a1')?.status === 'done' && steps.filter((s) => s.status === 'pending').length === 3)
    check('the next step is the first not finished', nextSeedStep('a', steps as never) === 'a2')
    check('a missing step row is not written by an update', (await updateSeedStep(admin, SCOPE, id, 'b1', { status: 'done' })) === false)
  }
  const v = (list: [string, SeedStepStatus, string?][]) => seedRunStatus('a', list.map(([step, status, error_code]) => ({ step: step as never, status, error_code: error_code ?? null })))
  check('verdict: every step done or skipped → done', JSON.stringify(v([['a1', 'done'], ['a2', 'skipped', 'storefront_locked'], ['a3', 'done'], ['a4', 'done']])) === '{"status":"done","errorCode":null}')
  check('verdict: a1 failed → failed, with its code', JSON.stringify(v([['a1', 'failed', 'site_blocked'], ['a2', 'skipped'], ['a3', 'skipped'], ['a4', 'skipped']])) === '{"status":"failed","errorCode":"site_blocked"}')
  check('verdict: a later step failed → partial, with the first failure\'s code', JSON.stringify(v([['a1', 'done'], ['a2', 'failed', 'model_failed'], ['a3', 'done'], ['a4', 'failed', 'search_failed']])) === '{"status":"partial","errorCode":"model_failed"}')
  check('nextSeedStep is null when all are finished', nextSeedStep('a', [{ step: 'a1', status: 'done' }, { step: 'a2', status: 'failed' }, { step: 'a3', status: 'skipped' }, { step: 'a4', status: 'done' }]) === null)
  check("a step left 'running' by a dead worker is where a resume starts",
    nextSeedStep('a', [{ step: 'a1', status: 'done' }, { step: 'a2', status: 'running' }, { step: 'a3', status: 'pending' }, { step: 'a4', status: 'pending' }]) === 'a2')
  check('stage b has its six steps for the later package', nextSeedStep('b', []) === 'b1')

  console.log('\n5) Nothing is readable or writable under another owner')
  {
    const { tables, admin } = world(projectRow())
    const created = await createSeedRun(admin, SCOPE, { trigger: 'create', stage: 'a', summary: summary(), now: NOW })
    if (!created.ok) return finish()
    const id = created.run.id
    const intruder = { projectId: PROJECT, userId: OTHER_USER }
    const elsewhere = { projectId: OTHER_PROJECT, userId: USER }
    check('getSeedRun under another user → nothing', (await getSeedRun(admin, intruder, id)) === null)
    check('getSeedRun under another project → nothing', (await getSeedRun(admin, elsewhere, id)) === null)
    check('getLatestSeedRun under another user → nothing', (await getLatestSeedRun(admin, intruder)) === null)
    check('listSeedSteps under another user → nothing', ((await listSeedSteps(admin, intruder, id)) as unknown[]).length === 0)
    check('updateSeedStep under another user → no write', (await updateSeedStep(admin, intruder, id, 'a1', { status: 'done' })) === false && tables.project_seed_steps[0].status === 'pending')
    check('takeSeedLease under another user → no', (await takeSeedLease(admin, intruder, id, new Date(NOW.getTime() + 10 * LEASE_MS))) === null)
    check('renew / snapshot / finish under another user → no',
      (await renewSeedLease(admin, intruder, id, created.lease, NOW)) === null
      && (await writeSeedSummary(admin, intruder, id, created.lease, summary())) === false
      && (await finishSeedRun(admin, intruder, id, created.lease, { status: 'done', errorCode: null, now: NOW })) === false)
    check("a start by another user supersedes nothing of this user's", (await createSeedRun(admin, intruder, { trigger: 'create', stage: 'a', summary: summary(), now: new Date(NOW.getTime() + 10 * LEASE_MS) })).ok
      && tables.project_seed_runs[0].status === 'running')
  }

  console.log('\n6) What the caps count')
  {
    const day = new Date('2026-09-27T00:00:00.000Z')
    const run = (o: Record<string, unknown>) => ({ id: `r${Math.random()}`, project_id: PROJECT, user_id: USER, trigger: 'rescan', stage: 'a', status: 'done', summary: {}, error_code: null, lease_expires_at: null, started_at: 'x', finished_at: null, ...o })
    const { admin } = world(projectRow(), {
      project_seed_runs: [
        run({ created_at: '2026-09-27T01:00:00.000Z' }),
        run({ created_at: '2026-09-27T02:00:00.000Z', status: 'failed' }),
        run({ created_at: '2026-09-26T23:00:00.000Z' }),
        run({ created_at: '2026-09-27T03:00:00.000Z', user_id: OTHER_USER, project_id: OTHER_PROJECT }),
      ],
    })
    check("this user's runs today (any project, failed ones included)", (await countUserSeedRunsSince(admin, USER, day)) === 2)
    check("everyone's runs today", (await countAllSeedRunsSince(admin, day)) === 3)
    check("this project's runs, ever", (await countProjectSeedRuns(admin, SCOPE)) === 3)
    const recent = await findRecentCompletedSeedRun(admin, SCOPE, new Date('2026-09-26T09:00:00.000Z'))
    check('the newest finished run since a moment — failed runs do not count',
      recent !== 'error' && sameInstant(recent?.created_at, '2026-09-27T01:00:00.000Z'), JSON.stringify(recent))
  }

  console.log('\n7) The lease is an instant: PostgREST reads it back as …+00:00')
  {
    const { admin } = world(projectRow())
    const created = await createSeedRun(admin, SCOPE, { trigger: 'create', stage: 'a', summary: summary(), now: NOW })
    if (!created.ok) return finish()
    const read = (await getSeedRun(admin, SCOPE, created.run.id)) as SeedRunRow
    check('the fixture answers as PostgREST does: written as …Z, read back as …+00:00',
      created.lease.endsWith('.000Z') && read.lease_expires_at === postgrestTimestamp(created.lease) && read.lease_expires_at !== created.lease, `${created.lease} → ${read.lease_expires_at}`)
    check('sameInstant: the two forms of one lease are the same lease', sameInstant(read.lease_expires_at, created.lease))
    check('sameInstant: a lease a millisecond later is not', !sameInstant(read.lease_expires_at, leaseUntil(NOW, LEASE_MS + 1)))
    check('sameInstant: no lease, or no time at all, is never the same',
      !sameInstant(null, created.lease) && !sameInstant(created.lease, undefined) && !sameInstant('', '') && !sameInstant('soon', 'soon'))
    check('a fenced write given the value read back still matches: Postgres compares instants',
      await writeSeedSummary(admin, SCOPE, created.run.id, read.lease_expires_at as string, summary()))
  }

  console.log("\n8) Stage B's rows: an attempt whose write landed but whose answer was lost")
  {
    const { tables, fake, admin } = world(projectRow())
    const created = await createSeedRun(admin, SCOPE, { trigger: 'create', stage: 'a', summary: summary(), now: NOW })
    if (!created.ok) return finish()
    await finishSeedRun(admin, SCOPE, created.run.id, created.lease, { status: 'partial', errorCode: 'model_failed', now: NOW })
    const run = (await getSeedRun(admin, SCOPE, created.run.id)) as SeedRunRow
    const bRows = () => tables.project_seed_steps.filter((s) => String(s.step).startsWith('b'))
    loseNextAnswer(fake, 'project_seed_steps')
    const first = await startSeedStageB(admin, SCOPE, run, NOW)
    const row = tables.project_seed_runs[0]
    check('the answer is lost: db_error, and the run is handed back as stage A left it',
      !first.ok && first.reason === 'db_error' && row.stage === 'a' && row.status === 'partial' && row.error_code === 'model_failed' && row.lease_expires_at === null, JSON.stringify(first))
    check('…while its six rows did land', bRows().length === 6)
    const again = await startSeedStageB(admin, SCOPE, run, new Date(NOW.getTime() + 1_000))
    check('continuing again works: the rows already there are kept, none is added twice',
      again.ok && bRows().length === 6 && tables.project_seed_runs[0].stage === 'b' && tables.project_seed_runs[0].status === 'running', JSON.stringify(again))
  }

  finish()
}

main().catch((err) => {
  console.error('suite crashed', err)
  process.exit(1)
})
export {}

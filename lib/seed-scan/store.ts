/**
 * The seed-run store: runs, their steps, the snapshot, and the worker lease.
 *
 * WHO WRITES. project_seed_runs and project_seed_steps have no write policy for
 * any browser role (supabase/migrations/20260927000000_project_seed_scan.sql):
 * only this server code writes them, with the service-role client. That client
 * bypasses RLS, so every query below names the owner explicitly —
 * `.eq('project_id', …)` AND `.eq('user_id', …)`, or both columns in the row it
 * inserts. Two exceptions, both pinned down by
 * lib/seed-scan/__qa__/seed-source-guards.qa.ts: the global daily cap, a
 * head-only count that returns a number and no row; and the cron's discovery
 * of stalled runs, which has no owner to filter by and so returns only the
 * keys (id, project_id, user_id, stage) that every later, owner-filtered
 * query then uses.
 *
 * THE LEASE. A run is worked by whoever holds its lease, and `lease_expires_at`
 * itself is the fencing token: taking a lease is a conditional UPDATE that only
 * matches when the lease is empty or already expired, and renewing, writing the
 * snapshot, and finishing are conditional UPDATEs that only match while the
 * column still holds the exact value this worker wrote. Postgres evaluates the
 * condition under the row lock, so two workers can never both take one run: the
 * loser matches zero rows. A worker that lost its lease finds out on its next
 * renewal and stops without writing another step. The value compared is an
 * instant, not a string: PostgREST reads the lease back as `…+00:00`, never in
 * the `…Z` form it was written in, so a JS check uses sameInstant.
 *
 * RESUME. Steps are created as `pending` together with the run, and each one is
 * finished individually, so a run that died midway is exactly "the first step
 * that is not finished" plus everything the finished steps saved.
 *
 * STAGE B. A finished stage A (done or partial) moves on to stage B in one
 * conditional UPDATE (startSeedStageB): the same run, back to `running`, with a
 * new lease, and b1-b6 added as `pending` next to its a1-a4. The condition is
 * the stage and the status, so of two requests only one moves it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { ProjectSeedRunRow, ProjectSeedStepRow } from '@/lib/supabase/types'
import {
  STAGE_STEPS,
  TERMINAL_STEP_STATUSES,
  type SeedErrorCode,
  type SeedRunStage,
  type SeedRunStatus,
  type SeedRunTrigger,
  type SeedScope,
  type SeedStep,
  type SeedStepStatus,
  type SeedSummary,
} from './types'

/**
 * How long a worker owns a run without renewing. It renews before every step,
 * and no step can take longer than its own budget (steps.ts, 18s at most), so
 * this is generous; it is also how long a run whose worker died waits before
 * the cron may take it over.
 */
export const LEASE_MS = 120_000

/**
 * Stage B's lease. Its longest step without an intermediate save is the content
 * plan (steps-b.ts, 120s), and a worker renews before every step and every
 * save, so the lease must outlast that step; 330s is also longer than the
 * route's whole life (maxDuration 300), so a live worker's lease never lapses
 * under it. A run whose worker died is taken over at most 5.5 minutes later.
 */
export const STAGE_B_LEASE_MS = 330_000

export const STAGE_LEASE_MS: Record<SeedRunStage, number> = { a: LEASE_MS, b: STAGE_B_LEASE_MS }

/**
 * The cron leaves a run alone once its current stage began this long ago: it
 * has been retried enough. Counted from `started_at`, which the move to stage B
 * restarts (startSeedStageB), so a stage B continued days after stage A still
 * gets its full day.
 */
export const MAX_RESUME_AGE_MS = 24 * 60 * 60 * 1000

/** A running run whose current stage began after this is still the cron's to resume. */
function resumableSinceIso(now: Date): string {
  return new Date(now.getTime() - MAX_RESUME_AGE_MS).toISOString()
}

const RUN_COLUMNS = 'id, project_id, user_id, trigger, stage, status, summary, error_code, lease_expires_at, started_at, finished_at, created_at'
const STEP_COLUMNS = 'run_id, project_id, user_id, step, status, item_count, detail, error_code, started_at, finished_at'

export type SeedRunRow = ProjectSeedRunRow
export type SeedStepRow = ProjectSeedStepRow

/** Reads work with either client: the owner's RLS-scoped one or the service role. */
type ReadDb = SupabaseClient

export function leaseUntil(now: Date, ms: number = LEASE_MS): string {
  return new Date(now.getTime() + ms).toISOString()
}

/**
 * Whether two timestamps name the same instant. A lease is written as
 * toISOString() (`…T10:02:00.000Z`) and PostgREST reads it back as
 * `…T10:02:00+00:00`: the same instant, another string. Postgres compares the
 * instants in every fenced write; a check made in JS must do the same.
 */
export function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const x = Date.parse(a)
  const y = Date.parse(b)
  return Number.isFinite(x) && Number.isFinite(y) && x === y
}

// ── Runs ────────────────────────────────────────────────────────────────────

export type CreateRunResult =
  | { ok: true; run: SeedRunRow; lease: string }
  | { ok: false; reason: 'in_progress' | 'db_error' }

/**
 * Create a run with its lease already held, and its steps as `pending`.
 *
 * Single flight without a lock table: the run is inserted, then the project's
 * runs in progress are read back in (created_at, id) order, and only the first
 * one may proceed; the loser deletes its own row and answers "in progress".
 * `created_at` is left to the database default (now() of the inserting
 * transaction), so the order is the order the inserts actually happened in:
 * whichever insert lands after another request's read also sorts after it and
 * yields, and two inserts that both land before either read are both seen by
 * both, which agree on one winner.
 *
 * In progress means a live worker holds the run, or its worker is gone and the
 * cron will still resume it (its current stage began within
 * MAX_RESUME_AGE_MS): such a run is older than the new one, so the new one
 * yields to it. Only a run the cron has given up on (lease lapsed, stage begun
 * longer ago than that) is superseded, first.
 */
export async function createSeedRun(
  admin: ServiceRoleClient,
  scope: SeedScope,
  input: {
    trigger: SeedRunTrigger
    stage: SeedRunStage
    summary: SeedSummary
    /** Initial `detail` for a step, e.g. the claimed scan a1 seeds from. */
    stepDetail?: Partial<Record<SeedStep, Record<string, unknown>>>
    now: Date
  },
): Promise<CreateRunResult> {
  const nowIso = input.now.toISOString()
  const lease = leaseUntil(input.now)
  const resumableSince = resumableSinceIso(input.now)

  const stale = await admin
    .from('project_seed_runs')
    .update({ status: 'failed', error_code: 'superseded', finished_at: nowIso, lease_expires_at: null })
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('status', 'running')
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
    .lt('started_at', resumableSince)
  if (stale.error) return { ok: false, reason: 'db_error' }

  const inserted = await admin
    .from('project_seed_runs')
    .insert({
      project_id: scope.projectId,
      user_id: scope.userId,
      trigger: input.trigger,
      stage: input.stage,
      status: 'running',
      summary: input.summary,
      lease_expires_at: lease,
      started_at: nowIso,
    })
    .select(RUN_COLUMNS)
  const run = (inserted.data as SeedRunRow[] | null)?.[0]
  if (inserted.error || !run) return { ok: false, reason: 'db_error' }

  const steps = await admin
    .from('project_seed_steps')
    .insert(
      STAGE_STEPS[input.stage].map((step) => ({
        run_id: run.id,
        project_id: scope.projectId,
        user_id: scope.userId,
        step,
        status: 'pending',
        detail: input.stepDetail?.[step] ?? {},
      })),
    )
  if (steps.error) {
    await discardSeedRun(admin, scope, run.id)
    return { ok: false, reason: 'db_error' }
  }

  const live = await admin
    .from('project_seed_runs')
    .select('id, created_at')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('status', 'running')
    .or(`lease_expires_at.gt.${nowIso},started_at.gt.${resumableSince}`)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
  const first = (live.data as { id: string }[] | null)?.[0]
  if (live.error || !first) {
    await discardSeedRun(admin, scope, run.id)
    return { ok: false, reason: 'db_error' }
  }
  if (first.id !== run.id) {
    await discardSeedRun(admin, scope, run.id)
    return { ok: false, reason: 'in_progress' }
  }
  return { ok: true, run, lease }
}

/**
 * Remove a run that never started. Only ever our own, just-created row. The
 * steps would cascade; they are removed first anyway so nothing depends on it.
 */
async function discardSeedRun(admin: ServiceRoleClient, scope: SeedScope, runId: string): Promise<void> {
  await admin
    .from('project_seed_steps')
    .delete()
    .eq('run_id', runId)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
  await admin
    .from('project_seed_runs')
    .delete()
    .eq('id', runId)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
}

export async function getSeedRun(db: ReadDb, scope: SeedScope, runId: string): Promise<SeedRunRow | null | 'error'> {
  const { data, error } = await db
    .from('project_seed_runs')
    .select(RUN_COLUMNS)
    .eq('id', runId)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .maybeSingle()
  if (error) return 'error'
  return (data as SeedRunRow | null) ?? null
}

export async function getLatestSeedRun(db: ReadDb, scope: SeedScope): Promise<SeedRunRow | null | 'error'> {
  const { data, error } = await db
    .from('project_seed_runs')
    .select(RUN_COLUMNS)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
  if (error) return 'error'
  return (data as SeedRunRow[] | null)?.[0] ?? null
}

// ── Steps ───────────────────────────────────────────────────────────────────

export async function listSeedSteps(db: ReadDb, scope: SeedScope, runId: string): Promise<SeedStepRow[] | 'error'> {
  const { data, error } = await db
    .from('project_seed_steps')
    .select(STEP_COLUMNS)
    .eq('run_id', runId)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
  if (error) return 'error'
  return (data as SeedStepRow[] | null) ?? []
}

export type StepPatch = {
  status: SeedStepStatus
  item_count?: number | null
  detail?: Record<string, unknown>
  error_code?: SeedErrorCode | null
  started_at?: string | null
  finished_at?: string | null
}

/** Update one step of one run. False when the row is missing or the write failed. */
export async function updateSeedStep(
  admin: ServiceRoleClient,
  scope: SeedScope,
  runId: string,
  step: SeedStep,
  patch: StepPatch,
): Promise<boolean> {
  const { data, error } = await admin
    .from('project_seed_steps')
    .update(patch)
    .eq('run_id', runId)
    .eq('step', step)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .select('step')
  return !error && ((data as unknown[] | null)?.length ?? 0) === 1
}

/** The first step of the stage that is not finished, or null when all are. */
export function nextSeedStep(stage: SeedRunStage, steps: Pick<SeedStepRow, 'step' | 'status'>[]): SeedStep | null {
  for (const step of STAGE_STEPS[stage]) {
    const row = steps.find((s) => s.step === step)
    if (!row || !TERMINAL_STEP_STATUSES.includes(row.status)) return step
  }
  return null
}

/**
 * The run's verdict from its steps: failed when the first step failed (nothing
 * was read, so nothing downstream means anything), partial when a later step
 * failed, done otherwise. A skipped step is a deliberate outcome, not a failure.
 *
 * A stage-B run is judged on all ten steps, and is never `failed`: its stage A
 * read the site (it could not have continued otherwise), so whatever b1-b6
 * found or did not find, the run is done or partial.
 */
export function seedRunStatus(
  stage: SeedRunStage,
  steps: Pick<SeedStepRow, 'step' | 'status' | 'error_code'>[],
): { status: SeedRunStatus; errorCode: string | null } {
  const order = stage === 'b' ? [...STAGE_STEPS.a, ...STAGE_STEPS.b] : STAGE_STEPS[stage]
  const ordered = order.map((step) => steps.find((s) => s.step === step))
  const first = ordered[0]
  if (stage === 'a' && first?.status === 'failed') return { status: 'failed', errorCode: first.error_code ?? 'internal_error' }
  const failed = ordered.find((s) => s?.status === 'failed')
  if (failed) return { status: 'partial', errorCode: failed.error_code ?? 'internal_error' }
  return { status: 'done', errorCode: null }
}

/**
 * Put back the rows of a stage that are missing (as `pending`), so a resumed
 * run never meets a step it cannot mark. Nothing to do in the normal case: the
 * rows are created with the run, or with its stage B.
 */
export async function insertMissingSeedSteps(
  admin: ServiceRoleClient,
  scope: SeedScope,
  runId: string,
  stage: SeedRunStage,
  existing: Pick<SeedStepRow, 'step'>[],
): Promise<boolean> {
  const missing = STAGE_STEPS[stage].filter((step) => !existing.some((s) => s.step === step))
  if (missing.length === 0) return true
  const { error } = await admin
    .from('project_seed_steps')
    .insert(
      missing.map((step) => ({
        run_id: runId,
        project_id: scope.projectId,
        user_id: scope.userId,
        step,
        status: 'pending',
        detail: {},
      })),
    )
  return !error
}

// ── Snapshot and lease (all fenced by the lease value) ─────────────────────

async function fencedRunUpdate(
  admin: ServiceRoleClient,
  scope: SeedScope,
  runId: string,
  lease: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await admin
    .from('project_seed_runs')
    .update(patch)
    .eq('id', runId)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('status', 'running')
    .eq('lease_expires_at', lease)
    .select('id')
  return !error && ((data as unknown[] | null)?.length ?? 0) === 1
}

/** Replace the snapshot. Only the lease holder can. */
export function writeSeedSummary(
  admin: ServiceRoleClient,
  scope: SeedScope,
  runId: string,
  lease: string,
  summary: SeedSummary,
): Promise<boolean> {
  return fencedRunUpdate(admin, scope, runId, lease, { summary })
}

/**
 * Take the lease of a run nobody is working: empty, or expired. Returns the new
 * lease value, or null when another worker holds it (or the run is finished).
 */
export async function takeSeedLease(
  admin: ServiceRoleClient,
  scope: SeedScope,
  runId: string,
  now: Date,
  ms: number = LEASE_MS,
): Promise<string | null> {
  const lease = leaseUntil(now, ms)
  const { data, error } = await admin
    .from('project_seed_runs')
    .update({ lease_expires_at: lease })
    .eq('id', runId)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('status', 'running')
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${now.toISOString()}`)
    .select('id')
  if (error || ((data as unknown[] | null)?.length ?? 0) !== 1) return null
  return lease
}

/** Extend a lease this worker holds. Null means it was lost: stop working the run. */
export async function renewSeedLease(
  admin: ServiceRoleClient,
  scope: SeedScope,
  runId: string,
  lease: string,
  now: Date,
  ms: number = LEASE_MS,
): Promise<string | null> {
  const next = leaseUntil(now, ms)
  return (await fencedRunUpdate(admin, scope, runId, lease, { lease_expires_at: next })) ? next : null
}

/** Give a lease back without finishing the run, so another worker may take it at once. */
export function releaseSeedLease(admin: ServiceRoleClient, scope: SeedScope, runId: string, lease: string): Promise<boolean> {
  return fencedRunUpdate(admin, scope, runId, lease, { lease_expires_at: null })
}

/** Finish the run and drop the lease in the same fenced write. */
export function finishSeedRun(
  admin: ServiceRoleClient,
  scope: SeedScope,
  runId: string,
  lease: string,
  outcome: { status: SeedRunStatus; errorCode: string | null; now: Date },
): Promise<boolean> {
  return fencedRunUpdate(admin, scope, runId, lease, {
    status: outcome.status,
    error_code: outcome.errorCode,
    finished_at: outcome.now.toISOString(),
    lease_expires_at: null,
  })
}

// ── Stage B ─────────────────────────────────────────────────────────────────

export type StartStageBResult =
  | { ok: true; lease: string }
  | { ok: false; reason: 'not_continuable' | 'db_error' }

/**
 * Move a finished stage A on to stage B, with the lease held by the caller.
 *
 * One conditional UPDATE decides it: it matches only while the run is still at
 * stage 'a' and done or partial, so of two concurrent requests exactly one
 * moves it (the other matches zero rows and answers not_continuable). Then
 * b1-b6 are added as `pending`, rows an earlier attempt already added kept as
 * they are. If that write fails, the run is handed back exactly as stage A left
 * it, fenced by the lease just taken, and the merchant can simply continue again.
 *
 * `started_at` and `finished_at` bracket the run's current stage: the move
 * restarts the one and clears the other, so the cron's MAX_RESUME_AGE_MS counts
 * from the start of stage B, however long after stage A the merchant continued.
 * Stage A's own times stay on a1-a4.
 */
export async function startSeedStageB(
  admin: ServiceRoleClient,
  scope: SeedScope,
  run: Pick<SeedRunRow, 'id' | 'status' | 'error_code' | 'started_at' | 'finished_at'>,
  now: Date,
): Promise<StartStageBResult> {
  const lease = leaseUntil(now, STAGE_B_LEASE_MS)
  const moved = await admin
    .from('project_seed_runs')
    .update({ stage: 'b', status: 'running', error_code: null, started_at: now.toISOString(), finished_at: null, lease_expires_at: lease })
    .eq('id', run.id)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('stage', 'a')
    .in('status', ['done', 'partial'])
    .select('id')
  if (moved.error) return { ok: false, reason: 'db_error' }
  if (((moved.data as unknown[] | null)?.length ?? 0) !== 1) return { ok: false, reason: 'not_continuable' }

  // ON CONFLICT DO NOTHING on the key (run_id, step): an earlier attempt whose
  // write landed but whose answer was lost left these very rows behind (its
  // back-out below cannot know they exist), and a plain insert would then fail
  // on them with 23505 at every later attempt.
  const steps = await admin
    .from('project_seed_steps')
    .upsert(
      STAGE_STEPS.b.map((step) => ({
        run_id: run.id,
        project_id: scope.projectId,
        user_id: scope.userId,
        step,
        status: 'pending',
        detail: {},
      })),
      { onConflict: 'run_id,step', ignoreDuplicates: true },
    )
  if (steps.error) {
    await fencedRunUpdate(admin, scope, run.id, lease, {
      stage: 'a',
      status: run.status,
      error_code: run.error_code,
      started_at: run.started_at,
      finished_at: run.finished_at,
      lease_expires_at: null,
    })
    return { ok: false, reason: 'db_error' }
  }
  return { ok: true, lease }
}

// ── What the cron resumes ───────────────────────────────────────────────────

export type StalledSeedRun = { id: string; project_id: string; user_id: string; stage: SeedRunStage }

/**
 * Runs still marked running whose worker is gone (lease empty or lapsed),
 * oldest first, whose current stage began within MAX_RESUME_AGE_MS.
 *
 * The one read here with no owner to filter by — the cron works for every
 * account — so it returns the run's keys and nothing else: no snapshot, no
 * step, no lease. Every query that follows is filtered by the owner these keys
 * name, and taking the lease is still the conditional UPDATE of takeSeedLease.
 */
export async function listStalledSeedRuns(admin: ServiceRoleClient, now: Date, limit: number): Promise<StalledSeedRun[] | 'error'> {
  const { data, error } = await admin
    .from('project_seed_runs')
    .select('id, project_id, user_id, stage')
    .eq('status', 'running')
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${now.toISOString()}`)
    .gt('started_at', resumableSinceIso(now))
    .order('started_at', { ascending: true })
    .limit(limit)
  if (error) return 'error'
  return ((data as StalledSeedRun[] | null) ?? []).filter((r) => r.stage === 'a' || r.stage === 'b')
}

// ── What the caps read ─────────────────────────────────────────────────────

/**
 * A run of this project still in progress: a live worker holds it, or its
 * worker is gone and the cron will still resume it (its current stage began
 * within MAX_RESUME_AGE_MS; listStalledSeedRuns). A run between two workers is
 * neither live nor finished, and a new start must not supersede it: it may be
 * a stage B the merchant already chose keywords for.
 */
export async function findSeedRunInProgress(admin: ServiceRoleClient, scope: SeedScope, now: Date): Promise<boolean | 'error'> {
  const { data, error } = await admin
    .from('project_seed_runs')
    .select('id')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('status', 'running')
    .or(`lease_expires_at.gt.${now.toISOString()},started_at.gt.${resumableSinceIso(now)}`)
    .limit(1)
  if (error) return 'error'
  return ((data as unknown[] | null)?.length ?? 0) > 0
}

/**
 * The newest run since `since` that actually read the site (done or partial).
 * A failed run read nothing and spent nothing but a few fetches of the
 * merchant's own site, so it does not hold back a retry.
 */
export async function findRecentCompletedSeedRun(
  admin: ServiceRoleClient,
  scope: SeedScope,
  since: Date,
): Promise<{ created_at: string } | null | 'error'> {
  const { data, error } = await admin
    .from('project_seed_runs')
    .select('id, created_at')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .in('status', ['done', 'partial'])
    .gt('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) return 'error'
  return (data as { created_at: string }[] | null)?.[0] ?? null
}

/** How many runs this project has ever had (decides create vs rescan). */
export async function countProjectSeedRuns(admin: ServiceRoleClient, scope: SeedScope): Promise<number | 'error'> {
  const { count, error } = await admin
    .from('project_seed_runs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
  if (error) return 'error'
  return count ?? 0
}

/** Runs this user started since `since`, across all of their projects. */
export async function countUserSeedRunsSince(admin: ServiceRoleClient, userId: string, since: Date): Promise<number | 'error'> {
  const { count, error } = await admin
    .from('project_seed_runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('created_at', since.toISOString())
  if (error) return 'error'
  return count ?? 0
}

/**
 * Runs started since `since` across ALL accounts — the global ceiling. One of
 * the two queries here without an owner filter (the other is the cron's
 * keys-only listStalledSeedRuns), deliberately head-only: it returns a count
 * and never a row, so nothing of another tenant's crosses over.
 */
export async function countAllSeedRunsSince(admin: ServiceRoleClient, since: Date): Promise<number | 'error'> {
  const { count, error } = await admin
    .from('project_seed_runs')
    .select('id', { count: 'exact', head: true })
    .gt('created_at', since.toISOString())
  if (error) return 'error'
  return count ?? 0
}

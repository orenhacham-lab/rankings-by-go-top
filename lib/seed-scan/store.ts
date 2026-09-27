/**
 * The seed-run store: runs, their steps, the snapshot, and the worker lease.
 *
 * WHO WRITES. project_seed_runs and project_seed_steps have no write policy for
 * any browser role (supabase/migrations/20260927000000_project_seed_scan.sql):
 * only this server code writes them, with the service-role client. That client
 * bypasses RLS, so every query below names the owner explicitly —
 * `.eq('project_id', …)` AND `.eq('user_id', …)`, or both columns in the row it
 * inserts. The single exception is the global daily cap, a head-only count that
 * returns a number and no row (lib/seed-scan/__qa__/seed-source-guards.qa.ts
 * pins that down).
 *
 * THE LEASE. A run is worked by whoever holds its lease, and `lease_expires_at`
 * itself is the fencing token: taking a lease is a conditional UPDATE that only
 * matches when the lease is empty or already expired, and renewing, writing the
 * snapshot, and finishing are conditional UPDATEs that only match while the
 * column still holds the exact value this worker wrote. Postgres evaluates the
 * condition under the row lock, so two workers can never both take one run: the
 * loser matches zero rows. A worker that lost its lease finds out on its next
 * renewal and stops without writing another step.
 *
 * RESUME. Steps are created as `pending` together with the run, and each one is
 * finished individually, so a run that died midway is exactly "the first step
 * that is not finished" plus everything the finished steps saved. Stage B adds
 * its steps to STAGE_STEPS; nothing here is specific to stage A.
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

const RUN_COLUMNS = 'id, project_id, user_id, trigger, stage, status, summary, error_code, lease_expires_at, started_at, finished_at, created_at'
const STEP_COLUMNS = 'run_id, project_id, user_id, step, status, item_count, detail, error_code, started_at, finished_at'

export type SeedRunRow = ProjectSeedRunRow
export type SeedStepRow = ProjectSeedStepRow

/** Reads work with either client: the owner's RLS-scoped one or the service role. */
type ReadDb = SupabaseClient

export function leaseUntil(now: Date): string {
  return new Date(now.getTime() + LEASE_MS).toISOString()
}

// ── Runs ────────────────────────────────────────────────────────────────────

export type CreateRunResult =
  | { ok: true; run: SeedRunRow; lease: string }
  | { ok: false; reason: 'in_progress' | 'db_error' }

/**
 * Create a run with its lease already held, and its steps as `pending`.
 *
 * Single flight without a lock table: the run is inserted, then the project's
 * live runs are read back in (created_at, id) order, and only the first one may
 * proceed; the loser deletes its own row and answers "in progress".
 * `created_at` is left to the database default (now() of the inserting
 * transaction), so the order is the order the inserts actually happened in:
 * whichever insert lands after another request's read also sorts after it and
 * yields, and two inserts that both land before either read are both seen by
 * both, which agree on one winner. A run still marked running whose lease has
 * lapsed is superseded first: its worker is gone.
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

  const stale = await admin
    .from('project_seed_runs')
    .update({ status: 'failed', error_code: 'superseded', finished_at: nowIso, lease_expires_at: null })
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('status', 'running')
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
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
    .gt('lease_expires_at', nowIso)
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
 */
export function seedRunStatus(
  stage: SeedRunStage,
  steps: Pick<SeedStepRow, 'step' | 'status' | 'error_code'>[],
): { status: SeedRunStatus; errorCode: string | null } {
  const ordered = STAGE_STEPS[stage].map((step) => steps.find((s) => s.step === step))
  const first = ordered[0]
  if (first?.status === 'failed') return { status: 'failed', errorCode: first.error_code ?? 'internal_error' }
  const failed = ordered.find((s) => s?.status === 'failed')
  if (failed) return { status: 'partial', errorCode: failed.error_code ?? 'internal_error' }
  return { status: 'done', errorCode: null }
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
): Promise<string | null> {
  const lease = leaseUntil(now)
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
): Promise<string | null> {
  const next = leaseUntil(now)
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

// ── What the caps read ─────────────────────────────────────────────────────

/** A run of this project that a live worker holds right now. */
export async function findLiveSeedRun(admin: ServiceRoleClient, scope: SeedScope, now: Date): Promise<boolean | 'error'> {
  const { data, error } = await admin
    .from('project_seed_runs')
    .select('id')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('status', 'running')
    .gt('lease_expires_at', now.toISOString())
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
 * Runs started since `since` across ALL accounts — the global ceiling. The one
 * query here without an owner filter, deliberately head-only: it returns a
 * count and never a row, so nothing of another tenant's crosses over.
 */
export async function countAllSeedRunsSince(admin: ServiceRoleClient, since: Date): Promise<number | 'error'> {
  const { count, error } = await admin
    .from('project_seed_runs')
    .select('id', { count: 'exact', head: true })
    .gt('created_at', since.toISOString())
  if (error) return 'error'
  return count ?? 0
}

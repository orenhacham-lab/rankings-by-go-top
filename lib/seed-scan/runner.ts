/**
 * Working a seed run: the steps of its stage in order, each saved on its own,
 * under a lease renewed before every step and before every intermediate save.
 *
 * The route starts a run with the lease already held — createSeedRun for stage
 * A, startSeedStageB for stage B — and calls runSeedStage after its response.
 * The cron calls resumeSeedRun for a run whose worker is gone: it takes the
 * lapsed lease and continues at the first step of the run's stage that is not
 * finished, with everything the finished steps saved.
 *
 * ORDER OF WRITES PER STEP: the step's intermediate saves (if any), then the
 * snapshot (fenced by the lease), then the step's own row. A worker that dies
 * between the last two leaves the step unfinished, and the resumed step
 * recomputes the same snapshot from what was saved. A worker that lost its
 * lease finds out at the next fenced write and stops without another write.
 * Stage B leaves stage A's snapshot as it is: its fence is a lease renewal.
 *
 * TIME CAP. A worker that must be gone by a certain time (the route's work
 * window, the cron's share of its tick) passes `deadlineAt`. Before each step
 * the runner checks that the step's own worst case still fits; when it does
 * not, it hands the run back — lease released, step untouched — and the next
 * cron tick continues from that very step.
 *
 * Logs carry ids, step names and stable codes only. A quiet run (the cron's)
 * logs nothing itself: what happened is in its result, which the cron sums up
 * in one line.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { readSeedProject, type SeedProject } from './settings'
import { SHOPIFY_STAGE_A_EXECUTORS } from './shopify-steps'
import { GRACE_MS, STAGE_A_EXECUTORS, stageADeps, type StageABudgets, type StageADepsInput, type StepContext, type StepOutcome } from './steps'
import { STAGE_B_EXECUTORS, stageBDeps, stageBStepBudgetMs, type StageBContext, type StageBDepsInput } from './steps-b'
import {
  finishSeedRun,
  getSeedRun,
  insertMissingSeedSteps,
  listSeedSteps,
  nextSeedStep,
  releaseSeedLease,
  renewSeedLease,
  seedRunStatus,
  STAGE_LEASE_MS,
  takeSeedLease,
  updateSeedStep,
  writeSeedSummary,
  type SeedStepRow,
} from './store'
import { initialSummary, readSummary } from './summary'
import {
  STAGE_STEPS,
  TERMINAL_STEP_STATUSES,
  type SeedErrorCode,
  type SeedRunStage,
  type SeedRunStatus,
  type SeedScope,
  type SeedStep,
} from './types'

export type SeedStopReason = 'not_running' | 'lease_lost' | 'write_failed' | 'time_cap'

export type SeedRunResult =
  | { outcome: 'finished'; status: SeedRunStatus; errorCode: string | null; stepErrors?: string[] }
  | { outcome: 'stopped'; reason: SeedStopReason; stepErrors?: string[] }

/** What working a stage-A run comes to (the name the stage-A suite knows). */
export type StageAResult = SeedRunResult

export type RunArgs = {
  admin: ServiceRoleClient
  scope: SeedScope
  runId: string
  /** Stage A's dependencies, any of them replaced. Its clock is the run's clock. */
  deps?: StageADepsInput
  /** Stage B's dependencies, any of them replaced. Only the seed route passes contentPlan and rankCheck. */
  stageB?: StageBDepsInput
  /** Epoch ms, on the run's clock, by which this worker must be done. */
  deadlineAt?: number
  /** Log nothing (the cron's resume): the result says what happened, thrown steps included. */
  quiet?: boolean
}

/** Room for the writes around a step (mark, snapshot, row) on top of its own budget. */
export const STEP_WRITE_ALLOWANCE_MS = 2_000

/** The longest a stage-A step can take (steps.ts: a1 reads page, companions and sitemaps in turn). */
export function stageAStepBudgetMs(step: SeedStep, b: StageABudgets): number {
  switch (step) {
    case 'a1':
      return b.pageMs + b.companionMs + b.sitemapMs + 3 * GRACE_MS
    case 'a2':
      return b.modelMs + GRACE_MS
    case 'a3':
      return GRACE_MS
    case 'a4':
      return b.searchMs + GRACE_MS
    default:
      return 0
  }
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)

async function workRun(args: RunArgs & { lease: string }, expect: SeedRunStage | null): Promise<SeedRunResult> {
  const { admin, scope, runId } = args
  // One clock for the whole run, whichever stage's dependencies name it.
  const now = args.deps?.now ?? args.stageB?.now ?? (() => new Date())
  const quiet = args.quiet === true
  const log = { runId, projectId: scope.projectId }
  const stepErrors: string[] = []
  let stage: SeedRunStage = expect ?? 'a'
  let lease = args.lease
  let leaseLost = false

  const renew = async (): Promise<boolean> => {
    const next = await renewSeedLease(admin, scope, runId, lease, now(), STAGE_LEASE_MS[stage])
    if (next === null) {
      leaseLost = true
      return false
    }
    lease = next
    return true
  }
  const stop = async (reason: 'lease_lost' | 'write_failed' | 'time_cap'): Promise<SeedRunResult> => {
    // A failed write, or the time cap, hands the run back at once, so the cron
    // can resume it without waiting for the lease to lapse. Fenced: a no-op
    // when the run is not ours.
    if (reason !== 'lease_lost') await releaseSeedLease(admin, scope, runId, lease)
    if (!quiet) console.warn('[seed-scan] run stopped', { ...log, stage, reason })
    return stepErrors.length > 0 ? { outcome: 'stopped', reason, stepErrors } : { outcome: 'stopped', reason }
  }

  const run = await getSeedRun(admin, scope, runId)
  if (run === 'error') return stop('write_failed')
  if (!run || run.status !== 'running' || (expect !== null && run.stage !== expect) || run.lease_expires_at !== lease) {
    return { outcome: 'stopped', reason: 'not_running' }
  }
  stage = run.stage
  const projectRow = await readSeedProject(admin, scope)
  if (projectRow === 'error') return stop('write_failed')
  const stepRows = await listSeedSteps(admin, scope, runId)
  if (stepRows === 'error') return stop('write_failed')
  // A stage-B run always has its six rows (startSeedStageB adds them or backs
  // out); put back any that are missing rather than stall on them forever.
  if (stage === 'b' && !(await insertMissingSeedSteps(admin, scope, runId, 'b', stepRows))) return stop('write_failed')

  const depsA = stageADeps({ ...args.deps, now })
  const depsB = stageBDeps({ ...args.stageB, now })
  let project: SeedProject | null = projectRow
  let summary =
    readSummary(run.summary) ??
    initialSummary({
      source: run.trigger === 'claim' ? 'claim' : 'scan',
      domain: projectRow?.target_domain ?? '',
      url: projectRow?.target_domain ?? '',
      locale: 'he',
    })
  const rows: Pick<SeedStepRow, 'step' | 'status' | 'error_code'>[] = stepRows.map((r) => ({ step: r.step, status: r.status, error_code: r.error_code }))
  const details: Partial<Record<SeedStep, Record<string, unknown>>> = {}
  for (const r of stepRows) details[r.step] = r.detail ?? {}

  const setRow = (step: SeedStep, status: SeedStepRow['status'], errorCode: string | null) => {
    const row = rows.find((r) => r.step === step)
    if (row) {
      row.status = status
      row.error_code = errorCode
    } else {
      rows.push({ step, status, error_code: errorCode })
    }
  }
  const isFinished = (step: SeedStep) => {
    const row = rows.find((r) => r.step === step)
    return !!row && TERMINAL_STEP_STATUSES.includes(row.status)
  }

  for (;;) {
    const step = nextSeedStep(stage, rows)
    if (!step) break
    // Not enough time left for this step's worst case: hand the run back now.
    if (args.deadlineAt !== undefined) {
      const need = stage === 'a' ? stageAStepBudgetMs(step, depsA.budgets) : stageBStepBudgetMs(step, depsB.budgets)
      if (now().getTime() + need + STEP_WRITE_ALLOWANCE_MS > args.deadlineAt) return stop('time_cap')
    }
    if (!(await renew())) return stop('lease_lost')
    const startedAt = now()
    const marked = await updateSeedStep(admin, scope, runId, step, {
      status: 'running',
      started_at: startedAt.toISOString(),
      finished_at: null,
      error_code: null,
    })
    if (!marked) return stop('write_failed')

    const save = async (detail: Record<string, unknown>): Promise<boolean> => {
      if (!(await renew())) return false
      const saved = await updateSeedStep(admin, scope, runId, step, { status: 'running', detail })
      if (saved) details[step] = detail
      return saved
    }
    let outcome: StepOutcome
    if (!project) {
      // The project row is gone (a delete racing the run). Nothing to work on.
      outcome = { kind: 'finished', status: 'failed', errorCode: 'project_missing', itemCount: null, detail: details[step] ?? {}, summary }
    } else {
      try {
        if (stage === 'a') {
          const ctx: StepContext = { admin, scope, trigger: run.trigger, project, summary, details, deps: depsA, save }
          // A store's first run reads the store it was installed on (shopify-steps.ts).
          const executors = run.trigger === 'shopify_install' ? SHOPIFY_STAGE_A_EXECUTORS : STAGE_A_EXECUTORS
          outcome = await executors[step as 'a1' | 'a2' | 'a3' | 'a4'](ctx)
        } else {
          const ctx: StageBContext = {
            admin,
            scope,
            runId,
            trigger: run.trigger,
            project,
            summary,
            details,
            deps: depsB,
            save,
            deadlineAt: args.deadlineAt ?? null,
          }
          outcome = await STAGE_B_EXECUTORS[step as 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6'](ctx)
        }
      } catch (err) {
        if (quiet) stepErrors.push(`${step}:${errorName(err)}`)
        else console.error('[seed-scan] step threw', { ...log, step, error: errorName(err) })
        outcome = { kind: 'finished', status: 'failed', errorCode: 'internal_error', itemCount: null, detail: details[step] ?? {}, summary }
      }
    }
    if (outcome.kind === 'abort') return stop(leaseLost ? 'lease_lost' : 'write_failed')

    // The snapshot first, fenced by the lease; then the step's own row.
    const fenced = stage === 'a' ? await writeSeedSummary(admin, scope, runId, lease, outcome.summary) : await renew()
    if (!fenced) return stop('lease_lost')
    summary = outcome.summary
    if (outcome.project) project = outcome.project
    const finishedAt = now()
    const saved = await updateSeedStep(admin, scope, runId, step, {
      status: outcome.status,
      item_count: outcome.itemCount,
      detail: outcome.detail,
      error_code: outcome.errorCode,
      finished_at: finishedAt.toISOString(),
    })
    if (!saved) return stop('write_failed')
    details[step] = outcome.detail
    setRow(step, outcome.status, outcome.errorCode)
    if (!quiet) {
      console.log('[seed-scan] step', {
        ...log,
        step,
        status: outcome.status,
        errorCode: outcome.errorCode,
        ms: finishedAt.getTime() - startedAt.getTime(),
      })
    }

    // Nothing was read (a1), or there is no project: the later steps of the
    // stage have nothing to work from, and say so.
    if (outcome.status === 'failed' && ((stage === 'a' && step === 'a1') || outcome.errorCode === 'project_missing')) {
      const code: SeedErrorCode = outcome.errorCode === 'project_missing' ? 'project_missing' : 'site_unreadable'
      for (const later of STAGE_STEPS[stage]) {
        if (isFinished(later)) continue
        const skipped = await updateSeedStep(admin, scope, runId, later, {
          status: 'skipped',
          error_code: code,
          finished_at: finishedAt.toISOString(),
        })
        if (!skipped) return stop('write_failed')
        setRow(later, 'skipped', code)
      }
    }
  }

  const verdict = seedRunStatus(stage, rows)
  if (!(await finishSeedRun(admin, scope, runId, lease, { ...verdict, now: now() }))) return stop('lease_lost')
  if (!quiet) console.log('[seed-scan] run finished', { ...log, stage, status: verdict.status, errorCode: verdict.errorCode })
  return stepErrors.length > 0 ? { outcome: 'finished', ...verdict, stepErrors } : { outcome: 'finished', ...verdict }
}

/** Work a stage-A run whose lease this caller holds, to the end or until the lease is lost. */
export function runStageA(args: RunArgs & { lease: string }): Promise<SeedRunResult> {
  return workRun(args, 'a')
}

/** Work a run whose lease this caller holds, whichever stage it is at (the seed route, after its answer). */
export function runSeedStage(args: RunArgs & { lease: string }): Promise<SeedRunResult> {
  return workRun(args, null)
}

/**
 * Take over a run whose worker is gone — its lease empty or lapsed — and
 * continue it from the first unfinished step of its stage. Answers
 * `not_running` when another worker holds it or it is finished.
 */
export async function resumeSeedRun(args: RunArgs): Promise<SeedRunResult> {
  const now = args.deps?.now ?? args.stageB?.now ?? (() => new Date())
  const run = await getSeedRun(args.admin, args.scope, args.runId)
  if (run === 'error') return { outcome: 'stopped', reason: 'write_failed' }
  if (!run || run.status !== 'running') return { outcome: 'stopped', reason: 'not_running' }
  // The conditional UPDATE decides: only an empty or lapsed lease is taken.
  const lease = await takeSeedLease(args.admin, args.scope, args.runId, now(), STAGE_LEASE_MS[run.stage])
  if (!lease) return { outcome: 'stopped', reason: 'not_running' }
  return workRun({ ...args, lease }, null)
}

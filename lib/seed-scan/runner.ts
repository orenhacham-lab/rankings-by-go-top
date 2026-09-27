/**
 * Working a stage-A run: its steps in order, each saved on its own, under a
 * lease renewed before every step and before every intermediate save.
 *
 * The route starts a run with the lease already held (createSeedRun) and calls
 * runStageA after its response. A later cron calls resumeSeedRun for a run
 * whose worker is gone: it takes the lapsed lease and continues at the first
 * step that is not finished, with everything the finished steps saved.
 *
 * ORDER OF WRITES PER STEP: the step's intermediate saves (if any), then the
 * snapshot (fenced by the lease), then the step's own row. A worker that dies
 * between the last two leaves the step unfinished, and the resumed step
 * recomputes the same snapshot from what was saved. A worker that lost its
 * lease finds out at the next fenced write and stops without another write.
 *
 * Logs carry ids, step names and stable codes only.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { readSeedProject, type SeedProject } from './settings'
import { STAGE_A_EXECUTORS, stageADeps, type StageADepsInput, type StepContext, type StepOutcome } from './steps'
import {
  finishSeedRun,
  getSeedRun,
  listSeedSteps,
  nextSeedStep,
  releaseSeedLease,
  renewSeedLease,
  seedRunStatus,
  takeSeedLease,
  updateSeedStep,
  writeSeedSummary,
  type SeedStepRow,
} from './store'
import { initialSummary, readSummary } from './summary'
import { STAGE_STEPS, TERMINAL_STEP_STATUSES, type SeedErrorCode, type SeedRunStatus, type SeedScope, type SeedStep } from './types'

export type StageAResult =
  | { outcome: 'finished'; status: SeedRunStatus; errorCode: string | null }
  | { outcome: 'stopped'; reason: 'not_running' | 'lease_lost' | 'write_failed' }

type RunArgs = {
  admin: ServiceRoleClient
  scope: SeedScope
  runId: string
  deps?: StageADepsInput
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)

/** Work a run whose lease this caller holds, to the end or until the lease is lost. */
export async function runStageA(args: RunArgs & { lease: string }): Promise<StageAResult> {
  const { admin, scope, runId } = args
  const deps = stageADeps(args.deps)
  const log = { runId, projectId: scope.projectId }
  let lease = args.lease
  let leaseLost = false

  const renew = async (): Promise<boolean> => {
    const next = await renewSeedLease(admin, scope, runId, lease, deps.now())
    if (next === null) {
      leaseLost = true
      return false
    }
    lease = next
    return true
  }
  const stop = async (reason: 'lease_lost' | 'write_failed'): Promise<StageAResult> => {
    // A failed write hands the run back at once, so the cron can resume it
    // without waiting for the lease to lapse. Fenced: a no-op when not ours.
    if (reason === 'write_failed') await releaseSeedLease(admin, scope, runId, lease)
    console.warn('[seed-scan] run stopped', { ...log, reason })
    return { outcome: 'stopped', reason }
  }

  const run = await getSeedRun(admin, scope, runId)
  if (run === 'error') return stop('write_failed')
  if (!run || run.status !== 'running' || run.stage !== 'a' || run.lease_expires_at !== lease) {
    return { outcome: 'stopped', reason: 'not_running' }
  }
  const projectRow = await readSeedProject(admin, scope)
  if (projectRow === 'error') return stop('write_failed')
  const stepRows = await listSeedSteps(admin, scope, runId)
  if (stepRows === 'error') return stop('write_failed')

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
    const step = nextSeedStep('a', rows)
    if (!step) break
    if (!(await renew())) return stop('lease_lost')
    const startedAt = deps.now()
    const marked = await updateSeedStep(admin, scope, runId, step, {
      status: 'running',
      started_at: startedAt.toISOString(),
      finished_at: null,
      error_code: null,
    })
    if (!marked) return stop('write_failed')

    let outcome: StepOutcome
    if (!project) {
      // The project row is gone (a delete racing the run). Nothing to work on.
      outcome = { kind: 'finished', status: 'failed', errorCode: 'project_missing', itemCount: null, detail: details[step] ?? {}, summary }
    } else {
      const ctx: StepContext = {
        admin,
        scope,
        trigger: run.trigger,
        project,
        summary,
        details,
        deps,
        save: async (detail) => {
          if (!(await renew())) return false
          const saved = await updateSeedStep(admin, scope, runId, step, { status: 'running', detail })
          if (saved) details[step] = detail
          return saved
        },
      }
      try {
        outcome = await STAGE_A_EXECUTORS[step as 'a1' | 'a2' | 'a3' | 'a4'](ctx)
      } catch (err) {
        console.error('[seed-scan] step threw', { ...log, step, error: errorName(err) })
        outcome = { kind: 'finished', status: 'failed', errorCode: 'internal_error', itemCount: null, detail: details[step] ?? {}, summary }
      }
    }
    if (outcome.kind === 'abort') return stop(leaseLost ? 'lease_lost' : 'write_failed')

    // The snapshot first, fenced by the lease; then the step's own row.
    if (!(await writeSeedSummary(admin, scope, runId, lease, outcome.summary))) return stop('lease_lost')
    summary = outcome.summary
    if (outcome.project) project = outcome.project
    const finishedAt = deps.now()
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
    console.log('[seed-scan] step', {
      ...log,
      step,
      status: outcome.status,
      errorCode: outcome.errorCode,
      ms: finishedAt.getTime() - startedAt.getTime(),
    })

    // Nothing was read, or there is no project: the later steps have nothing
    // to work from, and say so.
    if (outcome.status === 'failed' && (step === 'a1' || outcome.errorCode === 'project_missing')) {
      const code: SeedErrorCode = outcome.errorCode === 'project_missing' ? 'project_missing' : 'site_unreadable'
      for (const later of STAGE_STEPS.a) {
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

  const verdict = seedRunStatus('a', rows)
  if (!(await finishSeedRun(admin, scope, runId, lease, { ...verdict, now: deps.now() }))) return stop('lease_lost')
  console.log('[seed-scan] run finished', { ...log, status: verdict.status, errorCode: verdict.errorCode })
  return { outcome: 'finished', ...verdict }
}

/**
 * Take over a run whose worker is gone — its lease empty or lapsed — and finish
 * it. Answers `not_running` when another worker holds it or it is finished.
 */
export async function resumeSeedRun(args: RunArgs): Promise<StageAResult> {
  const now = args.deps?.now ?? (() => new Date())
  const lease = await takeSeedLease(args.admin, args.scope, args.runId, now())
  if (!lease) return { outcome: 'stopped', reason: 'not_running' }
  return runStageA({ ...args, lease })
}

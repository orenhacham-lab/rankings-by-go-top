/**
 * The cron's share of the seeding scan: runs whose worker is gone.
 *
 * A worker can die — a deploy, a crash, the platform's time limit — and leave
 * its run marked running with a lease nobody renews. Every 15 minutes the
 * content-automation cron (app/api/content/automation/cron/route.ts) calls
 * resumeStalledSeedRuns at the end of its `after()` work, and up to
 * MAX_RUNS_PER_TICK such runs continue from their first unfinished step, in
 * stage A or in stage B.
 *
 * ISOLATED FROM THE AUTOMATION RUNNER. It starts only after the runner has
 * finished and logged its result, inside startIsolatedSeedResume: its own
 * try/catch, its own deadline (what is left of the cron's maxDuration, less a
 * margin), and it never throws or rejects. A failure here cannot change, delay
 * or fail the runner's result.
 *
 * ONLY LAPSED LEASES. A run is taken with the conditional UPDATE every worker
 * uses (takeSeedLease): an empty or expired lease, or nothing. A live worker
 * is never disturbed, and two ticks never both work one run.
 *
 * WITHOUT THE MERCHANT. The cron has no session. b4 (the content plan) and b6
 * (the first rank check) act as the merchant, so a resumed run skips them with
 * content_session_required and rank_check_session_required. Everything else —
 * all of stage A, the crawl, keyword ideas, AI-visibility questions — resumes
 * inside each step's spend marks, so nothing is paid for twice.
 *
 * LOGS. Nothing at all when there is nothing to do. One `[seed-resume]` line
 * when it found runs to resume (worked, or left for the next tick) or failed:
 * ids, stages, counts and stable codes only.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { resumeSeedRun, type SeedRunResult } from './runner'
import type { StageADepsInput } from './steps'
import type { StageBDepsInput } from './steps-b'
import { listStalledSeedRuns } from './store'
import type { SeedRunStage } from './types'

/** Runs one tick may take on. */
export const MAX_RUNS_PER_TICK = 2
/** Kept free at the end of the cron's life for the last writes and the log line. */
export const RESUME_MARGIN_MS = 20_000
/** Less time than this left: not worth starting (a1 alone may take 24 seconds). */
export const MIN_RESUME_WINDOW_MS = 30_000

export type ResumeOptions = {
  env: Record<string, string | undefined>
  /** The clock; the deadline is on it. */
  now?: () => Date
  maxRuns?: number
  /** Epoch ms by which every resumed run must have handed itself back. */
  deadlineAt?: number
  /** Replace dependencies (tests). The cron never acts as a merchant: b4 and b6 get none. */
  deps?: StageADepsInput
  stageB?: StageBDepsInput
}

export type ResumedRun = {
  runId: string
  projectId: string
  stage: SeedRunStage
  result: SeedRunResult | { outcome: 'threw'; error: string }
}

export type ResumeReport =
  | { state: 'disabled' | 'idle' }
  | { state: 'failed'; reason: 'list_failed' }
  | { state: 'worked'; found: number; runs: ResumedRun[]; deferred: number }

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)

/** One run's outcome for the log line: codes only. */
function brief(r: ResumedRun) {
  const res = r.result
  const tail =
    res.outcome === 'finished'
      ? { status: res.status, errorCode: res.errorCode }
      : res.outcome === 'stopped'
        ? { reason: res.reason }
        : { error: res.error }
  const stepErrors = res.outcome !== 'threw' && res.stepErrors ? { stepErrors: res.stepErrors } : {}
  return { runId: r.runId, projectId: r.projectId, stage: r.stage, outcome: res.outcome, ...tail, ...stepErrors }
}

/** Continue up to MAX_RUNS_PER_TICK stalled runs, oldest first. Off unless ENABLE_SEED_SCAN=true. */
export async function resumeStalledSeedRuns(admin: ServiceRoleClient, options: ResumeOptions): Promise<ResumeReport> {
  if (options.env.ENABLE_SEED_SCAN !== 'true') return { state: 'disabled' }
  const now = options.now ?? (() => new Date())
  const limit = Math.max(0, Math.min(options.maxRuns ?? MAX_RUNS_PER_TICK, MAX_RUNS_PER_TICK))
  if (limit === 0) return { state: 'idle' }

  const stalled = await listStalledSeedRuns(admin, now(), limit)
  if (stalled === 'error') {
    console.error('[seed-resume] failed', { reason: 'list_failed' })
    return { state: 'failed', reason: 'list_failed' }
  }
  if (stalled.length === 0) return { state: 'idle' }

  const runs: ResumedRun[] = []
  for (const s of stalled) {
    // Out of time: the rest wait for the next tick, untouched.
    if (options.deadlineAt !== undefined && now().getTime() >= options.deadlineAt) break
    let result: ResumedRun['result']
    try {
      result = await resumeSeedRun({
        admin,
        scope: { projectId: s.project_id, userId: s.user_id },
        runId: s.id,
        deps: { ...options.deps, now },
        stageB: { ...options.stageB, now, contentPlan: null, rankCheck: null },
        deadlineAt: options.deadlineAt,
        quiet: true,
      })
    } catch (err) {
      result = { outcome: 'threw', error: errorName(err) }
    }
    runs.push({ runId: s.id, projectId: s.project_id, stage: s.stage, result })
  }
  // Runs left for the next tick because this one ran out of time.
  const deferred = stalled.length - runs.length
  console.log('[seed-resume] tick', { found: stalled.length, runs: runs.map(brief), deferred })
  return { state: 'worked', found: stalled.length, runs, deferred }
}

export type ResumeWindow = {
  /** When the cron's request started (epoch ms). */
  startedAtMs: number
  /** The cron route's maxDuration, in ms. */
  maxDurationMs: number
  nowMs?: () => number
  marginMs?: number
  minWindowMs?: number
}

/**
 * Run `task` in what is left of the cron's time, isolated: it gets its own
 * deadline, is abandoned at a hard cap past it, and whatever it does — throw,
 * reject, hang — this resolves, logging one line on a failure. Never rejects.
 */
export async function startIsolatedSeedResume(task: (deadlineAt: number) => Promise<unknown>, window: ResumeWindow): Promise<void> {
  const nowMs = window.nowMs ?? Date.now
  const margin = window.marginMs ?? RESUME_MARGIN_MS
  const deadlineAt = window.startedAtMs + window.maxDurationMs - margin
  // Too little time left after the runner: the next tick will do it.
  if (deadlineAt - nowMs() < (window.minWindowMs ?? MIN_RESUME_WINDOW_MS)) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const cap = new Promise<'time_cap'>((resolve) => {
      timer = setTimeout(() => resolve('time_cap'), Math.max(0, deadlineAt - nowMs() + margin / 2))
    })
    const work = Promise.resolve()
      .then(() => task(deadlineAt))
      .then(() => 'done' as const)
    const outcome = await Promise.race([work, cap])
    if (outcome === 'time_cap') {
      // Abandoned, not awaited: a late rejection must not surface either.
      work.catch(() => undefined)
      console.error('[seed-resume] failed', { reason: 'time_cap' })
    }
  } catch (err) {
    console.error('[seed-resume] failed', { reason: 'threw', error: errorName(err) })
  } finally {
    clearTimeout(timer)
  }
}

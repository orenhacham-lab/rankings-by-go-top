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
 * ONLY WHILE ENTITLED. Access can end while a run waits (a trial runs out, a
 * subscription lapses), so before a run is taken its owner is checked again
 * with the seed route's own check (explainAccess: an admin passes). No access:
 * the run is finished as failed (entitlement_required) before any step, so
 * nothing is spent on it. The check cannot be read (a failed query, which
 * explainAccess would otherwise read as "no subscription"): the run is left
 * as it is for the next tick.
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
import { explainAccess } from '@/lib/subscription'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { resumeSeedRun, type SeedRunResult } from './runner'
import type { StageADepsInput } from './steps'
import type { StageBDepsInput } from './steps-b'
import { finishSeedRun, listStalledSeedRuns, takeSeedLease } from './store'
import type { SeedRunStage, SeedScope } from './types'

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
  /** The entitlement check for a run's owner (tests). Default: ownerAccess. */
  access?: (admin: ServiceRoleClient, userId: string) => Promise<ResumeAccess>
}

/** What the entitlement check answers: explainAccess's verdict, or 'unreadable'. */
export type ResumeAccess = { allowed: boolean; authority: string }

export type ResumedRun = {
  runId: string
  projectId: string
  stage: SeedRunStage
  result: SeedRunResult | { outcome: 'threw'; error: string } | { outcome: 'skipped'; reason: 'entitlement_unavailable' }
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
      : res.outcome === 'stopped' || res.outcome === 'skipped'
        ? { reason: res.reason }
        : { error: res.error }
  const stepErrors = (res.outcome === 'finished' || res.outcome === 'stopped') && res.stepErrors ? { stepErrors: res.stepErrors } : {}
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

  const access = options.access ?? ((db: ServiceRoleClient, userId: string) => ownerAccess(db, userId, now))
  const runs: ResumedRun[] = []
  for (const s of stalled) {
    // Out of time: the rest wait for the next tick, untouched.
    if (options.deadlineAt !== undefined && now().getTime() >= options.deadlineAt) break
    const scope: SeedScope = { projectId: s.project_id, userId: s.user_id }
    let result: ResumedRun['result']
    try {
      const entitled = await entitlementOf(access, admin, s.user_id)
      result =
        entitled === 'unreadable'
          ? { outcome: 'skipped', reason: 'entitlement_unavailable' }
          : entitled === 'denied'
            ? await endUnentitled(admin, scope, s.id, now)
            : await resumeSeedRun({
                admin,
                scope,
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

/** The check's verdict for one owner; a check that throws cannot be read. */
async function entitlementOf(
  access: NonNullable<ResumeOptions['access']>,
  admin: ServiceRoleClient,
  userId: string,
): Promise<'entitled' | 'denied' | 'unreadable'> {
  try {
    const verdict = await access(admin, userId)
    if (verdict.authority === 'unreadable') return 'unreadable'
    return verdict.allowed ? 'entitled' : 'denied'
  } catch {
    return 'unreadable'
  }
}

/**
 * Finish a run whose owner has no access any more: failed, entitlement_required,
 * before any step (nothing is fetched, asked or searched). Taken like any run,
 * with the conditional UPDATE, so a run another worker holds is left alone.
 */
async function endUnentitled(admin: ServiceRoleClient, scope: SeedScope, runId: string, now: () => Date): Promise<SeedRunResult> {
  const lease = await takeSeedLease(admin, scope, runId, now())
  if (!lease) return { outcome: 'stopped', reason: 'not_running' }
  const ended = await finishSeedRun(admin, scope, runId, lease, { status: 'failed', errorCode: 'entitlement_required', now: now() })
  return ended ? { outcome: 'finished', status: 'failed', errorCode: 'entitlement_required' } : { outcome: 'stopped', reason: 'lease_lost' }
}

/**
 * The seed route's entitlement check (explainAccess, admins first), for a
 * run's owner, on reads that are watched: explainAccess reads a query that
 * failed as "no row", which for the route is a 403 the merchant can retry,
 * but here would end a paying merchant's run for good. Any failed read makes
 * the answer unreadable instead.
 */
export async function ownerAccess(admin: ServiceRoleClient, userId: string, now: () => Date): Promise<ResumeAccess> {
  let failed = false
  const verdict = await explainAccess(userId, watchReads(admin, () => { failed = true }), now)
  return failed ? { allowed: false, authority: 'unreadable' } : { allowed: verdict.allowed, authority: verdict.authority }
}

type AnyFn = (...args: unknown[]) => unknown

/** `admin`, with the answer of every query made through it looked at: `onFailure` hears of each error. */
function watchReads(admin: ServiceRoleClient, onFailure: () => void): ServiceRoleClient {
  const watched = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(obj, prop) {
        const value: unknown = Reflect.get(obj, prop, obj)
        if (typeof value !== 'function') return value
        if (prop === 'then') {
          return (resolve?: AnyFn, reject?: AnyFn) =>
            (value as AnyFn).call(
              obj,
              (answer: unknown) => {
                if (answer && typeof answer === 'object' && (answer as { error?: unknown }).error) onFailure()
                return resolve ? resolve(answer) : answer
              },
              (err: unknown) => {
                onFailure()
                if (reject) return reject(err)
                throw err
              },
            )
        }
        // Every builder a call returns (the same one, or a new one) is watched too.
        return (...args: unknown[]) => {
          const out = (value as AnyFn).apply(obj, args)
          return out && typeof out === 'object' ? watched(out) : out
        }
      },
    })
  return new Proxy(admin, {
    get(obj, prop) {
      const value: unknown = Reflect.get(obj, prop, obj)
      // Named: a query made through it is explainAccess's, not this file's (_owner-audit.ts).
      if (prop === 'from' && typeof value === 'function') {
        return function watchedFrom(table: string) {
          return watched((value as (t: string) => object).call(obj, table))
        }
      }
      return typeof value === 'function' ? (value as AnyFn).bind(obj) : value
    },
  })
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

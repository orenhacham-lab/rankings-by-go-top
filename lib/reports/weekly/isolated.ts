/**
 * The weekly summary as the automation cron calls it: after everything else, behind the same
 * gate the run itself uses (so with the flag off, or on any day but Sunday, it creates no
 * client and reads nothing), inside its own try/catch and its own time cap. It never throws
 * or rejects, so a failure here cannot change, delay or fail the cron's existing work.
 */
import { weeklyGate, runWeeklySummaries, type WeeklyRun } from './run'

export const WEEKLY_TIME_CAP_MS = 60_000

export async function runIsolatedWeeklySummaries(
  run: () => Promise<WeeklyRun> = async () => {
    const { liveWeeklyDeps } = await import('./live')
    return runWeeklySummaries(liveWeeklyDeps())
  },
  opts: { env?: Record<string, string | undefined>; now?: () => Date; capMs?: number } = {},
): Promise<WeeklyRun | { status: 'error' | 'time_cap' }> {
  const env = opts.env ?? process.env
  const now = opts.now ?? (() => new Date())
  const gate = weeklyGate(env, now())
  if (gate !== 'go') return { status: gate }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const cap = new Promise<{ status: 'time_cap' }>((resolve) => { timer = setTimeout(() => resolve({ status: 'time_cap' }), opts.capMs ?? WEEKLY_TIME_CAP_MS) })
    const work = Promise.resolve().then(run)
    const outcome = await Promise.race([work, cap])
    if (outcome.status === 'time_cap') {
      work.catch(() => undefined)
      console.error('[weekly-summary] failed', { reason: 'time_cap' })
    }
    return outcome
  } catch {
    console.error('[weekly-summary] failed', { reason: 'threw' })
    return { status: 'error' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The setup-email run as the automation cron calls it: after everything the cron already
 * does and after the approval reminders, behind the same gate the run itself uses (so with
 * the flag off it creates no client and reads nothing), inside its own try/catch and its own
 * time cap. It never throws or rejects, so a failure here cannot change, delay or fail the
 * cron's existing work.
 */
import { onboardingGate, runOnboardingEmails, type OnboardingRun } from './run'

/** Kept short: the cron has other work to finish, and a late tick is retried 15 minutes later. */
export const ONBOARDING_TIME_CAP_MS = 45_000

export async function runIsolatedOnboardingEmails(
  run: () => Promise<OnboardingRun> = async () => {
    const { liveOnboardingDeps } = await import('./live')
    return runOnboardingEmails(liveOnboardingDeps())
  },
  opts: { env?: Record<string, string | undefined>; now?: () => Date; capMs?: number } = {},
): Promise<OnboardingRun | { status: 'error' | 'time_cap' }> {
  const env = opts.env ?? process.env
  const now = opts.now ?? (() => new Date())
  // Off, out of hours or not configured: nothing is even constructed.
  const gate = onboardingGate(env, now())
  if (gate !== 'go') return { status: gate }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const cap = new Promise<{ status: 'time_cap' }>((resolve) => { timer = setTimeout(() => resolve({ status: 'time_cap' }), opts.capMs ?? ONBOARDING_TIME_CAP_MS) })
    const work = Promise.resolve().then(run)
    const outcome = await Promise.race([work, cap])
    if (outcome.status === 'time_cap') {
      work.catch(() => undefined)
      console.error('[onboarding-emails] failed', { reason: 'time_cap' })
    }
    return outcome
  } catch {
    console.error('[onboarding-emails] failed', { reason: 'threw' })
    return { status: 'error' }
  } finally {
    clearTimeout(timer)
  }
}

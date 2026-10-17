/**
 * The retention pass as the 15-minute cron calls it.
 *
 * WHY IT DOES NOT RIDE THE DAILY CRON ALONE. `vercel.json` schedules this at
 * 11:30 UTC, and on this plan a daily Vercel cron is best-effort: on 12 and 13
 * Oct 2026 most of the project's daily jobs left no invocation at all. The
 * published privacy text promises that a prospect's address, name and postal
 * address are gone 30 days after the last message, and a promise that depends
 * on a job which may silently never fire is not a promise. So the pass also
 * rides cron-job.org's call to /api/content/automation/cron every 15 minutes,
 * the same way the monthly topic top-up does. The daily entry stays: it is a
 * second chance at the same idempotent pass, not a second behaviour.
 *
 * WHY EVERY QUARTER HOUR IS SAFE. The pass is idempotent by construction: it
 * redacts only a row already past its cutoff and deletes only a row we never
 * wrote to that is past 90 days, so running it 96 times a day and running it
 * once produce the same table. Earlier is also better here — a row redacted at
 * 00:15 instead of 11:30 keeps the promise sooner. There is no window.
 *
 * WHY IT LOGS EVERY PASS, COUNTS OF ZERO INCLUDED. This is the only evidence
 * that the pass runs at all. While the table is empty every count is zero, and
 * a line printed only when something changed is indistinguishable from a job
 * that never fired — which is exactly the question we could not answer on 13
 * Oct 2026. The line carries counts only; nothing about any prospect reaches it.
 *
 * Production only: Preview shares the Production database, so a preview
 * deployment must not sweep live rows on its own schedule. Isolated like the
 * other passengers of that cron — its own try/catch, and it never throws, so a
 * failure here cannot change, delay or fail the cron's existing work.
 */
import { applyProspectRetention, type ProspectRetentionSummary } from './retention'

export type IsolatedRetentionOutcome =
  | ({ status: 'ran' } & ProspectRetentionSummary)
  | { status: 'not_production' | 'error' }

export async function runIsolatedProspectRetention(
  run: () => Promise<ProspectRetentionSummary> = async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    return applyProspectRetention(createAdminClient())
  },
  opts: { env?: Record<string, string | undefined> } = {},
): Promise<IsolatedRetentionOutcome> {
  const env = opts.env ?? process.env
  // Nothing is constructed outside Production: no client, no read.
  if (env.VERCEL_ENV !== 'production') return { status: 'not_production' }
  try {
    const summary = await run()
    console.log('[outreach-retention] pass complete', summary)
    return { status: 'ran', ...summary }
  } catch {
    console.error('[outreach-retention] pass failed', { reason: 'threw' })
    return { status: 'error' }
  }
}

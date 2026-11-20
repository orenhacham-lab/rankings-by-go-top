/**
 * The published-cover backfill as a passenger on the hourly cron.
 *
 * Production only, because Preview shares the Production database: a preview
 * deployment must not start replacing the live blog's images on its own.
 *
 * Isolated like the cron's other passengers: its own deadline inside what is
 * left of maxDuration, its own try/catch, and it never throws, so it cannot
 * change, delay or fail the runner above it.
 *
 * There is no switch. The pass ends by itself — once every published cover has
 * been looked at it costs one small query a pass — and an unreviewed cover is
 * the thing being fixed, so a switch would only be a way to forget.
 */
import type { CoverRepairResult } from './cover-repair'

/** What is left for the pass after the work above it, at most 60 seconds. */
export const COVER_REPAIR_BUDGET_MS = 60_000

export type IsolatedCoverRepairOutcome =
  | ({ status: 'ran' } & CoverRepairResult)
  | { status: 'not_production' | 'no_time' | 'error' }

export async function runIsolatedBlogCoverRepair(
  run: (deadlineAt: number) => Promise<CoverRepairResult> = async (deadlineAt) => {
    const [{ createAdminClient }, { repairBlogCovers }] = await Promise.all([
      import('@/lib/supabase/admin'), import('./cover-repair'),
    ])
    return repairBlogCovers(createAdminClient(), { deadlineAt })
  },
  opts: { env?: Record<string, string | undefined>; startedAtMs?: number; maxDurationMs?: number } = {},
): Promise<IsolatedCoverRepairOutcome> {
  const env = opts.env ?? process.env
  if (env.VERCEL_ENV !== 'production') return { status: 'not_production' }

  const now = Date.now()
  const endOfRun = (opts.startedAtMs ?? now) + (opts.maxDurationMs ?? 0)
  const left = Math.min(COVER_REPAIR_BUDGET_MS, endOfRun - now)
  // Under ten seconds is not enough for one review and nowhere near enough for
  // one replacement, and a pass that starts what it cannot finish pays for an
  // image nobody keeps.
  if (left < 10_000) return { status: 'no_time' }

  try {
    const result = await run(now + left)
    if (result.reviewed > 0 || result.failures.length > 0) {
      console.log('[blog-cover-repair] pass complete', result)
    }
    return { status: 'ran', ...result }
  } catch (e) {
    console.error('[blog-cover-repair] pass failed', { message: e instanceof Error ? e.message : String(e) })
    return { status: 'error' }
  }
}

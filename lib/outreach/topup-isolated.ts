/**
 * The list top-up as the 15-minute cron calls it.
 *
 * Same shape and same reasons as lib/outreach/sender-isolated.ts: its own
 * switch, Production only, its own try/catch, and it never throws, so a
 * directory that redesigned itself overnight cannot change, delay or fail the
 * cron's existing work.
 *
 * TWO SWITCHES, deliberately separate from the sender's. `OUTREACH_SOURCING_ENABLED`
 * turns the crawler on without turning sending on, which is the order these
 * should ever be used in: fill and inspect the list first, send second. Turning
 * the sender off does not stop the list growing, and that is also wanted — the
 * list is the thing it takes days to build.
 *
 * WHY IT LOGS EVERY PASS. The pass reads other people's websites, and the only
 * evidence of what it did is the line it prints: which source it used, how many
 * requests it made, what it added, and why each business it looked at was
 * refused. A pass that added nothing is the normal case and still prints,
 * because a silent pass is indistinguishable from a cron that never fired —
 * the exact question this project could not answer on 13 Oct 2026.
 */
import type { TopUpSummary } from './topup'
import { runProspectTopUp } from './topup'
import { fetchPublicPage } from './sender-isolated'
import { createSerperSearch } from '@/lib/seed-scan/serper'

export const SOURCING_FLAG = 'OUTREACH_SOURCING_ENABLED'

export type IsolatedTopUpOutcome =
  | { status: 'ran'; summary: TopUpSummary }
  | { status: 'off' | 'not_production' | 'error' }

export async function runIsolatedProspectTopUp(
  run: () => Promise<TopUpSummary> = async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    // The search the pass tries before the directories. It is the rank
    // scanner's own provider and key; without a key every search answers
    // `search_unavailable` and the pass is the directories alone, which is the
    // same pass this cron ran before the search existed.
    return runProspectTopUp(createAdminClient(), {
      fetchPage: fetchPublicPage,
      now: new Date(),
      search: createSerperSearch(),
    })
  },
  opts: { env?: Record<string, string | undefined> } = {},
): Promise<IsolatedTopUpOutcome> {
  const env = opts.env ?? process.env
  // Nothing is constructed before both switches: no client, no request.
  if (env[SOURCING_FLAG] !== 'true') return { status: 'off' }
  if (env.VERCEL_ENV !== 'production') return { status: 'not_production' }
  try {
    const summary = await run()
    console.log('[outreach-topup] pass complete', summary)
    return { status: 'ran', summary }
  } catch (error) {
    console.error('[outreach-topup] pass failed', error instanceof Error ? error.message : 'unknown')
    return { status: 'error' }
  }
}

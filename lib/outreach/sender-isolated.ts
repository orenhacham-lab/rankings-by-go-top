/**
 * The outbound send as the 15-minute cron calls it.
 *
 * WHY IT RIDES THAT CRON AND HAS NO SCHEDULE OF ITS OWN. On this Vercel plan a
 * cron entry in `vercel.json` must be daily, and a daily one is best-effort:
 * on 12 and 13 Oct 2026 most of this project's daily jobs left no invocation at
 * all. A channel that sends five messages a day cannot be built on a job that
 * may silently never fire — and this one needs sub-daily timing anyway, because
 * the plan requires minutes between messages. cron-job.org calls
 * /api/content/automation/cron every fifteen minutes, so one message per pass
 * gives the spacing for free. This is the same arrangement the retention sweep
 * and the monthly topic top-up use.
 *
 * WHY IT IS OFF BY DEFAULT, AND WHY THAT IS NOT TIMIDITY. Merging this changes
 * nothing: without `OUTREACH_SENDING_ENABLED` set to exactly "true" the first
 * line returns and no read, no fetch and no send happens. Cold email is the one
 * thing in this product that reaches people who never asked for it, and the
 * switch that starts it should be a deliberate act by the person whose name is
 * on the messages, not a side effect of a deploy. The mailbox password is the
 * second such switch and is also absent until he enters it.
 *
 * WHY PRODUCTION ONLY. Preview deployments share the Production database, so a
 * preview that sent would write to real businesses from a branch.
 *
 * WHY IT LOGS EVERY PASS. This and the retention sweep answer the same question
 * — did the job run — and on 13 Oct 2026 we could not answer it for the sweep,
 * because it logged only when it changed something. A pass that sends nothing is
 * the normal case here (outside the window, quota met, nothing due), so a line
 * printed only on a send would leave the usual state indistinguishable from a
 * cron that stopped. The line carries the outcome and counts; the recipient's
 * address never reaches it, and neither does the message.
 *
 * Isolated like the cron's other passengers: its own try/catch, and it never
 * throws, so a failure here cannot change, delay or fail the cron's other work.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNextProspect, type SenderResult } from './send'
import { liveSender, readSmtpConfig } from './smtp'
import type { FetchedPage } from './finding'

/** The switch. Exactly "true", following the project's other email switches. */
export const SENDING_FLAG = 'OUTREACH_SENDING_ENABLED'

export type IsolatedSendOutcome =
  | { status: 'off' | 'not_production' | 'no_transport' | 'error' }
  | { status: 'ran'; result: SenderResult }

const UA = 'Mozilla/5.0 (compatible; GoTopSEO-check/1.0; +https://www.gotopseo.com)'

/**
 * Fetch a stranger's page: a short timeout, no redirect chasing beyond what
 * fetch does by itself, and a user agent that says who we are and where to
 * complain. A body larger than this is not a page we need to measure.
 */
export async function fetchPublicPage(url: string): Promise<FetchedPage> {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12_000),
  })
  const body = (await response.text()).slice(0, 2_000_000)
  return { url: response.url || url, status: response.status, body }
}

export async function runIsolatedProspectSend(
  run: () => Promise<SenderResult> = async () => {
    const config = readSmtpConfig(process.env)
    if (!config.ok) throw Object.assign(new Error('no transport'), { noTransport: config.reason })
    return sendNextProspect(createAdminClient(), {
      now: new Date(),
      fetchPage: fetchPublicPage,
      send: liveSender(config.settings),
    })
  },
  opts: { env?: Record<string, string | undefined> } = {},
): Promise<IsolatedSendOutcome> {
  const env = opts.env ?? process.env
  // Nothing is constructed before both switches: no client, no transport, no read.
  if (env[SENDING_FLAG] !== 'true') return { status: 'off' }
  if (env.VERCEL_ENV !== 'production') return { status: 'not_production' }
  try {
    const result = await run()
    console.log('[outreach-send] pass complete', result)
    return { status: 'ran', result }
  } catch (error) {
    const reason = (error as { noTransport?: unknown } | null)?.noTransport
    if (typeof reason === 'string') {
      // The ordinary state before the mailbox password is entered. Said once per
      // pass and plainly, because the alternative is a channel that is switched
      // on, silent, and looks like it is working.
      console.warn('[outreach-send] no transport', { reason })
      return { status: 'no_transport' }
    }
    console.error('[outreach-send] pass failed', { reason: 'threw' })
    return { status: 'error' }
  }
}

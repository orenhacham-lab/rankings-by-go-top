/**
 * ONE REAL PASS AN HOUR, NOT ONE EVERY QUARTER HOUR.
 *
 * `/api/content/automation/cron` is called by cron-job.org every fifteen
 * minutes — 96 times a day — and it is the ONLY path of this project that
 * appears in the Vercel runtime logs at all. A quiet pass walks 29 pools and
 * twenty isolated lanes and takes about ten seconds; a pass that carries the
 * daily revive took 23.3s on 17 November 2026. On 9 and 13 November the
 * measured recommendation was to lower that schedule to hourly, which cuts the
 * project's one visible consumer fourfold. It was left as a dashboard change in
 * cron-job.org, nobody made it, and on 17 November 2026 the team crossed 175%
 * of the Hobby allowance of 4 Active-CPU-hours and was given 24 hours before
 * Vercel paused the site. A saving that depends on somebody remembering to
 * click is not a saving, so the interval belongs in the code that is called.
 *
 * THE GATE IS A CLAIM, NOT A READ. Two calls can arrive together (the Vercel
 * cron at 07:00 and cron-job.org's 07:00 pass), so "read the last time, then
 * write it" would let both through. The claim is a single conditional UPDATE —
 * the row is handed to whoever moves `last_started_at` past the cutoff — so at
 * most one caller per window ever runs.
 *
 * WHAT IS NEVER GATED: a request from Vercel's own scheduler (`vercel-cron`
 * user agent, once a day at 07:00 UTC). It carries the daily publishing-stall
 * check (`isDailyStallCheckRun`), which exists precisely because it runs once,
 * and it is one invocation a day — nothing to save and something to lose.
 *
 * IT FAILS OPEN. If the claim cannot be read or written, the pass RUNS. A gate
 * whose database is unreachable must not be the reason a merchant's article
 * never publishes; the worst case is the old frequency, which is what we had.
 *
 * WHAT IT COSTS THE PRODUCT: publishing, the Business Profile post queue and
 * the batch collections are checked hourly instead of every quarter hour, and
 * the blog's morning window (04:00-10:59 UTC) gets seven passes instead of
 * twenty-eight — still far more than the one article a language a day it may
 * write. Generation throughput falls the same fourfold, which today costs
 * nothing (one generation on 17 November, against 35 a day of waste on the
 * 15th and 16th before the paused-backlog hold), and is the number to raise
 * first if a paying queue ever needs more.
 */
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/**
 * How long a claimed pass holds the window. Fifty minutes, not sixty: a
 * scheduler firing "hourly" drifts by seconds to minutes, and a cutoff of
 * exactly an hour would make every other hour's call miss and halve the real
 * rate. At fifty minutes a quarter-hour caller yields exactly one pass an hour.
 */
export const MIN_PASS_INTERVAL_MS = 50 * 60_000

/** The single gate row. One key today; the column exists so a second schedule can have its own. */
export const AUTOMATION_PASS_KEY = 'automation'

/** True when Vercel's own scheduler is calling, which is never gated. */
export function isUngatedScheduler(request: Request): boolean {
  return (request.headers.get('user-agent') ?? '').toLowerCase().startsWith('vercel-cron')
}

export interface PassClaim {
  /** Whether this caller may do the work. */
  granted: boolean
  /** Why, for the one log line: 'claimed' | 'first' | 'too_soon' | 'ungated' | 'error'. */
  reason: 'claimed' | 'first' | 'too_soon' | 'ungated' | 'error'
  /** Milliseconds since the previous claimed pass, when known. */
  sinceLastMs: number | null
}

/**
 * Claims this window for the caller. Never throws.
 *
 * The first branch is the whole mechanism: an UPDATE filtered on
 * `last_started_at < cutoff`. Postgres applies that filter and the write in one
 * statement, so of two simultaneous callers exactly one gets a row back.
 */
export async function claimAutomationPass(
  admin: Admin,
  opts: { nowMs?: number; key?: string; intervalMs?: number } = {},
): Promise<PassClaim> {
  const nowMs = opts.nowMs ?? Date.now()
  const key = opts.key ?? AUTOMATION_PASS_KEY
  const intervalMs = opts.intervalMs ?? MIN_PASS_INTERVAL_MS
  const cutoffIso = new Date(nowMs - intervalMs).toISOString()
  const nowIso = new Date(nowMs).toISOString()
  try {
    const { data: taken, error: updateError } = await admin
      .from('cron_pass_gate')
      .update({ last_started_at: nowIso })
      .eq('key', key)
      .lt('last_started_at', cutoffIso)
      .select('key')
      .maybeSingle()
    if (updateError) return { granted: true, reason: 'error', sinceLastMs: null }
    if (taken) return { granted: true, reason: 'claimed', sinceLastMs: null }

    // No row moved: either the window is still held, or the row does not exist yet.
    const { data: existing, error: selectError } = await admin
      .from('cron_pass_gate')
      .select('last_started_at')
      .eq('key', key)
      .maybeSingle()
    if (selectError) return { granted: true, reason: 'error', sinceLastMs: null }
    if (existing) {
      const t = Date.parse(String((existing as { last_started_at?: unknown }).last_started_at ?? ''))
      return { granted: false, reason: 'too_soon', sinceLastMs: Number.isFinite(t) ? nowMs - t : null }
    }

    // First ever call. The primary key makes a concurrent insert fail, so the
    // loser is refused rather than running a second pass.
    const { data: created, error: insertError } = await admin
      .from('cron_pass_gate')
      .insert({ key, last_started_at: nowIso })
      .select('key')
      .maybeSingle()
    if (insertError) return { granted: false, reason: 'too_soon', sinceLastMs: null }
    return created ? { granted: true, reason: 'first', sinceLastMs: null } : { granted: false, reason: 'too_soon', sinceLastMs: null }
  } catch {
    return { granted: true, reason: 'error', sinceLastMs: null }
  }
}

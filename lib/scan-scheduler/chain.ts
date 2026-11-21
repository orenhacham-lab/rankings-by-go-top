/**
 * THE RANK SCHEDULE'S THROUGHPUT CEILING, AND HOW IT IS LIFTED.
 *
 * `/api/schedule` is one invocation with `maxDuration = 300`, and inside it a
 * serial `for` over every due project. A rank check measured 1.8 s, so one
 * invocation can perform about 166 checks and then the platform kills it
 * mid-project. That is roughly 5,000 checks a month FOR THE WHOLE PLATFORM,
 * while a single Agency customer at quota is entitled to 40,000. It is also
 * why a 7x7 geo grid (49 searches for one keyword) has nowhere to run.
 *
 * This module does not add a queue table, a worker or a broker. It makes the
 * existing loop finish cleanly and then hand the rest to a fresh invocation of
 * the same route, so one 300-second window becomes as many as the work needs:
 *
 *   1. DEADLINE. The loop stops starting new projects once the invocation has
 *      spent its budget, instead of being killed inside one. A project that is
 *      never started keeps its `next_scan_at`, so it is still due.
 *   2. CHAIN. If work remains and this pass made progress, the route calls
 *      itself once more with `?pass=N+1`, carrying the same CRON_SECRET.
 *
 * Three things keep a chain from becoming a runaway, and all three must hold:
 *   - a hard cap on passes;
 *   - PROGRESS: a pass that processed nothing does not chain, so a permanently
 *     failing project cannot spin;
 *   - work actually remaining.
 * A completed project advances `next_scan_at` and a claimed one sets
 * `scan_claimed_at`, so the next pass picks up different projects, never the
 * same ones again.
 */

/** Passes per trigger. 20 x ~166 checks is ~3,300 checks a day, bounded. */
export const SCAN_CHAIN_MAX_PASSES = 20

/** The query parameter carrying the pass number. */
export const SCAN_CHAIN_PARAM = 'pass'

/**
 * Of the invocation's budget, the share the loop may spend starting projects.
 * The remainder is left for the project in flight to finish, for `after()`
 * work already scheduled, and for the response itself.
 */
export const SCAN_CHAIN_BUDGET_SHARE = 0.8

export function readPassNumber(url: string): number {
  let raw: string | null = null
  try {
    raw = new URL(url).searchParams.get(SCAN_CHAIN_PARAM)
  } catch {
    return 1
  }
  const n = Number(raw)
  // A missing, junk, zero, negative or fractional value is pass 1. A hostile
  // value cannot buy extra passes either: it is clamped to the cap.
  if (!Number.isInteger(n) || n < 1) return 1
  return Math.min(n, SCAN_CHAIN_MAX_PASSES)
}

/**
 * When this invocation must stop starting new projects. Absolute epoch ms, so
 * it can be compared with `Date.now()` directly.
 */
export function scanDeadlineAt(startedAtMs: number, maxDurationSeconds: number): number {
  return startedAtMs + maxDurationSeconds * 1000 * SCAN_CHAIN_BUDGET_SHARE
}

export interface ChainDecision {
  chain: boolean
  reason: 'work_remains' | 'nothing_left' | 'no_progress' | 'cap_reached'
  nextPass: number
}

export function decideChain(opts: {
  /** Projects this pass actually started. */
  processed: number
  /** Due projects this pass did NOT start. */
  remaining: number
  /** The pass that just ran, 1-based. */
  pass: number
  maxPasses?: number
}): ChainDecision {
  const maxPasses = opts.maxPasses ?? SCAN_CHAIN_MAX_PASSES
  const nextPass = opts.pass + 1
  if (opts.remaining <= 0) return { chain: false, reason: 'nothing_left', nextPass }
  // Checked before the cap on purpose: a pass that did nothing is the symptom
  // that matters, and saying "no_progress" is what a reader needs to see.
  if (opts.processed <= 0) return { chain: false, reason: 'no_progress', nextPass }
  if (nextPass > maxPasses) return { chain: false, reason: 'cap_reached', nextPass }
  return { chain: true, reason: 'work_remains', nextPass }
}

/**
 * The URL of the next pass: this route's own URL with `pass` replaced, never
 * appended twice, and with every other parameter preserved.
 */
export function nextPassUrl(currentUrl: string, nextPass: number): string {
  const url = new URL(currentUrl)
  url.searchParams.set(SCAN_CHAIN_PARAM, String(nextPass))
  return url.toString()
}

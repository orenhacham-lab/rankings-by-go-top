/**
 * A small in-process rate limiter for the public AI crawler check.
 *
 * WHY NOT THE LEDGER THE FREE CHECK USES. That one is a Supabase table because
 * the free check spends money per run: a model call, with a daily cap that has
 * to hold across every serverless instance or it is not a cap. This check
 * spends nothing — one GET of one text file, then string matching — so what a
 * limit is protecting here is only politeness towards the site being fetched
 * and our own egress, not a budget. A per-instance window is enough for that,
 * and it buys the asset its most important property: no database, no
 * migration, no row per visitor, nothing to keep.
 *
 * It is therefore honestly WEAKER than the free check's gate, and says so: a
 * determined caller spread across instances gets more than LIMIT. The blast
 * radius of that is unauthenticated GETs of public robots.txt files, each one
 * capped in bytes and time by site-fetch.ts.
 *
 * Memory is bounded by sweeping expired entries on write, so a long-lived
 * instance cannot accumulate a key per visitor forever.
 */

/** How many checks one client may run per window. */
export const LIMIT = 20
export const WINDOW_MS = 60_000
/** Above this many tracked clients, the oldest windows are dropped outright. */
const MAX_KEYS = 5_000

type Window = { count: number; resetAt: number }

const windows = new Map<string, Window>()

/** Drop every window that has already expired, and hard-cap the map's size. */
function sweep(now: number): void {
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key)
  }
  if (windows.size <= MAX_KEYS) return
  // Still too many live windows: drop the ones closest to expiring. Insertion
  // order is close enough to age for this, and the cost of being wrong is one
  // client getting a fresh allowance.
  const excess = windows.size - MAX_KEYS
  let dropped = 0
  for (const key of windows.keys()) {
    windows.delete(key)
    if (++dropped >= excess) break
  }
}

export type RateDecision = { allowed: boolean; remaining: number; resetAt: number }

/**
 * Count one request against `key` and say whether it may proceed.
 *
 * `now` is a parameter so the QA suite can advance the clock without waiting a
 * minute; nothing in app code passes one.
 */
export function takeToken(key: string, now: number = Date.now()): RateDecision {
  sweep(now)
  const existing = windows.get(key)
  if (!existing || existing.resetAt <= now) {
    const fresh: Window = { count: 1, resetAt: now + WINDOW_MS }
    windows.set(key, fresh)
    return { allowed: true, remaining: LIMIT - 1, resetAt: fresh.resetAt }
  }
  if (existing.count >= LIMIT) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt }
  }
  existing.count += 1
  return { allowed: true, remaining: LIMIT - existing.count, resetAt: existing.resetAt }
}

/** Test seam: forget every window. Never called from app code. */
export function resetRateLimiter(): void {
  windows.clear()
}

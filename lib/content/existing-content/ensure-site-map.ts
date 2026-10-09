/**
 * Map a project's site BEFORE its first article is written.
 *
 * The automatic internal links (lib/content/auto-internal-links) can only link
 * to pages listed in `site_page_map`, and that table was filled by exactly one
 * thing: a human opening the Existing Content screen. No cron, no onboarding
 * step, nothing server-side. So a project's first articles — including the one
 * written the moment the owner approves the strategy — were generated before
 * any mapping existed and came out with no internal links at all, silently.
 *
 * This is the server-side filler for that one case: it runs the same claim +
 * run the screen's route runs, so there is no second mapping implementation,
 * and it is awaited by the caller (already inside after(), so no one waits on
 * it). BEST-EFFORT: it never throws, and a failure only means the article is
 * written without automatic links, exactly as before.
 *
 * It does NOT cover a project whose mapping has gone stale months later; that
 * needs a refresh pass in the automation cron, which is a separate change.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { claimSiteMap, readSiteMap, MAP_FRESH_MS } from './site-map-store'
import { projectSiteOrigin, runSiteMap, type RunDeps } from './site-map-run'

export type EnsureSiteMapOutcome =
  /** A run finished here; its entries are now stored. */
  | 'mapped'
  /** A usable mapping already exists and is fresh enough to link against. */
  | 'fresh'
  /** Another run holds the lease, or one just finished; nothing to do here. */
  | 'running'
  /** The project has no site to map (no domain, no connected platform). */
  | 'no_site'
  /** The mapping table is absent, the claim failed, or the run threw. */
  | 'unavailable'
  | 'failed'

export interface EnsureSiteMapScope { projectId: string; userId: string }

/** A stored mapping this fresh is good enough; no point re-crawling the site. */
export const ENSURE_MAP_FRESH_MS = MAP_FRESH_MS

/**
 * Make sure the project has a mapping worth linking against, and wait for it.
 * Returns what happened; never throws.
 */
export async function ensureSiteMapForProject(
  admin: ServiceRoleClient,
  scope: EnsureSiteMapScope,
  deps: { now?: () => number; runDeps: (admin: ServiceRoleClient, scope: EnsureSiteMapScope) => RunDeps },
): Promise<EnsureSiteMapOutcome> {
  const now = deps.now ?? (() => Date.now())
  try {
    const read = await readSiteMap(admin, scope, { entries: false })
    if (!read.available) return 'unavailable'
    if (isFreshEnough(read.row, now())) return 'fresh'

    const origin = await projectSiteOrigin(admin, scope)
    if (!origin) return 'no_site'

    const claim = await claimSiteMap(admin, scope, { siteUrl: origin.toString(), now: now() })
    if (claim === 'unavailable') return 'unavailable'
    if (claim === 'failed') return 'failed'
    // Someone else is mapping, or a run ended moments ago: never a second crawl.
    if (claim === 'running' || claim === 'recent') return 'running'

    const outcome = await runSiteMap(admin, scope, origin, deps.runDeps(admin, scope))
    // 'partial' and even 'failed' can still have stored usable entries, which is
    // what the link step reads; the caller only needs to know a run happened.
    return outcome.status === 'failed' && outcome.found === 0 ? 'failed' : 'mapped'
  } catch {
    return 'unavailable'
  }
}

/** A stored mapping worth linking against: it has pages, and it is recent. */
export function isFreshEnough(
  row: { status?: string | null; finished_at?: string | null; urls_found?: number | null } | null | undefined,
  nowMs: number,
): boolean {
  if (!row) return false
  // 'running' has nothing to offer yet; a failed run may still carry the
  // previous run's entries, which the link step accepts.
  if (row.status !== 'completed' && row.status !== 'partial' && row.status !== 'failed') return false
  if ((row.urls_found ?? 0) <= 0) return false
  const finished = row.finished_at ? Date.parse(row.finished_at) : NaN
  if (!Number.isFinite(finished)) return false
  return nowMs - finished <= ENSURE_MAP_FRESH_MS
}

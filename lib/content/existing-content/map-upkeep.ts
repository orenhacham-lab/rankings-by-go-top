/**
 * Keep every automated project's site mapping present and fresh, from the cron.
 *
 * The automatic internal links can only link to pages in `site_page_map`, and
 * that table is filled when someone opens the Existing Content screen, or once
 * when a strategy is first approved (ensure-site-map.ts, since 9 October 2026).
 * Every project approved before that, and every mapping that ages past the link
 * step's 30-day limit, got no map, so its articles came out with no internal
 * links at all: on 11 October 16 of the 25 projects with an active queue had
 * no mapping row, and none of their recent articles had a single internal link.
 *
 * This pass, run from the automation cron after everything else that matters,
 * maps ONE project per run with the same claim + run the screen uses (no second
 * crawler): missing mappings first, then those older than MAP_REFRESH_AFTER_MS,
 * which is well inside the link step's limit so a map never lapses. A project
 * whose last attempt finished less than MAP_RETRY_AFTER_MS ago is left alone,
 * so a site that cannot be mapped is tried once a day, not every quarter hour.
 * The order rotates per run so one project that keeps failing cannot hold
 * the others back.
 *
 * Service role: every read names the project and its owner. Never throws.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { ensureSiteMapForProject, type EnsureSiteMapOutcome, type EnsureSiteMapScope } from './ensure-site-map'
import { MAP_TABLE } from './site-map-store'
import { WORK_MS, liveWalk, liveWordPress } from './site-map-run'

/** Re-map after this, half the link step's limit, so a mapping never goes stale under it. */
export const MAP_REFRESH_AFTER_MS = 14 * 24 * 3600_000
/** A project's last attempt, good or bad, is not repeated sooner than this. */
export const MAP_RETRY_AFTER_MS = 24 * 3600_000
/** Starting a mapping needs its work window plus the walk's own slack and the writes. */
export const MAP_UPKEEP_MIN_WINDOW_MS = WORK_MS + 30_000
/** Outcomes that did no crawl: the pass moves on to the next project. */
const NOTHING_DONE: ReadonlySet<EnsureSiteMapOutcome> = new Set(['fresh', 'running', 'no_site'])
const MAX_TRIES = 5

type ProjectRow = { id: string; user_id: string | null; target_domain: string | null }
type MapRow = { project_id: string; status: string | null; finished_at: string | null; urls_found: number | null; lease_expires_at: string | null }

/** Pure: which projects need mapping now, in the order to try them. */
export function pickProjectsToMap(projects: ProjectRow[], maps: MapRow[], nowMs: number, runMs = 15 * 60_000): EnsureSiteMapScope[] {
  const byProject = new Map(maps.map((m) => [m.project_id, m]))
  const missing: EnsureSiteMapScope[] = []
  const stale: { scope: EnsureSiteMapScope; finished: number }[] = []
  for (const p of [...projects].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!p.user_id || !String(p.target_domain ?? '').trim()) continue
    const scope = { projectId: p.id, userId: p.user_id }
    const m = byProject.get(p.id)
    if (!m) { missing.push(scope); continue }
    if (m.status === 'running' && m.lease_expires_at && Date.parse(m.lease_expires_at) >= nowMs) continue
    const finished = m.finished_at ? Date.parse(m.finished_at) : NaN
    if (Number.isFinite(finished) && nowMs - finished < MAP_RETRY_AFTER_MS) continue
    const usable = (m.urls_found ?? 0) > 0 && Number.isFinite(finished) && nowMs - finished <= MAP_REFRESH_AFTER_MS
    if (!usable) stale.push({ scope, finished: Number.isFinite(finished) ? finished : 0 })
  }
  const run = Math.floor(nowMs / runMs)
  const rotate = <T>(xs: T[]) => (xs.length ? [...xs.slice(run % xs.length), ...xs.slice(0, run % xs.length)] : xs)
  return [...rotate(missing), ...rotate(stale.sort((a, b) => a.finished - b.finished).map((s) => s.scope))]
}

export type MapUpkeepResult = { projectId: string; outcome: EnsureSiteMapOutcome } | null

/**
 * Map at most one project. `ensure` is the real ensureSiteMapForProject with the
 * live crawl bound in (the cron route), or a stand-in in tests.
 */
export async function runMapUpkeep(
  admin: ServiceRoleClient,
  opts: { deadlineAt: number; nowMs?: () => number; ensure: (admin: ServiceRoleClient, scope: EnsureSiteMapScope) => Promise<EnsureSiteMapOutcome> },
): Promise<MapUpkeepResult> {
  const now = opts.nowMs ?? Date.now
  try {
    if (opts.deadlineAt - now() < MAP_UPKEEP_MIN_WINDOW_MS) return null
    const { data: pools } = await admin.from('article_pools').select('project_id').eq('is_active', true)
    const ids = [...new Set(((pools ?? []) as { project_id: string }[]).map((p) => p.project_id))]
    if (!ids.length) return null
    const { data: projects } = await admin.from('projects').select('id, user_id, target_domain').in('id', ids)
    const { data: maps, error } = await admin.from(MAP_TABLE).select('project_id, user_id, status, finished_at, urls_found, lease_expires_at').in('project_id', ids)
    if (error) return null
    const owners = new Map(((projects ?? []) as ProjectRow[]).map((p) => [p.id, p.user_id]))
    // A row belongs to the project only when it is the owner's own.
    const ownMaps = ((maps ?? []) as (MapRow & { user_id: string })[]).filter((m) => owners.get(m.project_id) === m.user_id)
    const todo = pickProjectsToMap((projects ?? []) as ProjectRow[], ownMaps, now())
    for (const scope of todo.slice(0, MAX_TRIES)) {
      if (opts.deadlineAt - now() < MAP_UPKEEP_MIN_WINDOW_MS) return null
      const outcome = await opts.ensure(admin, scope)
      if (NOTHING_DONE.has(outcome)) continue
      console.log('[map-upkeep]', { projectId: scope.projectId, outcome, waiting: todo.length - 1 })
      return { projectId: scope.projectId, outcome }
    }
    return null
  } catch (e) {
    console.error('[map-upkeep] failed', { error: e instanceof Error ? e.name : 'unknown' })
    return null
  }
}

/** The live crawl, bound for the cron: the same deps the strategy route passes. */
export function liveEnsure(admin: ServiceRoleClient, scope: EnsureSiteMapScope): Promise<EnsureSiteMapOutcome> {
  return ensureSiteMapForProject(admin, scope, {
    now: () => Date.now(),
    runDeps: (a, sc) => ({ now: () => Date.now(), walk: liveWalk, platform: liveWordPress(a, sc.projectId, () => Date.now(), sc.userId) }),
  })
}

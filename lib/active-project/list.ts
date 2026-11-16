/**
 * The owned+active project list, built once and served two ways.
 *
 * WHY THIS IS SHARED. The dashboard's active-project provider used to learn
 * this list from `/api/projects/active` on mount, and nothing else on the page
 * could start until that answer came back: the project id is what every other
 * request is keyed by. Measured from Tokyo, that single gate cost about 650ms
 * before any real work began, on every dashboard load. The dashboard layout
 * already runs in the database's own region, so it builds the same list there
 * and hands it to the provider, which then starts resolved. The route stays
 * exactly as it was for reloads, for the switcher's own refreshes, and for the
 * deep-link path that asks again for an id the first list did not contain.
 *
 * Ownership is enforced here, not assumed: the query filters on the caller's
 * own user id and RLS backs it. The list is a UI convenience — every data
 * route still runs its own ownership check, and nothing here is an
 * authorization decision.
 */
import { safeSiteIcon } from '@/lib/site-icon'
import { needsIconRetry, MAX_PER_REQUEST, type IconRunRow } from '@/lib/seed-scan/site-icon-refresh'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ActiveProjectRow = {
  id: string
  name: string | null
  updated_at: string | null
  target_domain: string | null
  site_icon: string | null
}

export type ActiveProjectList = {
  projects: ActiveProjectRow[]
  /** Latest scan runs whose icon is worth looking for again. Empty for the layout. */
  iconRetryRunIds: string[]
  /** Each listed project's target domain, for the icon refresh. */
  domains: Map<string, string | null>
}

/**
 * ONE read of project_seed_runs, not two.
 *
 * The icon a project's latest scan stored, and whether that run is due another
 * look, were two queries against the same table with the same filter, the same
 * order and the same limit — run one after the other. In the middleware's
 * region that is one wasted round trip on the request every other request
 * waits for. The columns the second needed are a superset of the first's, so
 * one query answers both and the rows are walked twice in memory.
 */
async function latestRuns(
  supabase: SupabaseClient,
  ids: string[],
): Promise<{ id: string; project_id: string; status: string | null; site_icon: string | null; checked_at: string | null }[]> {
  if (ids.length === 0) return []
  try {
    // RLS scopes the runs to the caller's own projects; the ids are the caller's too.
    const { data, error } = await supabase
      .from('project_seed_runs')
      .select('id, project_id, status, created_at, site_icon:summary->>siteIcon, checked_at:summary->>siteIconCheckedAt')
      .in('project_id', ids)
      .order('created_at', { ascending: false })
      .limit(Math.min(500, ids.length * 5))
    if (error || !Array.isArray(data)) return []
    return (data as unknown as Record<string, unknown>[]).map((r) => ({
      id: typeof r.id === 'string' ? r.id : '',
      project_id: typeof r.project_id === 'string' ? r.project_id : '',
      status: typeof r.status === 'string' ? r.status : null,
      site_icon: typeof r.site_icon === 'string' ? r.site_icon : null,
      checked_at: typeof r.checked_at === 'string' ? r.checked_at : null,
    }))
  } catch {
    // Best-effort: the switcher falls back to /favicon.ico, then the initial.
    return []
  }
}

/**
 * The caller's owned + active projects, newest first, each with the icon its
 * latest finished scan found. Returns null when the list itself cannot be
 * read, which a caller must not confuse with "this account has no projects".
 */
export async function buildActiveProjectList(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<ActiveProjectList | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, updated_at, target_domain')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[projects/active] list failed', { code: (error as { code?: string }).code })
    return null
  }

  const rows = (data ?? []) as { id: string; name: string | null; updated_at: string | null; target_domain: string | null }[]
  const runs = await latestRuns(supabase, rows.map((r) => r.id))

  // The newest run per project carries the icon; the same newest run is the
  // one a retry would re-read. Both are taken from this single ordered pass.
  const icons = new Map<string, string>()
  const newestRun = new Map<string, IconRunRow>()
  for (const r of runs) {
    if (!r.project_id) continue
    if (r.site_icon && !icons.has(r.project_id)) icons.set(r.project_id, r.site_icon)
    if (!newestRun.has(r.project_id)) {
      newestRun.set(r.project_id, {
        id: r.id,
        project_id: r.project_id,
        status: r.status,
        summary: { siteIcon: r.site_icon ?? undefined, siteIconCheckedAt: r.checked_at ?? undefined },
      })
    }
  }

  const projects = rows.map((r) => ({ ...r, site_icon: safeSiteIcon(icons.get(r.id), r.target_domain) }))

  const iconRetryRunIds: string[] = []
  for (const p of projects) {
    if (p.site_icon) continue
    const run = newestRun.get(p.id)
    if (run && needsIconRetry(run, now)) iconRetryRunIds.push(run.id)
    if (iconRetryRunIds.length >= MAX_PER_REQUEST) break
  }

  return { projects, iconRetryRunIds, domains: new Map(rows.map((r) => [r.id, r.target_domain])) }
}

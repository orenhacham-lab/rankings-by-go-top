/**
 * Area D — GET /api/projects/active
 *
 * The authoritative list the global active-project selector validates against:
 * the caller's OWNED + ACTIVE projects, with updated_at for the most-recently-
 * updated fallback. Ownership is enforced server-side (user_id = auth.uid(), also
 * backed by RLS). This is a read-only list; every data route still runs its own
 * ownership check — the client-side active projectId is never trusted for auth.
 *
 * Each project also carries what the switcher needs to show the site's icon: its
 * target_domain, and the icon its latest seeding scan found in the home page's
 * HTML (site_icon), re-checked here (https, on the project's own site, bounded;
 * lib/site-icon.ts). The icon URL is never fetched here: the owner's browser
 * loads it. The icon read is best-effort: when it fails, the list is served
 * without icons.
 *
 * A project whose latest FINISHED scan stored no icon has its home page read
 * again for one, after the response, at most once a week and for at most
 * MAX_PER_REQUEST projects per load (lib/seed-scan/site-icon-refresh.ts, under
 * the scan's own guards). The list itself never waits for it.
 *
 * THE LIST ITSELF now lives in lib/active-project/list.ts, because the
 * dashboard layout builds the same list in-region and hands it to the provider,
 * so a first dashboard load no longer waits for this round trip. This route is
 * unchanged for every other caller: the switcher's refreshes, a deep link to an
 * id the first list did not carry, and a retry after a failed load.
 */
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildActiveProjectList } from '@/lib/active-project/list'
import { realIconRefreshDeps, refreshRunIcon, type IconRunRow } from '@/lib/seed-scan/site-icon-refresh'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const list = await buildActiveProjectList(supabase, user.id)
  if (!list) return Response.json({ error: 'Failed to load projects' }, { status: 500 })

  if (list.iconRetryRunIds.length > 0) {
    const userId = user.id
    const { iconRetryRunIds, domains } = list
    after(async () => {
      const admin = createAdminClient()
      const deps = realIconRefreshDeps()
      for (const runId of iconRetryRunIds) {
        // The full summary is read here, by the service role, fenced to the caller's own run.
        const { data: run } = await admin
          .from('project_seed_runs')
          .select('id, project_id, status, summary')
          .eq('id', runId)
          .eq('user_id', userId)
          .maybeSingle()
        const row = run as IconRunRow | null
        if (!row || !domains.has(row.project_id)) continue
        await refreshRunIcon(admin, { run: row, userId, targetDomain: domains.get(row.project_id) ?? null }, deps)
      }
    })
  }

  return Response.json({ projects: list.projects })
}

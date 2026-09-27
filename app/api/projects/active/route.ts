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
 * lib/site-icon.ts). Nothing is fetched: the owner's browser loads the icon. The
 * icon read is best-effort: when it fails, the list is served without icons.
 */
import { createClient } from '@/lib/supabase/server'
import { safeSiteIcon } from '@/lib/site-icon'

export const dynamic = 'force-dynamic'

type Row = { id: string; name: string | null; updated_at: string | null; target_domain: string | null }

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, updated_at, target_domain')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[projects/active] list failed', { code: (error as { code?: string }).code })
    return Response.json({ error: 'Failed to load projects' }, { status: 500 })
  }
  const rows = (data ?? []) as Row[]
  const icons = await latestIcons(supabase, rows.map((r) => r.id))
  return Response.json({
    projects: rows.map((r) => ({ ...r, site_icon: safeSiteIcon(icons.get(r.id), r.target_domain) })),
  })
}

/** The icon each project's latest scan stored, newest first; an empty map when the read fails. */
async function latestIcons(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  try {
    // RLS scopes the runs to the caller's own projects; the ids are the caller's too.
    const { data, error } = await supabase
      .from('project_seed_runs')
      .select('project_id, site_icon:summary->>siteIcon, created_at')
      .in('project_id', ids)
      .not('summary->>siteIcon', 'is', null)
      .order('created_at', { ascending: false })
      .limit(Math.min(500, ids.length * 5))
    if (error || !Array.isArray(data)) return out
    for (const row of data as unknown as { project_id?: unknown; site_icon?: unknown }[]) {
      if (typeof row.project_id === 'string' && typeof row.site_icon === 'string' && !out.has(row.project_id)) {
        out.set(row.project_id, row.site_icon)
      }
    }
  } catch {
    // Best-effort: the switcher falls back to /favicon.ico, then the initial.
  }
  return out
}

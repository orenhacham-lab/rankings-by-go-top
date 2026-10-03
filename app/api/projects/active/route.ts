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
 */
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeSiteIcon } from '@/lib/site-icon'
import { MAX_PER_REQUEST, needsIconRetry, realIconRefreshDeps, refreshRunIcon, type IconRunRow } from '@/lib/seed-scan/site-icon-refresh'

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
  const retry = await iconRetries(supabase, rows.filter((r) => !safeSiteIcon(icons.get(r.id), r.target_domain)).map((r) => r.id))
  if (retry.length > 0) {
    const userId = user.id
    const domains = new Map(rows.map((r) => [r.id, r.target_domain]))
    after(async () => {
      const admin = createAdminClient()
      const deps = realIconRefreshDeps()
      for (const runId of retry) {
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

/**
 * The runs whose icon is worth looking for again: each listed project's LATEST
 * run, when it finished without an icon and was not looked at this week. At
 * most MAX_PER_REQUEST; none when the read fails.
 */
async function iconRetries(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]): Promise<string[]> {
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
    const seen = new Set<string>()
    const out: string[] = []
    const now = new Date()
    for (const r of data as unknown as { id?: unknown; project_id?: unknown; status?: unknown; site_icon?: unknown; checked_at?: unknown }[]) {
      if (typeof r.id !== 'string' || typeof r.project_id !== 'string' || seen.has(r.project_id)) continue
      seen.add(r.project_id)
      const run: IconRunRow = {
        id: r.id,
        project_id: r.project_id,
        status: typeof r.status === 'string' ? r.status : null,
        summary: { siteIcon: r.site_icon ?? undefined, siteIconCheckedAt: r.checked_at ?? undefined },
      }
      if (needsIconRetry(run, now)) out.push(r.id)
      if (out.length >= MAX_PER_REQUEST) break
    }
    return out
  } catch {
    return []
  }
}

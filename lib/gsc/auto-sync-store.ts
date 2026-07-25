/**
 * Area A — admin-client loader for the auto-sync dispatcher.
 *
 * Builds the AutoSyncCandidate list (project + assigned property + connection status +
 * last SUCCESSFUL sync) with a few small, bounded reads. Kept out of auto-sync.ts so the
 * selection/dispatch core stays pure and unit-testable.
 *
 * Server-only (service role). It reads exactly the columns the dispatcher needs and NEVER
 * reads or returns tokens: gsc_connections is queried for id/user_id/status only.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { AutoSyncCandidate } from './auto-sync'

type Admin = ReturnType<typeof createAdminClient>

/** Hard bound on the candidate scan so one invocation can never read unbounded rows. */
const MAX_CANDIDATES = 500

export async function loadAutoSyncCandidates(admin: Admin): Promise<AutoSyncCandidate[]> {
  // 1) Every project that has a Search Console property assigned (the natural scope).
  const { data: props, error: propsErr } = await admin
    .from('project_gsc_properties')
    .select('project_id, connection_id, site_url')
    .limit(MAX_CANDIDATES)
  if (propsErr) throw new Error('auto_sync_properties_read_failed')
  const properties = (props ?? []) as { project_id: string; connection_id: string; site_url: string }[]
  if (properties.length === 0) return []

  const projectIds = properties.map((p) => p.project_id)
  const connectionIds = Array.from(new Set(properties.map((p) => p.connection_id)))

  // 2) Project activity, 3) connection status (NO token columns), 4) last successful runs.
  const [{ data: projRows, error: projErr }, { data: connRows, error: connErr }, { data: runRows, error: runErr }] = await Promise.all([
    admin.from('projects').select('id, is_active').in('id', projectIds),
    admin.from('gsc_connections').select('id, status').in('id', connectionIds),
    admin.from('gsc_sync_runs').select('project_id, finished_at').in('project_id', projectIds)
      .eq('status', 'succeeded').order('finished_at', { ascending: false }),
  ])
  if (projErr) throw new Error('auto_sync_projects_read_failed')
  if (connErr) throw new Error('auto_sync_connections_read_failed')
  if (runErr) throw new Error('auto_sync_runs_read_failed')

  const activeById = new Map((projRows ?? []).map((p) => [String((p as { id: string }).id), !!(p as { is_active: boolean }).is_active]))
  const statusById = new Map((connRows ?? []).map((c) => [String((c as { id: string }).id), String((c as { status: string }).status)]))
  // Rows arrive newest-first, so the FIRST entry per project is its latest success.
  const lastSuccessByProject = new Map<string, string>()
  for (const r of (runRows ?? []) as { project_id: string; finished_at: string | null }[]) {
    if (!r.finished_at) continue
    if (!lastSuccessByProject.has(r.project_id)) lastSuccessByProject.set(r.project_id, r.finished_at)
  }

  return properties.map((p) => ({
    projectId: p.project_id,
    connectionId: p.connection_id,
    siteUrl: p.site_url,
    projectActive: activeById.get(p.project_id) ?? false,
    connectionStatus: statusById.get(p.connection_id) ?? 'error',
    lastSuccessAt: lastSuccessByProject.get(p.project_id) ?? null,
  }))
}

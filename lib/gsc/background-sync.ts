/**
 * Search Console syncs by itself right after it is linked to a project.
 *
 * Before this, linking was only the first step: the owner connected Google, picked a
 * property, and then had to press "manual sync" before any data appeared. Now the
 * moment a property is linked to a project (auto-matched at the end of the OAuth
 * callback, or chosen by the user afterwards) the SAME sync engine the manual button
 * runs (executeManualSync) is started on the server, in `after()`, so:
 *   - it does not delay the redirect / the property response (nothing here is awaited
 *     by the route), and it keeps running if the user leaves the page;
 *   - a double trigger (connect + pick, reconnect, auto + click) never runs two
 *     syncs at once: an active-run pre-check, a short cooldown after a fresh
 *     success for the same property, and, as the final guard, the DB unique-active-run
 *     index (surfaced by makeSyncStore as `sync_in_progress`, treated as a skip);
 *   - a failure is stored as a sanitized failed run (code only) so the screen can show
 *     a friendly message; raw Google/DB text is never kept or shown.
 *
 * Owner-scoped: createAdminClient bypasses RLS, so the project must belong to `userId`
 * and the connection used is that user's own (authorizeProjectGsc re-checks both).
 */
import { randomUUID } from 'crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import { getGscMaxRowsPerWindow } from './config'
import { listSites } from './api'
import { buildPropertyViews } from './property-match'
import { executeManualSync, STALE_RUN_LEASE_MS, type ManualSyncResult } from './sync'
import {
  authorizeProjectGsc, getAccessTokenForConnection, latestSucceededRun, loadProjectProperty,
  loadUserConnection, makeSyncClient, makeSyncStore,
} from './service'

type Admin = ReturnType<typeof createAdminClient>

/** A property synced successfully this recently is not synced again by an automatic trigger. */
export const AUTO_START_COOLDOWN_MS = 5 * 60 * 1000

export type BackgroundSyncOutcome =
  | { state: 'skipped'; reason: 'forbidden' | 'no_connection' | 'no_property' | 'sync_in_progress' | 'recently_synced' }
  | { state: 'done'; status: 'succeeded' | 'partial' | 'failed'; errorCode?: string; autoAssigned: boolean }

export interface BackgroundSyncEffects {
  getAccessToken: (admin: Admin, connection: Parameters<typeof getAccessTokenForConnection>[1]) => Promise<string>
  listSites: (accessToken: string) => Promise<{ siteUrl: string; permissionLevel: string }[]>
  runSync: (deps: Parameters<typeof executeManualSync>[0]) => Promise<ManualSyncResult>
}
const REAL_EFFECTS: BackgroundSyncEffects = { getAccessToken: getAccessTokenForConnection, listSites, runSync: executeManualSync }

/** Only a short lowercase code ever reaches the database or a log. */
function safeCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code
  return typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code) ? code : 'sync_failed'
}

/**
 * The one property to link on its own: a verified property that covers the project URL.
 * When several qualify, only an unambiguous broadest choice (exactly one domain property)
 * is taken; otherwise the user chooses, and the sync starts when they do.
 */
export function pickAutoProperty(
  sites: { siteUrl: string; permissionLevel: string }[],
  projectUrl: string | null | undefined,
): { siteUrl: string; permissionLevel: string } | null {
  const ok = buildPropertyViews(sites, projectUrl).filter((v) => v.assignable)
  if (ok.length === 1) return ok[0]
  const domains = ok.filter((v) => v.kind === 'domain')
  return domains.length === 1 ? domains[0] : null
}

export async function runBackgroundGscSync(args: {
  admin: Admin
  userId: string
  projectId: string
  /** Link a matching property first when the project has none (the OAuth callback). */
  autoAssign: boolean
  nowMs?: number
  effects?: Partial<BackgroundSyncEffects>
}): Promise<BackgroundSyncOutcome> {
  const { admin, userId, projectId } = args
  const fx = { ...REAL_EFFECTS, ...args.effects }
  const nowMs = args.nowMs ?? Date.now()

  // Owner scope: the service-role client sees every project.
  const { data: proj } = await admin.from('projects').select('user_id, target_domain').eq('id', projectId).maybeSingle()
  const project = proj as { user_id?: string; target_domain?: string | null } | null
  if (!project || project.user_id !== userId) return { state: 'skipped', reason: 'forbidden' }

  const connection = await loadUserConnection(admin, userId)
  if (!connection || connection.status !== 'connected') return { state: 'skipped', reason: 'no_connection' }

  let autoAssigned = false
  let property = await loadProjectProperty(admin, projectId)
  if (!property && args.autoAssign) {
    const sites = await fx.listSites(await fx.getAccessToken(admin, connection))
    const pick = pickAutoProperty(sites, project.target_domain ?? null)
    if (pick) {
      const nowIso = new Date(nowMs).toISOString()
      const { error } = await admin.from('project_gsc_properties').upsert({
        project_id: projectId, connection_id: connection.id, site_url: pick.siteUrl,
        permission_level: pick.permissionLevel, selected_by: userId, selected_at: nowIso, updated_at: nowIso,
      }, { onConflict: 'project_id' })
      if (error) throw Object.assign(new Error('assign_failed'), { code: 'assign_failed' })
      autoAssigned = true
      property = await loadProjectProperty(admin, projectId)
    }
  }
  if (!property) return { state: 'skipped', reason: 'no_property' }

  const { property: assigned, connection: owned } = await authorizeProjectGsc(admin, projectId, userId)

  // Already running (a click, the cron, an earlier trigger): never start a second one.
  const leaseCutoff = new Date(nowMs - STALE_RUN_LEASE_MS).toISOString()
  const { data: active } = await admin.from('gsc_sync_runs').select('id').eq('project_id', projectId).eq('status', 'running').gt('started_at', leaseCutoff).limit(1)
  if (Array.isArray(active) && active.length > 0) return { state: 'skipped', reason: 'sync_in_progress' }

  // A reconnect or re-pick right after a good sync of the same property has nothing new.
  const last = await latestSucceededRun(admin, projectId, 28)
  if (last && last.site_url === assigned.site_url && last.finished_at && nowMs - Date.parse(last.finished_at) < AUTO_START_COOLDOWN_MS) {
    return { state: 'skipped', reason: 'recently_synced' }
  }

  const store = makeSyncStore(admin)
  try {
    const accessToken = await fx.getAccessToken(admin, owned)
    const result = await fx.runSync({
      store,
      client: makeSyncClient(accessToken, assigned.site_url, getGscMaxRowsPerWindow()),
      projectId,
      connectionId: owned.id,
      siteUrl: assigned.site_url,
      syncGroupId: randomUUID(),
      maxRows: getGscMaxRowsPerWindow(),
      batchSize: 1000,
    })
    const failed = result.windows.filter((w) => w.status === 'failed').length
    if (result.windows.length === 0 || failed === result.windows.length) return { state: 'done', status: 'failed', errorCode: result.windows[0]?.errorCode ?? 'sync_failed', autoAssigned }
    return { state: 'done', status: failed > 0 ? 'partial' : 'succeeded', autoAssigned }
  } catch (e) {
    const code = safeCode(e)
    if (code === 'sync_in_progress') return { state: 'skipped', reason: 'sync_in_progress' }
    // Failures before any window ran (token, probe) leave no run behind; record one failed
    // run, code only, so the screen can say so. Best effort: never throws.
    try {
      const run = await store.createRun({ syncGroupId: randomUUID(), projectId, connectionId: owned.id, siteUrl: assigned.site_url, windowDays: 28 })
      await store.finishRun(run.id, { status: 'failed', rowsFetched: 0, apiBatches: 0, truncated: false, startDate: null, endDate: null, latestAvailableDate: null, totalClicks: 0, totalImpressions: 0, weightedPositionSum: 0, summary: null, errorCode: code, errorMessage: 'Sync failed while fetching Search Console data.' })
    } catch { /* a run is already active or the table is unreachable: nothing more to record */ }
    return { state: 'done', status: 'failed', errorCode: code, autoAssigned }
  }
}

/** Fire-and-forget wrapper for `after()`: never throws, logs a sanitized code only. */
export async function startBackgroundGscSync(args: Parameters<typeof runBackgroundGscSync>[0]): Promise<void> {
  try {
    const r = await runBackgroundGscSync(args)
    console.log('[gsc-background-sync]', r.state === 'skipped' ? { skipped: r.reason } : { status: r.status, code: r.errorCode, autoAssigned: r.autoAssigned })
  } catch (e) {
    console.error('[gsc-background-sync] failed', { code: safeCode(e) })
  }
}

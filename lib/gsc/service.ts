/**
 * Stage E1 — server-side GSC service layer. Loads connections, decrypts + refreshes
 * access tokens (never persisting them), authorizes a project's GSC access, and adapts
 * the injectable SyncStore/SyncClient for the manual-sync orchestrator.
 *
 * Server-only. Every caller has ALREADY passed authContentProject (project ownership),
 * and this layer additionally enforces that the connection belongs to the same user
 * (one user cannot reference another user's connection).
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { GscConnection, ProjectGscProperty } from '@/lib/supabase/types'
import { decryptGscToken } from './token-crypto'
import { refreshAccessToken, GscOAuthError } from './oauth'
import { listSites, probeLatestAvailableDate, fetchQueryPageWindow } from './api'
import type { SyncStore, SyncClient, GscWindowDays } from './sync'
import type { GscMetricRow } from './summary'

type Admin = ReturnType<typeof createAdminClient>
export { listSites }

export class GscServiceError extends Error {
  code: string
  status: number
  constructor(code: string, status: number, message: string) { super(message); this.name = 'GscServiceError'; this.code = code; this.status = status }
}

/** The single Google connection owned by this user (E1: one connection per user). */
export async function loadUserConnection(admin: Admin, userId: string): Promise<GscConnection | null> {
  const { data } = await admin.from('gsc_connections').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return (data as GscConnection | null) ?? null
}

/** The project's assigned property (or null). */
export async function loadProjectProperty(admin: Admin, projectId: string): Promise<ProjectGscProperty | null> {
  const { data } = await admin.from('project_gsc_properties').select('*').eq('project_id', projectId).maybeSingle()
  return (data as ProjectGscProperty | null) ?? null
}

/**
 * Obtain a fresh access token from a connection's encrypted refresh token. On an
 * invalid_grant (reauth_required) the connection is marked reauth_required and a typed
 * error is thrown (no retry loop). Access tokens are NEVER persisted.
 */
export async function getAccessTokenForConnection(admin: Admin, connection: GscConnection): Promise<string> {
  if (connection.status === 'revoked') throw new GscServiceError('connection_revoked', 409, 'The Google connection was revoked.')
  if (!connection.encrypted_refresh_token) throw new GscServiceError('reauth_required', 409, 'No stored authorization; reconnect required.')
  let refresh: string
  try { refresh = decryptGscToken(connection.encrypted_refresh_token) } catch { throw new GscServiceError('token_decrypt_failed', 500, 'Stored authorization could not be read.') }
  try {
    const tok = await refreshAccessToken(refresh)
    return tok.accessToken
  } catch (e) {
    if (e instanceof GscOAuthError && e.code === 'reauth_required') {
      await admin.from('gsc_connections').update({ status: 'reauth_required', last_error_code: 'invalid_grant', last_error_message: 'Google authorization expired or was revoked.', updated_at: new Date().toISOString() }).eq('id', connection.id)
      throw new GscServiceError('reauth_required', 409, 'Google authorization expired; reconnect required.')
    }
    const code = e instanceof GscOAuthError ? e.code : 'oauth_error'
    throw new GscServiceError(code, 502, 'Could not obtain a Google access token.')
  }
}

/** Authorize a project's GSC access: property assigned + connection owned by this user. */
export async function authorizeProjectGsc(admin: Admin, projectId: string, userId: string): Promise<{ property: ProjectGscProperty; connection: GscConnection }> {
  const property = await loadProjectProperty(admin, projectId)
  if (!property) throw new GscServiceError('no_property_assigned', 409, 'No Search Console property is assigned to this project.')
  const { data: conn } = await admin.from('gsc_connections').select('*').eq('id', property.connection_id).maybeSingle()
  const connection = conn as GscConnection | null
  if (!connection) throw new GscServiceError('connection_missing', 409, 'The Google connection no longer exists.')
  if (connection.user_id !== userId) throw new GscServiceError('forbidden', 403, 'This connection does not belong to you.')
  return { property, connection }
}

/** SyncClient backed by the real GSC API + a live access token. */
export function makeSyncClient(accessToken: string, siteUrl: string, maxRows: number): SyncClient {
  return {
    probeLatestDate: () => probeLatestAvailableDate(accessToken, siteUrl),
    fetchWindow: (startDate, endDate) => fetchQueryPageWindow(accessToken, siteUrl, startDate, endDate, { maxRows }),
  }
}

/** SyncStore backed by admin-client writes to gsc_sync_runs + gsc_query_page_metrics. */
export function makeSyncStore(admin: Admin): SyncStore {
  return {
    async createRun(run: { syncGroupId: string; projectId: string; connectionId: string; siteUrl: string; windowDays: GscWindowDays }) {
      const { data, error } = await admin.from('gsc_sync_runs').insert({ sync_group_id: run.syncGroupId, project_id: run.projectId, connection_id: run.connectionId, site_url: run.siteUrl, window_days: run.windowDays, status: 'running' }).select('id').single()
      if (error) {
        // 23505 = unique_violation on uq_gsc_sync_runs_one_active → a sync is already running.
        if ((error as { code?: string }).code === '23505') throw new GscServiceError('sync_in_progress', 409, 'A sync is already running for this project.')
        throw new GscServiceError('run_create_failed', 500, 'Could not start the sync run.')
      }
      return { id: String((data as { id: string }).id) }
    },
    async insertMetricsBatch(runId: string, projectId: string, rows: GscMetricRow[]) {
      if (rows.length === 0) return
      const payload = rows.map((r) => ({ sync_run_id: runId, project_id: projectId, query: r.query, page: r.page, clicks: Math.round(r.clicks), impressions: Math.round(r.impressions), ctr: r.ctr, position: r.position }))
      const { error } = await admin.from('gsc_query_page_metrics').insert(payload)
      if (error) throw new GscServiceError('metrics_insert_failed', 500, 'Could not store Search Console rows.')
    },
    async finishRun(runId, patch) {
      await admin.from('gsc_sync_runs').update({
        status: patch.status, rows_fetched: patch.rowsFetched, api_batches: patch.apiBatches, truncated: patch.truncated,
        start_date: patch.startDate, end_date: patch.endDate, latest_available_date: patch.latestAvailableDate,
        total_clicks: patch.totalClicks, total_impressions: patch.totalImpressions, weighted_position_sum: patch.weightedPositionSum,
        sanitized_error_code: patch.errorCode ?? null, sanitized_error_message: patch.errorMessage ?? null,
        finished_at: new Date().toISOString(),
      }).eq('id', runId)
    },
  }
}

/** Latest SUCCEEDED run for a project+window (diagnostics read only these). */
export async function latestSucceededRun(admin: Admin, projectId: string, windowDays: GscWindowDays) {
  const { data } = await admin.from('gsc_sync_runs').select('*').eq('project_id', projectId).eq('window_days', windowDays).eq('status', 'succeeded').order('started_at', { ascending: false }).limit(1).maybeSingle()
  return (data as import('@/lib/supabase/types').GscSyncRun | null) ?? null
}

/** Sanitize a connection row for the browser (NEVER expose the encrypted token). */
export function sanitizeConnection(c: GscConnection | null): { id: string; status: string; grantedScope: string | null; lastErrorCode: string | null; updatedAt: string } | null {
  if (!c) return null
  return { id: c.id, status: c.status, grantedScope: c.granted_scope, lastErrorCode: c.last_error_code, updatedAt: c.updated_at }
}

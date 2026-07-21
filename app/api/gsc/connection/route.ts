/**
 * DELETE /api/gsc/connection?projectId=... — GLOBAL revocation of the user's Google
 * connection. This is the CLEARLY SEPARATE, destructive action — NOT the normal per-project
 * disconnect (that is DELETE /api/gsc/property, which only removes one assignment).
 *
 * Fail-closed shared-connection safety: the Google connection is user-owned and may serve
 * multiple projects. If ANY project_gsc_properties row still references it, this returns
 * HTTP 409 { ok:false, error:"connection_in_use", dependentProjectCount:N } and does NOT
 * revoke at Google or clear the token. Only when zero assignments depend on it does it
 * revoke, clear the encrypted token, and mark the connection revoked. Historical metrics
 * are always preserved. The projectId only authorizes the caller; the connection is per-user.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { loadUserConnection, countProjectsUsingConnection, GscServiceError } from '@/lib/gsc/service'
import { decryptGscToken } from '@/lib/gsc/token-crypto'
import { revokeToken } from '@/lib/gsc/oauth'

export const runtime = 'nodejs'

export async function DELETE(request: Request) {
  if (!isGscReadOnlyEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const connection = await loadUserConnection(auth.admin, auth.user.id)
  if (!connection) return Response.json({ ok: true, alreadyDisconnected: true })

  // Refuse to revoke a connection still in use by any project (including other projects).
  let dependentProjectCount: number
  try {
    dependentProjectCount = await countProjectsUsingConnection(auth.admin, connection.id)
  } catch (e) {
    if (e instanceof GscServiceError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    return Response.json({ ok: false, error: 'revoke_failed' }, { status: 500 })
  }
  if (dependentProjectCount > 0) {
    return Response.json({ ok: false, error: 'connection_in_use', dependentProjectCount }, { status: 409 })
  }

  // No dependents → safe to revoke at Google (best-effort) and clear the stored token.
  if (connection.encrypted_refresh_token) {
    try { await revokeToken(decryptGscToken(connection.encrypted_refresh_token)) } catch { /* ignore — proceed to clear */ }
  }

  const { error } = await auth.admin.from('gsc_connections').update({
    encrypted_refresh_token: null,
    status: 'revoked',
    last_error_code: null,
    last_error_message: null,
    updated_at: new Date().toISOString(),
  }).eq('id', connection.id)
  if (error) return Response.json({ ok: false, error: 'revoke_failed' }, { status: 500 })

  return Response.json({ ok: true })
}

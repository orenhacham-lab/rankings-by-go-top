/**
 * DELETE /api/gsc/connection?projectId=... — REVOKE the user's Google connection.
 *
 * Best-effort revokes the refresh token at Google, then clears the stored encrypted
 * token and marks the connection `revoked`. Historical metrics and per-project property
 * assignments are PRESERVED (a later sync will report reauth_required). The projectId is
 * used only to authorize the caller; the connection is per-user.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { loadUserConnection } from '@/lib/gsc/service'
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

  // Best-effort Google-side revoke (never throws). Decryption failure must not block
  // clearing the local token.
  if (connection.encrypted_refresh_token) {
    try { await revokeToken(decryptGscToken(connection.encrypted_refresh_token)) } catch { /* ignore — proceed to clear */ }
  }

  await auth.admin.from('gsc_connections').update({
    encrypted_refresh_token: null,
    status: 'revoked',
    last_error_code: null,
    last_error_message: null,
    updated_at: new Date().toISOString(),
  }).eq('id', connection.id)

  return Response.json({ ok: true })
}

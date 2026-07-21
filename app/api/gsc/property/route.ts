/**
 * POST   /api/gsc/property — assign one Search Console property to a project (explicit).
 * DELETE /api/gsc/property?projectId=... — disconnect the project's property assignment
 *         (historical metrics are preserved; the shared connection is untouched).
 *
 * Assignment requires: the connection is owned by the user, the property is still
 * accessible, is verified (not siteUnverifiedUser), and either covers the project URL or
 * the caller explicitly confirms a mismatch (per-request confirmation, no stored override).
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { loadUserConnection, getAccessTokenForConnection, listSites, GscServiceError } from '@/lib/gsc/service'
import { propertyCoversProjectUrl, isUnverifiedPermission } from '@/lib/gsc/property-match'
import { GscApiError } from '@/lib/gsc/api'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!isGscReadOnlyEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const siteUrl = typeof body.siteUrl === 'string' ? body.siteUrl.trim() : ''
  const confirmMismatch = body.confirmMismatch === true
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (!siteUrl) return Response.json({ ok: false, error: 'site_url_required' }, { status: 400 })

  const connection = await loadUserConnection(auth.admin, auth.user.id)
  if (!connection) return Response.json({ ok: false, error: 'not_connected' }, { status: 409 })

  const { data: proj } = await auth.admin.from('projects').select('target_domain').eq('id', auth.project.id).maybeSingle()
  const projectUrl = (proj as { target_domain?: string | null } | null)?.target_domain ?? null

  try {
    const accessToken = await getAccessTokenForConnection(auth.admin, connection)
    const sites = await listSites(accessToken)
    const match = sites.find((s) => s.siteUrl === siteUrl)
    if (!match) return Response.json({ ok: false, error: 'property_not_accessible' }, { status: 409 })
    if (isUnverifiedPermission(match.permissionLevel)) return Response.json({ ok: false, error: 'property_unverified' }, { status: 409 })
    if (!propertyCoversProjectUrl(siteUrl, projectUrl) && !confirmMismatch) {
      return Response.json({ ok: false, error: 'property_url_mismatch', requiresConfirmation: true }, { status: 409 })
    }
    const nowIso = new Date().toISOString()
    const { error } = await auth.admin.from('project_gsc_properties').upsert({
      project_id: auth.project.id, connection_id: connection.id, site_url: siteUrl,
      permission_level: match.permissionLevel, selected_by: auth.user.id, selected_at: nowIso, updated_at: nowIso,
    }, { onConflict: 'project_id' })
    if (error) return Response.json({ ok: false, error: 'assign_failed' }, { status: 500 })
    return Response.json({ ok: true, siteUrl, permissionLevel: match.permissionLevel })
  } catch (e) {
    if (e instanceof GscServiceError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    if (e instanceof GscApiError) return Response.json({ ok: false, error: e.code }, { status: e.httpStatus || 502 })
    return Response.json({ ok: false, error: 'gsc_error' }, { status: 502 })
  }
}

export async function DELETE(request: Request) {
  if (!isGscReadOnlyEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  // Remove ONLY the project↔property assignment. Historical metrics + shared connection stay.
  await auth.admin.from('project_gsc_properties').delete().eq('project_id', auth.project.id)
  return Response.json({ ok: true })
}

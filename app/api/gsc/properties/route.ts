/**
 * GET /api/gsc/properties?projectId=... — list the connected Google account's Search
 * Console properties, annotated (kind/covers/assignable) and sorted covering-first.
 * Read-only. Never creates/deletes/modifies properties.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { loadUserConnection, getAccessTokenForConnection, listSites, sanitizeConnection, GscServiceError } from '@/lib/gsc/service'
import { buildPropertyViews } from '@/lib/gsc/property-match'
import { GscApiError } from '@/lib/gsc/api'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  if (!isGscReadOnlyEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const connection = await loadUserConnection(auth.admin, auth.user.id)
  if (!connection) return Response.json({ ok: true, connection: null, properties: [] })

  const { data: proj } = await auth.admin.from('projects').select('target_domain').eq('id', auth.project.id).maybeSingle()
  const projectUrl = (proj as { target_domain?: string | null } | null)?.target_domain ?? null

  try {
    const accessToken = await getAccessTokenForConnection(auth.admin, connection)
    const sites = await listSites(accessToken)
    return Response.json({ ok: true, connection: sanitizeConnection(connection), properties: buildPropertyViews(sites, projectUrl) })
  } catch (e) {
    if (e instanceof GscServiceError) return Response.json({ ok: false, error: e.code, connection: sanitizeConnection(connection) }, { status: e.status })
    if (e instanceof GscApiError) return Response.json({ ok: false, error: e.code, connection: sanitizeConnection(connection) }, { status: e.httpStatus || 502 })
    return Response.json({ ok: false, error: 'gsc_error' }, { status: 502 })
  }
}

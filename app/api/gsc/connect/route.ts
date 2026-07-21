/**
 * POST /api/gsc/connect — begin the Google Search Console read-only OAuth flow.
 * Fails closed when the feature flag or OAuth config is absent. Returns the Google
 * authorization URL; the caller redirects the browser to it.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled, isGscOAuthConfigured } from '@/lib/gsc/config'
import { buildAuthUrl } from '@/lib/gsc/oauth'
import { createOAuthState } from '@/lib/gsc/state-store'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!isGscReadOnlyEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (!isGscOAuthConfigured()) return Response.json({ ok: false, error: 'gsc_oauth_not_configured' }, { status: 503 })

  const state = await createOAuthState(auth.admin, { userId: auth.user.id, projectId: auth.project.id })
  return Response.json({ ok: true, authUrl: buildAuthUrl(state) })
}

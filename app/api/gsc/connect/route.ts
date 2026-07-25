/**
 * POST /api/gsc/connect — begin the Google Search Console read-only OAuth flow.
 * Fails closed when the feature flag or OAuth config is absent. Returns the Google
 * authorization URL; the caller redirects the browser to it.
 */
import { NextResponse } from 'next/server'
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled, isGscOAuthConfigured } from '@/lib/gsc/config'
import { buildAuthUrl, GSC_RETURN_COOKIE, GSC_RETURN_COOKIE_TTL_S } from '@/lib/gsc/oauth'
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

  // K4 — remember whether this flow started from the Content Hub, so the callback
  // returns there. Fixed enum only; the redirect path is built server-side from the
  // validated state's project id. A non-hub origin CLEARS any stale cookie so a
  // project-page connect can never inherit a previous hub return.
  const returnHub = body.origin === 'hub'
  const res = NextResponse.json({ ok: true, authUrl: buildAuthUrl(state) })
  res.cookies.set(GSC_RETURN_COOKIE, returnHub ? 'hub' : '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
    maxAge: returnHub ? GSC_RETURN_COOKIE_TTL_S : 0,
  })
  return res
}

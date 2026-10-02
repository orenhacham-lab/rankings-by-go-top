/**
 * /api/content/existing/map — start the full-site mapping, and read its progress.
 *
 *   POST { projectId }   start a run: 202 while it works (in the background),
 *                        200 { state: 'recent' } when the last run just ended
 *   GET  ?projectId=…    the mapping's state and progress (no entries)
 *
 * proxy.ts does not cover /api/*, so every call authenticates itself: the
 * content module's flag, then the session and the project's OWNER
 * (authContentProject), and the work runs with the verified ids only. Errors
 * are stable codes, never provider or database text.
 *
 * ANSWERS FIRST, WORKS AFTER: the run is scheduled with after() (the route's
 * `schedule`), the same pattern as the seeding scan and the automation cron, so
 * the screen never waits on the merchant's site.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { claimSiteMap, mapStatus, readSiteMap } from './site-map-store'
import { projectSiteOrigin, runSiteMap, type RunDeps } from './site-map-run'

type Admin = ReturnType<typeof createAdminClient>
type Auth =
  | { error: string; status: number }
  | { user: { id: string }; admin: Admin; project: { id: string; user_id: string } }

export interface MapRouteDeps {
  enabled: () => boolean
  auth: (projectId: string | null | undefined) => Promise<Auth>
  schedule: (task: () => Promise<unknown>) => void
  now: () => number
  runDeps: (admin: Admin, scope: { projectId: string; userId: string }) => RunDeps
}

const json = (body: unknown, status = 200) => Response.json(body, { status })

export async function handleMapPost(request: Request, deps: MapRouteDeps): Promise<Response> {
  if (!deps.enabled()) return json({ error: 'Not found' }, 404)
  const body = await request.json().catch(() => null) as { projectId?: unknown } | null
  const projectId = typeof body?.projectId === 'string' ? body.projectId : null
  const auth = await deps.auth(projectId)
  if ('error' in auth) return json({ error: auth.error }, auth.status)
  const scope = { projectId: auth.project.id, userId: auth.user.id }

  const origin = await projectSiteOrigin(auth.admin, scope)
  if (!origin) return json({ ok: false, error: 'no_site' }, 409)
  const claim = await claimSiteMap(auth.admin, scope, { siteUrl: origin.toString(), now: deps.now() })
  if (claim === 'unavailable') return json({ ok: false, error: 'map_unavailable' }, 409)
  if (claim === 'failed') return json({ ok: false, error: 'map_start_failed' }, 500)
  if (claim === 'running') return json({ ok: true, state: 'running' }, 202)
  if (claim === 'recent') return json({ ok: true, state: 'recent' })
  const run = deps.runDeps(auth.admin, scope)
  deps.schedule(() => runSiteMap(auth.admin, scope, origin, run))
  return json({ ok: true, state: 'running' }, 202)
}

export async function handleMapGet(request: Request, deps: MapRouteDeps): Promise<Response> {
  if (!deps.enabled()) return json({ error: 'Not found' }, 404)
  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await deps.auth(projectId)
  if ('error' in auth) return json({ error: auth.error }, auth.status)
  const scope = { projectId: auth.project.id, userId: auth.user.id }
  try {
    const [read, origin] = await Promise.all([readSiteMap(auth.admin, scope, { entries: false }), projectSiteOrigin(auth.admin, scope)])
    return json({ ok: true, map: mapStatus(read, !!origin, deps.now()) })
  } catch {
    console.error('[existing-content] map status read failed')
    return json({ ok: false, error: 'map_status_failed' }, 500)
  }
}

/**
 * POST /api/content/topics/overlap { projectId, title?, keyword? } — "is this already
 * on the site?", asked by the brief form before it saves (a manual path: it WARNS,
 * it never blocks; the form still saves when the merchant chooses to).
 *
 * READ-ONLY: no write, no model, no third party, so asking costs nothing.
 * proxy.ts does not cover /api/*, so this checks everything itself, in order:
 *   the content module is on                    404
 *   a JSON body                                 400 invalid_request
 *   signed in and owns the project              the content auth's own 400/401/403/404
 *   something to check (a title or a keyword)   400 invalid_request
 * The loader filters every read by the project and its owner. A failure to load is
 * "no overlap known" (200, overlap null), never a database text.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { checkOverlap, overlapPayload, SITE_AND_PLAN_KINDS, type OverlapIndex } from './check'

type Admin = ReturnType<typeof createAdminClient>

export type OverlapAuth =
  | { error: string; status: number }
  | { user: { id: string }; admin: Admin; project: { id: string; user_id: string } }

export interface OverlapRouteDeps {
  enabled: () => boolean
  auth: (projectId: string | null) => Promise<OverlapAuth>
  load: (admin: Admin, scope: { projectId: string; userId: string }) => Promise<OverlapIndex>
}

const MAX_TEXT = 300
const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : '')

export async function handleOverlapCheck(request: Request, deps: OverlapRouteDeps): Promise<Response> {
  if (!deps.enabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return Response.json({ error: 'invalid_request' }, { status: 400 })
  }
  const auth = await deps.auth(typeof body.projectId === 'string' ? body.projectId : null)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const title = text(body.title)
  const keyword = text(body.keyword)
  if (!title && !keyword) return Response.json({ error: 'invalid_request' }, { status: 400 })

  let index: OverlapIndex
  try {
    index = await deps.load(auth.admin, { projectId: auth.project.id, userId: auth.user.id })
  } catch {
    return Response.json({ overlap: null }, { headers: { 'cache-control': 'no-store' } })
  }
  const overlap = overlapPayload(checkOverlap(index, { title, keyword }, { kinds: SITE_AND_PLAN_KINDS }))
  return Response.json({ overlap }, { headers: { 'cache-control': 'no-store' } })
}

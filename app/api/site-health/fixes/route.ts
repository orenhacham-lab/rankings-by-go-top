/**
 * GET  /api/site-health/fixes?projectId=…   where approved fixes go for this project, and its queue
 * POST /api/site-health/fixes
 *   { projectId, action: 'preview', type, url, kind, from?, keyword? }           read-only
 *   { projectId, action: 'approve', approved: true, kind, pageUrl, fix, expected?, via?, before? }
 *   { projectId, action: 'undo' | 'cancel' | 'retry', jobId }
 *
 * One approval writes one element of one page, through the site's channel (the Go Top plugin, the
 * WordPress application password, or the custom site's webhook), and is recorded with who approved
 * it, when, from which IP, and the previous and new value. The contract, owner filters and the fix
 * whitelist included: lib/site-fix/api.ts.
 */
import { createClient } from '@/lib/supabase/server'
import { handleFixesGet, handleFixesPost } from '@/lib/site-fix/api'
import { routeDeps } from '@/lib/site-fix/route-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const projectId = new URL(request.url).searchParams.get('projectId')
  try {
    const answer = await handleFixesGet(projectId, routeDeps(user?.id ?? null, request.headers))
    return json(answer.body, answer.status)
  } catch {
    console.error('[site-fix] queue read failed')
    return json({ ok: false, code: 'store_failed' }, 500)
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const body = await request.json().catch(() => null)
  try {
    const answer = await handleFixesPost(body, routeDeps(user?.id ?? null, request.headers))
    return json(answer.body, answer.status)
  } catch {
    console.error('[site-fix] request failed')
    return json({ ok: false, code: 'store_failed' }, 500)
  }
}

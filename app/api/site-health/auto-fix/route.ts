/**
 * GET  /api/site-health/auto-fix?projectId=…   the project's automatic-fix switch: on or off, its
 *      last run, whether it can be turned on here, and what it covers (`available: false` while
 *      its table is not installed)
 * POST /api/site-health/auto-fix
 *   { projectId, enabled: true, acknowledged: true, types: ['image_alt', 'broken_link', 'meta_description'] }
 *   { projectId, enabled: false }
 *
 * Turning it on records who, when and the request's IP (lib/site-fix/route-deps.ts, the same
 * clientIpFrom as every approval); every automatic fix is then recorded with them. Turning it off
 * applies at once. WordPress with the Go Top plugin only; Shopify is refused. The contract, owner
 * filters included: lib/site-fix/api.ts handleAutoGet / handleAutoSetting.
 */
import { createClient } from '@/lib/supabase/server'
import { handleAutoGet, handleAutoSetting } from '@/lib/site-fix/api'
import { routeDeps } from '@/lib/site-fix/route-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const projectId = new URL(request.url).searchParams.get('projectId')
  try {
    const answer = await handleAutoGet(projectId, routeDeps(user?.id ?? null, request.headers))
    return json(answer.body, answer.status)
  } catch {
    console.error('[site-fix] auto setting read failed')
    return json({ ok: false, code: 'store_failed' }, 500)
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const body = await request.json().catch(() => null)
  try {
    const answer = await handleAutoSetting(body, routeDeps(user?.id ?? null, request.headers))
    return json(answer.body, answer.status)
  } catch {
    console.error('[site-fix] auto setting write failed')
    return json({ ok: false, code: 'store_failed' }, 500)
  }
}

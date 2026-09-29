/**
 * POST /api/site-health/plugin  { projectId, action: 'issue' | 'pair' | 'check' | 'disconnect' }
 *
 * The Go Top WordPress plugin's connection for one project:
 *   issue       a new site key; its pairing code is returned ONCE (to paste in Settings > GO TOP SEO)
 *   pair        push the key to the plugin over the site's application password (administrators only)
 *   check       a signed status call: connected, with the plugin's version and SEO plugin, or not
 *   disconnect  forget the key (the plugin can no longer be reached by us)
 * Owner-filtered, Shopify refused, codes only: lib/site-fix/api.ts handlePlugin.
 */
import { createClient } from '@/lib/supabase/server'
import { handlePlugin } from '@/lib/site-fix/api'
import { routeDeps } from '@/lib/site-fix/route-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const body = await request.json().catch(() => null)
  try {
    const answer = await handlePlugin(body, routeDeps(user?.id ?? null, request.headers))
    return Response.json(answer.body, { status: answer.status, headers: { 'cache-control': 'no-store' } })
  } catch {
    console.error('[site-fix] plugin request failed')
    return Response.json({ ok: false, code: 'store_failed' }, { status: 500 })
  }
}

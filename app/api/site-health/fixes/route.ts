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
 *
 * Shopify stores: the store's credentials come from the existing connection loader, only for the
 * signed-in owner's own connection that may edit content; lib/site-fix/shopify-admin.ts writes
 * only the store's articles and pages with them.
 */
import { createClient } from '@/lib/supabase/server'
import { handleFixesGet, handleFixesPost } from '@/lib/site-fix/api'
import { routeDeps } from '@/lib/site-fix/route-deps'
import { canWriteContent, shopifyFixClient, type ShopCreds } from '@/lib/site-fix/shopify-admin'
import type { Scope } from '@/lib/site-fix/store'
import type { FixesDeps } from '@/lib/site-fix/api'
import { loadShopifyConnection } from '@/lib/shopify/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function withShopify(deps: FixesDeps): FixesDeps {
  return {
    ...deps,
    shopify: {
      client: shopifyFixClient(),
      creds: async (scope: Scope): Promise<ShopCreds | null> => {
        const r = await loadShopifyConnection(deps.admin, scope.projectId)
        if ('error' in r) return null
        // The project was already checked against its owner; the connection must be that owner's too.
        if (r.connection.user_id !== scope.userId || !canWriteContent(r.connection.granted_scopes)) return null
        return r.creds
      },
    },
  }
}

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const projectId = new URL(request.url).searchParams.get('projectId')
  try {
    const answer = await handleFixesGet(projectId, withShopify(routeDeps(user?.id ?? null, request.headers)))
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
    const answer = await handleFixesPost(body, withShopify(routeDeps(user?.id ?? null, request.headers)))
    return json(answer.body, answer.status)
  } catch {
    console.error('[site-fix] request failed')
    return json({ ok: false, code: 'store_failed' }, 500)
  }
}

/**
 * POST /api/site-health/scan  { projectId }
 *
 * Reads the project's own site (bounded: lib/site-health/scan.ts) and answers
 * with an NDJSON stream: progress lines while pages are read, then the report.
 * Writes nothing, stores nothing, calls no paid provider.
 *
 * proxy.ts does not cover /api/*: handleScan authenticates, and every read it
 * makes with the service role is filtered by the project AND its owner
 * (lib/site-health/sources.ts). The contract: lib/site-health/api.ts.
 *
 * A Shopify store: the signed-in owner's own connection, when it may edit content, is used to read
 * (never write) the scanned articles and pages, so a problem in the theme gets no fix button. A
 * WordPress site: the same, through the Go Top plugin's read-only /inspect or the application password.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleScan, type ScanApiDeps } from '@/lib/site-health/api'
import type { ScanStreamLine } from '@/lib/site-health/types'
import { canWriteContent, shopifyFixClient } from '@/lib/site-fix/shopify-admin'
import { markShopifyOutsideContent } from '@/lib/site-fix/shopify-scan'
import { markWordPressOutsideContent, type WpReader } from '@/lib/site-fix/wordpress-scan'
import { loadFixContext, resolveCapabilities } from '@/lib/site-fix/channel'
import { pluginInspect } from '@/lib/site-fix/plugin-client'
import { decryptCredential } from '@/lib/security/credentials-crypto'
import { findItemByUrl, getItemForEdit, searchMedia } from '@/lib/wordpress/client'
import { findMediaFor } from '@/lib/site-fix/media-alt'
import { loadShopifyConnection } from '@/lib/shopify/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Read-only: the store's own articles and pages, through the owner's own connection. */
async function shopifyRefine(admin: ReturnType<typeof createAdminClient>, ...[findings, scope, scan]: Parameters<NonNullable<ScanApiDeps['refine']>>) {
  const r = await loadShopifyConnection(admin, scope.projectId)
  if ('error' in r) return
  if (r.connection.user_id !== scope.userId || !canWriteContent(r.connection.granted_scopes)) return
  await markShopifyOutsideContent(findings, { admin, scope, creds: r.creds, client: shopifyFixClient() }, scan.pages)
}

/**
 * Read-only: a WordPress site's posts and pages, the way a fix would read them: the Go Top plugin's
 * signed /inspect when it writes the fixes, else the REST API through the application password. The
 * owner's own connection only (lib/site-fix/channel.ts filters by project AND owner).
 */
async function wordpressRefine(admin: ReturnType<typeof createAdminClient>, ...[findings, scope, scan]: Parameters<NonNullable<ScanApiDeps['refine']>>) {
  const ctx = await loadFixContext(admin, scope, decryptCredential, null)
  const caps = resolveCapabilities(ctx, true)
  const channel = caps.channelFor.image_alt
  let read: WpReader | null = null
  let siteUrl = ''
  if (channel === 'plugin' && ctx.pluginLink) {
    const link = ctx.pluginLink
    siteUrl = link.siteUrl
    read = async (url) => {
      const r = await pluginInspect(link, url)
      if (r.ok) return { content: String(r.body.item.content ?? ''), builder: typeof r.body.item.builder === 'boolean' ? r.body.item.builder : null }
      return r.code === 'not_in_wordpress' ? 'not_ours' : null
    }
  } else if (channel === 'app_password' && ctx.creds) {
    const creds = ctx.creds
    siteUrl = creds.siteUrl
    read = async (url) => {
      const item = await findItemByUrl(creds, url)
      if (!item) return 'not_ours'
      const full = await getItemForEdit(creds, item.endpoint, item.id)
      return { content: full.content, builder: null }
    }
  }
  if (!read) return
  let homeHost = ''
  try { homeHost = new URL(siteUrl).hostname } catch { return }
  // The Media Library, through the application password only (lib/site-fix/media-alt.ts), read-only here.
  const creds = ctx.creds
  const findMedia = creds ? (src: string) => findMediaFor(creds, src, { searchMedia }) : null
  await markWordPressOutsideContent(findings, scan.pages, read, { platform: scan.platform, connections: scan.connections, homeHost, findMedia })
}

function refine(admin: ReturnType<typeof createAdminClient>): ScanApiDeps['refine'] {
  return async (findings, scope, scan) => {
    if (scan.connections.shopify) return shopifyRefine(admin, findings, scope, scan)
    if (scan.platform === 'wordpress') return wordpressRefine(admin, findings, scope, scan)
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const body = await request.json().catch(() => null)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (line: ScanStreamLine) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
      try {
        const admin = createAdminClient()
        await handleScan(body, { userId: user?.id ?? null, admin, refine: refine(admin) }, emit)
      } catch {
        console.error('[site-health] scan failed')
        emit({ type: 'error', code: 'scan_failed' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    status: user ? 200 : 401,
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  })
}

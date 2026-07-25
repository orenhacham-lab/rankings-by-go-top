/**
 * Phase 4F.1 — POST /api/shopify/test-connection { projectId }
 * Tests the project's SAVED Shopify connection and records the result
 * (status/last_tested_at/storefront_domain/last_error). Never returns the token.
 */

import { isContentModuleEnabled, authContentProject } from '@/lib/content/api-auth'
import { loadShopifyConnection } from '@/lib/shopify/api-auth'
import { testShopifyConnection } from '@/lib/shopify/client'

export async function POST(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: string }
  try { body = await request.json() } catch { body = {} }
  const auth = await authContentProject(body.projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // test-connection is the ONLY caller allowed to load an inactive (untested/failed)
  // connection — it exists to test/recover exactly those. Every other caller default-denies.
  const loaded = await loadShopifyConnection(auth.admin, auth.project.id, { allowInactive: true })
  if ('error' in loaded) {
    const reason = loaded.status === 404 ? 'no_shopify_connection' : 'shopify_connection_error'
    return Response.json({ error: reason, reason }, { status: loaded.status === 404 ? 400 : loaded.status })
  }

  const test = await testShopifyConnection(loaded.creds)
  const storefront = test.ok && test.storefrontDomain ? test.storefrontDomain : loaded.connection.storefront_domain
  await auth.admin
    .from('shopify_connections')
    .update({
      // Token valid (even with scope/version warnings) → connected; hard failure → failed.
      connection_status: test.ok ? 'connected' : 'failed',
      last_tested_at: new Date().toISOString(),
      storefront_domain: storefront,
      last_error: test.status === 'connection_ok' ? null : test.error ?? test.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', loaded.connection.id)

  return Response.json({
    ok: test.ok,
    status: test.status,
    shopName: test.shopName ?? null,
    storefrontDomain: test.storefrontDomain ?? null,
    grantedScopes: test.grantedScopes ?? null,
    missingScopes: test.missingScopes ?? null,
    apiVersionRequested: test.apiVersionRequested ?? null,
    apiVersionActual: test.apiVersionActual ?? null,
    ...(test.error ? { error: test.error, kind: test.kind } : {}),
  })
}

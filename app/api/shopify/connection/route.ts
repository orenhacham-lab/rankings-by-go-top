/**
 * Phase 4F.1 — /api/shopify/connection
 *
 * GET    ?projectId=  → sanitized connection (never the token) + entity counts.
 * POST   { projectId, shopDomain, accessToken?, storefrontDomain?, apiVersion? }
 *        → create/update the project's Shopify connection (token encrypted at
 *          rest). On update the token may be omitted to keep the stored one.
 *          When a token is present the connection is tested and the storefront
 *          domain is auto-resolved for canonical URLs.
 * DELETE ?projectId=  → disconnect (delete the row; entities cascade).
 *
 * Gated by ENABLE_CONTENT. Auth + project ownership on every method.
 */

import { isContentModuleEnabled, authContentProject } from '@/lib/content/api-auth'
import { loadShopifyConnection, sanitizeShopifyConnection, type ShopifyConnectionRow } from '@/lib/shopify/api-auth'
import { normalizeShopDomain, normalizeStorefrontDomain } from '@/lib/shopify/domain'
import { testShopifyConnection } from '@/lib/shopify/client'
import { SHOPIFY_API_VERSION } from '@/lib/shopify/constants'
import { encryptCredential, isCredentialsCryptoConfigured, CredentialsCryptoError } from '@/lib/security/credentials-crypto'
import type { ShopifyEntityType } from '@/lib/shopify/types'

const TYPES: ShopifyEntityType[] = ['product', 'collection', 'page', 'blog', 'article']

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.admin
    .from('shopify_connections')
    .select('*')
    .eq('project_id', auth.project.id)
    .maybeSingle()
  if (error) {
    console.error('[Shopify] Connection load failed:', error.message)
    return Response.json({ error: 'Failed to load connection' }, { status: 500 })
  }

  const counts: Record<string, number> = { product: 0, collection: 0, page: 0, blog: 0, article: 0 }
  if (data) {
    for (const type of TYPES) {
      const { count } = await auth.admin
        .from('shopify_entities')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', auth.project.id)
        .eq('entity_type', type)
        .eq('is_active', true)
      counts[type] = count ?? 0
    }
  }

  return Response.json({
    connection: data ? sanitizeShopifyConnection(data as ShopifyConnectionRow) : null,
    counts,
  })
}

export async function POST(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  // Note: apiVersion is intentionally NOT read from the client — it is always the
  // server-pinned SHOPIFY_API_VERSION (no arbitrary client-supplied versions).
  let body: { projectId?: string; shopDomain?: string; accessToken?: string; storefrontDomain?: string }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const auth = await authContentProject(body.projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const shopDomain = normalizeShopDomain(String(body.shopDomain ?? ''))
  if (!shopDomain) {
    return Response.json({ error: 'invalid_domain', reason: 'invalid_domain' }, { status: 400 })
  }
  const apiVersion = SHOPIFY_API_VERSION
  const providedToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : ''

  // Existing connection (for update-without-token + ownership already checked).
  const { data: existingData } = await auth.admin
    .from('shopify_connections').select('*').eq('project_id', auth.project.id).maybeSingle()
  const existing = existingData as ShopifyConnectionRow | null

  // Phase 4F.1 — one primary platform per project: refuse to CREATE a Shopify
  // connection when the project already has a WordPress connection. Updating an
  // existing Shopify connection stays allowed. Enforced server-side.
  if (!existing) {
    const { data: wordpress } = await auth.admin
      .from('wordpress_connections')
      .select('id')
      .eq('project_id', auth.project.id)
      .maybeSingle()
    if (wordpress) {
      return Response.json({ error: 'platform_already_connected', reason: 'platform_already_connected', platform: 'wordpress' }, { status: 409 })
    }
  }

  if (!existing && !providedToken) {
    return Response.json({ error: 'access_token_required', reason: 'access_token_required' }, { status: 400 })
  }

  // Encrypt the token (never store plaintext). Refuse if crypto isn't configured.
  let tokenEncrypted = existing?.access_token_encrypted ?? null
  if (providedToken) {
    if (!isCredentialsCryptoConfigured()) {
      return Response.json({ error: 'encryption_not_configured', reason: 'not_configured' }, { status: 500 })
    }
    try { tokenEncrypted = encryptCredential(providedToken) } catch (err) {
      const msg = err instanceof CredentialsCryptoError ? err.message : 'encryption_failed'
      return Response.json({ error: 'encryption_failed', reason: 'not_configured', detail: msg }, { status: 500 })
    }
  }
  if (!tokenEncrypted) {
    return Response.json({ error: 'access_token_required', reason: 'access_token_required' }, { status: 400 })
  }

  const storefrontOverride = normalizeStorefrontDomain(body.storefrontDomain)

  // Test + resolve the storefront domain when we have a usable token. The test
  // verifies granted scopes + the served API version (never a silent success).
  let connectionStatus: ShopifyConnectionRow['connection_status'] = 'untested'
  let lastError: string | null = existing?.last_error ?? null
  let resolvedStorefront: string | null = storefrontOverride ?? existing?.storefront_domain ?? null
  let testResult: Record<string, unknown> = { ok: true, status: 'connection_ok' }
  if (providedToken) {
    const test = await testShopifyConnection({ shopDomain, accessToken: providedToken, apiVersion })
    testResult = {
      ok: test.ok, status: test.status, kind: test.kind, error: test.error,
      grantedScopes: test.grantedScopes, missingScopes: test.missingScopes,
      apiVersionRequested: test.apiVersionRequested, apiVersionActual: test.apiVersionActual,
    }
    // Token valid (even with scope/version warnings) → 'connected'; a hard token/
    // permission failure → 'failed'. The precise state is carried in last_error.
    connectionStatus = test.ok ? 'connected' : 'failed'
    lastError = test.status === 'connection_ok' ? null : test.error ?? test.status
    if (test.ok && !storefrontOverride && test.storefrontDomain) resolvedStorefront = test.storefrontDomain
  }

  const row = {
    user_id: auth.project.user_id,
    project_id: auth.project.id,
    shop_domain: shopDomain,
    storefront_domain: resolvedStorefront,
    access_token_encrypted: tokenEncrypted,
    api_version: apiVersion,
    connection_status: connectionStatus,
    last_tested_at: providedToken ? new Date().toISOString() : existing?.last_tested_at ?? null,
    last_error: lastError,
    updated_at: new Date().toISOString(),
  }

  const { data: saved, error: saveError } = await auth.admin
    .from('shopify_connections')
    .upsert(row, { onConflict: 'project_id' })
    .select('*')
    .single()
  if (saveError || !saved) {
    console.error('[Shopify] Connection save failed:', saveError?.message)
    return Response.json({ error: 'Failed to save connection' }, { status: 500 })
  }

  return Response.json({
    connection: sanitizeShopifyConnection(saved as ShopifyConnectionRow),
    test: testResult,
  })
}

export async function DELETE(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { error } = await auth.admin.from('shopify_connections').delete().eq('project_id', auth.project.id)
  if (error) {
    console.error('[Shopify] Disconnect failed:', error.message)
    return Response.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
  return Response.json({ success: true })
}

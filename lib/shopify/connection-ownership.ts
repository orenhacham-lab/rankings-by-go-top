/**
 * Phase 2 (blocker fix) — shared "claim this shop for this project" logic,
 * used by app/api/shopify/link/complete/route.ts (the App-Store-initiated
 * pending-install completion path). Mirrors, byte-for-byte in security
 * effect, the existing inline one-owner-per-shop check already proven in
 * app/api/shopify/oauth/callback/route.ts's logged-in-initiated path (left
 * untouched there to avoid any regression risk to that already-verified
 * code) — never reassigns or overwrites another project's connection.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { initiateMigrationIfPayPalSubscriber } from './paypal-migration'

type Admin = ReturnType<typeof createAdminClient>

export type ClaimShopResult =
  | { ok: true; connectionId: string }
  | { ok: false; reason: 'shop_already_connected' | 'save_failed' }

export async function claimShopForProject(admin: Admin, args: {
  userId: string
  projectId: string
  shopDomain: string
  shopGid: string | null
  accessTokenEncrypted: string
  apiVersion: string
  grantedScopes: string[]
  storefrontDomain: string | null
  connectionStatus: 'connected' | 'failed'
  lastError: string | null
}): Promise<ClaimShopResult> {
  const { data: existingByDomain } = await admin
    .from('shopify_connections')
    .select('id, project_id')
    .eq('shop_domain', args.shopDomain)
    .neq('project_id', args.projectId)
    .maybeSingle()
  if (existingByDomain) return { ok: false, reason: 'shop_already_connected' }

  if (args.shopGid) {
    const { data: existingByGid } = await admin
      .from('shopify_connections')
      .select('id, project_id')
      .eq('shop_gid', args.shopGid)
      .neq('project_id', args.projectId)
      .maybeSingle()
    if (existingByGid) return { ok: false, reason: 'shop_already_connected' }
  }

  const nowIso = new Date().toISOString()
  const { data: saved, error } = await admin.from('shopify_connections').upsert({
    user_id: args.userId,
    project_id: args.projectId,
    shop_domain: args.shopDomain,
    shop_gid: args.shopGid,
    storefront_domain: args.storefrontDomain,
    access_token_encrypted: args.accessTokenEncrypted,
    api_version: args.apiVersion,
    auth_method: 'oauth',
    granted_scopes: args.grantedScopes,
    connection_status: args.connectionStatus,
    last_tested_at: nowIso,
    last_error: args.lastError,
    updated_at: nowIso,
  }, { onConflict: 'project_id' }).select('id').maybeSingle()

  if (error) {
    const reason = (error as { code?: string }).code === '23505' ? 'shop_already_connected' : 'save_failed'
    return { ok: false, reason }
  }
  if (!saved?.id) return { ok: false, reason: 'save_failed' }

  await initiateMigrationIfPayPalSubscriber(admin, {
    userId: args.userId,
    projectId: args.projectId,
    shopifyConnectionId: saved.id,
  })

  return { ok: true, connectionId: saved.id }
}

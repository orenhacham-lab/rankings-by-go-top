/**
 * Shopify connection cleanup for shop/redact + app/uninstalled (server-only).
 *
 * Revokes the usability of the stored access token for a shop WITHOUT deleting any
 * project content, articles or unrelated records: it empties the encrypted token
 * (so decryption fails and no future publish can use it) and marks the connection
 * 'failed'. Idempotent — a repeat call sets the same terminal state and is safe.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { normalizeShopDomain } from './domain'

type Admin = ReturnType<typeof createAdminClient>

export interface DisconnectResult {
  ok: boolean
  matched: number
  /** true when the shop domain could not be normalized/validated. */
  invalidDomain?: boolean
}

/**
 * Disconnect EVERY Shopify connection for a shop domain (a shop may be connected to
 * more than one project). Empties access_token_encrypted + sets connection_status
 * 'failed' + a safe last_error. Never touches generated_articles / projects / topics.
 * No-throw; returns how many connection rows matched (0 is a valid idempotent result).
 */
export async function disconnectShopConnections(admin: Admin, shopDomainRaw: string, reason: string): Promise<DisconnectResult> {
  const shopDomain = normalizeShopDomain(String(shopDomainRaw || ''))
  if (!shopDomain) return { ok: false, matched: 0, invalidDomain: true }
  try {
    const { data, error } = await admin
      .from('shopify_connections')
      .update({
        access_token_encrypted: '',       // revoke usability (decrypt then fails)
        connection_status: 'failed',
        last_error: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('shop_domain', shopDomain)
      .select('id')
    if (error) {
      console.error('[shopify-webhook] disconnect failed', { reason, message: error.message })
      return { ok: false, matched: 0 }
    }
    return { ok: true, matched: (data ?? []).length }
  } catch (e) {
    console.error('[shopify-webhook] disconnect threw', { reason, message: e instanceof Error ? e.message : String(e) })
    return { ok: false, matched: 0 }
  }
}

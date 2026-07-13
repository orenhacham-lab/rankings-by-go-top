/**
 * Phase 4F.1 — Shopify connection load/sanitize helpers. Ownership is enforced
 * by the shared authContentProject (same as WordPress). The access token is
 * decrypted server-side only at call time and never returned to the client.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential, CredentialsCryptoError } from '@/lib/security/credentials-crypto'
import { SHOPIFY_API_VERSION, hasWriteContent } from './constants'
import type { ShopifyCredentials } from './types'

export type ShopifyConnectionRow = {
  id: string
  user_id: string
  project_id: string
  shop_domain: string
  storefront_domain: string | null
  access_token_encrypted: string
  api_version: string
  connection_status: 'untested' | 'connected' | 'failed'
  last_tested_at: string | null
  last_synced_at: string | null
  last_error: string | null
  // Phase 4F.1 OAuth — scopes the merchant approved + how the token was obtained.
  granted_scopes: string[] | null
  auth_method: 'manual' | 'oauth'
  created_at: string
  updated_at: string
}

type Admin = ReturnType<typeof createAdminClient>

/**
 * Load the project's Shopify connection and decrypt its access token.
 * Returns a clear error (no secrets) when missing or undecryptable.
 */
export async function loadShopifyConnection(
  admin: Admin,
  projectId: string,
): Promise<
  | { error: string; status: 404 | 500 }
  | { connection: ShopifyConnectionRow; creds: ShopifyCredentials }
> {
  const { data, error } = await admin
    .from('shopify_connections')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    console.error('[Shopify] Failed to load connection:', error.message)
    return { error: 'Failed to load Shopify connection', status: 500 }
  }
  if (!data) return { error: 'No Shopify connection for this project', status: 404 }

  const connection = data as ShopifyConnectionRow
  try {
    const accessToken = decryptCredential(connection.access_token_encrypted)
    return {
      connection,
      // Always the server-pinned version (centralized), never a stale stored value.
      creds: { shopDomain: connection.shop_domain, accessToken, apiVersion: SHOPIFY_API_VERSION },
    }
  } catch (err) {
    const reason = err instanceof CredentialsCryptoError ? err.message : 'decryption failed'
    console.error('[Shopify] Token decryption failed:', reason)
    return { error: 'Stored Shopify credentials could not be decrypted', status: 500 }
  }
}

/** Strip the token (even encrypted) before returning a connection to the client. */
export function sanitizeShopifyConnection(c: ShopifyConnectionRow) {
  return {
    id: c.id,
    project_id: c.project_id,
    shop_domain: c.shop_domain,
    storefront_domain: c.storefront_domain,
    api_version: c.api_version,
    connection_status: c.connection_status,
    last_tested_at: c.last_tested_at,
    last_synced_at: c.last_synced_at,
    last_error: c.last_error,
    granted_scopes: Array.isArray(c.granted_scopes) ? c.granted_scopes : [],
    auth_method: c.auth_method ?? 'oauth',
    // Phase 4F.2 — true when write_content was granted (publishing is enabled).
    can_publish: hasWriteContent(c.granted_scopes),
    created_at: c.created_at,
    updated_at: c.updated_at,
  }
}

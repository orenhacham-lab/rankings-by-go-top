/**
 * Shopify shop-scoped LOCAL data cleanup for compliance webhooks (`app/uninstalled`,
 * `shop/redact`) and the manual-disconnect route.
 *
 * Erases only the merchant's SHOP data (connection token/state/entities + the Shopify
 * publish POINTERS on articles). Article CONTENT (title/slug/excerpt/content_html/meta/
 * images) and all WordPress/project/user data are preserved. No external Shopify API
 * calls. Every Supabase error is checked; a failed step returns `ok:false` so the
 * webhook responds non-2xx and Shopify retries. All operations are idempotent.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { encryptCredential, isCredentialsCryptoConfigured } from '@/lib/security/credentials-crypto'

type Admin = ReturnType<typeof createAdminClient>

export interface CleanupResult { ok: boolean; error?: string }

/**
 * Non-secret, non-usable revocation marker written into `access_token_encrypted`
 * on uninstall. It is a VALID encrypted value (satisfies the NOT NULL column and
 * the `iv:tag:ciphertext` format so the row stays structurally valid), but decrypts
 * to a token Shopify always rejects → the connection can never publish again. The
 * plaintext is deliberately non-secret; `access_token_encrypted=''` is impossible
 * because `encryptCredential('')` throws and the column is NOT NULL.
 */
export const SHOPIFY_REVOCATION_SENTINEL = '__revoked__'

/** The EXACT `generated_articles` Shopify publish-pointer columns cleared on erasure.
 *  `shopify_tags` is a `text[]` → reset to `[]`; every other pointer → NULL. Article
 *  content and `wp_*` fields are intentionally absent here (never touched). */
const CLEARED_ARTICLE_POINTERS = {
  shopify_blog_id: null,
  shopify_article_id: null,
  shopify_article_url: null,
  shopify_handle: null,
  shopify_status: null,
  shopify_published_at: null,
  shopify_last_error: null,
  shopify_last_synced_at: null,
  shopify_tags: [] as string[],
} as const

/**
 * Clear the Shopify publish pointers on every article of the given projects
 * (content preserved). Shared by `shop/redact` and the manual-disconnect route so a
 * disconnect never leaves orphaned Shopify GIDs/URLs with no shop→project mapping.
 * Never calls `.in()` with an empty list — an empty `projectIds` is a safe no-op.
 */
export async function clearShopifyArticlePointers(admin: Admin, projectIds: string[]): Promise<CleanupResult> {
  const ids = Array.isArray(projectIds) ? projectIds.filter((p) => typeof p === 'string' && p.length > 0) : []
  if (ids.length === 0) return { ok: true }
  const { error } = await admin
    .from('generated_articles')
    .update({ ...CLEARED_ARTICLE_POINTERS, updated_at: new Date().toISOString() })
    .in('project_id', ids)
  if (error) return { ok: false, error: 'article_pointer_clear_failed' }
  return { ok: true }
}

/**
 * `app/uninstalled` — disable the connection so it can never publish again, WITHOUT
 * deleting merchant content. Writes a valid encrypted revocation sentinel (fails
 * closed if crypto is unavailable/throws so no usable token can ever survive),
 * `connection_status='failed'`, empty scopes, cleared default blog. Idempotent (a
 * re-delivery re-writes the same terminal fields). Scoped by normalized `shop_domain`.
 *
 * Cache-invalidation fix — also clears the Shopify billing cache columns
 * (shopify_subscription_status/shopify_plan_handle/shopify_billing_verified_at).
 * `connection_status='failed'` ALREADY excludes this row from every entitlement
 * query (resolveShopifyGovernedEntitlement/isShopifyGovernedAndActive both filter
 * on connection_status='connected'), so this isn't needed for THIS install's
 * entitlement to end — it closes a narrower edge case: if the SAME shop
 * reinstalls shortly after, connection_status flips back to 'connected' and
 * would otherwise still carry a stale (but not yet expired) 'active' cache
 * entry from before the uninstall, momentarily granting entitlement before any
 * fresh Partner API check. Clearing it here forces the very next check after
 * any reinstall to be live.
 */
export async function applyAppUninstalled(admin: Admin, shopDomain: string): Promise<CleanupResult> {
  if (!isCredentialsCryptoConfigured()) return { ok: false, error: 'crypto_unavailable' }
  let sentinel: string
  try {
    sentinel = encryptCredential(SHOPIFY_REVOCATION_SENTINEL)
  } catch {
    // Never acknowledge success while a usable token might remain.
    return { ok: false, error: 'crypto_failed' }
  }
  const { error } = await admin
    .from('shopify_connections')
    .update({
      access_token_encrypted: sentinel,
      connection_status: 'failed',
      granted_scopes: [],
      default_blog_id: null,
      last_error: 'app_uninstalled',
      shopify_subscription_status: null,
      shopify_plan_handle: null,
      shopify_billing_verified_at: null,
      shopify_current_period_end: null,
      shopify_current_period_start: null,
      shopify_trial_ends_at: null,
      shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('shop_domain', shopDomain)
    .is('archived_at', null)
  if (error) return { ok: false, error: 'connection_update_failed' }
  return { ok: true }
}

/**
 * `shop/redact` — erase local shop-scoped data in this EXACT order (no external API
 * calls): (1) resolve+retain the shop's `project_ids`; (2) clear article publish
 * pointers for those projects (content preserved); (3) delete OAuth states for the
 * shop; (4) delete the connection(s) LAST so `shopify_entities` cascade. Every step's
 * error is checked and short-circuits to `ok:false` (→ webhook non-2xx → Shopify
 * retries). Idempotent: an already-redacted shop resolves 0 projects and each delete
 * affects 0 rows, returning `ok:true` (→ 200).
 *
 * `shop_domain` is NOT unique (one shop may map to several projects/users), so all
 * matching projects are handled.
 */
export async function applyShopRedact(admin: Admin, shopDomain: string): Promise<CleanupResult> {
  // 1) Resolve + retain the project ids for this shop (before deleting the mapping).
  const { data: conns, error: selErr } = await admin
    .from('shopify_connections')
    .select('project_id')
    .eq('shop_domain', shopDomain)
  if (selErr) return { ok: false, error: 'connection_lookup_failed' }
  const projectIds = Array.isArray(conns)
    ? (conns as { project_id: string | null }[]).map((c) => c.project_id).filter((p): p is string => typeof p === 'string' && p.length > 0)
    : []

  // 2) Clear article publish pointers (safe no-op when there are no projects).
  const cleared = await clearShopifyArticlePointers(admin, projectIds)
  if (!cleared.ok) return cleared

  // 3) Delete short-lived OAuth CSRF states for the shop.
  const { error: stateErr } = await admin.from('shopify_oauth_states').delete().eq('shop_domain', shopDomain)
  if (stateErr) return { ok: false, error: 'oauth_state_delete_failed' }

  // 4) Delete the connection(s) LAST — shopify_entities cascade via connection_id.
  const { error: connErr } = await admin.from('shopify_connections').delete().eq('shop_domain', shopDomain)
  if (connErr) return { ok: false, error: 'connection_delete_failed' }

  return { ok: true }
}

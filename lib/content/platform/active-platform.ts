/**
 * Shared ACTIVE-PUBLISHING-PLATFORM resolver.
 *
 * ONE authority for "which platform should this project publish to". Historically every
 * call site detected the platform by connection-ROW EXISTENCE (ignoring connection_status),
 * so a stale/failed/untested WordPress row on a Shopify-only project produced a false
 * platform_conflict and WordPress was called for a Shopify article.
 *
 * Platform selection is by connection VALIDITY, not row existence:
 *   - WordPress is ACTIVE only when its connection is 'connected'.
 *   - Shopify is ACTIVE only when its connection is 'connected'. (Publish-scope / blog are
 *     downstream prerequisites the Shopify path surfaces; they don't flip the platform, so a
 *     connected-but-missing-scope Shopify still routes to Shopify and stays retriable.)
 *   - A stale/failed/untested WordPress row NEVER blocks an active Shopify connection.
 *   - Two genuinely active platforms → 'conflict'.
 *   - Neither active → the single PRESENT platform is used (this preserves existing
 *     WordPress-only publishing whose connection may still be 'untested'); only genuinely
 *     zero usable rows (or both present yet neither connected) resolve to 'none'.
 */

export type ActivePlatform = 'wordpress' | 'shopify' | 'conflict' | 'none'

export interface PlatformConnectionState {
  wordpress: { present: boolean; connectionStatus: string | null }
  shopify: { present: boolean; connectionStatus: string | null; canPublish: boolean }
}

export interface ActivePlatformResult {
  platform: ActivePlatform
  wordpressActive: boolean
  shopifyActive: boolean
  wordpressPresent: boolean
  shopifyPresent: boolean
  shopifyCanPublish: boolean
  /** Shopify is the active platform but write_content scope is missing → publishing needs
   *  the merchant to re-grant the scope (surfaced by the UI as a corrective action). */
  shopifyNeedsScope: boolean
}

const isConnected = (status: string | null): boolean => status === 'connected'

export function resolveActivePlatform(s: PlatformConnectionState): ActivePlatformResult {
  const wordpressActive = s.wordpress.present && isConnected(s.wordpress.connectionStatus)
  const shopifyActive = s.shopify.present && isConnected(s.shopify.connectionStatus)

  let platform: ActivePlatform
  if (wordpressActive && shopifyActive) platform = 'conflict'
  else if (shopifyActive) platform = 'shopify'          // active Shopify wins over any non-connected WordPress row
  else if (wordpressActive) platform = 'wordpress'
  else if (s.wordpress.present && !s.shopify.present) platform = 'wordpress' // WP-only (maybe untested) — preserve WordPress semantics
  else if (s.shopify.present && !s.wordpress.present) platform = 'shopify'   // Shopify-only (maybe untested) — Shopify route surfaces the exact state
  else platform = 'none'

  return {
    platform,
    wordpressActive,
    shopifyActive,
    wordpressPresent: s.wordpress.present,
    shopifyPresent: s.shopify.present,
    shopifyCanPublish: s.shopify.canPublish,
    shopifyNeedsScope: shopifyActive && !s.shopify.canPublish,
  }
}

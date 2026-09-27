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

export type ActivePlatform = 'wordpress' | 'shopify' | 'wix' | 'webhook' | 'conflict' | 'none'

export interface PlatformConnectionState {
  wordpress: { present: boolean; connectionStatus: string | null }
  shopify: { present: boolean; connectionStatus: string | null; canPublish: boolean }
  /**
   * The project's Wix / custom-site (webhook) connection, from
   * site_platform_connections. Optional: a caller that does not pass it — and a
   * project without one — resolves exactly as before this field existed.
   */
  site?: { present: boolean; connectionStatus: string | null; platform: 'wix' | 'webhook' } | null
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
  /** The Wix / webhook connection is 'connected'. */
  siteActive: boolean
}

const isConnected = (status: string | null): boolean => status === 'connected'

/** A site_platform_connections row (or a failed/missing read → null) as resolver input. */
export function siteConnectionState(row: { platform?: unknown; connection_status?: unknown } | null | undefined): PlatformConnectionState['site'] {
  if (!row || (row.platform !== 'wix' && row.platform !== 'webhook')) return null
  return { present: true, connectionStatus: typeof row.connection_status === 'string' ? row.connection_status : null, platform: row.platform }
}

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

  // Wix / webhook. The same rule, one level up: a connected site platform next
  // to a connected WordPress or Shopify is a conflict; a connected one alone is
  // the platform; an untested one is used only when nothing else is present.
  const site = s.site && s.site.present ? s.site : null
  const siteActive = !!site && isConnected(site.connectionStatus)
  if (site) {
    if (siteActive) platform = wordpressActive || shopifyActive ? 'conflict' : site.platform
    else if (platform === 'none' && !s.wordpress.present && !s.shopify.present) platform = site.platform
  }

  return {
    platform,
    wordpressActive,
    shopifyActive,
    wordpressPresent: s.wordpress.present,
    shopifyPresent: s.shopify.present,
    shopifyCanPublish: s.shopify.canPublish,
    shopifyNeedsScope: shopifyActive && !s.shopify.canPublish && !siteActive,
    siteActive,
  }
}

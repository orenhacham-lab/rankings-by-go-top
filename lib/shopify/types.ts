/**
 * Phase 4F.1 — Shopify Admin API types (only the fields the app consumes).
 */

export interface ShopifyCredentials {
  /** Normalized *.myshopify.com admin domain. */
  shopDomain: string
  /** Admin API access token (plaintext, decrypted server-side at call time). */
  accessToken: string
  /** Pinned Admin API version (e.g. 2024-10). */
  apiVersion: string
}

export type ShopifyEntityType = 'product' | 'collection' | 'page' | 'blog' | 'article'

/** A normalized Shopify entity ready to persist into shopify_entities. */
export interface ShopifyEntity {
  gid: string
  numericId: string
  type: ShopifyEntityType
  title: string
  handle: string
  canonicalUrl: string
  /** Raw Shopify status/state where available (ACTIVE/DRAFT/…); null otherwise. */
  status: string | null
  /** Whether this is a currently-valid, published internal-link target. */
  isActive: boolean
  bodyExcerpt: string
  metadata: Record<string, unknown>
  updatedAt: string | null
}

export interface ShopifyTestResult {
  ok: boolean
  /** Shop display name + resolved storefront host (present when ok). */
  shopName?: string
  storefrontDomain?: string | null
  /** Human-readable failure reason (present when not ok). Never contains the token. */
  error?: string
  /** Classified failure kind for the UI/error map. */
  kind?: ShopifyErrorKind
}

export type ShopifyErrorKind =
  | 'invalid_domain'
  | 'invalid_token'
  | 'missing_scope'
  | 'rate_limited'
  | 'api_error'
  | 'network'
  | 'not_configured'

/** Result of one entity-type fetch page pass. */
export interface EntitySyncTypeResult {
  type: ShopifyEntityType
  ok: boolean
  fetched: number
  /** Present when this type failed (partial sync) — other types are unaffected. */
  error?: string
  kind?: ShopifyErrorKind
}

export interface ShopifySyncResult {
  ok: boolean
  perType: EntitySyncTypeResult[]
  upserted: number
  deactivated: number
  counts: Record<ShopifyEntityType, number>
  /** Any type-level failures (partial sync) — never erases prior valid data. */
  warnings: string[]
  error?: string
}

/**
 * Phase 4F.1 — Shopify Admin API types (only the fields the app consumes).
 */

export interface ShopifyCredentials {
  /** Normalized *.myshopify.com admin domain. */
  shopDomain: string
  /** Admin API access token (plaintext, decrypted server-side at call time). */
  accessToken: string
  /** Pinned Admin API version (server-controlled; see SHOPIFY_API_VERSION). */
  apiVersion: string
}

/** Precise connection-test outcome (distinct from transport ShopifyErrorKind). */
export type ShopifyConnectionStatus =
  | 'connection_ok'
  | 'invalid_token'
  | 'missing_scopes'
  | 'permission_error'
  | 'api_version_fallback'

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
  /** Safe, structured diagnostics for the stage that failed. Contains ONLY
   *  non-sensitive values — never a token, secret, auth header, cookie or
   *  response body. `requestId` is Shopify's opaque `x-request-id`. */
  diagnostics?: {
    stage: 'shop_query' | 'access_scopes'
    kind: string
    httpStatus?: number
    requestId?: string | null
  }

  /** True when the token is valid and the store is reachable (may still warn). */
  ok: boolean
  /** Precise classification of the test. */
  status: ShopifyConnectionStatus
  /** Shop display name + resolved storefront host (present when reachable). */
  shopName?: string
  storefrontDomain?: string | null
  /** Granted Admin API scopes (handles only — never the token). */
  grantedScopes?: string[]
  /** Required scopes NOT granted (exact list). */
  missingScopes?: string[]
  /** Requested (pinned) vs actual (X-Shopify-API-Version header) version. */
  apiVersionRequested?: string
  apiVersionActual?: string | null
  /** Human-readable reason (present when not ok). Never contains the token. */
  error?: string
  /** Classified transport failure kind (network/api/rate-limit) when applicable. */
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

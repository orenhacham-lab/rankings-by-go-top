/**
 * Phase 4F.1 — centralized Shopify constants + PURE connection-status helpers.
 *
 * The Admin API version is pinned here in ONE place (never client-supplied) and
 * the required read scopes are derived from the implemented GraphQL queries:
 *   - read_products → products + collections
 *   - read_content  → Online Store pages, blogs, and articles
 * No write scopes are requested in Phase 4F.1.
 */

import type { ShopifyConnectionStatus } from './types'

/** The ONLY supported/pinned Admin GraphQL API version. Not client-overridable. */
export const SHOPIFY_API_VERSION = '2026-07'

/** Read scopes the implemented queries require. */
export const SHOPIFY_REQUIRED_SCOPES = ['read_products', 'read_content'] as const
export type RequiredScope = (typeof SHOPIFY_REQUIRED_SCOPES)[number]

/** Phase 4F.2 — the single extra scope required to CREATE/UPDATE Blog Articles. */
export const SHOPIFY_WRITE_SCOPE = 'write_content'
/**
 * Scopes requested during the publishing scope upgrade: the read scopes PLUS
 * write_content. No write_products / write_files / write_themes / customer /
 * order scopes are ever requested.
 */
export const SHOPIFY_PUBLISH_SCOPES = ['read_products', 'read_content', 'write_content'] as const

/** True when the granted set allows creating/updating Blog Articles. */
export function hasWriteContent(granted: string[] | null | undefined): boolean {
  const g = Array.isArray(granted) ? granted.map((s) => String(s).trim()) : []
  return g.includes(SHOPIFY_WRITE_SCOPE)
}

/** A granted `read_x` requirement is satisfied by `read_x` OR the implied `write_x`. */
function hasScope(granted: string[], required: string): boolean {
  if (granted.includes(required)) return true
  const write = required.replace(/^read_/, 'write_')
  return write !== required && granted.includes(write)
}

/** Required scopes NOT present in the granted set (exact, order-preserving). */
export function missingScopes(granted: string[], required: readonly string[] = SHOPIFY_REQUIRED_SCOPES): string[] {
  const g = Array.isArray(granted) ? granted.map((s) => String(s).trim()).filter(Boolean) : []
  return required.filter((r) => !hasScope(g, r))
}

/**
 * Classify a connection test into one precise status. PURE + unit-tested.
 * Priority: invalid token → can't read scopes → missing scopes → version
 * fall-forward → healthy.
 */
export function classifyConnection(opts: {
  tokenValid: boolean
  scopesReadable: boolean
  missing: string[]
  apiVersionRequested: string
  apiVersionActual: string | null
}): ShopifyConnectionStatus {
  if (!opts.tokenValid) return 'invalid_token'
  if (!opts.scopesReadable) return 'permission_error'
  if (opts.missing.length > 0) return 'missing_scopes'
  if (opts.apiVersionActual && opts.apiVersionActual !== opts.apiVersionRequested) return 'api_version_fallback'
  return 'connection_ok'
}

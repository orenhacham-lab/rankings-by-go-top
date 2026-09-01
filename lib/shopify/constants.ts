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

/**
 * THE authoritative list of scopes this app requests, and the single source of
 * truth for it. It must equal the `scopes` line in shopify.app.toml — the
 * Shopify app configuration — and lib/shopify/__qa__/shopify-scopes.qa.ts
 * fails if the two ever drift apart.
 *
 * Kept separate from SHOPIFY_REQUIRED_SCOPES on purpose: this is what the app
 * ASKS Shopify for, while SHOPIFY_REQUIRED_SCOPES is the smaller set the
 * implemented read queries cannot work without. A grant is refused only for
 * missing a REQUIRED scope — never for lacking an optional one — and a missing
 * required scope is a reauthorization problem, never a billing problem.
 */
export const SHOPIFY_APP_SCOPES = ['read_products', 'read_content', 'write_content'] as const

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
 * Phase 2 — the ONLY Shopify App Pricing plan handles this app treats as a
 * valid paid entitlement for Shopify publishing. The obsolete public
 * `free-plan` and private `shopify-test` plans are deliberately NOT included:
 * a merchant on either of those has no verifiable Partner-API-confirmed paid
 * plan, so the publishing guard must treat them as unentitled.
 */
export const SHOPIFY_SUPPORTED_PLAN_HANDLES = ['regular', 'advanced', 'premium', 'large-agency'] as const
export type ShopifyPlanHandle = (typeof SHOPIFY_SUPPORTED_PLAN_HANDLES)[number]

/** True narrowing guard: is this a Shopify App Pricing plan handle we grant entitlement for. */
export function isSupportedShopifyPlanHandle(value: unknown): value is ShopifyPlanHandle {
  return typeof value === 'string' && (SHOPIFY_SUPPORTED_PLAN_HANDLES as readonly string[]).includes(value)
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

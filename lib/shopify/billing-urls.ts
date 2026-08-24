/**
 * Phase 2 — centralized Shopify App Pricing redirect URL builder. This is the
 * ONLY place in the codebase that constructs a link to Shopify's hosted
 * plan-selection page. Every caller — the install flow, the embedded
 * connector home's "Manage plan" action, the billing-return re-check bounce,
 * and any Shopify publish-attempt lockout screen — MUST go through this
 * function so the URL policy stays in exactly one place.
 *
 * The store handle is ALWAYS derived from a connection's own canonical
 * `.myshopify.com` domain (see shopHandleFromMyshopifyDomain) — never from
 * browser-supplied input. The app handle comes from the required
 * SHOPIFY_APP_HANDLE env var; it is never guessed or derived from
 * SHOPIFY_CLIENT_ID (a separate, unrelated identifier).
 *
 * Per shopify.dev, this URL is OUTSIDE the embedded app's iframe scope — the
 * caller is responsible for a top-level/frame-breaking navigation
 * (e.g. `target=_top`, or `window.top.location` from a client component).
 * This module only builds the URL; it never performs the navigation itself.
 */

const MYSHOPIFY_SUFFIX = '.myshopify.com'

/**
 * PURE — `my-store.myshopify.com` → `"my-store"`. Returns null (fail closed)
 * for anything that isn't a well-formed `*.myshopify.com` domain.
 */
export function shopHandleFromMyshopifyDomain(shopDomain: string): string | null {
  if (typeof shopDomain !== 'string') return null
  const domain = shopDomain.trim().toLowerCase()
  if (!domain.endsWith(MYSHOPIFY_SUFFIX)) return null
  const handle = domain.slice(0, -MYSHOPIFY_SUFFIX.length)
  if (!handle || !/^[a-z0-9][a-z0-9-]*$/.test(handle)) return null
  return handle
}

export type PricingUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid_shop_domain' | 'missing_app_handle' }

/**
 * Build the Shopify-hosted pricing-plan-selection URL for a shop:
 * `https://admin.shopify.com/store/{storeHandle}/charges/{appHandle}/pricing_plans`
 *
 * Fails closed (`ok: false`) rather than returning a guessed/partial URL if
 * the shop domain is malformed or SHOPIFY_APP_HANDLE isn't configured.
 */
export function buildShopifyPricingUrl(shopDomain: string): PricingUrlResult {
  const storeHandle = shopHandleFromMyshopifyDomain(shopDomain)
  if (!storeHandle) return { ok: false, reason: 'invalid_shop_domain' }
  const appHandle = process.env.SHOPIFY_APP_HANDLE?.trim()
  if (!appHandle) return { ok: false, reason: 'missing_app_handle' }
  return { ok: true, url: `https://admin.shopify.com/store/${storeHandle}/charges/${encodeURIComponent(appHandle)}/pricing_plans` }
}

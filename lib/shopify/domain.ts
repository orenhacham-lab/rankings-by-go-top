/**
 * Phase 4F.1 — Shopify domain PURE helpers (no network). Normalizes and
 * validates the shop domain and builds canonical storefront URLs. Split out so
 * they are unit-testable without a live store.
 */

import type { ShopifyEntityType } from './types'

/**
 * Normalize a user-entered shop identifier into a bare *.myshopify.com host.
 * Accepts: "acme", "acme.myshopify.com", "https://acme.myshopify.com/admin",
 * "ACME.MyShopify.com". Returns null when it can't be resolved to a valid
 * *.myshopify.com host. Custom storefront domains are NOT accepted here — the
 * admin API domain must be *.myshopify.com (the custom domain is discovered
 * from the shop after connecting and used only for canonical URLs).
 */
export function normalizeShopDomain(input: string): string | null {
  if (typeof input !== 'string') return null
  let s = input.trim().toLowerCase()
  if (!s) return null
  // Strip scheme, path, query, and any leading/trailing slashes.
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\s+/g, '')
  if (!s) return null
  // A bare handle → append the canonical suffix.
  if (!s.includes('.')) s = `${s}.myshopify.com`
  // Validate the final shape: one label + .myshopify.com, DNS-safe label.
  const m = s.match(/^([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])\.myshopify\.com$/)
  if (!m) return null
  return s
}

/** True for a valid *.myshopify.com admin host. */
export function isValidShopDomain(input: string): boolean {
  return normalizeShopDomain(input) !== null
}

/**
 * Validate an OPTIONAL custom storefront domain host (e.g. shop.example.com).
 * Returns the bare lowercased host, or null when invalid. Rejects myshopify
 * (handled separately), IPs, localhost/internal, and anything without a dot.
 */
export function normalizeStorefrontDomain(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null
  let s = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!s || !s.includes('.')) return null
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s) || s.includes(':')) return null
  if (s === 'localhost' || s.endsWith('.localhost') || s.endsWith('.local') || s.endsWith('.internal')) return null
  if (!/^[a-z0-9.-]+$/.test(s)) return null
  return s
}

const PATH_BY_TYPE: Record<Exclude<ShopifyEntityType, 'blog' | 'article'>, string> = {
  product: 'products',
  collection: 'collections',
  page: 'pages',
}

/**
 * Build a canonical storefront URL for an entity. `host` is the custom
 * storefront domain when known, else the *.myshopify.com host. For articles the
 * blog handle is required; falls back to a blog-relative path if absent.
 */
export function buildCanonicalUrl(
  host: string,
  type: ShopifyEntityType,
  handle: string,
  blogHandle?: string | null,
): string {
  const base = `https://${host}`
  const h = encodeURIComponent(handle)
  if (type === 'article') {
    const b = blogHandle ? encodeURIComponent(blogHandle) : 'news'
    return `${base}/blogs/${b}/${h}`
  }
  if (type === 'blog') return `${base}/blogs/${h}`
  return `${base}/${PATH_BY_TYPE[type]}/${h}`
}

/** Extract the numeric id from a Shopify GID (gid://shopify/Product/123 → "123"). */
export function numericIdFromGid(gid: string): string {
  if (typeof gid !== 'string') return ''
  const m = gid.match(/\/(\d+)(?:\?.*)?$/)
  return m ? m[1] : ''
}

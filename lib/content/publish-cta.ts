/**
 * The article's ONE primary publishing action, as an invitation, never an error.
 *
 * Used by the article viewer's top bar and by the rows of the Articles screen,
 * so both say the same thing about the same project:
 *   - published             → "view it on the site" (the live URL, https only)
 *   - no platform           → "connect your site to publish" → the project's settings
 *   - two platforms          → "fix the connection" → the project's settings
 *   - Shopify without the
 *     write_content scope   → the EXISTING scope-upgrade flow
 *                             (/api/shopify/oauth/start?intent=publish). It asks
 *                             Shopify for the scope set the app already declares;
 *                             nothing here adds or changes a scope.
 *   - connected             → "publish" (the platform's own publish panel owns
 *                             the choices: blog, draft or live, confirmation)
 *
 * Every href is a same-origin path. Pure: no React, no I/O.
 */
import { platformSetupHref } from './content-hub-setup'

export type CtaPlatform = 'wordpress' | 'shopify' | 'wix' | 'webhook' | 'conflict' | 'none'

export type PublishCta =
  | { kind: 'loading' }
  | { kind: 'published'; href: string | null }
  | { kind: 'connect'; href: string }
  | { kind: 'conflict'; href: string }
  | { kind: 'grant_scope'; href: string }
  | { kind: 'publish' }

export interface PublishCtaInput {
  projectId: string | null
  loading?: boolean
  platform: CtaPlatform
  shopifyNeedsScope?: boolean
  shopDomain?: string | null
  isPublished?: boolean
  publishedUrl?: string | null
}

/** The existing Shopify publishing-scope upgrade (the same URL ShopifyPublishSettings opens). */
export function shopifyScopeUpgradeHref(projectId: string, shopDomain: string): string {
  return `/api/shopify/oauth/start?projectId=${encodeURIComponent(projectId)}&shop=${encodeURIComponent(shopDomain)}&intent=publish`
}

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i

export function resolvePublishCta(input: PublishCtaInput): PublishCta {
  if (input.isPublished) {
    const u = String(input.publishedUrl ?? '').trim()
    return { kind: 'published', href: /^https:\/\/[^\s]+$/i.test(u) ? u : null }
  }
  if (input.loading) return { kind: 'loading' }
  const settings = input.projectId ? platformSetupHref(input.projectId) : '/settings'
  if (input.platform === 'none') return { kind: 'connect', href: settings }
  if (input.platform === 'conflict') return { kind: 'conflict', href: settings }
  if (input.platform === 'shopify' && input.shopifyNeedsScope) {
    const shop = String(input.shopDomain ?? '').trim()
    return input.projectId && SHOP_DOMAIN.test(shop)
      ? { kind: 'grant_scope', href: shopifyScopeUpgradeHref(input.projectId, shop) }
      : { kind: 'connect', href: settings }
  }
  return { kind: 'publish' }
}

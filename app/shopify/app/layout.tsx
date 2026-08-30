import type { Metadata } from 'next'
import Script from 'next/script'
import { getShopifyAppClientId } from '@/lib/shopify/oauth'

/**
 * Phase 2 — layout scoped to the embedded Shopify App Home only. Adds the
 * `shopify-api-key` meta tag + the App Bridge CDN script App Bridge requires
 * (client_id is a public API key, never a secret — safe to render here).
 * Uses getShopifyAppClientId(), which does NOT require the app URL to be
 * configured — so this still renders a usable page when only the credentials
 * are set — but DOES apply the same atomic public/legacy pair rule as
 * getShopifyOAuthConfig. That matters: the key rendered here names the app
 * whose secret must verify the resulting App Bridge session tokens
 * (lib/shopify/session-token.ts checks `aud === config.clientId`), so naming
 * the public app here while verifying with the legacy secret would reject
 * every session token.
 */
export async function generateMetadata(): Promise<Metadata> {
  const clientId = getShopifyAppClientId()
  return {
    other: clientId ? { 'shopify-api-key': clientId } : {},
  }
}

export default function ShopifyAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" strategy="beforeInteractive" />
      {children}
    </>
  )
}

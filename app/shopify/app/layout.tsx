import type { Metadata } from 'next'
import Script from 'next/script'

/**
 * Phase 2 — layout scoped to the embedded Shopify App Home only. Adds the
 * `shopify-api-key` meta tag + the App Bridge CDN script App Bridge requires
 * (client_id is a public API key, never a secret — safe to render here).
 * SHOPIFY_CLIENT_ID is read directly (not via lib/shopify/oauth.ts's
 * getShopifyOAuthConfig, which also requires the secret + app URL to be
 * configured) so this still renders a usable page even if only the client id
 * is set; the actual session-token verification still hard-requires full
 * config server-side (lib/shopify/session-token.ts).
 */
export async function generateMetadata(): Promise<Metadata> {
  const clientId = (process.env.SHOPIFY_CLIENT_ID || '').trim()
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

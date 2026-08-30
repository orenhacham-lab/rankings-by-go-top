import type { Metadata } from 'next'
import { getShopifyAppClientId } from '@/lib/shopify/oauth'

/**
 * Phase 2 — layout scoped to the embedded Shopify App Home only. Emits the two
 * raw tags App Bridge requires: the `shopify-api-key` meta tag and the App
 * Bridge CDN script (client_id is a public API key, never a secret — safe to
 * render here).
 *
 * The client id comes from getShopifyAppClientId(), which does NOT require the
 * app URL to be configured — so this still renders a usable page when only the
 * credentials are set — but DOES apply the same atomic public/legacy pair rule
 * as getShopifyOAuthConfig. That matters: the key rendered here names the app
 * whose secret must verify the resulting App Bridge session tokens
 * (lib/shopify/session-token.ts checks `aud === config.clientId`), so naming
 * the public app here while verifying with the legacy secret would reject
 * every session token.
 *
 * ---------------------------------------------------------------------------
 * Why this is a PLAIN <script> and not next/script.
 *
 * This layout previously used:
 *   <Script src="…/app-bridge.js" strategy="beforeInteractive" />
 *
 * In the App Router that emits NO executable script tag. next/script's
 * beforeInteractive branch (node_modules/next/dist/client/script.js) calls
 * `ReactDOM.preload(src, { as: 'script' })` and then renders only an inline
 * queue push:
 *   (self.__next_s = self.__next_s || []).push(["…/app-bridge.js", {}])
 * The comment in Next's own source says these "need to be loaded by Next.js'
 * runtime instead of native <script> tags". That runtime drains `__next_s`
 * only for beforeInteractive scripts declared in the ROOT layout, which are
 * collected during the root render. Declared in a NESTED layout, the preload
 * link and the queue entry are emitted but nothing ever executes them.
 *
 * Confirmed against the real production HTML for /shopify/app, which contained
 * exactly:
 *   <link rel="preload" href="https://cdn.shopify.com/shopifycloud/app-bridge.js" as="script"/>
 *   <meta name="shopify-api-key" content="…"/>
 * and no <script src="…app-bridge.js">. So `window.shopify` never existed,
 * ConnectorHomeClient's waitForAppBridge() timed out, and the embedded iframe
 * showed "This page must be opened from within Shopify Admin."
 *
 * A plain <script src> rendered by this Server Component is emitted verbatim
 * into the server-rendered HTML and executes normally. It is deliberately NOT
 * async/defer: Shopify requires App Bridge to load synchronously and before
 * any other script, and it must not be hoisted or reordered. Keeping it in
 * this route-scoped layout is what confines App Bridge to /shopify/app —
 * moving it to the root layout would load it across the whole marketing site.
 * ---------------------------------------------------------------------------
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
      {/* eslint-disable-next-line @next/next/no-sync-scripts -- Shopify requires
          App Bridge to be loaded synchronously and first; next/script's
          beforeInteractive strategy emits no executable tag from a nested
          layout (see the header comment above). */}
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      {children}
    </>
  )
}

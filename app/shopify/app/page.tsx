import ConnectorHomeClient from './ConnectorHomeClient'

/**
 * Phase 2 — embedded Shopify App Home (rendered inside the Shopify Admin
 * iframe). This is also the app's configured "Application URL" — the page
 * Shopify opens on every install AND every reopen, with no distinction
 * between the two beyond the `shop` query param.
 *
 * This server component makes NO decision from the query string at all — it
 * renders the client shell and nothing else. Real identity, the connected/
 * not-connected state, and first-time installation are all driven by
 * ConnectorHomeClient from a VERIFIED App Bridge session token (see
 * lib/shopify/session-token.ts), never from an unverified `shop` param.
 *
 * Embedded-app fix: this page previously read `shop` and, when no connected
 * row existed, server-redirected to /api/shopify/install — which redirects to
 * https://{shop}/admin/oauth/authorize, a page Shopify refuses to let anyone
 * frame. Under `embedded = true` that ran INSIDE the Admin iframe and rendered
 * a blocked frame, so a brand-new merchant could never install. Shopify-managed
 * installation removes the authorization redirect entirely: the client calls
 * /api/shopify/embedded-install, which exchanges the session token for an
 * offline access token server-side. Nothing navigates to Shopify, so nothing
 * can be framed. The authorization-code flow remains for the non-embedded,
 * dashboard-initiated connect path, which runs top-level in a normal tab.
 */
export default async function ShopifyAppHomePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f6f6f7', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <ConnectorHomeClient />
    </div>
  )
}

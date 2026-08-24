import ConnectorHomeClient from './ConnectorHomeClient'

/**
 * Phase 2 — embedded Shopify App Home (rendered inside the Shopify Admin
 * iframe). Deliberately thin: all real identity/data comes from
 * ConnectorHomeClient's verified session-token fetch to
 * /api/shopify/app-home, never from this page's own search params (Shopify
 * appends `shop`/`host`/etc. to the iframe URL, but those are NOT proof of
 * identity — see lib/shopify/session-token.ts). This is a connector status
 * screen, not a re-implementation of the full Rankings dashboard — content
 * creation stays in the external dashboard, reached via "Open full
 * dashboard" once identity is verified.
 */
export default function ShopifyAppHomePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f6f6f7', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <ConnectorHomeClient />
    </div>
  )
}

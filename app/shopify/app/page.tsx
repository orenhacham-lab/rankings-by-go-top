import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeShopDomain } from '@/lib/shopify/domain'
import ConnectorHomeClient from './ConnectorHomeClient'

/**
 * Phase 2 — embedded Shopify App Home (rendered inside the Shopify Admin
 * iframe). This is also the app's configured "Application URL" — the page
 * Shopify opens on every install AND every reopen, with no distinction
 * between the two beyond the `shop` query param.
 *
 * The ONLY thing this server component does with `shop` is a non-privileged
 * "have we ever completed OAuth for this shop" existence check, to decide
 * whether to kick off installation (blocker fix — see
 * app/api/shopify/install/route.ts) before rendering anything. This is safe
 * to base on an unverified query param because it decides nothing
 * privileged: worst case a spoofed `shop` either shows the connect flow for
 * a shop that isn't real, or redirects to Shopify's OWN authorize screen for
 * that domain (which Shopify itself will reject if it doesn't exist) — no
 * entitlement or data is read or granted here. Real identity for everything
 * that follows comes from ConnectorHomeClient's verified App Bridge session
 * token (see lib/shopify/session-token.ts), never from this param.
 */
export default async function ShopifyAppHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const shopRaw = typeof params.shop === 'string' ? params.shop : ''
  const shop = normalizeShopDomain(shopRaw)

  if (shop) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('shopify_connections')
      .select('id')
      .eq('shop_domain', shop)
      .eq('connection_status', 'connected')
      .limit(1)
      .maybeSingle()
    if (!data) {
      redirect(`/api/shopify/install?shop=${encodeURIComponent(shop)}`)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f6f6f7', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <ConnectorHomeClient />
    </div>
  )
}

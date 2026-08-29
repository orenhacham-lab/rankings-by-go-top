import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth'
import { PENDING_LINK_COOKIE, verifyPendingLinkCookieValue, loadValidPendingInstall } from '@/lib/shopify/pending-link'
import ShopifyLinkClient from './ShopifyLinkClient'

/**
 * Phase 2 (blocker fix) — the fresh-install resume page. Reached after an
 * App-Store-initiated OAuth completes (see the pre-auth branch of
 * app/api/shopify/oauth/callback/route.ts): a merchant with NO Rankings
 * session or account yet needs to log in/register, then pick or create a
 * project to link the store to. The pending install itself is identified
 * ONLY by the signed, httpOnly cookie set at OAuth completion — never by
 * anything in the URL.
 */
export default async function ShopifyLinkPage() {
  const config = getShopifyOAuthConfig()
  const cookieStore = await cookies()
  const raw = cookieStore.get(PENDING_LINK_COOKIE)?.value
  const token = config ? verifyPendingLinkCookieValue(raw, config.clientSecret) : null

  if (!token) return <ExpiredMessage />

  const admin = createAdminClient()
  const pending = await loadValidPendingInstall(admin, token)
  if (!pending) return <ExpiredMessage />

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <Shell>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Connect {pending.shop_domain}</h1>
        <p style={{ color: '#616161', marginBottom: 20 }}>
          Log in or create a Rankings by Go Top account to finish connecting this store. You&apos;ll come right back here afterward.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <a href="/login?next=%2Fshopify%2Flink" style={linkButtonStyle}>Log in</a>
          <a href="/signup?next=%2Fshopify%2Flink" style={{ ...linkButtonStyle, background: '#fff', color: '#008060', border: '1px solid #008060' }}>Sign up</a>
        </div>
      </Shell>
    )
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, business_name, target_domain')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  return (
    <Shell>
      <ShopifyLinkClient
        shopDomain={pending.shop_domain}
        projects={(projects ?? []).map((p) => ({ id: p.id, label: p.business_name || p.target_domain || p.id }))}
      />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f6f6f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 480, width: '100%', background: '#fff', border: '1px solid #e1e3e5', borderRadius: 8, padding: 32 }}>
        {children}
      </div>
    </div>
  )
}

function ExpiredMessage() {
  return (
    <Shell>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Linking session expired</h1>
      <p style={{ color: '#616161' }}>
        This Shopify linking session is no longer valid. Please reopen or reinstall the app from your Shopify Admin to try again.
      </p>
    </Shell>
  )
}

const linkButtonStyle: React.CSSProperties = {
  display: 'inline-block', background: '#008060', color: '#fff', textDecoration: 'none',
  borderRadius: 6, padding: '10px 16px', fontSize: 14, fontWeight: 600,
}

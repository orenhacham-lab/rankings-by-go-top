import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/public/LandingPage'
import { landingHe } from '@/lib/i18n/public/landing-he'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { getShopifyOAuthConfig, detectSignedShopifyLaunch } from '@/lib/shopify/oauth'
import { authHref } from '@/lib/i18n/auth-href'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Hotfix — a signed Shopify app-launch (`?shop=...&hmac=...&host=...
  // &timestamp=...`, sent by Shopify to this app's configured Application
  // URL on every install AND every reopen) must NEVER fall through to the
  // public marketing homepage. This is checked BEFORE any Supabase call and
  // before rendering anything — a bare, unsigned visit to `/` (the normal
  // case, zero query params) skips this entirely via the cheap presence
  // check below. Fails safely (renders the normal homepage) on ANY
  // ambiguity: missing params, invalid/tampered HMAC, unparseable/expired
  // timestamp, an unconfigured OAuth client, or the content module being
  // disabled — nothing is trusted or persisted here, this ONLY decides
  // whether to hand off to the real embedded entry point (/shopify/app,
  // which itself treats `shop` as non-privileged — see its own header
  // comment). Never logs the raw hmac/shop/host/timestamp values.
  const sp = await searchParams
  const shopParam = typeof sp.shop === 'string' ? sp.shop : ''
  const hmacParam = typeof sp.hmac === 'string' ? sp.hmac : ''
  if (isContentModuleEnabled() && shopParam && hmacParam) {
    const config = getShopifyOAuthConfig()
    if (config) {
      const params: Record<string, string> = {}
      for (const [k, v] of Object.entries(sp)) {
        if (typeof v === 'string') params[k] = v
      }
      const launch = detectSignedShopifyLaunch(params, config.clientSecret)
      if (launch.ok) {
        const qs = new URLSearchParams(params).toString()
        redirect(`/shopify/app${qs ? `?${qs}` : ''}`)
      } else {
        console.warn('[Shopify launch] rejected at app URL', { route: 'home_page', reason: launch.reason })
      }
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Hero Section and the rest of the marketing page (components/public/LandingPage.tsx)
  // render only from here, after the signed-launch check above.
  return <LandingPage locale="he" copy={landingHe} signedIn={!!user} signupHref={authHref('signup', 'he')} pricingHref="/pricing" />
}

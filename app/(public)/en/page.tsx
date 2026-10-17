import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { LandingPage } from '@/components/public/LandingPage'
import { landingEn } from '@/lib/i18n/public/landing-en'
import { authHref } from '@/lib/i18n/auth-href'
import { REFERRAL_PARAM, withReferral } from '@/lib/affiliate/referral'

/**
 * The home page's own canonical. The Hebrew root has always had one and
 * these three had none, so the only thing naming this URL as itself was
 * Google's guess. It lives on the PAGE, not on the language layout: a
 * layout's canonical is inherited by every route under /en, which would
 * point the legal pages that declare no canonical of their own at the home
 * page. `alternates` replaces the layout's wholesale, so the hreflang set
 * is restated here.
 */
export const metadata: Metadata = {
  alternates: {
    canonical: 'https://www.gotopseo.com/en',
    languages: buildHreflangAlternates('/', '/en', '/es'),
  },
}

/**
 * A visitor who arrived on an affiliate link carries the code on the URL, and
 * the page's own "start free" button carries it into the signup form. Nothing is
 * stored: lib/affiliate/referral.ts says why, and the live agreement promises
 * partners attribution by the last click on the way to signing up. A visitor who
 * wanders to another page loses it, which is also what the agreement says.
 */
export default async function EnglishHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const referral = typeof sp[REFERRAL_PARAM] === 'string' ? sp[REFERRAL_PARAM] : null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <LandingPage locale="en" copy={landingEn} signedIn={!!user} signupHref={withReferral(authHref('signup', 'en'), referral)} pricingHref="/en/pricing" />
}

import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { LandingPage } from '@/components/public/LandingPage'
import { landingEs } from '@/lib/i18n/public/landing-es'
import { authHref } from '@/lib/i18n/auth-href'
import { REFERRAL_PARAM, withReferral } from '@/lib/affiliate/referral'

/**
 * The home page's own canonical. The Hebrew root has always had one and
 * these three had none, so the only thing naming this URL as itself was
 * Google's guess. It lives on the PAGE, not on the language layout: a
 * layout's canonical is inherited by every route under /es, which would
 * point the legal pages that declare no canonical of their own at the home
 * page. `alternates` replaces the layout's wholesale, so the hreflang set
 * is restated here.
 */
export const metadata: Metadata = {
  alternates: {
    canonical: 'https://www.gotopseo.com/es',
    languages: buildHreflangAlternates('/', '/en', '/es'),
  },
}

/**
 * The Spanish home page. The call to action goes to the SPANISH sign-up form
 * (app/(auth)/es/signup): the owner's rule of 4 October 2026 is that a visitor
 * who comes in on the Spanish site signs up, signs in and uses the app in
 * Spanish, with no language change along the way. It used to point at the
 * English form, from when the auth surface knew only two languages.
 */

/**
 * A visitor who arrived on an affiliate link carries the code on the URL, and
 * the page's own "start free" button carries it into the signup form. Nothing is
 * stored: lib/affiliate/referral.ts says why, and the live agreement promises
 * partners attribution by the last click on the way to signing up. A visitor who
 * wanders to another page loses it, which is also what the agreement says.
 */
export default async function SpanishHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const referral = typeof sp[REFERRAL_PARAM] === 'string' ? sp[REFERRAL_PARAM] : null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <LandingPage locale="es" copy={landingEs} signedIn={!!user} signupHref={withReferral(authHref('signup', 'es'), referral)} pricingHref="/es/pricing" />
}

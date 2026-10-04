import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/public/LandingPage'
import { landingEs } from '@/lib/i18n/public/landing-es'
import { authHref } from '@/lib/i18n/auth-href'

/**
 * The Spanish home page. The call to action goes to the SPANISH sign-up form
 * (app/(auth)/es/signup): the owner's rule of 4 October 2026 is that a visitor
 * who comes in on the Spanish site signs up, signs in and uses the app in
 * Spanish, with no language change along the way. It used to point at the
 * English form, from when the auth surface knew only two languages.
 */
export default async function SpanishHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <LandingPage locale="es" copy={landingEs} signedIn={!!user} signupHref={authHref('signup', 'es')} pricingHref="/es/pricing" />
}

import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/public/LandingPage'
import { landingPtBR } from '@/lib/i18n/public/landing-pt-BR'
import { authHref } from '@/lib/i18n/auth-href'

/**
 * The Brazilian Portuguese home page. The call to action goes to the PORTUGUESE
 * sign-up form (app/(auth)/pt-BR/signup): the owner's rule of 4 October 2026 is
 * that a visitor who comes in on a language's site signs up, signs in and uses
 * the app in that language, with no language change along the way.
 */
export default async function PortugueseHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <LandingPage locale="pt-BR" copy={landingPtBR} signedIn={!!user} signupHref={authHref('signup', 'pt-BR')} pricingHref="/pt-BR/pricing" />
}

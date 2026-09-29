import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/public/LandingPage'
import { landingEn } from '@/lib/i18n/public/landing-en'
import { authHref } from '@/lib/i18n/auth-href'

export default async function EnglishHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <LandingPage locale="en" copy={landingEn} signedIn={!!user} signupHref={authHref('signup', 'en')} pricingHref="/en/pricing" />
}

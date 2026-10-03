import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/public/LandingPage'
import { landingEs } from '@/lib/i18n/public/landing-es'
import { authHref } from '@/lib/i18n/auth-href'

/**
 * The Spanish home page. Sign-up itself is still bilingual (the dashboard has
 * no Spanish yet), so the call to action goes to the ENGLISH form rather than
 * to a Hebrew one: the shared Latin script is the nearest thing a Spanish
 * speaker can read. lib/i18n/locales.ts#toBilingualLocale is where that
 * narrowing is documented, and every call site of it is the dashboard wave's
 * to-do list.
 */
export default async function SpanishHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <LandingPage locale="es" copy={landingEs} signedIn={!!user} signupHref={authHref('signup', 'en')} pricingHref="/es/pricing" />
}

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getServerLocale } from '@/lib/i18n/server-locale'
import { AuthLocaleProvider } from '@/components/auth/AuthLocaleProvider'
import { countryFromHeaders } from '@/lib/billing/server-market'
import { koreaTrialOnlyNoticeForCountry } from '@/lib/billing/korea-sale'

export const metadata: Metadata = {
  // Note: Auth pages are not indexed, but we don't explicitly block robots
  // to allow Google to crawl and understand the site structure
}

/**
 * The auth pages are the first thing a signed-out reviewer sees, and they are
 * client components — they cannot read the cookie, the proxy header or
 * Accept-Language themselves. This layout resolves the locale with the SAME
 * server resolver every other surface uses and hands it down, so the sign-in
 * form renders in the request's language on the server, before hydration.
 * Without it the forms fell back to Hebrew for every request that did not carry
 * an /en URL or an explicit ?lang.
 *
 * The Korea notice rides the same wire, and for the same reason: the forms are
 * client components and the decision is the request's COUNTRY, which only a
 * server component can read. It is resolved here rather than per page because
 * the duty under 전자상거래법 제21조 제1항 제1호 follows the Korean consumer,
 * not the page's language, so a Korean-placed visitor signing up on the English
 * tree is owed the same sentence as one on /ko. Only the sign-up form renders
 * it — that is where the inducement happens.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getServerLocale()
  const requestHeaders = await headers()
  const koreaTrialOnly = koreaTrialOnlyNoticeForCountry(countryFromHeaders(requestHeaders))
  return (
    <AuthLocaleProvider locale={locale} koreaTrialOnly={koreaTrialOnly}>
      {children}
    </AuthLocaleProvider>
  )
}

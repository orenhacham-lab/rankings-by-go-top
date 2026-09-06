import type { Metadata } from 'next'
import { getServerLocale } from '@/lib/i18n/server-locale'
import { AuthLocaleProvider } from '@/components/auth/AuthLocaleProvider'

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
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getServerLocale()
  return <AuthLocaleProvider locale={locale}>{children}</AuthLocaleProvider>
}

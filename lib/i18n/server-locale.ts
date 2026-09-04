/**
 * The SERVER's view of the active locale, for the root layout and any other
 * server component that needs it before a single byte is rendered.
 *
 * Prefers the header the proxy set (which already accounted for an /en URL);
 * falls back to reading the cookie directly, so a route the proxy does not
 * match still gets the user's choice rather than a hard-coded default.
 */

import { cookies, headers } from 'next/headers'
import type { Locale } from './locales'
import { normalizeLocale } from './dashboard/locale'
import { LANGUAGE_COOKIE, LOCALE_HEADER, DEFAULT_LOCALE, resolveRequestLocale } from './request-locale'

export async function getServerLocale(seed?: string | null): Promise<Locale> {
  try {
    const h = await headers()
    const fromProxy = normalizeLocale(h.get(LOCALE_HEADER))
    if (fromProxy) return fromProxy
  } catch { /* headers() unavailable in this context — fall through */ }
  try {
    const c = await cookies()
    return resolveRequestLocale({ cookieValue: c.get(LANGUAGE_COOKIE)?.value ?? null, seed })
  } catch {
    return normalizeLocale(seed) ?? DEFAULT_LOCALE
  }
}

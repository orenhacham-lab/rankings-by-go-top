/**
 * The SERVER's view of the active locale, for the root layout and any other
 * server component that needs it before a single byte is rendered.
 *
 * Order of consultation:
 *   1. the header the proxy set — it already accounted for an /en URL or an
 *      explicit cookie, and the proxy sets it ONLY in those two cases;
 *   2. otherwise the full contract in resolveRequestLocale: cookie → seed →
 *      Accept-Language → English.
 *
 * The Accept-Language header is read HERE and passed down, rather than being
 * looked up inside the pure resolver, so the resolver stays framework-free and
 * every caller (proxy, layouts, tests) can drive it with an explicit value.
 */

import { cookies, headers } from 'next/headers'
import type { Locale } from './locales'
import { normalizeLocale } from './dashboard/locale'
import { LANGUAGE_COOKIE, LOCALE_HEADER, resolveRequestLocale } from './request-locale'

export async function getServerLocale(seed?: string | null): Promise<Locale> {
  let acceptLanguage: string | null = null
  try {
    const h = await headers()
    const fromProxy = normalizeLocale(h.get(LOCALE_HEADER))
    if (fromProxy) return fromProxy
    acceptLanguage = h.get('accept-language')
  } catch { /* headers() unavailable in this context — fall through */ }
  try {
    const c = await cookies()
    return resolveRequestLocale({ cookieValue: c.get(LANGUAGE_COOKIE)?.value ?? null, seed, acceptLanguage })
  } catch {
    // No cookie store (e.g. a static context). The seed and the browser's own
    // header are still real signals and must not be discarded for a constant.
    return resolveRequestLocale({ seed, acceptLanguage })
  }
}

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
 *
 * TWO FUNCTIONS, BECAUSE THERE ARE TWO QUESTIONS. Nearly every caller is a
 * BILINGUAL surface — the dashboard, the auth pages, the Shopify entry points,
 * the server actions whose refusals they display — and those have Hebrew and
 * English strings and nothing else. Only the DOCUMENT itself (what <html
 * lang/dir> and the page metadata must agree with) can be Spanish, because
 * `/es/*` is a Spanish document. Keeping them apart is what stops a `'es'`
 * reaching a `locale === 'he' ? … : …` in 160 dashboard files and silently
 * serving English there, and it leaves every bilingual call site untouched.
 */

import { cookies, headers } from 'next/headers'
import { normalizePublicLocale, toBilingualLocale, type Locale, type PublicLocale } from './locales'
import { normalizeLocale } from './dashboard/locale'
import { LANGUAGE_COOKIE, LOCALE_HEADER, resolveRequestLocale } from './request-locale'

/**
 * The locale of a surface that exists in HEBREW AND ENGLISH only.
 *
 * Unchanged from before the Spanish work, deliberately: the only way a Spanish
 * value could arrive here is a hand-edited cookie, and a Spanish visitor on a
 * bilingual surface is served ENGLISH, never Hebrew — they came from a
 * latin-script, left-to-right site, and a right-to-left Hebrew document would
 * be a worse answer than one they can read.
 */
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
    return toBilingualLocale(resolveRequestLocale({ cookieValue: c.get(LANGUAGE_COOKIE)?.value ?? null, seed, acceptLanguage }))
  } catch {
    // No cookie store (e.g. a static context). The seed and the browser's own
    // header are still real signals and must not be discarded for a constant.
    return toBilingualLocale(resolveRequestLocale({ seed, acceptLanguage }))
  }
}

/**
 * The DOCUMENT's locale, which includes Spanish. Read by the root layout for
 * <html lang/dir> and for the page metadata, so a `/es/*` request declares
 * Spanish instead of inheriting Hebrew from the root.
 *
 * Same chain, same precedence; the only difference is that it does not throw
 * Spanish away.
 */
export async function getServerPublicLocale(seed?: string | null): Promise<PublicLocale> {
  let acceptLanguage: string | null = null
  try {
    const h = await headers()
    const fromProxy = normalizePublicLocale(h.get(LOCALE_HEADER))
    if (fromProxy) return fromProxy
    acceptLanguage = h.get('accept-language')
  } catch { /* headers() unavailable in this context — fall through */ }
  try {
    const c = await cookies()
    return resolveRequestLocale({ cookieValue: c.get(LANGUAGE_COOKIE)?.value ?? null, seed, acceptLanguage })
  } catch {
    return resolveRequestLocale({ seed, acceptLanguage })
  }
}

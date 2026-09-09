/**
 * Every link that leaves the embedded Shopify app for the external dashboard.
 *
 * WHY A BUILDER AND NOT A TEMPLATE STRING. There is more than one of these —
 * the connector home's "Open full dashboard", and the link page's log-in and
 * sign-up buttons — and the defect was that a link carried no language at all.
 * Fixing the one URL in the bug report would have left the others to regress
 * the same way, so the rule lives in one function and the QA asserts that no
 * Shopify surface builds such a URL by hand.
 *
 * The locale is a parameter, never a constant chosen here: the caller resolves
 * it through lib/i18n/request-locale and passes the answer, so this file adds
 * no second opinion about language.
 */

import type { Locale } from '@/lib/i18n/locales'
import { LANGUAGE_PARAM, sanitizeNextPath } from '@/lib/i18n/request-locale'

/** `appUrl` + an INTERNAL path + the carried locale. The path is sanitised the
 *  same way a `next` parameter is, so a caller cannot build a cross-origin
 *  handoff even by accident. */
export function externalUrlWithLocale(appUrl: string, internalPath: string, locale: Locale): string {
  const base = appUrl.replace(/\/+$/, '')
  const safePath = sanitizeNextPath(internalPath, '/dashboard')
  const url = new URL(`${base}${safePath}`)
  url.searchParams.set(LANGUAGE_PARAM, locale)
  return url.toString()
}

/** A sign-in link back into the app that returns to `next` afterwards, in the
 *  surface's own language. Used by the Shopify link page. */
export function authUrlWithLocale(authPath: '/login' | '/signup', nextPath: string, locale: Locale): string {
  const params = new URLSearchParams({ next: sanitizeNextPath(nextPath, '/dashboard') })
  params.set(LANGUAGE_PARAM, locale)
  return `${authPath}?${params.toString()}`
}

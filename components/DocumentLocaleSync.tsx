'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { routePublicLocale } from '@/lib/i18n/request-locale'
import { documentLocaleAttributes } from '@/lib/i18n/document-locale'

/**
 * KEEPS <html lang/dir> HONEST ACROSS A CLIENT-SIDE NAVIGATION.
 *
 * The root layout renders <html lang dir> from the request, and it is the one
 * thing a client-side route change cannot update: the root layout sits above
 * every changing segment, so Next never re-renders it. Switching language is
 * exactly that kind of navigation, so the page's WORDS changed to Hebrew while
 * the document stayed `dir="ltr"` — the header's sign-in, start-free and
 * language controls stayed pinned to the right, and only a refresh fixed it.
 * Reported by the owner, 3 October 2026, and reproduced: after clicking עברית
 * on /en the sign-in link sat at x=1137 instead of x=217.
 *
 * This runs for EVERY navigation, not just the switcher, because any link from
 * one language tree to another has the same effect.
 *
 * It only speaks when the ROUTE states a language. On a bilingual surface
 * (`/dashboard`, `/login`) `routePublicLocale` answers null and the attributes
 * are left exactly as the server set them, so this can never overrule the
 * user's own preference with a guess made from a URL.
 *
 * It is a correction, not the source of truth: the server still renders the
 * right attributes on the first paint, so there is no flash on a cold load and
 * a visitor with JavaScript off is unaffected.
 */
export function DocumentLocaleSync() {
  const pathname = usePathname()

  useEffect(() => {
    const locale = routePublicLocale(pathname)
    if (!locale) return
    const { lang, dir } = documentLocaleAttributes(locale)
    const el = document.documentElement
    if (el.lang !== lang) el.lang = lang
    if (el.dir !== dir) el.dir = dir
  }, [pathname])

  return null
}

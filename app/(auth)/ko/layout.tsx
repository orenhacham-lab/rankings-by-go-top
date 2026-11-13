import { notFound } from 'next/navigation'
import { koreanSiteEnabled } from '@/lib/i18n/korean-site'

/**
 * THE ONE GATE for the Korean auth tree, the twin of the public tree's
 * (app/(public)/ko/layout.tsx) and of the nine beside it.
 *
 * WHY THIS TREE WAS MISSING, AND WHY THAT WAS NOT COSMETIC. The Korean locale
 * shipped with its own public tree and its own words in every auth form
 * (`SIGNUP_UI.ko`, the login form's `ko`, `PASSWORD_UI.ko`) — but with no
 * `/ko` routes under (auth). `authHref('signup', 'ko')` builds `/ko/signup`
 * from LOCALE_PREFIX, so the Korean site's one call to action, the free
 * trial, led to a 404. The trial is the whole reason the legal thread let the
 * locale go live as a marketing-and-trial site, so the locale could not be
 * switched on at all until these four routes existed.
 *
 * The gate is here rather than in the pages so a new Korean auth page cannot
 * forget to be gated, and with the flag off the URLs do not exist, so nothing
 * labels a 404 'ko'.
 */
export default function KoreanAuthLayout({ children }: { children: React.ReactNode }) {
  if (!koreanSiteEnabled()) notFound()
  return children
}

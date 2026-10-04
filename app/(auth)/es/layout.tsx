import { notFound } from 'next/navigation'
import { spanishSiteEnabled } from '@/lib/i18n/spanish-site'

/**
 * THE ONE GATE for the Spanish auth tree, the twin of the public tree's
 * (app/(public)/es/layout.tsx).
 *
 * WHY THESE ROUTES EXIST (owner, 4 October 2026): "a customer comes in on the
 * Spanish site, signs up, signs in, and everything is in Spanish". The forms
 * already held the words; what they had no way to say was WHICH language the
 * visitor came in on, because the auth surface had exactly two routes. `/es/…`
 * is that statement, and `resolveAuthLocale` reads it from the path.
 *
 * The gate is here rather than in the pages for the same reason as the public
 * tree: a new Spanish auth page cannot forget to be gated, and with the flag
 * off the URLs do not exist, so nothing labels a 404 'es'.
 *
 * The forms do not re-declare lang/dir. The root layout renders them from the
 * request (the proxy resolves /es/… to Spanish) and AuthShell sets `dir` from
 * the locale it is given, so the Spanish forms are left-to-right without a
 * wrapper of their own.
 */
export default function SpanishAuthLayout({ children }: { children: React.ReactNode }) {
  if (!spanishSiteEnabled()) notFound()
  return children
}

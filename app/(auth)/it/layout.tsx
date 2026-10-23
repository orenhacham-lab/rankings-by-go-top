import { notFound } from 'next/navigation'
import { italianSiteEnabled } from '@/lib/i18n/italian-site'

/**
 * THE ONE GATE for the Italian auth tree, the twin of the public
 * tree's (app/(public)/it/layout.tsx) and of the French one beside it.
 *
 * WHY THESE ROUTES EXIST (owner, 4 October 2026): "a customer comes in on the
 * site in one language, signs up, signs in, and everything is in that
 * language". The forms already hold the words; what they have no way to say is
 * WHICH language the visitor came in on. `/it/…` is that statement, and
 * `resolveAuthLocale` reads it from the path.
 *
 * The gate is here rather than in the pages so a new Italian auth page
 * cannot forget to be gated, and with the flag off the URLs do not exist, so
 * nothing labels a 404 'it'.
 */
export default function ItalianAuthLayout({ children }: { children: React.ReactNode }) {
  if (!italianSiteEnabled()) notFound()
  return children
}

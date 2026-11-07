import { notFound } from 'next/navigation'
import { dutchSiteEnabled } from '@/lib/i18n/dutch-site'

/**
 * THE ONE GATE for the Dutch auth tree, the twin of the public
 * tree's (app/(public)/nl/layout.tsx) and of the French one beside it.
 *
 * WHY THESE ROUTES EXIST (owner, 4 October 2026): "a customer comes in on the
 * site in one language, signs up, signs in, and everything is in that
 * language". The forms already hold the words; what they have no way to say is
 * WHICH language the visitor came in on. `/nl/…` is that statement, and
 * `resolveAuthLocale` reads it from the path.
 *
 * The gate is here rather than in the pages so a new Dutch auth page
 * cannot forget to be gated, and with the flag off the URLs do not exist, so
 * nothing labels a 404 'nl'.
 */
export default function DutchAuthLayout({ children }: { children: React.ReactNode }) {
  if (!dutchSiteEnabled()) notFound()
  return children
}

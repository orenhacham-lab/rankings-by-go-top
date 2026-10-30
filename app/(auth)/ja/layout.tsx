import { notFound } from 'next/navigation'
import { japaneseSiteEnabled } from '@/lib/i18n/japanese-site'

/**
 * THE ONE GATE for the Japanese auth tree, the twin of the public
 * tree's (app/(public)/ja/layout.tsx) and of the French one beside it.
 *
 * WHY THESE ROUTES EXIST (owner, 4 October 2026): "a customer comes in on the
 * site in one language, signs up, signs in, and everything is in that
 * language". The forms already hold the words; what they have no way to say is
 * WHICH language the visitor came in on. `/ja/…` is that statement, and
 * `resolveAuthLocale` reads it from the path.
 *
 * The gate is here rather than in the pages so a new Japanese auth page
 * cannot forget to be gated, and with the flag off the URLs do not exist, so
 * nothing labels a 404 'ja'.
 */
export default function JapaneseAuthLayout({ children }: { children: React.ReactNode }) {
  if (!japaneseSiteEnabled()) notFound()
  return children
}

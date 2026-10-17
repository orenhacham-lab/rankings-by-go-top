import { notFound } from 'next/navigation'
import { portugueseSiteEnabled } from '@/lib/i18n/portuguese-site'

/**
 * THE ONE GATE for the Brazilian Portuguese auth tree, the twin of the public
 * tree's (app/(public)/pt-BR/layout.tsx) and of the Spanish one beside it.
 *
 * WHY THESE ROUTES EXIST (owner, 4 October 2026): "a customer comes in on the
 * site in one language, signs up, signs in, and everything is in that
 * language". The forms already hold the words; what they have no way to say is
 * WHICH language the visitor came in on. `/pt-BR/…` is that statement, and
 * `resolveAuthLocale` reads it from the path.
 *
 * The gate is here rather than in the pages so a new Portuguese auth page
 * cannot forget to be gated, and with the flag off the URLs do not exist, so
 * nothing labels a 404 'pt-BR'.
 */
export default function PortugueseAuthLayout({ children }: { children: React.ReactNode }) {
  if (!portugueseSiteEnabled()) notFound()
  return children
}

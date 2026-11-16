/**
 * ONE per-request answer to "who is this and what language is the document?",
 * shared by the root layout's `generateMetadata` and its render.
 *
 * Both need the same two facts, and both derive the locale from the same seed
 * (the signup language in auth metadata). Reading them twice would mean two
 * resolutions that can disagree, producing a Hebrew <title> on an English
 * document. React's `cache` makes the pair a single computation per request, so
 * the metadata and the <html> element cannot drift apart.
 *
 * NO AUTH ROUND TRIP FOR A VISITOR WHO IS NOT SIGNED IN.
 *
 * This used to call `supabase.auth.getUser()`, which asks the Auth server to
 * verify the token — on EVERY page view of the whole site, the public marketing
 * pages included, where there is usually no token at all. Measured from Israel
 * on 16.11.2026 against production, the document of a public page took 630-1050ms
 * and every one of them was answered in the function's region (`x-vercel-id:
 * kix1::bom1`), with roughly 300ms of that this single verification. A crawler
 * pays it too, on every page it fetches.
 *
 * `verifiedClaims` (lib/auth/edge-session.ts) answers the same two questions
 * from the cookie: no token means nobody is signed in and costs NO request, and
 * a token is checked locally against the project's own JWKS, which is held per
 * warm instance. Anything unexpected still ends at `getUser()`.
 *
 * WHAT THIS DECIDES, AND WHAT IT MUST NOT: `isAuthenticated` chooses the
 * document's language and whether the public widgets and the consent notice are
 * rendered. It is presentation, never permission: the dashboard layout and every
 * `/api/*` route still call `auth.getUser()` themselves, in-region, before they
 * read or write anything of the owner's.
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { verifiedClaims } from '@/lib/auth/edge-session'
import { getServerPublicLocale } from './server-locale'
import type { PublicLocale } from './locales'

export interface RootRequestContext {
  isAuthenticated: boolean
  locale: PublicLocale
}

export const getRootRequestContext = cache(async (): Promise<RootRequestContext> => {
  let isAuthenticated = false
  let seed: string | null = null
  try {
    const supabase = await createClient()
    const claims = await verifiedClaims(supabase, process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    isAuthenticated = !!claims
    const s = claims?.userMetadata?.locale
    seed = typeof s === 'string' ? s : null
  } catch {
    // A transient auth failure defaults to the safe public behaviour and never
    // breaks the app; the locale still resolves from cookie/header.
    isAuthenticated = false
  }
  return { isAuthenticated, locale: await getServerPublicLocale(seed) }
})

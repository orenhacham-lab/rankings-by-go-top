/**
 * ONE per-request answer to "who is this and what language is the document?",
 * shared by the root layout's `generateMetadata` and its render.
 *
 * Both need the same two facts, and both derive the locale from the same seed
 * (the signup language in auth metadata). Reading them twice would mean two
 * Supabase round-trips per request AND — the part that actually matters — two
 * independent resolutions that can disagree, producing a Hebrew <title> on an
 * English document. React's `cache` makes the pair a single computation per
 * request, so the metadata and the <html> element cannot drift apart.
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getServerLocale } from './server-locale'
import type { Locale } from './locales'

export interface RootRequestContext {
  isAuthenticated: boolean
  locale: Locale
}

export const getRootRequestContext = cache(async (): Promise<RootRequestContext> => {
  let isAuthenticated = false
  let seed: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    isAuthenticated = !!user
    const s = user?.user_metadata?.locale
    seed = typeof s === 'string' ? s : null
  } catch {
    // A transient auth failure defaults to the safe public behaviour and never
    // breaks the app; the locale still resolves from cookie/header.
    isAuthenticated = false
  }
  return { isAuthenticated, locale: await getServerLocale(seed) }
})

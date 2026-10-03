/**
 * Pure dashboard-locale helpers — deliberately NOT a `'use client'` module.
 *
 * The dashboard layout is a SERVER component (it reads the authenticated user), and a
 * server component cannot call a function exported from a `'use client'` module: every
 * such export becomes a client reference, so invoking it on the server throws
 * "Attempted to call X() from the server but X is on the client".
 *
 * These helpers are plain, dependency-free functions, so they live here and are used by
 * BOTH sides: the server layout (to seed initialLocale from auth metadata) and the client
 * language provider (which re-exports them for existing client-side importers).
 */
import { normalizeStoredLocale, toBilingualLocale, type Locale, type PublicLocale } from '../locales'

/** Validate an untrusted value (URL param / auth metadata) to a supported Locale. */
export function normalizeLocale(v: unknown): Locale | null {
  return v === 'en' || v === 'he' ? v : null
}

/**
 * The single resolution rule for the dashboard language: a previously-stored choice
 * (the switcher, or a prior signup seed) ALWAYS wins; otherwise fall back to the
 * empty-storage seed (initialLocale from auth metadata); otherwise Hebrew.
 */
export function resolveDashboardLocale(stored: string | null, initialLocale?: Locale | null): Locale {
  return normalizeLocale(stored) ?? normalizeLocale(initialLocale) ?? 'he'
}

/**
 * The locale the dashboard's WORDS are in, which is the one thing about it that
 * can be Spanish. Everything else — the ~300 `locale === 'he'` conditionals, the
 * server actions' refusals, the Shopify entry points — stays bilingual and reads
 * `resolveDashboardLocale` above, so a Spanish reader gets the ENGLISH branch of
 * each of those rather than the Hebrew one (lib/i18n/locales.ts explains why).
 *
 * Spanish is accepted only while the Spanish build is on. The flag is the one
 * gate for the whole language (lib/i18n/spanish-site.ts), so with it off a
 * hand-edited cookie saying `es` cannot put a visitor on a half-translated
 * dashboard: it is simply not a value this function returns.
 */
export function normalizeDashboardUiLocale(v: unknown): PublicLocale | null {
  return normalizeStoredLocale(v)
}

/** Same precedence as resolveDashboardLocale — a stored choice, then the seed, then Hebrew. */
export function resolveDashboardUiLocale(stored: string | null, initialLocale?: PublicLocale | null): PublicLocale {
  return normalizeDashboardUiLocale(stored) ?? normalizeDashboardUiLocale(initialLocale) ?? 'he'
}

/** The bilingual value that belongs with a dashboard UI locale. One narrowing point, named. */
export function dashboardBilingualLocale(uiLocale: PublicLocale): Locale {
  return toBilingualLocale(uiLocale)
}

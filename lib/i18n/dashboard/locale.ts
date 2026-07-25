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
import type { Locale } from '../locales'

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

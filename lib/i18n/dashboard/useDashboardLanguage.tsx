'use client'

import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import type { Locale } from '../locales'
import { normalizeLocale, resolveDashboardLocale } from './locale'

/** The single, existing dashboard-language store key (localStorage). Exported so the
 *  signup flow can seed it without a second competing key. */
export const DASHBOARD_LANGUAGE_STORAGE_KEY = 'dashboard-language'
const STORAGE_KEY = DASHBOARD_LANGUAGE_STORAGE_KEY

// The pure locale helpers live in ./locale (NOT a client module) so the SERVER dashboard
// layout can call them. Re-exported here for existing client-side importers.
export { normalizeLocale, resolveDashboardLocale } from './locale'

type DashboardLanguageContextValue = {
  language: Locale
  setDashboardLanguage: (lang: Locale) => void
  isLoaded: boolean
}

const DashboardLanguageContext = createContext<DashboardLanguageContextValue | null>(null)

export function DashboardLanguageProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale | null }) {
  // Area G — the seed is used ONLY as the empty-storage default (e.g. a fresh device's
  // first login after email confirmation, where the signup-language lives in auth
  // metadata). A previously-stored choice (from the switcher) always wins below.
  // Initial state IS the empty-storage seed (initialLocale from auth metadata, else 'he').
  const [language, setLanguage] = useState<Locale>(resolveDashboardLocale(null, initialLocale))
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // A stored choice (the switcher, or a prior signup seed) always wins over the seed.
    // Reads the same existing key the switcher writes — no second store.
    const stored = normalizeLocale(localStorage.getItem(STORAGE_KEY))
    if (stored) setLanguage(stored)
    setIsLoaded(true)
  }, [])

  const setDashboardLanguage = (lang: Locale) => {
    setLanguage(lang)
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // ignore quota / privacy mode errors
    }
  }

  return (
    <DashboardLanguageContext.Provider value={{ language, setDashboardLanguage, isLoaded }}>
      {children}
    </DashboardLanguageContext.Provider>
  )
}

export function useDashboardLanguage(): DashboardLanguageContextValue {
  const ctx = useContext(DashboardLanguageContext)
  if (ctx) return ctx
  // Safe fallback for any consumer rendered outside the provider.
  // Keeps Hebrew default so the dashboard never appears broken.
  return { language: 'he', setDashboardLanguage: () => {}, isLoaded: true }
}

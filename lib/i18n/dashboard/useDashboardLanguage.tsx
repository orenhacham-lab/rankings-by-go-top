'use client'

import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import { DocumentLocaleEffect } from '@/components/DocumentLocaleEffect'
import {
  LANGUAGE_COOKIE, languageCookieString, readCookie, migrateLocalePreference,
} from '@/lib/i18n/request-locale'
import type { Locale } from '../locales'
import { resolveDashboardLocale } from './locale'

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

/** Write the preference where the SERVER can read it on the next request. */
function writeLanguageCookie(lang: Locale) {
  try {
    document.cookie = languageCookieString(lang, window.location.protocol === 'https:')
  } catch { /* non-browser or blocked — the UI still works, the server just keeps its value */ }
}

export function DashboardLanguageProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale | null }) {
  // `initialLocale` is now the SERVER-RESOLVED locale (the same cookie the root
  // layout rendered from), not just an auth-metadata seed. Starting from it is
  // what makes the client's FIRST render identical to the server's — the
  // previous version started from the seed and then corrected itself in an
  // effect, which is precisely the disagreement this contract removes.
  const [language, setLanguage] = useState<Locale>(resolveDashboardLocale(null, initialLocale))
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // ONE-TIME MIGRATION, deterministic and cookie-first. Before this change the
    // preference lived only in localStorage, which the server cannot read; on the
    // first load after it the cookie may be missing while a real choice sits in
    // storage. migrateLocalePreference decides once, and always ends with the
    // cookie written so the NEXT request is already decided server-side.
    let stored: string | null = null
    try { stored = localStorage.getItem(STORAGE_KEY) } catch { /* private mode */ }
    const cookieValue = readCookie(typeof document === 'undefined' ? null : document.cookie, LANGUAGE_COOKIE)
    const migration = migrateLocalePreference({
      cookieValue,
      storedValue: stored,
      serverLocale: resolveDashboardLocale(null, initialLocale),
    })
    if (migration.locale !== language) setLanguage(migration.locale)
    writeLanguageCookie(migration.locale)
    if (migration.writeStorage) {
      try { localStorage.setItem(STORAGE_KEY, migration.locale) } catch { /* ignore */ }
    }
    setIsLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setDashboardLanguage = (lang: Locale) => {
    setLanguage(lang)
    // BOTH stores, always together — a cookie the server reads and the existing
    // localStorage key, so nothing can silently disagree with the next response.
    writeLanguageCookie(lang)
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // ignore quota / privacy mode errors
    }
  }

  return (
    <DashboardLanguageContext.Provider value={{ language, setDashboardLanguage, isLoaded }}>
      {/* The DOCUMENT's own lang/dir follow the switcher. Without this the page
          rendered English text inside a document still declaring lang="he"
          dir="rtl" — a scoped wrapper div cannot change what the document
          declares. */}
      <DocumentLocaleEffect locale={language} />
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

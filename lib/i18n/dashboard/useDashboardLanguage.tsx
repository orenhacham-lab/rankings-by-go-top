'use client'

import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import type { Locale } from '../locales'

const STORAGE_KEY = 'dashboard-language'

type DashboardLanguageContextValue = {
  language: Locale
  setDashboardLanguage: (lang: Locale) => void
  isLoaded: boolean
}

const DashboardLanguageContext = createContext<DashboardLanguageContextValue | null>(null)

export function DashboardLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Locale>('he')
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'he') {
      setLanguage(stored)
    }
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

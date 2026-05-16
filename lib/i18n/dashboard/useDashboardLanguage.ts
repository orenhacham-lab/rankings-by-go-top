'use client'

import { useState, useEffect } from 'react'
import type { Locale } from '../locales'

const STORAGE_KEY = 'dashboard-language'

export function useDashboardLanguage() {
  const [language, setLanguage] = useState<Locale>('he')
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // Initialize from localStorage on mount
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'he') {
      setLanguage(stored)
    }
    setIsLoaded(true)
  }, [])

  const setDashboardLanguage = (lang: Locale) => {
    setLanguage(lang)
    localStorage.setItem(STORAGE_KEY, lang)
  }

  return { language, setDashboardLanguage, isLoaded }
}

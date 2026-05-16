'use client'

import { useEffect } from 'react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'

export function DashboardLocaleEffect() {
  const { language, isLoaded } = useDashboardLanguage()

  useEffect(() => {
    if (!isLoaded) return

    const originalDir = document.documentElement.dir
    const originalLang = document.documentElement.lang

    if (language === 'en') {
      document.documentElement.dir = 'ltr'
      document.documentElement.lang = 'en'
      document.body.dir = 'ltr'
    } else {
      document.documentElement.dir = 'rtl'
      document.documentElement.lang = 'he'
      document.body.dir = 'rtl'
    }

    return () => {
      document.documentElement.dir = originalDir
      document.documentElement.lang = originalLang
    }
  }, [language, isLoaded])

  return null
}

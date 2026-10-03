'use client'

import type { ReactNode } from 'react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getLocaleConfig } from '@/lib/i18n/locales'

// Scoped direction wrapper for the dashboard main content area only.
// IMPORTANT: must NOT mutate html/body direction. The root document stays
// dir="rtl" so the sidebar and global layout are unaffected. This wrapper
// applies an isolated LTR/RTL context to the dashboard content area so
// English UI reads naturally without flipping the surrounding chrome.
//
// It reads uiLocale, not the bilingual language, and takes the direction from
// the locale table rather than from a test for English: the test it used to make
// (`language === 'en' ? 'ltr' : 'rtl'`) answers RTL for every value that is not
// English, so a Spanish dashboard would have been laid out right-to-left.
export function DashboardDirectionWrapper({ children }: { children: ReactNode }) {
  const { uiLocale } = useDashboardLanguage()
  const dir = getLocaleConfig(uiLocale).dir
  return (
    <div dir={dir} data-dashboard-dir={uiLocale}>
      {children}
    </div>
  )
}

'use client'

import type { ReactNode } from 'react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'

// Scoped direction wrapper for the dashboard main content area only.
// IMPORTANT: must NOT mutate html/body direction. The root document stays
// dir="rtl" so the sidebar and global layout are unaffected. This wrapper
// applies an isolated LTR/RTL context to the dashboard content area so
// English UI reads naturally without flipping the surrounding chrome.
export function DashboardDirectionWrapper({ children }: { children: ReactNode }) {
  const { language } = useDashboardLanguage()
  const dir = language === 'en' ? 'ltr' : 'rtl'
  return (
    <div dir={dir} data-dashboard-dir={language}>
      {children}
    </div>
  )
}

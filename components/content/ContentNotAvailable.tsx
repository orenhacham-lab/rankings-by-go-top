'use client'

import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

/** The content workspace's "not available" state, in the dashboard's language. */
export default function ContentNotAvailable() {
  const { language } = useDashboardLanguage()
  return (
    <div className="py-20 text-center text-muted text-copy">
      {getDashboardDictionary(language).common.notAvailable}
    </div>
  )
}

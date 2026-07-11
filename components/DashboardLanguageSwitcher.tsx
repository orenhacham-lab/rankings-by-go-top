'use client'

import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { cn } from '@/lib/utils'

export function DashboardLanguageSwitcher() {
  const { language, setDashboardLanguage, isLoaded } = useDashboardLanguage()

  if (!isLoaded) return null

  return (
    <div className="flex gap-1 px-3 py-2">
      <button
        onClick={() => setDashboardLanguage('he')}
        className={cn(
          'flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors',
          language === 'he'
            ? 'bg-indigo-600 text-white'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
        )}
      >
        עברית
      </button>
      <button
        onClick={() => setDashboardLanguage('en')}
        className={cn(
          'flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors',
          language === 'en'
            ? 'bg-indigo-600 text-white'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
        )}
      >
        EN
      </button>
    </div>
  )
}

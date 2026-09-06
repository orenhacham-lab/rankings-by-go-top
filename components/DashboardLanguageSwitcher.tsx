'use client'

import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { cn } from '@/lib/utils'

/**
 * The switch renders from the FIRST render, in the server-resolved language.
 *
 * It used to return null until `isLoaded` — i.e. until a client effect had run —
 * so the one control that changes the language was missing for the whole of the
 * initial load, exactly when a reader who landed in the wrong language wants it.
 * Nothing here needs hydration: `language` is authoritative from the first
 * render, and the handlers only run on click, which cannot happen earlier.
 */
export function DashboardLanguageSwitcher() {
  const { language, setDashboardLanguage } = useDashboardLanguage()

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

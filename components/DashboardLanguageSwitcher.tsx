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

  // A segmented control: two options on one sunk track, the chosen one lifted
  // onto a white chip. Each option names itself in its own language (lang=…),
  // so a screen reader pronounces "עברית" in Hebrew from an English screen.
  const option = (active: boolean) => cn(
    'h-7 rounded-[calc(var(--radius-control)-2px)] px-2 text-caption font-semibold transition-[background-color,color,box-shadow] duration-150 ease-snappy',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
    active ? 'bg-surface text-ink shadow-control' : 'text-muted hover:text-ink'
  )

  return (
    <div className="grid grid-cols-2 gap-0.5 rounded-control border border-line bg-sunk p-0.5">
      <button
        type="button"
        lang="he"
        aria-pressed={language === 'he'}
        onClick={() => setDashboardLanguage('he')}
        className={option(language === 'he')}
      >
        עברית
      </button>
      <button
        type="button"
        lang="en"
        aria-pressed={language === 'en'}
        onClick={() => setDashboardLanguage('en')}
        className={option(language === 'en')}
      >
        EN
      </button>
    </div>
  )
}

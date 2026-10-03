'use client'

import { useTheme } from 'next-themes'
import { useMemo, useSyncExternalStore } from 'react'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

const noop = () => () => {}

/**
 * The theme as a two-option segmented control: a sun and a moon, the chosen one
 * lifted onto a light chip, each a button that says whether it is pressed.
 *
 * It was one switch labelled with the CURRENT state ("Light mode" while light
 * was on), which read as the action to take: nobody could tell which way it
 * pointed. Two named options cannot be misread. The same track and chip as the
 * language control beside it.
 *
 * The theme is only known in the browser, so the server (and the first client
 * render) draws the track with neither option pressed, in the same size.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const { uiLocale } = useDashboardLanguage()
  const dict = useMemo(() => getDashboardDictionary(uiLocale), [uiLocale])
  const current = mounted ? (resolvedTheme === 'dark' ? 'dark' : 'light') : null

  const option = (active: boolean) => cn(
    'inline-flex h-7 items-center justify-center rounded-[calc(var(--radius-control)-2px)] transition-[background-color,color,box-shadow] duration-150 ease-snappy',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-focus',
    active ? 'bg-rail-ink text-rail shadow-control' : 'text-rail-muted hover:text-rail-ink'
  )

  return (
    <div role="group" aria-label={dict.sidebar.themeLabel} className="grid grid-cols-2 gap-0.5 rounded-control border border-rail-line bg-rail-hover p-0.5">
      <button
        type="button"
        aria-pressed={current === 'light'}
        aria-label={dict.common.lightMode}
        title={dict.common.lightMode}
        onClick={() => setTheme('light')}
        className={option(current === 'light')}
      >
        <Sun size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-pressed={current === 'dark'}
        aria-label={dict.common.darkMode}
        title={dict.common.darkMode}
        onClick={() => setTheme('dark')}
        className={option(current === 'dark')}
      >
        <Moon size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}

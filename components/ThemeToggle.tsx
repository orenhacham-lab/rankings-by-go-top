'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState, useMemo } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const { language } = useDashboardLanguage()
  const dict = useMemo(() => getDashboardDictionary(language), [language])

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-9" />
  }

  const isLight = theme === 'light'

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? 'dark' : 'light')}
      className="w-full flex items-center justify-between gap-3 px-3 h-9 rounded-control text-copy font-medium text-muted transition-colors duration-150 hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-inset"
      aria-label={isLight ? dict.common.switchToDarkMode : dict.common.switchToLightMode}
    >
      <span className="flex items-center gap-3">
        {isLight ? <Sun size={18} strokeWidth={1.8} className="shrink-0" /> : <Moon size={18} strokeWidth={1.8} className="shrink-0" />}
        <span>{isLight ? dict.common.lightMode : dict.common.darkMode}</span>
      </span>
      {/* The switch: the knob travels toward the logical END when dark is on. */}
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${isLight ? 'bg-line-strong' : 'bg-action'}`}
      >
        <span
          className={`absolute top-0.5 start-0.5 size-4 rounded-full bg-white shadow-control transition-transform duration-200 ease-snappy ${
            isLight ? 'translate-x-0' : 'translate-x-4 rtl:-translate-x-4'
          }`}
        />
      </span>
    </button>
  )
}

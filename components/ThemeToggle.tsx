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
    return <div className="h-10" />
  }

  const isLight = theme === 'light'

  return (
    <button
      onClick={() => setTheme(isLight ? 'dark' : 'light')}
      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      aria-label={isLight ? dict.common.switchToDarkMode : dict.common.switchToLightMode}
    >
      <span>{isLight ? dict.common.lightMode : dict.common.darkMode}</span>
      <div className="flex items-center gap-1.5">
        <Sun size={16} className={isLight ? 'text-amber-500' : 'text-slate-600 dark:text-slate-500'} />
        <div className="w-8 h-5 rounded-full bg-slate-300 dark:bg-slate-700 relative transition-colors">
          <div
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 ${
              isLight ? 'left-0.5' : 'right-0.5'
            }`}
          />
        </div>
        <Moon size={16} className={isLight ? 'text-slate-400' : 'text-blue-400'} />
      </div>
    </button>
  )
}

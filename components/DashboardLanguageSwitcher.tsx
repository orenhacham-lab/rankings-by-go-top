'use client'

import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { cn } from '@/lib/utils'
import { spanishSiteEnabled } from '@/lib/i18n/spanish-site'
import { portugueseSiteEnabled } from '@/lib/i18n/portuguese-site'
import type { PublicLocale } from '@/lib/i18n/locales'

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
  const { uiLocale, setDashboardLanguage } = useDashboardLanguage()

  // The languages the dashboard HAS, in the order a reader meets them. Spanish
  // appears only while the Spanish build is on: the flag is the one gate for the
  // whole language, and a switcher that offers a half-translated dashboard is
  // the thing lib/i18n/spanish-site.ts exists to prevent.
  const options: Array<{ locale: PublicLocale; lang: string; label: string }> = [
    { locale: 'he', lang: 'he', label: 'עברית' },
    { locale: 'en', lang: 'en', label: 'EN' },
    ...(spanishSiteEnabled() ? [{ locale: 'es' as PublicLocale, lang: 'es', label: 'ES' }] : []),
    ...(portugueseSiteEnabled() ? [{ locale: 'pt-BR' as PublicLocale, lang: 'pt-BR', label: 'PT' }] : []),
  ]

  // A segmented control on the sidebar's ink: one track, the chosen option
  // lifted onto a light chip. Each option names itself in its own language (lang=…),
  // so a screen reader pronounces "עברית" in Hebrew from an English screen.
  const option = (active: boolean) => cn(
    'h-7 rounded-[calc(var(--radius-control)-2px)] px-2 text-caption font-semibold transition-[background-color,color,box-shadow] duration-150 ease-snappy',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-focus',
    active ? 'bg-rail-ink text-rail shadow-control' : 'text-rail-muted hover:text-rail-ink'
  )

  return (
    <div
      // The track holds as many options as there are languages, so adding one
      // does not need a second class name kept in step with the array.
      className="grid gap-0.5 rounded-control border border-rail-line bg-rail-hover p-0.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.locale}
          type="button"
          lang={o.lang}
          aria-pressed={uiLocale === o.locale}
          onClick={() => setDashboardLanguage(o.locale)}
          className={option(uiLocale === o.locale)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

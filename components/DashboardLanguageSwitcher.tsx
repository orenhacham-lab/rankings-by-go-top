'use client'

import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { cn } from '@/lib/utils'
import { spanishSiteEnabled } from '@/lib/i18n/spanish-site'
import { portugueseSiteEnabled } from '@/lib/i18n/portuguese-site'
import { frenchSiteEnabled } from '@/lib/i18n/french-site'
import { italianSiteEnabled } from '@/lib/i18n/italian-site'
import { LOCALE_SHORT_LABEL, type PublicLocale } from '@/lib/i18n/locales'

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
  const options: Array<{ locale: PublicLocale; lang: string }> = [
    { locale: 'he', lang: 'he' },
    { locale: 'en', lang: 'en' },
    ...(spanishSiteEnabled() ? [{ locale: 'es' as PublicLocale, lang: 'es' }] : []),
    ...(portugueseSiteEnabled() ? [{ locale: 'pt-BR' as PublicLocale, lang: 'pt-BR' }] : []),
    ...(frenchSiteEnabled() ? [{ locale: 'fr' as PublicLocale, lang: 'fr' }] : []),
    ...(italianSiteEnabled() ? [{ locale: 'it' as PublicLocale, lang: 'it' }] : []),
  ]

  // A segmented control on the sidebar's ink: one track, the chosen option
  // lifted onto a light chip. Each option names itself in its own language (lang=…),
  // so a screen reader pronounces "עברית" in Hebrew from an English screen.
  // `min-w-fit` is the whole fix for the sixth language. The track used to be a
  // grid of EQUAL columns, so every chip got a sixth of the rail whatever its
  // word was: measured at 1440×1000 with six languages, each column came to
  // 34.5px while "עברית" needs 39px of content box, and the Hebrew chip — the
  // product's own language — was cut off. A flex row of items that may GROW to
  // share the leftover space but may never SHRINK below their own word keeps
  // every label whole, whatever its length; `flex-wrap` means a seventh
  // language moves to a second line instead of clipping again.
  const option = (active: boolean) => cn(
    'h-7 min-w-fit flex-1 basis-0 rounded-[calc(var(--radius-control)-2px)] px-2 text-caption font-semibold transition-[background-color,color,box-shadow] duration-150 ease-snappy',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-focus',
    active ? 'bg-rail-ink text-rail shadow-control' : 'text-rail-muted hover:text-rail-ink'
  )

  return (
    <div className="flex flex-wrap gap-0.5 rounded-control border border-rail-line bg-rail-hover p-0.5">
      {options.map((o) => (
        <button
          key={o.locale}
          type="button"
          lang={o.lang}
          aria-pressed={uiLocale === o.locale}
          onClick={() => setDashboardLanguage(o.locale)}
          className={option(uiLocale === o.locale)}
        >
          {LOCALE_SHORT_LABEL[o.locale]}
        </button>
      ))}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Languages } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { enabledPublicLocales } from '@/lib/i18n/locales'
import { cn } from '@/lib/utils'

/**
 * The interface language, on the sidebar's rail.
 *
 * IT USED TO BE A CHIP PER LANGUAGE. That worked at two and survived at six
 * (`min-w-fit`, so no label was clipped). At eleven it wrapped to three rows of
 * small chips at the foot of the rail: measured 15.11.2026 on the Hebrew
 * dashboard, where ten of the eleven are noise to the one reader looking at
 * them. It is now the control it should have been — the language it is in,
 * which opens the list — so the rail says one thing and still changes in two
 * clicks.
 *
 * It renders from the FIRST render, in the server-resolved language: it used to
 * return null until a client effect had run, so the one control that changes
 * the language was missing for the whole of the initial load, exactly when a
 * reader who landed in the wrong language wants it. `language` is authoritative
 * from the first render, and the handlers only run on click.
 *
 * The languages offered are the ones whose dashboard EXISTS, from the one gate
 * (enabledPublicLocales): a switcher that offered a half-translated dashboard
 * is what those flags exist to prevent. Each names itself in its own script, so
 * a reader scans for the word they would recognize — and a screen reader
 * pronounces it in that language (`lang=…`).
 */
export function DashboardLanguageSwitcher() {
  const { uiLocale, setDashboardLanguage } = useDashboardLanguage()
  const names = getPublicDictionary(uiLocale).languageSwitcher
  const label = getDashboardDictionary(uiLocale).sidebar.languageLabel
  const locales = enabledPublicLocales()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-language-trigger=""
        className={cn(
          'flex h-9 w-full items-center gap-1.5 rounded-control border border-rail-line bg-rail-hover px-2 text-caption font-semibold text-rail-ink',
          'transition-[background-color,color] duration-150 ease-snappy hover:text-rail-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-focus',
        )}
      >
        <Languages className="size-4 shrink-0 text-rail-muted" aria-hidden="true" />
        <span lang={uiLocale} className="truncate">{names[uiLocale]}</span>
        <ChevronDown
          className={cn('ms-auto size-3.5 shrink-0 text-rail-muted transition-transform duration-150 ease-snappy', open && '-rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        // Above the rail's own rows, and opening UPWARD: this control sits at
        // the foot of the sidebar, where a menu below it would fall off screen.
        <div
          role="menu"
          aria-label={label}
          data-language-menu=""
          className="absolute bottom-full start-0 z-50 mb-2 max-h-[60vh] w-full min-w-[11rem] overflow-auto rounded-card border border-line bg-surface py-1 shadow-pop"
        >
          {locales.map((l) => {
            const current = l === uiLocale
            return (
              <button
                key={l}
                type="button"
                role="menuitem"
                lang={l}
                aria-current={current ? 'true' : undefined}
                onClick={() => { setDashboardLanguage(l); setOpen(false) }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-copy',
                  'transition-colors duration-150 ease-snappy hover:bg-sunk',
                  current ? 'font-semibold text-ink' : 'text-body',
                )}
              >
                <span>{names[l]}</span>
                {current && <Check className="size-4 shrink-0 text-action" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

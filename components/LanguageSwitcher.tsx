'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Check, ChevronDown, Languages } from 'lucide-react'
import { LOCALE_PREFIX, PUBLIC_LOCALES, type PublicLocale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { spanishSiteEnabled } from '@/lib/i18n/spanish-site'
import { portugueseSiteEnabled } from '@/lib/i18n/portuguese-site'
import { cn } from '@/lib/utils'

/**
 * The SAME path in another public locale.
 *
 * The Hebrew tree is canonical and every other locale is its prefix plus that
 * path, so the switch is done in two steps: strip whatever prefix the current
 * URL carries to get the Hebrew path, then apply the target's prefix. Doing it
 * that way is what keeps a three-language switch from needing a rule per pair.
 *
 * A single article is the one exception. `/articles/<slug>` is one article in
 * one language — its slug does not exist in the others — so the switch lands on
 * that locale's article INDEX rather than on a URL that would 404.
 */
export function counterpartPath(pathname: string, from: PublicLocale, to: PublicLocale): string {
  const fromPrefix = LOCALE_PREFIX[from]
  let hebrewPath = pathname
  if (fromPrefix && (pathname === fromPrefix || pathname.startsWith(`${fromPrefix}/`))) {
    hebrewPath = pathname.slice(fromPrefix.length) || '/'
  }
  if (hebrewPath.startsWith('/articles/')) hebrewPath = '/articles'
  if (hebrewPath === '' || hebrewPath === '/') return LOCALE_PREFIX[to] || '/'
  const toPrefix = LOCALE_PREFIX[to]
  return `${toPrefix}${hebrewPath}`
}

/**
 * The locales a visitor may switch to right now. A gated language appears only
 * while its own site is on, so the switcher can never offer a tree that 404s.
 */
export function availableLocales(
  spanishOn = spanishSiteEnabled(),
  portugueseOn = portugueseSiteEnabled(),
): PublicLocale[] {
  return PUBLIC_LOCALES.filter((l) => (l === 'es' ? spanishOn : l === 'pt-BR' ? portugueseOn : true))
}

/**
 * `inverse`: white ink, for the nav while it sits over a navy hero.
 *
 * With two languages this was one link; with three it is a small menu, because a
 * toggle cannot express "and also Spanish". It stays a list of real links, so it
 * works without JavaScript and a middle-click still opens the other language in
 * a new tab — and when only two languages are available it renders as the single
 * link it used to be.
 */
export function LanguageSwitcher({ locale, className, inverse = false }: { locale: PublicLocale; className?: string; inverse?: boolean }) {
  const pathname = usePathname() ?? '/'
  const dict = getPublicDictionary(locale)
  const locales = availableLocales()
  const others = locales.filter((l) => l !== locale)
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

  const trigger = cn(
    'inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-copy font-medium',
    'transition-[background-color,color] duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-4',
    inverse
      ? 'text-contrast-ink/85 hover:bg-white/10 hover:text-contrast-ink focus-visible:ring-white/40'
      : 'text-body hover:bg-sunk hover:text-ink focus-visible:ring-action/20',
    className,
  )

  // Two languages: the original single link, no menu to open.
  if (others.length === 1) {
    const other = others[0]
    return (
      <Link
        href={counterpartPath(pathname, locale, other)}
        hrefLang={other}
        lang={other}
        className={trigger}
        aria-label={dict.languageSwitcher.aria}
      >
        <Languages className={cn('size-4', inverse ? 'text-contrast-ink/70' : 'text-muted')} aria-hidden="true" />
        {dict.languageSwitcher[other]}
      </Link>
    )
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={trigger}
        aria-label={dict.languageSwitcher.aria}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Languages className={cn('size-4', inverse ? 'text-contrast-ink/70' : 'text-muted')} aria-hidden="true" />
        {dict.languageSwitcher[locale]}
        {/* The globe alone read as a label rather than a control: a visitor had no
            reason to think the language could be changed (owner, 5 October 2026).
            The chevron is what says "this opens", and it turns when it is open. */}
        <ChevronDown
          className={cn('size-3.5 transition-transform duration-150 ease-snappy', open && '-rotate-180', inverse ? 'text-contrast-ink/70' : 'text-muted')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={dict.languageSwitcher.aria}
          className="absolute end-0 top-full z-50 mt-2 min-w-[11rem] overflow-hidden rounded-card border border-line bg-surface shadow-pop"
        >
          {locales.map((l) => {
            const current = l === locale
            return (
              <Link
                key={l}
                role="menuitem"
                href={counterpartPath(pathname, locale, l)}
                hrefLang={l}
                lang={l}
                aria-current={current ? 'true' : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center justify-between gap-3 px-4 py-2.5 text-copy',
                  'transition-colors duration-150 ease-snappy hover:bg-sunk',
                  current ? 'font-semibold text-ink' : 'text-body',
                )}
              >
                <span>{dict.languageSwitcher[l]}</span>
                {current && <Check className="size-4 text-action" aria-hidden="true" />}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

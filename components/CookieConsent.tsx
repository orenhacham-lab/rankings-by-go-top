'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { buttonClasses } from '@/components/public/marketing'

/**
 * The privacy notice: ONE element, shaped by the width it has.
 *
 * - Below `md` (where the contact bar is): a slim bottom sheet laid exactly over
 *   the contact bar's strip, one short sentence and the accept button. Like the
 *   bar it keeps the start slot free for the accessibility button that docks
 *   there, with a wider gap than the bar's, so the button never touches the
 *   sentence (w7 P2-10).
 * - From `md`: one slim floating bar centred at the bottom of the window (the
 *   WhatsApp button steps aside while it is open, PublicSiteWidgets). It used to
 *   be a card in a top or bottom corner, where it sat on the English hero
 *   headline and on the free check's first figures (w7 P2-10).
 *
 * While it shows, the page gets bottom padding for whatever it covers (on a
 * phone, only what the sheet needs beyond the contact bar's strip, which the
 * footer already pads for), so nothing on the page ends up under it for good.
 * `onOpenChange` tells the other widgets.
 */
/** From md, the gap kept free under the floating bar (its bottom-5) plus a little air. */
const DESKTOP_GAP_PX = 32

export function CookieConsent({ onOpenChange }: { onOpenChange?: (open: boolean) => void } = {}) {
  const pathname = usePathname()
  const [isVisible, setIsVisible] = useState(false)
  const [isClient, setIsClient] = useState(false)

  const isEnglish = pathname === '/en' || !!pathname?.startsWith('/en/')
  const t = getPublicDictionary(isEnglish ? 'en' : 'he').cookie
  const privacyLink = isEnglish ? '/en/privacy' : '/privacy'

  useEffect(() => {
    setIsClient(true)
    let hasAccepted: string | null = null
    try { hasAccepted = localStorage.getItem('cookie-consent-accepted') } catch { /* storage blocked: ask again */ }
    if (!hasAccepted) {
      setIsVisible(true)
    }
  }, [])

  useEffect(() => {
    onOpenChange?.(isClient && isVisible)
  }, [isClient, isVisible, onOpenChange])

  // Bottom padding while the notice shows: on a phone only what the sheet needs
  // beyond the contact bar's strip (the footer already pads for the bar); from md
  // the floating bar's height and the gap under it.
  const sheetRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const sheet = sheetRef.current
    if (!isClient || !isVisible || !sheet || typeof ResizeObserver === 'undefined') return
    const body = document.body
    const pad = () => {
      const bar = document.querySelector<HTMLElement>('[data-mobile-contact-bar]')
      const barH = bar && bar.offsetParent !== null ? bar.offsetHeight : 0
      const phone = window.matchMedia('(max-width: 767px)').matches
      body.style.paddingBottom = phone ? `${Math.max(0, sheet.offsetHeight - barH)}px` : `${sheet.offsetHeight + DESKTOP_GAP_PX}px`
    }
    pad()
    const ro = new ResizeObserver(pad)
    ro.observe(sheet)
    window.addEventListener('resize', pad)
    return () => { ro.disconnect(); window.removeEventListener('resize', pad); body.style.paddingBottom = '' }
  }, [isClient, isVisible])

  const handleAccept = () => {
    try { localStorage.setItem('cookie-consent-accepted', 'true') } catch { /* storage blocked */ }
    setIsVisible(false)
  }

  if (!isClient || !isVisible) {
    return null
  }

  const privacy = (
    <Link href={privacyLink} className="whitespace-nowrap font-semibold text-action underline underline-offset-2 hover:text-action-hover">
      {t.privacy}
    </Link>
  )

  return (
    <div
      ref={sheetRef}
      dir={isEnglish ? 'ltr' : 'rtl'}
      role="dialog"
      aria-label={t.aria}
      data-cookie-consent
      className={[
        'fixed z-[58] animate-pop-in border-line bg-surface text-start shadow-pop',
        // phone: a slim sheet over the contact bar's strip; a wide start slot stays free for the accessibility button
        'inset-x-0 bottom-0 flex items-center gap-3 rounded-t-card border-t ps-[4.75rem] pe-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]',
        // md+: one slim bar floating at the bottom centre, clear of every headline and first figure
        'md:start-[4.75rem] md:end-6 md:bottom-5 md:mx-auto md:max-w-3xl md:gap-5 md:rounded-card md:border md:px-5 md:py-3.5 lg:inset-x-6',
      ].join(' ')}
    >
      <p className="min-w-0 flex-1 text-caption text-body md:hidden">
        {t.short}
        {isEnglish ? ' ' : ''}
        {privacy}
        {'.'}
      </p>
      <div className="hidden min-w-0 flex-1 md:block">
        <p className="text-copy font-semibold text-ink">{t.title}</p>
        <p className="mt-0.5 text-caption text-body">
          {t.body}
          {isEnglish ? ' ' : ''}
          {privacy}
          {'.'}
        </p>
      </div>
      <button type="button" onClick={handleAccept} className={buttonClasses('primary', 'md', 'shrink-0 md:px-6')}>
        {t.accept}
      </button>
    </div>
  )
}

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
 *   the contact bar's strip, one short sentence and the accept button, so it
 *   covers nothing the page had not already given to the bar. Like the bar, it
 *   keeps the start slot free for the accessibility button that docks there.
 * - From `md`: a card in the bottom end corner, where the WhatsApp button sits
 *   (that button steps aside while the notice is open, PublicSiteWidgets).
 * - From 1400px: the same card in the top end corner under the navigation, in
 *   the empty margin beside the centred hero, clear of the hero's product frame.
 *
 * While the sheet shows on a phone the page gets bottom padding for whatever
 * the sheet needs beyond the contact bar's strip (the footer already pads for
 * the bar), so nothing ends up under it. `onOpenChange` tells the other widgets.
 */
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

  // Bottom padding while the phone sheet shows: only what the sheet needs beyond
  // the contact bar's strip, which the footer already pads for.
  const sheetRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const sheet = sheetRef.current
    if (!isClient || !isVisible || !sheet || typeof ResizeObserver === 'undefined') return
    const body = document.body
    const pad = () => {
      const bar = document.querySelector<HTMLElement>('[data-mobile-contact-bar]')
      const barH = bar && bar.offsetParent !== null ? bar.offsetHeight : 0
      const phone = window.matchMedia('(max-width: 767px)').matches
      body.style.paddingBottom = phone ? `${Math.max(0, sheet.offsetHeight - barH)}px` : ''
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
        // phone: a slim sheet over the contact bar's strip; the start slot stays free for the accessibility button
        'inset-x-0 bottom-0 flex items-center gap-3 rounded-t-card border-t ps-[4.25rem] pe-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]',
        // md+: a card in the bottom end corner, where the WhatsApp button is
        'md:inset-x-auto md:end-6 md:block md:w-[20rem] md:rounded-card md:border md:p-5 md:max-[1399px]:bottom-6',
        // 1400px+: the top end corner, beside the centred hero instead of over its product frame
        'min-[1400px]:bottom-auto min-[1400px]:top-24',
      ].join(' ')}
    >
      <p className="min-w-0 flex-1 text-caption text-body md:hidden">
        {t.short}
        {isEnglish ? ' ' : ''}
        {privacy}
        {'.'}
      </p>
      <div className="hidden md:block">
        <p className="text-copy font-semibold text-ink">{t.title}</p>
        <p className="mt-1 text-caption text-body">
          {t.body}
          {isEnglish ? ' ' : ''}
          {privacy}
          {'.'}
        </p>
      </div>
      <button type="button" onClick={handleAccept} className={buttonClasses('primary', 'md', 'shrink-0 md:mt-3 md:w-full')}>
        {t.accept}
      </button>
    </div>
  )
}

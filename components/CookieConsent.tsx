'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { buttonClasses } from '@/components/public/marketing'

/**
 * The privacy notice: ONE element at every width. On a phone it is a bottom
 * sheet (rounded top, pop shadow) laid over the contact bar until it is
 * accepted; from `sm` up it is a card in the bottom corner where the WhatsApp
 * button sits, which stays hidden while the notice is open (PublicSiteWidgets).
 * `onOpenChange` tells the other widgets so they can make room.
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

  const handleAccept = () => {
    try { localStorage.setItem('cookie-consent-accepted', 'true') } catch { /* storage blocked */ }
    setIsVisible(false)
  }

  if (!isClient || !isVisible) {
    return null
  }

  return (
    <div
      dir={isEnglish ? 'ltr' : 'rtl'}
      role="dialog"
      aria-label={t.aria}
      data-cookie-consent
      className={[
        'fixed z-[58] animate-pop-in border-line bg-surface text-start shadow-pop',
        // phone: a bottom sheet over the contact bar
        'inset-x-0 bottom-0 rounded-t-card border-t px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]',
        // sm+: a card in the end corner, where the WhatsApp button is
        'sm:inset-x-auto sm:bottom-6 sm:end-6 sm:w-[22rem] sm:rounded-card sm:border sm:p-5',
      ].join(' ')}
    >
      <p className="text-copy font-semibold text-ink">{t.title}</p>
      <p className="mt-1 text-caption text-body">
        {t.body}
        {isEnglish ? ' ' : ''}
        <Link href={privacyLink} className="font-semibold text-action underline underline-offset-2 hover:text-action-hover">
          {t.privacy}
        </Link>
        {'.'}
      </p>
      <button type="button" onClick={handleAccept} className={buttonClasses('primary', 'md', 'mt-3 w-full')}>
        {t.accept}
      </button>
    </div>
  )
}

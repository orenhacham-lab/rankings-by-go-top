'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Cookie } from 'lucide-react'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

/**
 * The privacy notice: the small popup at the left side (w9: back to the original
 * shape from before the redesign, the owner's ask). One compact card anchored to
 * the physical left in both languages: from `sm` a 340px card at the bottom-left
 * corner, on a phone a 240px card lifted above the contact bar. It never spans
 * the page, so it needs no bottom padding. The WhatsApp button, which also sits
 * at the bottom-left, steps aside while it is open (PublicSiteWidgets), and
 * `onOpenChange` tells the other widgets.
 *
 * Consent logic and storage are untouched: the key `cookie-consent-accepted` in
 * localStorage, shown again when storage is blocked.
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

  const privacy = (
    <Link href={privacyLink} className="font-medium text-rail-tagline underline underline-offset-2 hover:text-contrast-ink">
      {t.privacy}
    </Link>
  )

  return (
    <div dir={isEnglish ? 'ltr' : 'rtl'} role="dialog" aria-label={t.aria} data-cookie-consent>
      {/* Phone: ultra compact, 240px, no title, lifted above the contact bar */}
      <div
        data-cookie-compact
        className="fixed left-3.5 z-[58] flex w-[240px] max-w-[calc(100vw-1.75rem)] flex-col items-stretch rounded-card border border-white/10 bg-contrast px-2.5 pb-2 pt-1.5 shadow-pop animate-pop-in sm:hidden"
        style={{ bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' }}
      >
        <p className="m-0 text-center text-caption leading-tight text-contrast-ink/80">
          {t.short}
          {isEnglish ? ' ' : ''}
          {privacy}
          {'.'}
        </p>
        <button
          type="button"
          onClick={handleAccept}
          className="mt-1.5 h-[26px] w-full rounded-control bg-action px-2 text-overline font-bold text-action-ink transition-colors hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
        >
          {t.accept}
        </button>
      </div>

      {/* From sm: compact but readable, 340px, at the bottom-left corner */}
      <div className="fixed bottom-6 left-6 z-[58] hidden w-[340px] max-w-[340px] rounded-card border border-white/10 bg-contrast px-4 py-3.5 shadow-pop animate-pop-in sm:block">
        <div className="flex items-start gap-2.5">
          <div className="flex size-[30px] shrink-0 items-center justify-center rounded-pill bg-white/10 text-contrast-ink" aria-hidden="true">
            <Cookie className="size-4" />
          </div>
          <div className="flex-1">
            <h2 className="m-0 text-lead font-bold leading-tight text-contrast-ink">{t.title}</h2>
            <p className="m-0 mt-1 text-caption leading-snug text-contrast-ink/80">
              {t.body}
              {isEnglish ? ' ' : ''}
              {privacy}
              {'.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleAccept}
          className="mt-2.5 h-9 w-full rounded-control bg-action text-copy font-bold text-action-ink transition-colors hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
        >
          {t.accept}
        </button>
      </div>
    </div>
  )
}

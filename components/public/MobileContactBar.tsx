'use client'

import { usePathname } from 'next/navigation'
import { Phone } from 'lucide-react'
import WhatsAppGlyph from '@/components/brand/WhatsAppGlyph'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { buttonClasses } from './marketing'
import { whatsappHelpUrl, PHONE_TEL } from './contact'

/**
 * Sticky bottom contact bar — public site only, mobile.
 *
 * Two actions on a paper strip fixed to the bottom of the viewport on small
 * screens: WhatsApp (a bordered button, the glyph in WhatsApp green) and Call
 * (the one primary). Hidden from `md` upward, where the floating WhatsApp
 * button takes over. The start slot of the strip stays free: the accessibility
 * button docks there (AccessibilityWidget). The privacy notice, while open, is
 * a sheet laid over this bar that keeps the same slot free (CookieConsent).
 *
 * Labels follow the active locale, inferred from the `/en` route prefix.
 */
export function MobileContactBar() {
  const pathname = usePathname()
  const isEn = pathname === '/en' || !!pathname?.startsWith('/en/')
  const t = getPublicDictionary(isEn ? 'en' : 'he').contact

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[55] flex border-t border-line bg-canvas/95 backdrop-blur-md md:hidden"
      role="region"
      aria-label={t.region}
      data-mobile-contact-bar
      data-public-float
    >
      <div className="flex w-full items-stretch gap-2 ps-[4.25rem] pe-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        <a
          href={whatsappHelpUrl(t.whatsappMessage)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.whatsappAria}
          className={buttonClasses('secondary', 'lg', 'flex-1')}
        >
          <WhatsAppGlyph size={18} className="text-whatsapp" />
          {t.whatsapp}
        </a>
        <a href={PHONE_TEL} aria-label={t.callAria} className={buttonClasses('primary', 'lg', 'flex-1')}>
          <Phone className="size-4" aria-hidden="true" />
          {t.call}
        </a>
      </div>
    </div>
  )
}

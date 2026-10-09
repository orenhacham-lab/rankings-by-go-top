'use client'

import { usePathname } from 'next/navigation'
import { MonitorPlay, Phone } from 'lucide-react'
import WhatsAppGlyph from '@/components/brand/WhatsAppGlyph'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { publicUiLocale } from '@/lib/i18n/request-locale'
import { buttonClasses } from './marketing'
import { whatsappHelpUrl, PHONE_TEL } from './contact'

/**
 * Sticky bottom contact bar — public site only, mobile.
 *
 * Three actions on a paper strip fixed to the bottom of the viewport on small
 * screens: WhatsApp and Call keep their glyphs only, and "free demo" (w11) is
 * the one primary and the only one that carries words. On a phone this is where
 * the demo offer lives, because DemoFloat's pill would land on the privacy
 * sheet (CookieConsent's compact card sits at left-3.5, bottom 76px). Hidden
 * from `md` upward, where the floating WhatsApp button and DemoFloat take over.
 * The start slot of the strip stays free: the accessibility button docks there
 * (AccessibilityWidget). The privacy notice, while open, is a sheet laid over
 * this bar that keeps the same slot free (CookieConsent).
 *
 * Labels follow the active locale, inferred from the `/en` route prefix.
 */
export function MobileContactBar() {
  const pathname = usePathname()
  const locale = publicUiLocale(pathname)
  const t = getPublicDictionary(locale).contact

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
          className={buttonClasses('secondary', 'lg', 'shrink-0 px-0 w-11')}
        >
          <WhatsAppGlyph size={18} className="text-whatsapp" />
        </a>
        <a href={PHONE_TEL} aria-label={t.callAria} className={buttonClasses('secondary', 'lg', 'shrink-0 px-0 w-11')}>
          <Phone className="size-4" aria-hidden="true" />
        </a>
        <a
          href={whatsappHelpUrl(t.demoMessage)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.demoAria}
          data-mobile-demo
          className={buttonClasses('primary', 'lg', 'min-w-0 flex-1')}
        >
          <MonitorPlay className="size-4 shrink-0" aria-hidden="true" />
          {t.demo}
        </a>
      </div>
    </div>
  )
}

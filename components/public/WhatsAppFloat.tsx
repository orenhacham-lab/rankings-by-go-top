'use client'

import { usePathname } from 'next/navigation'
import WhatsAppGlyph from '@/components/brand/WhatsAppGlyph'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { cn } from '@/lib/utils'
import { whatsappHelpUrl } from './contact'

/**
 * Floating WhatsApp button — public site only, from `md` up.
 *
 * On mobile the WhatsApp action lives inside <MobileContactBar /> instead, so
 * this button is hidden below the `md` breakpoint. It sits in the end corner and
 * the accessibility button in the start corner. It is always visible: the privacy
 * notice sits beside it, not over it (CookieConsent). A white surface with the
 * glyph in WhatsApp green: no pulse ring, no hover growth.
 */
export function WhatsAppFloat() {
  const pathname = usePathname()
  const isEn = pathname === '/en' || !!pathname?.startsWith('/en/')
  const t = getPublicDictionary(isEn ? 'en' : 'he').contact
  return (
    <a
      href={whatsappHelpUrl(t.whatsappMessage)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.whatsappAria}
      title={t.whatsappTitle}
      data-whatsapp-float
      data-public-float
      className={cn(
        'fixed bottom-6 end-6 z-[60] hidden size-14 items-center justify-center rounded-pill border border-line bg-surface text-whatsapp shadow-pop md:flex',
        'transition-[border-color,background-color] duration-150 ease-snappy hover:border-line-strong hover:bg-sunk',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20',
      )}
    >
      <WhatsAppGlyph size={28} />
    </a>
  )
}

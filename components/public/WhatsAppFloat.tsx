'use client'

import { usePathname } from 'next/navigation'
import WhatsAppGlyph from '@/components/brand/WhatsAppGlyph'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { cn } from '@/lib/utils'
import { WHATSAPP_HELP_URL } from './contact'

/**
 * Floating WhatsApp button — public site only, from `md` up.
 *
 * On mobile the WhatsApp action lives inside <MobileContactBar /> instead, so
 * this button is hidden below the `md` breakpoint. It sits in the end corner,
 * the accessibility button in the start corner, and it steps aside (`hidden`)
 * while the privacy notice occupies the same corner. A white surface with the
 * glyph in WhatsApp green: no pulse ring, no hover growth.
 */
export function WhatsAppFloat({ hidden = false }: { hidden?: boolean } = {}) {
  const pathname = usePathname()
  const isEn = pathname === '/en' || !!pathname?.startsWith('/en/')
  const t = getPublicDictionary(isEn ? 'en' : 'he').contact
  if (hidden) return null
  return (
    <a
      href={WHATSAPP_HELP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.whatsappAria}
      title={t.whatsappTitle}
      data-whatsapp-float
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

'use client'

import { WHATSAPP_HELP_URL, PHONE_TEL } from './contact'

/**
 * Sticky bottom contact bar — public site only, mobile.
 *
 * Renders a two-button CTA (WhatsApp + Call) fixed to the bottom of the
 * viewport on small screens. Hidden from `md` upward, where the floating
 * WhatsApp button takes over. The bar reserves ~68px; the cookie banner
 * offsets above it on mobile so the two never overlap.
 */
export function MobileContactBar() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[55] flex md:hidden"
      role="region"
      aria-label="אזור יצירת קשר"
    >
      <div className="flex w-full items-stretch gap-3 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <a
          href={WHATSAPP_HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="פנייה אלינו בוואטסאפ"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-sm font-bold text-[#062B16] shadow-sm transition-colors active:scale-[0.98] hover:bg-[#20bd5a]"
        >
          <svg viewBox="0 0 32 32" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16c0 3.5 1.13 6.744 3.05 9.38L1.05 31.3l6.116-1.956A15.9 15.9 0 0 0 16.004 32C24.826 32 32 24.822 32 16S24.826 0 16.004 0Zm9.31 22.594c-.386 1.09-1.92 1.994-3.142 2.258-.836.178-1.928.32-5.604-1.204-4.7-1.948-7.726-6.724-7.962-7.034-.226-.31-1.9-2.53-1.9-4.826 0-2.296 1.166-3.424 1.636-3.904.386-.394.846-.574 1.13-.574.346 0 .69.004.99.018.318.014.744-.12 1.164.888.43 1.03 1.46 3.566 1.586 3.826.128.26.214.566.04.876-.166.31-.25.502-.49.772-.246.27-.518.604-.74.81-.246.226-.502.472-.216.962.286.49 1.27 2.094 2.726 3.392 1.872 1.668 3.45 2.184 3.94 2.43.49.246.776.206 1.062-.124.286-.33 1.226-1.43 1.554-1.922.328-.49.656-.41 1.106-.246.45.164 2.86 1.35 3.35 1.594.49.246.816.366.94.572.122.206.122 1.196-.264 2.286Z" />
          </svg>
          וואטסאפ
        </a>
        <a
          href={PHONE_TEL}
          aria-label="התקשרו אלינו"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-sm transition-colors active:scale-[0.98] hover:bg-blue-700"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M6.62 10.79a15.46 15.46 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.24 1.02l-2.2 2.2Z" />
          </svg>
          התקשרו
        </a>
      </div>
    </div>
  )
}

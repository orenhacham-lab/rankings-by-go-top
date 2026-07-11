'use client'

import { WHATSAPP_HELP_URL } from './contact'

/**
 * Floating WhatsApp button — public site only, desktop/tablet.
 *
 * On mobile the WhatsApp action lives inside <MobileContactBar /> instead, so
 * this button is hidden below the `md` breakpoint to avoid a detached element
 * overlapping the sticky bottom CTA.
 */
export function WhatsAppFloat() {
  return (
    <a
      href={WHATSAPP_HELP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="פנייה אלינו בוואטסאפ"
      title="דברו איתנו בוואטסאפ"
      className="group fixed bottom-6 right-6 z-[60] hidden h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-emerald-600/30 ring-1 ring-black/5 transition-transform duration-200 hover:scale-110 hover:bg-[#1ebe57] focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 md:flex"
    >
      {/* Soft pulse ring */}
      <span className="absolute inset-0 -z-10 rounded-full bg-[#25D366] opacity-60 motion-safe:animate-ping" />
      <svg
        viewBox="0 0 32 32"
        className="h-7 w-7 fill-current"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16c0 3.5 1.13 6.744 3.05 9.38L1.05 31.3l6.116-1.956A15.9 15.9 0 0 0 16.004 32C24.826 32 32 24.822 32 16S24.826 0 16.004 0Zm9.31 22.594c-.386 1.09-1.92 1.994-3.142 2.258-.836.178-1.928.32-5.604-1.204-4.7-1.948-7.726-6.724-7.962-7.034-.226-.31-1.9-2.53-1.9-4.826 0-2.296 1.166-3.424 1.636-3.904.386-.394.846-.574 1.13-.574.346 0 .69.004.99.018.318.014.744-.12 1.164.888.43 1.03 1.46 3.566 1.586 3.826.128.26.214.566.04.876-.166.31-.25.502-.49.772-.246.27-.518.604-.74.81-.246.226-.502.472-.216.962.286.49 1.27 2.094 2.726 3.392 1.872 1.668 3.45 2.184 3.94 2.43.49.246.776.206 1.062-.124.286-.33 1.226-1.43 1.554-1.922.328-.49.656-.41 1.106-.246.45.164 2.86 1.35 3.35 1.594.49.246.816.366.94.572.122.206.122 1.196-.264 2.286Z" />
      </svg>
    </a>
  )
}

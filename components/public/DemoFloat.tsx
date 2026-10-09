'use client'

/**
 * THE FLOATING "FREE DEMO" BUTTON (w11).
 *
 * A labelled cobalt pill that opens WhatsApp with a demo request already
 * written. It is a sales offer, which is why it carries words and the brand
 * colour, while the round white WhatsAppFloat under it stays what it is — a
 * support button with a different prefilled message. The two sit as one stack
 * in the same corner so the pair reads as deliberate.
 *
 * Geometry (public site), measured against everything else that floats:
 *   WhatsAppFloat          end-6,  bottom-6  (56px tall), z-[60], md and up
 *   AccessibilityWidget    start-4, md:bottom-24,          z-[60]
 *   CookieConsent desktop  left-24, bottom-6,              z-[58]
 *   MobileContactBar       the whole bottom strip,         z-[55]
 * So this takes end-6 / bottom-24 — directly above the WhatsApp circle, with a
 * 1rem gap — at z-[59]: under the two buttons that must always be reachable,
 * over the cookie card. Like WhatsAppFloat it is md and up; on a phone the demo
 * is the primary action of MobileContactBar instead, because a floating pill
 * there would sit on the cookie sheet (left-3.5, bottom 76px).
 *
 * Motion is the global `.float-y` loop plus a `.dot-ping` dot (app/globals.css),
 * both of which exist only inside `prefers-reduced-motion: no-preference`.
 *
 * `href` is passed in rather than built here: the public site asks for help in
 * general, the dashboard names the customer's own site, and neither spelling
 * belongs in this component.
 */
import { usePathname } from 'next/navigation'
import { MonitorPlay } from 'lucide-react'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { publicUiLocale } from '@/lib/i18n/request-locale'
import { cn } from '@/lib/utils'
import { whatsappHelpUrl } from './contact'

export function DemoFloat({
  href, label, ariaLabel, className, tone = 'public',
}: {
  href: string
  label: string
  ariaLabel: string
  className?: string
  /** `public` floats above the WhatsApp circle on md+; `app` owns the corner on every size. */
  tone?: 'public' | 'app'
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      data-demo-float
      data-public-float
      className={cn(
        'float-y fixed z-[59] items-center gap-2 rounded-pill bg-action px-4 py-3 text-copy font-bold text-action-ink shadow-pop',
        'transition-[background-color,box-shadow] duration-150 ease-snappy hover:bg-action-hover',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/30',
        tone === 'public' ? 'end-6 bottom-24 hidden md:flex' : 'end-6 bottom-6 flex',
        className,
      )}
    >
      <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
        <span className="dot-ping absolute inline-flex size-full rounded-pill bg-action-ink/70" />
        <span className="relative inline-flex size-2.5 rounded-pill bg-action-ink" />
      </span>
      <MonitorPlay className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </a>
  )
}

/**
 * The public site's instance: the locale comes from the route prefix, exactly as
 * WhatsAppFloat and MobileContactBar read it, and the WhatsApp message is the
 * dictionary's own, never a string typed in here.
 */
export function PublicDemoFloat() {
  const locale = publicUiLocale(usePathname())
  const t = getPublicDictionary(locale).contact
  return <DemoFloat href={whatsappHelpUrl(t.demoMessage)} label={t.demo} ariaLabel={t.demoAria} tone="public" />
}

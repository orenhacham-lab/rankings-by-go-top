'use client'

/**
 * "צרו קשר" / "Contact" (wave 8, UX decision C): the public nav's last text
 * item, a small disclosure menu with the three channels the site already uses
 * (components/public/contact.ts): WhatsApp, the phone and the email.
 *
 *   ContactMenu  the nav's button and its popover (click or Enter/Space opens
 *                it; Escape, a click outside or focus leaving closes it and
 *                Escape returns focus to the button);
 *   ContactRows  the same three rows as a plain list, for the mobile menu.
 *
 * The floating WhatsApp button and the phone contact bar stay as they are.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Mail, Phone } from 'lucide-react'
import WhatsAppGlyph from '@/components/brand/WhatsAppGlyph'
import type { Locale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { cn } from '@/lib/utils'
import { contactChannels, type ContactChannel } from './contact'

function ChannelIcon({ id }: { id: ContactChannel['id'] }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-inset',
        id === 'whatsapp' ? 'bg-ok-soft text-whatsapp' : 'bg-action-soft text-action',
      )}
    >
      {id === 'whatsapp' ? <WhatsAppGlyph size={18} /> : id === 'phone' ? <Phone className="size-4" /> : <Mail className="size-4" />}
    </span>
  )
}

export function ContactRows({ locale, onPick, className }: { locale: Locale; onPick?: () => void; className?: string }) {
  const t = getPublicDictionary(locale).contact
  return (
    <ul className={cn('flex flex-col gap-0.5', className)} data-contact-rows>
      {contactChannels(t).map((c) => (
        <li key={c.id}>
          <a
            href={c.href}
            {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            onClick={onPick}
            data-contact-channel={c.id}
            className="flex items-center gap-3 rounded-inset p-2.5 transition-[background-color] duration-150 ease-snappy hover:bg-sunk focus-visible:bg-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
          >
            <ChannelIcon id={c.id} />
            <span className="min-w-0">
              <span className="block text-copy font-semibold text-ink">{c.label}</span>
              {c.value && <span dir="ltr" className="block text-caption tabular-nums text-muted">{c.value}</span>}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

export function ContactMenu({ locale, linkClassName }: { locale: Locale; linkClassName: string }) {
  const dict = getPublicDictionary(locale)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (open && rootRef.current && !rootRef.current.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
      data-contact-menu
    >
      <button
        ref={buttonRef}
        type="button"
        className={linkClassName}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        {dict.nav.contact}
        <ChevronDown className={cn('size-4 transition-transform duration-150 ease-snappy', open && 'rotate-180')} aria-hidden="true" />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute end-0 top-full z-50 pt-2"
      >
        <div className="w-72 animate-pop-in rounded-card border border-line bg-surface p-2 text-start shadow-pop">
          <ContactRows locale={locale} onPick={() => setOpen(false)} />
        </div>
      </div>
    </div>
  )
}

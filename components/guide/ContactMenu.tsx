'use client'

/**
 * "צרו קשר" / "Contact us": a named contact entry in the top bar (wave 8, UX C),
 * between the project switcher and the Guide pill, in the Guide pill's style with
 * the WhatsApp glyph; icon-only on a phone. It opens a small menu (GuideMenu's
 * popover pattern) with three rows:
 *   1. WhatsApp, with a message that names the site on screen;
 *   2. the phone, as tel:;
 *   3. the email, as mailto:;
 * No opening hours are shown (the owner has not confirmed any). The number and the address are the ones every other contact
 * entry uses (components/public/contact.ts). Admins do not see it (the layout
 * mounts it for customers only, as the rail's support row).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Mail, Phone } from 'lucide-react'
import WhatsAppGlyph from '@/components/brand/WhatsAppGlyph'
import { EMAIL, EMAIL_HREF, PHONE_DISPLAY, PHONE_TEL, whatsappHelpUrl } from '@/components/public/contact'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { cn } from '@/lib/utils'

export default function ContactMenu() {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).contact
  const { activeProjectId, projects } = useActiveProject()
  const domain = projects.find((p) => p.id === activeProjectId)?.target_domain?.trim() ?? ''
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // Close on an outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Opening moves focus to the first row.
  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
  }, [open])

  const closeToPill = () => { setOpen(false); pillRef.current?.focus({ preventScroll: true }) }

  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeToPill(); return }
    if (e.key === 'Tab') { e.preventDefault(); closeToPill(); return }
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const at = items.indexOf(document.activeElement as HTMLElement)
    const move = (i: number) => { e.preventDefault(); items[(i + items.length) % items.length]?.focus() }
    if (e.key === 'ArrowDown') move(at + 1)
    else if (e.key === 'ArrowUp') move(at - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(items.length - 1)
  }

  const ITEM = 'group flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-start text-copy text-body transition-colors duration-150 hover:bg-sunk hover:text-ink focus-visible:bg-sunk focus-visible:text-ink focus-visible:outline-none'
  const rows = [
    { key: 'whatsapp', href: whatsappHelpUrl(t.whatsappMessage(domain)), label: t.whatsapp, icon: <WhatsAppGlyph size={16} className="shrink-0 text-muted transition-colors duration-150 group-hover:text-whatsapp group-focus-visible:text-whatsapp" />, external: true },
    { key: 'phone', href: PHONE_TEL, label: t.phone(PHONE_DISPLAY), icon: <Phone size={16} className="shrink-0 text-muted" aria-hidden="true" />, external: false },
    { key: 'email', href: EMAIL_HREF, label: t.email(EMAIL), icon: <Mail size={16} className="shrink-0 text-muted" aria-hidden="true" />, external: false },
  ]

  return (
    <div ref={boxRef} className="sm:relative">
      <button
        ref={pillRef}
        type="button"
        data-contact-pill=""
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true) } }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t.label}
        className={cn(
          'relative inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-pill bg-action-soft text-caption font-semibold text-action',
          'sm:size-auto sm:h-8 sm:px-3',
          'transition-colors duration-150 hover:bg-action hover:text-action-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          open && 'bg-action text-action-ink',
        )}
      >
        <WhatsAppGlyph size={16} />
        <span className="hidden sm:inline">{t.label}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={t.menuLabel}
          onKeyDown={onPanelKey}
          data-contact-menu=""
          className={cn(
            'absolute inset-x-4 top-full z-50 mt-1 origin-top overflow-hidden rounded-card border border-line bg-surface p-1 shadow-pop motion-safe:animate-pop-in',
            'sm:inset-x-auto sm:start-0 sm:mt-2 sm:w-[280px]',
          )}
        >
          {rows.map((r) => (
            <a
              key={r.key}
              role="menuitem"
              href={r.href}
              data-contact-row={r.key}
              {...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              onClick={() => setOpen(false)}
              className={ITEM}
            >
              {r.icon}
              <span className="min-w-0 flex-1"><bdi>{r.label}</bdi></span>
              {r.external && <span className="sr-only">{t.opensNewTab}</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

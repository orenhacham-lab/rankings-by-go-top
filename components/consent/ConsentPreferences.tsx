'use client'

/**
 * THE PREFERENCES DIALOG — where a visitor allows or refuses each category.
 *
 * It lives in its own file, not inside components/CookieConsent.tsx, because
 * that file's exact layout classes are pinned by the overlay guards (the
 * owner's rule that the WhatsApp button is never covered). The dialog is a
 * centred modal instead of more content inside the 240px phone card: three
 * categories with their explanations do not fit beside a button, and a
 * description a visitor cannot read is not informed consent.
 *
 * Accessibility, because this is a dialog that traps the page:
 *  - role="dialog" aria-modal with a labelled title, focus moved in on open
 *    and returned to the trigger on close;
 *  - Escape closes it WITHOUT saving (closing is not a decision);
 *  - Tab is cycled inside it, so a keyboard user cannot land behind the veil;
 *  - the necessary toggle is rendered disabled and checked rather than hidden,
 *    so the visitor can see what runs regardless of what they choose.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { CONSENT_CATEGORIES, type ConsentCategory, type ConsentChoices } from '@/lib/consent/categories'
import type { PublicDictionary } from '@/lib/i18n/getPublicDictionary'

type Props = {
  dict: PublicDictionary['cookie']
  isEnglish: boolean
  initial: ConsentChoices
  onSave: (choices: ConsentChoices) => void
  onClose: () => void
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function ConsentPreferences({ dict, isEnglish, initial, onSave, onClose }: Props) {
  const [choices, setChoices] = useState<ConsentChoices>(initial)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const introId = useId()

  // Focus the dialog on open and hand focus back to whatever opened it on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => opener?.focus?.()
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    },
    [onClose]
  )

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-scrim p-3 sm:items-center sm:p-6"
      dir={isEnglish ? 'ltr' : 'rtl'}
      data-consent-veil
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={introId}
        onKeyDown={onKeyDown}
        data-consent-preferences
        className="max-h-[85vh] w-full max-w-[32rem] overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-pop animate-pop-in"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="m-0 text-title font-bold text-ink">{dict.settingsTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.back}
            className="-me-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-sunk hover:text-ink focus:outline-none focus-visible:ring-4 focus-visible:ring-action/30"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p id={introId} className="m-0 mt-1.5 text-copy leading-snug text-muted">{dict.settingsIntro}</p>

        <ul className="m-0 mt-4 list-none space-y-3 p-0">
          {CONSENT_CATEGORIES.map((category: ConsentCategory) => {
            const copy = dict.categories[category]
            const locked = category === 'necessary'
            const checked = locked ? true : choices[category]
            return (
              <li key={category} className="rounded-card border border-line bg-canvas p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="m-0 text-lead font-bold text-ink">{copy.title}</h3>
                    <p className="m-0 mt-1 text-caption leading-snug text-muted">{copy.desc}</p>
                  </div>
                  <label className="flex shrink-0 cursor-pointer flex-col items-center gap-1 pt-0.5">
                    <input
                      type="checkbox"
                      className="size-5 cursor-pointer accent-action focus:outline-none focus-visible:ring-4 focus-visible:ring-action/30 disabled:cursor-default"
                      checked={checked}
                      disabled={locked}
                      aria-label={copy.title}
                      onChange={(e) => setChoices((prev) => ({ ...prev, [category]: e.target.checked }))}
                    />
                    {locked ? <span className="text-overline font-bold uppercase text-muted">{dict.always}</span> : null}
                  </label>
                </div>
              </li>
            )
          })}
        </ul>

        {/* Art. 7(3): the right to withdraw, stated where consent is given, and
            as easy to use as giving it — the same dialog, from every page. */}
        <p className="m-0 mt-3.5 text-caption leading-snug text-muted">{dict.withdrawHint}</p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={() => onSave(choices)}
            className="h-10 flex-1 rounded-control bg-action px-4 text-copy font-bold text-action-ink transition-colors hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-action/30"
          >
            {dict.save}
          </button>
          <button
            type="button"
            onClick={() => onSave({ necessary: true, analytics: false, marketing: false })}
            className="h-10 flex-1 rounded-control border border-line bg-surface px-4 text-copy font-bold text-ink transition-colors hover:bg-sunk focus:outline-none focus-visible:ring-4 focus-visible:ring-action/30"
          >
            {dict.rejectAll}
          </button>
        </div>
      </div>
    </div>
  )
}

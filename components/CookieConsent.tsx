'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Cookie } from 'lucide-react'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { publicUiLocale } from '@/lib/i18n/request-locale'
import { getLocaleConfig } from '@/lib/i18n/locales'
import {
  CONSENT_DENIED,
  CONSENT_GRANTED,
  actionForChoices,
  type ConsentAction,
  type ConsentChoices,
} from '@/lib/consent/categories'
import {
  CONSENT_CHANGED_EVENT,
  clearLegacyConsent,
  globalPrivacyControl,
  readConsent,
  writeConsent,
} from '@/lib/consent/client-store'
import { reportConsent } from '@/lib/consent/report'
import { ConsentPreferences } from '@/components/consent/ConsentPreferences'

/**
 * The privacy notice: the small popup at the left side (w9: back to the original
 * shape from before the redesign, the owner's ask). One compact card anchored to
 * the physical left in both languages: from `sm` a 340px card at the bottom-left
 * corner, on a phone a 240px card lifted above the contact bar. It never spans
 * the page, so it needs no bottom padding. The WhatsApp button, which also sits
 * at the bottom-left in Hebrew, is NEVER covered or hidden by it (wave 10): from `sm`
 * the card is offset past the button's 6rem slot (left-24), so it clears the WhatsApp
 * button at the bottom-left (Hebrew) and the accessibility button at the left (English);
 * on a phone the WhatsApp action is in the contact bar the card sits above.
 * `onOpenChange` tells the other widgets.
 *
 * WHAT CHANGED, AND WHY — the shape above is the owner's and is untouched; the
 * CONSENT is new. Until now the card offered one button, "Accept", over the
 * sentence "continuing to use the site means you agree", and it decided nothing:
 * Google Tag Manager was loaded from the root layout on every page regardless.
 * Three separate problems with that, all of them in law rather than in taste:
 *
 *   1. ePrivacy Art. 5(3), as read in Planet49 (CJEU C-673/17), requires consent
 *      BEFORE non-essential storage. Loading the tag first makes any later click
 *      decorative. Tags now load only after a decision allows them
 *      (components/consent/GoogleTags.tsx).
 *   2. GDPR Art. 4(11) + 7(3) and the EDPB's cookie-banner findings require a
 *      refusal that is as easy as agreement. "Reject all" is now a button of the
 *      same size, weight and prominence as "Accept all", side by side — not a
 *      link, not one level down, not greyed.
 *   3. Continued browsing is not an affirmative act, so that sentence is gone.
 *
 * The decision is stored under a NEW key, and the old `cookie-consent-accepted`
 * flag is deliberately not honoured as a grant (see lib/consent/client-store.ts):
 * a click collected under an invalid notice cannot be carried forward, so every
 * returning visitor is asked once, properly.
 *
 * Global Privacy Control: if the browser sends it, nothing optional is loaded
 * and the refusal is recorded without a banner — the visitor has already
 * answered, and asking again would be asking them to repeat themselves.
 */
export function CookieConsent({ onOpenChange }: { onOpenChange?: (open: boolean) => void } = {}) {
  const pathname = usePathname()
  const [isVisible, setIsVisible] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [choices, setChoices] = useState<ConsentChoices>(CONSENT_DENIED)

  // Three public languages, not two: the notice has to speak the language of
  // the page it interrupts, and the decision has to be logged under it
  // (CONSENT_LOCALES already lists 'es'). Where the old flag was really asking
  // about writing direction rather than about English, `ltr` now answers.
  const locale = publicUiLocale(pathname)
  const ltr = getLocaleConfig(locale).dir === 'ltr'
  const t = getPublicDictionary(locale).cookie
  const privacyLink = locale === 'he' ? '/privacy' : `/${locale}/privacy`

  useEffect(() => {
    setIsClient(true)
    clearLegacyConsent()
    const existing = readConsent()
    if (existing) {
      setChoices(existing.categories)
      return
    }
    if (globalPrivacyControl()) {
      // An opt-out signal the visitor already sent. Honour it, record it, and
      // do not interrupt them with a question they have answered.
      const record = writeConsent('gpc', CONSENT_DENIED)
      setChoices(record.categories)
      reportConsent(record, locale)
      return
    }
    setIsVisible(true)
  }, [locale])

  // The footer's "Cookie settings" link, and anything else on the page, opens
  // the dialog through one window event, so a visitor can withdraw from any
  // page without the banner having to still be on screen (Art. 7(3)).
  useEffect(() => {
    const open = () => setPanelOpen(true)
    window.addEventListener('gotop:open-consent-settings', open)
    return () => window.removeEventListener('gotop:open-consent-settings', open)
  }, [])

  // One source of truth when more than one mount exists on a page.
  useEffect(() => {
    const sync = () => setChoices(readConsent()?.categories ?? CONSENT_DENIED)
    window.addEventListener(CONSENT_CHANGED_EVENT, sync)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, sync)
  }, [])

  useEffect(() => {
    onOpenChange?.(isClient && isVisible)
  }, [isClient, isVisible, onOpenChange])

  const decide = useCallback(
    (action: ConsentAction, next: ConsentChoices) => {
      const record = writeConsent(action, next)
      setChoices(record.categories)
      setIsVisible(false)
      setPanelOpen(false)
      reportConsent(record, locale)
    },
    [locale]
  )

  const handleAccept = () => decide('accept_all', CONSENT_GRANTED)
  const handleReject = () => decide('reject_all', CONSENT_DENIED)
  const handleSave = (next: ConsentChoices) => decide(actionForChoices(next, readConsent()?.categories ?? null), next)

  if (!isClient) {
    return null
  }

  const privacy = (
    <Link href={privacyLink} className="font-medium text-rail-tagline underline underline-offset-2 hover:text-contrast-ink">
      {t.privacy}
    </Link>
  )

  // The two decisions are peers: same height, same width, same row. Nothing
  // here may make one of them cheaper to press than the other. The accept
  // button carries a TRANSPARENT border purely so the two measure identically:
  // the reject button needs a visible one to read as a button on this navy
  // card, and without the invisible twin it came out 2px wider in the browser.
  const actions = (compact: boolean) => (
    <>
      <div className={`${compact ? 'mt-1.5 gap-1.5' : 'mt-2.5 gap-2'} flex`}>
        <button
          type="button"
          onClick={handleAccept}
          className={`${compact ? 'h-[26px] text-overline' : 'h-9 text-copy'} flex-1 rounded-control border border-transparent bg-action px-2 font-bold text-action-ink transition-colors hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40`}
        >
          {t.accept}
        </button>
        <button
          type="button"
          onClick={handleReject}
          className={`${compact ? 'h-[26px] text-overline' : 'h-9 text-copy'} flex-1 rounded-control border border-white/25 bg-white/10 px-2 font-bold text-contrast-ink transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40`}
        >
          {t.rejectAll}
        </button>
      </div>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className={`${compact ? 'mt-1 text-overline' : 'mt-2 text-caption'} w-full rounded-control px-1 py-0.5 font-medium text-contrast-ink/80 underline underline-offset-2 transition-colors hover:text-contrast-ink focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40`}
      >
        {t.customize}
      </button>
    </>
  )

  return (
    <>
      {isVisible ? (
        <div dir={getLocaleConfig(locale).dir} role="dialog" aria-label={t.aria} data-cookie-consent>
          {/* Phone: ultra compact, 240px, no title, lifted above the contact bar */}
          <div
            data-cookie-compact
            data-public-float
            className="fixed left-3.5 z-[58] flex w-[240px] max-w-[calc(100vw-1.75rem)] flex-col items-stretch rounded-card border border-white/10 bg-contrast px-2.5 pb-2 pt-1.5 shadow-pop animate-pop-in sm:hidden"
            style={{ bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' }}
          >
            <p className="m-0 text-center text-caption leading-tight text-contrast-ink/80">
              {t.short}
              {ltr ? ' ' : ''}
              {privacy}
              {'.'}
            </p>
            {actions(true)}
          </div>

          {/* From sm: compact but readable, 340px, at the bottom-left corner */}
          <div data-public-float data-cookie-desktop className="fixed bottom-6 left-24 z-[58] hidden w-[340px] max-w-[340px] rounded-card border border-white/10 bg-contrast px-4 py-3.5 shadow-pop animate-pop-in sm:block">
            <div className="flex items-start gap-2.5">
              <div className="flex size-[30px] shrink-0 items-center justify-center rounded-pill bg-white/10 text-contrast-ink" aria-hidden="true">
                <Cookie className="size-4" />
              </div>
              <div className="flex-1">
                <h2 className="m-0 text-lead font-bold leading-tight text-contrast-ink">{t.title}</h2>
                <p className="m-0 mt-1 text-caption leading-snug text-contrast-ink/80">
                  {t.body}
                  {ltr ? ' ' : ''}
                  {privacy}
                  {'.'}
                </p>
              </div>
            </div>
            {actions(false)}
          </div>
        </div>
      ) : null}

      {panelOpen ? (
        <ConsentPreferences
          dict={t}
          ltr={ltr}
          initial={choices}
          onSave={handleSave}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </>
  )
}

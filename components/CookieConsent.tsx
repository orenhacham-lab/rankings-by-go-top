'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

/**
 * Cookie consent banner.
 *
 * Redesigned as a compact dark card (not a full-width strip): bottom-left on
 * desktop so it composes with the floating WhatsApp button (bottom-right), and
 * a centered card lifted above the mobile contact bar on small screens.
 *
 * Consent logic is unchanged: a single `cookie-consent-accepted` flag in
 * localStorage gates visibility, and the privacy link adapts to /en pages.
 */
export function CookieConsent() {
  const pathname = usePathname()
  const [isVisible, setIsVisible] = useState(false)
  const [isClient, setIsClient] = useState(false)

  const isEnglish = pathname?.startsWith('/en')
  const privacyLink = isEnglish ? '/en/privacy' : '/privacy'

  const content = isEnglish
    ? {
        title: 'We value your privacy',
        message:
          'We use cookies to improve your browsing experience. By continuing to use this site, you agree to our',
        privacyLabel: 'Privacy Policy',
        buttonLabel: 'Accept',
      }
    : {
        title: 'אנחנו מכבדים את הפרטיות שלך',
        message:
          'אנו משתמשים בעוגיות כדי לשפר את חוויית הגלישה. המשך השימוש באתר מהווה הסכמה לשימוש בהן בהתאם ל',
        privacyLabel: 'מדיניות הפרטיות',
        buttonLabel: 'אישור',
      }

  useEffect(() => {
    setIsClient(true)
    const hasAccepted = localStorage.getItem('cookie-consent-accepted')
    if (!hasAccepted) {
      setIsVisible(true)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem('cookie-consent-accepted', 'true')
    setIsVisible(false)
  }

  if (!isClient || !isVisible) {
    return null
  }

  return (
    <div
      dir={isEnglish ? 'ltr' : 'rtl'}
      role="dialog"
      aria-label={content.title}
      className="fixed inset-x-4 bottom-[88px] z-[58] mx-auto w-[calc(100vw-32px)] max-w-sm sm:inset-x-auto sm:bottom-6 sm:left-6 sm:right-auto sm:mx-0 sm:w-auto"
    >
      <div className="rounded-2xl border border-white/10 bg-[#0b1f3a] p-5 text-white shadow-2xl ring-1 ring-black/20 sm:p-6">
        <div className="flex items-start gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
            🍪
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold leading-tight sm:text-lg">{content.title}</h2>
            <p className="mt-1 text-xs leading-snug text-slate-300 sm:text-sm">
              {content.message}{' '}
              <Link
                href={privacyLink}
                className="font-medium text-blue-300 underline underline-offset-2 hover:text-blue-200"
              >
                {content.privacyLabel}
              </Link>
            </p>
          </div>
        </div>
        <button
          onClick={handleAccept}
          className="mt-3 w-full rounded-xl bg-blue-600 px-6 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/50 sm:mt-4 sm:py-2.5 sm:text-sm"
        >
          {content.buttonLabel}
        </button>
      </div>
    </div>
  )
}

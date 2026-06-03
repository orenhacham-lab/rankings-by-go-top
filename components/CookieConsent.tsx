'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

export function CookieConsent() {
  const pathname = usePathname()
  const [isVisible, setIsVisible] = useState(false)
  const [isClient, setIsClient] = useState(false)

  const isEnglish = pathname?.startsWith('/en')
  const privacyLink = isEnglish ? '/en/privacy' : '/privacy'

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
      aria-label={isEnglish ? 'Privacy notice' : 'הודעת פרטיות'}
    >
      {/* MOBILE ONLY — ultra compact: 240px width, 26px button, no title */}
      <div className="fixed left-[14px] z-[58] flex w-[240px] max-w-[240px] flex-col items-stretch justify-start rounded-[12px] border border-white/10 bg-[#0b1f3a] sm:hidden" style={{ bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', padding: '4px 10px 8px 10px', minHeight: 0, height: 'auto', boxShadow: '0 8px 20px rgba(0,0,0,0.18)' }}>
        <p className="m-0 p-0 text-center text-[12px] leading-[1.25] text-slate-300">
          {isEnglish
            ? 'We use cookies. Continued use constitutes consent to the'
            : 'אנחנו משתמשים בעוגיות. המשך שימוש מהווה הסכמה ל'}
          {' '}
          <Link
            href={privacyLink}
            className="font-medium text-blue-300 underline underline-offset-2 hover:text-blue-200"
          >
            {isEnglish ? 'Privacy Policy' : 'מדיניות הפרטיות'}
          </Link>
          {'.'}
        </p>
        <button
          onClick={handleAccept}
          className="w-full rounded-[8px] bg-blue-600 px-2 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/50"
          style={{ height: '26px', marginTop: '6px' }}
        >
          {isEnglish ? 'Accept' : 'אישור'}
        </button>
      </div>

      {/* DESKTOP ONLY — compact but readable: 340px width, 36px button, 12px body text */}
      <div className="fixed bottom-6 left-6 z-[58] hidden w-[340px] max-w-[340px] rounded-[16px] border border-white/10 bg-[#0b1f3a] p-[14px_16px] sm:block" style={{ boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)' }}>
        <div className="flex items-start gap-[10px]">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-white/10 text-[14px]">
            🍪
          </div>
          <div className="flex-1">
            <h2 className="m-0 text-white text-[15px] font-bold leading-[1.25]">
              {isEnglish
                ? 'We value your privacy'
                : 'אנחנו מכבדים את הפרטיות שלך'}
            </h2>
            <p className="m-0 mb-[10px] text-[12px] leading-[1.4] text-slate-300">
              {isEnglish
                ? 'We use cookies to improve your browsing experience. By continuing to use this site, you agree to our'
                : 'אנו משתמשים בעוגיות כדי לשפר את חוויית הגלישה. המשך השימוש באתר מהווה הסכמה לשימוש בהן בהתאם ל'}
              {' '}
              <Link
                href={privacyLink}
                className="font-medium text-blue-300 underline underline-offset-2 hover:text-blue-200"
              >
                {isEnglish ? 'Privacy Policy' : 'מדיניות הפרטיות'}
              </Link>
            </p>
          </div>
        </div>
        <button
          onClick={handleAccept}
          className="mt-[10px] w-full rounded-[10px] bg-blue-600 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/50"
          style={{ height: '36px' }}
        >
          {isEnglish ? 'Accept' : 'אישור'}
        </button>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

export function CookieConsent() {
  const pathname = usePathname()
  const [isVisible, setIsVisible] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const isEnglish = pathname?.startsWith('/en')
  const privacyLink = isEnglish ? '/en/privacy' : '/privacy'

  const desktop = isEnglish
    ? {
        title: 'We value your privacy',
        before:
          'We use cookies to improve your browsing experience. By continuing to use this site, you agree to our',
        link: 'Privacy Policy',
        after: '',
        button: 'Accept',
      }
    : {
        title: 'אנחנו מכבדים את הפרטיות שלך',
        before:
          'אנו משתמשים בעוגיות כדי לשפר את חוויית הגלישה. המשך השימוש באתר מהווה הסכמה לשימוש בהן בהתאם ל',
        link: 'מדיניות הפרטיות',
        after: '',
        button: 'אישור',
      }

  const mobile = isEnglish
    ? {
        title: 'Your privacy matters',
        before: 'We use cookies. Continued use constitutes consent to the',
        link: 'Privacy Policy',
        after: '.',
        button: 'Accept',
      }
    : {
        title: 'הפרטיות שלך חשובה לנו',
        before: 'אנחנו משתמשים בעוגיות. המשך השימוש מהווה הסכמה ל',
        link: 'מדיניות הפרטיות',
        after: '.',
        button: 'אישור',
      }

  useEffect(() => {
    setIsClient(true)
    const hasAccepted = localStorage.getItem('cookie-consent-accepted')
    if (!hasAccepted) {
      setIsVisible(true)
    }

    const handleResize = () => {
      setIsMobile(window.innerWidth < 640)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleAccept = () => {
    localStorage.setItem('cookie-consent-accepted', 'true')
    setIsVisible(false)
  }

  if (!isClient || !isVisible) {
    return null
  }

  const c = isMobile ? mobile : desktop

  return (
    <div
      dir={isEnglish ? 'ltr' : 'rtl'}
      role="dialog"
      aria-label={c.title}
      style={{
        position: 'fixed',
        bottom: isMobile ? '92px' : '24px',
        left: isMobile ? '50%' : '24px',
        transform: isMobile ? 'translateX(-50%)' : 'none',
        zIndex: 58,
        width: isMobile ? '240px' : '340px',
        maxWidth: isMobile ? '240px' : '340px',
        minWidth: isMobile ? 0 : undefined,
      }}
    >
      <div
        style={{
          borderRadius: isMobile ? '12px' : '16px',
          padding: isMobile ? '8px 10px' : '14px 16px',
          backgroundColor: '#0b1f3a',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: isMobile
            ? '0 4px 12px rgba(0, 0, 0, 0.15)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          color: 'white',
        }}
      >
        {/* Desktop: icon + title + body */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div
              style={{
                display: 'flex',
                width: '30px',
                height: '30px',
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                fontSize: '14px',
              }}
            >
              🍪
            </div>
            <div style={{ flex: 1 }}>
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  lineHeight: '1.25',
                  marginBottom: '4px',
                  marginTop: 0,
                }}
              >
                {c.title}
              </h2>
              <p
                style={{
                  fontSize: '12px',
                  lineHeight: '1.4',
                  color: '#cbd5e1',
                  margin: 0,
                  marginBottom: '10px',
                }}
              >
                {c.before}{' '}
                <Link
                  href={privacyLink}
                  className="font-medium text-blue-300 underline underline-offset-2 hover:text-blue-200"
                >
                  {c.link}
                </Link>
                {c.after}
              </p>
            </div>
          </div>
        )}

        {/* Mobile: no icon, centered short text */}
        {isMobile && (
          <div>
            <h2
              style={{
                fontSize: '12px',
                fontWeight: 700,
                lineHeight: '1.15',
                marginBottom: '4px',
                marginTop: 0,
                textAlign: 'center',
              }}
            >
              {c.title}
            </h2>
            <p
              style={{
                fontSize: '10px',
                lineHeight: '1.25',
                color: '#cbd5e1',
                margin: 0,
                marginBottom: '6px',
                textAlign: 'center',
              }}
            >
              {c.before}{' '}
              <Link
                href={privacyLink}
                className="font-medium text-blue-300 underline underline-offset-2 hover:text-blue-200"
              >
                {c.link}
              </Link>
              {c.after}
            </p>
          </div>
        )}

        <button
          onClick={handleAccept}
          style={{
            marginTop: isMobile ? 0 : '10px',
            width: '100%',
            height: isMobile ? '28px' : '36px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: isMobile ? '8px' : '10px',
            fontSize: isMobile ? '12px' : '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            padding: isMobile ? '0 10px' : 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1d4ed8'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#2563eb'
          }}
          onFocus={(e) => {
            e.currentTarget.style.outline = 'none'
            e.currentTarget.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.5)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          {c.button}
        </button>
      </div>
    </div>
  )
}

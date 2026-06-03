'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

export function CookieConsent() {
  const pathname = usePathname()
  const [isVisible, setIsVisible] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [isMobile, setIsMobile] = useState(true)

  const isEnglish = pathname?.startsWith('/en')
  const privacyLink = isEnglish ? '/en/privacy' : '/privacy'

  const desktopContent = isEnglish
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

  const mobileContent = isEnglish
    ? {
        title: 'Your privacy matters',
        message: 'We use cookies. Continued use constitutes consent per',
        privacyLabel: 'Privacy Policy',
        buttonLabel: 'Accept',
      }
    : {
        title: 'הפרטיות שלך חשובה לנו',
        message: 'אנחנו משתמשים בעוגיות. המשך השימוש באתר מהווה הסכמה בהתאם ל',
        privacyLabel: 'מדיניות הפרטיות',
        buttonLabel: 'אישור',
      }

  const content = isMobile ? mobileContent : desktopContent

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

  return (
    <div
      dir={isEnglish ? 'ltr' : 'rtl'}
      role="dialog"
      aria-label={content.title}
      style={{
        position: 'fixed',
        bottom: isMobile ? '88px' : '20px',
        left: isMobile ? '50%' : '20px',
        transform: isMobile ? 'translateX(-50%)' : 'none',
        zIndex: 58,
        width: isMobile ? 'calc(100vw - 56px)' : '360px',
        maxWidth: isMobile ? '300px' : '360px',
        minWidth: isMobile ? '260px' : undefined,
        margin: 0,
      }}
    >
      <div
        style={{
          borderRadius: '16px',
          padding: isMobile ? '12px 14px' : '14px 16px',
          backgroundColor: '#0b1f3a',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: isMobile
            ? '0 4px 12px rgba(0, 0, 0, 0.15)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          color: 'white',
        }}
      >
        {!isMobile && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              marginBottom: 0,
            }}
          >
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
                  fontWeight: 'bold',
                  lineHeight: '1.25',
                  marginBottom: '4px',
                  marginTop: 0,
                }}
              >
                {content.title}
              </h2>
              <p
                style={{
                  fontSize: '12px',
                  lineHeight: '1.45',
                  color: '#cbd5e1',
                  margin: 0,
                  marginBottom: '10px',
                }}
              >
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
        )}

        {isMobile && (
          <div>
            <h2
              style={{
                fontSize: '15px',
                fontWeight: 700,
                lineHeight: '1.2',
                marginBottom: '6px',
                marginTop: 0,
                textAlign: 'center',
              }}
            >
              {content.title}
            </h2>
            <p
              style={{
                fontSize: '12px',
                lineHeight: '1.35',
                color: '#cbd5e1',
                margin: 0,
                marginBottom: '10px',
                textAlign: 'center',
              }}
            >
              {content.message}{' '}
              <Link
                href={privacyLink}
                className="font-medium text-blue-300 underline underline-offset-2 hover:text-blue-200"
              >
                {content.privacyLabel}
              </Link>
            </p>
          </div>
        )}

        <button
          onClick={handleAccept}
          style={{
            marginTop: isMobile ? 0 : '10px',
            width: '100%',
            height: '38px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            paddingInline: '14px',
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
          {content.buttonLabel}
        </button>
      </div>
    </div>
  )
}

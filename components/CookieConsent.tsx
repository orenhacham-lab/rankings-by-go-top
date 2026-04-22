'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)

    // Check if consent was already accepted without blocking API call
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
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 text-white p-4 sm:p-6 shadow-lg">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm leading-relaxed">
            אנו משתמשים בעוגיות. המשך השימוש באתר מהווה הסכמה לשימוש בהן בהתאם ל
            <Link href="/privacy" className="text-blue-400 hover:text-blue-300 underline mx-1">
              מדיניות הפרטיות
            </Link>
          </p>
        </div>
        <button
          onClick={handleAccept}
          className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors whitespace-nowrap"
        >
          אישור
        </button>
      </div>
    </div>
  )
}

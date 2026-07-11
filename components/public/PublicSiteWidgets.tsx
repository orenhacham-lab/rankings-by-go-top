'use client'

import { usePathname } from 'next/navigation'
import { CookieConsent } from '@/components/CookieConsent'
import { WhatsAppFloat } from './WhatsAppFloat'
import { MobileContactBar } from './MobileContactBar'
import { AccessibilityWidget } from './AccessibilityWidget'

/**
 * Renders the public-site-only floating widgets and gates them away from the
 * authenticated application and from the auth (login/signup) screens.
 *
 * Public vs. app is decided by pathname segmentation against the dashboard /
 * setup route groups. The marketing pages, the home page `/` and the legal
 * pages are treated as the public site, where the widgets appear.
 *
 * The cookie banner is bundled here so it coordinates spacing with the mobile
 * contact bar and never overlaps form actions on the login/signup screens.
 */

// Route prefixes where the floating widgets must NOT appear. Matched as exact
// segments so e.g. `/features/keyword-research` (public) is never caught by
// `/keyword-research` (app). Covers the authenticated app, onboarding/setup and
// the auth screens (Hebrew + English variants).
const NON_PUBLIC_PREFIXES = [
  '/dashboard',
  '/projects',
  '/keywords',
  '/keyword-research',
  '/reports',
  '/scans',
  '/billing',
  '/clients',
  '/admin',
  '/ai-visibility',
  '/setup',
  '/login',
  '/signup',
  '/en/login',
  '/en/signup',
]

function isNonPublicArea(pathname: string | null): boolean {
  if (!pathname) return false
  return NON_PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export function PublicSiteWidgets() {
  const pathname = usePathname()

  if (isNonPublicArea(pathname)) {
    return null
  }

  return (
    <>
      <AccessibilityWidget />
      <WhatsAppFloat />
      <MobileContactBar />
      <CookieConsent />
    </>
  )
}

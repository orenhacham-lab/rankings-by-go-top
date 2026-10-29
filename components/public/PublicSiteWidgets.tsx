'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { CookieConsent } from '@/components/CookieConsent'
import { WhatsAppFloat } from './WhatsAppFloat'
import { PublicDemoFloat } from './DemoFloat'
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
 * The WhatsApp button is never hidden by it: the card sits beside the button. On a
 * phone the notice, the contact bar and the accessibility button share ONE
 * bottom strip: the sheet lies over the bar, and both keep the start slot free
 * for the accessibility button, so none of them floats over the page.
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
  '/es/login',
  '/es/signup',
  // The password-reset pages are auth screens too: nothing floats over their form.
  '/forgot-password',
  '/reset-password',
  '/en/forgot-password',
  '/en/reset-password',
  '/es/forgot-password',
  '/es/reset-password',
]

function isNonPublicArea(pathname: string | null): boolean {
  if (!pathname) return false
  return NON_PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * The public contact widgets render ONLY for unauthenticated public visitors.
 * An authenticated user never sees them — regardless of pathname — because
 * public-ish routes (the home page `/`, the legal pages) are reachable while
 * logged in. isAuthenticated is resolved server-side (see the root layout), so
 * a logged-in user gets `null` from the first render — no client-side flash.
 */
export function shouldRenderPublicWidgets(isAuthenticated: boolean, pathname: string | null): boolean {
  if (isAuthenticated) return false
  if (isMarketplaceSalesArea(pathname)) return false
  return !isNonPublicArea(pathname)
}

/**
 * THE MARKETPLACE SALES PAGES, WHERE THE CONTACT WIDGETS MUST NOT APPEAR BUT
 * THE COOKIE NOTICE MUST.
 *
 * `/go/<platform>` is reviewed by the platform before it will list us, and
 * every one of them requires that its own buy button be the only way to buy
 * on that page. The floating widgets put two other routes beside it: the
 * WhatsApp button and the "free demo" float, both of which take a visitor who
 * came through an affiliate's link into a conversation with us instead of
 * through the affiliate's sale. That is the behaviour a compliance review
 * refuses, and it is also what the sales page's own header comment claimed was
 * not happening - the guards there read the page's source, which never
 * mentioned the root layout.
 *
 * The cookie notice is the exception and is deliberately NOT gated with them:
 * the platform's tracking beacon on that page fires only on a marketing grant
 * (components/consent/MarketplacePixel.tsx), so a visitor with no way to
 * answer the banner is a visitor the beacon can never fire for.
 */
const MARKETPLACE_SALES_PREFIX = '/go'

function isMarketplaceSalesArea(pathname: string | null): boolean {
  if (!pathname) return false
  return pathname === MARKETPLACE_SALES_PREFIX
    || pathname.startsWith(`${MARKETPLACE_SALES_PREFIX}/`)
}

/**
 * THE CONSENT NOTICE IS RENDERED BEFORE THE PAGE, NOT AFTER IT.
 *
 * It looks the same either way, because it is fixed-positioned. What changes is
 * the TAB ORDER. Rendered with the other floating widgets, at the end of the
 * document, the notice was tab stop 47 on the home page: a visitor with a mouse
 * refused cookies in one click, and a visitor using only a keyboard had to pass
 * the whole page first. Refusing has to be as easy as accepting (GDPR Art. 7
 * and the EDPB's cookie-banner guidance), and "as easy" cannot mean 46 extra
 * keystrokes. So the root layout renders this one above `children`, and the
 * rest of the widgets stay below it. Measured by
 * lib/__qa__/reviewer-journey/public-a11y.js, which fails if the notice is not
 * among the first stops.
 */
export function PublicConsentNotice({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const pathname = usePathname()
  const [, setCookieOpen] = useState(false)

  // Not `shouldRenderPublicWidgets`: the marketplace sales pages drop the
  // contact widgets and KEEP this, because the platform's beacon there waits
  // on a marketing grant that only this notice can collect. See
  // isMarketplaceSalesArea.
  const suppressed = isAuthenticated || isNonPublicArea(pathname)
  if (suppressed) {
    return null
  }

  return <CookieConsent onOpenChange={setCookieOpen} />
}

export function PublicSiteWidgets({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const pathname = usePathname()

  if (!shouldRenderPublicWidgets(isAuthenticated, pathname)) {
    return null
  }

  return (
    <>
      <AccessibilityWidget />
      <PublicDemoFloat />
      <WhatsAppFloat />
      <MobileContactBar />
    </>
  )
}

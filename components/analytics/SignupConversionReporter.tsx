'use client'

/**
 * Tell the server, once, that this browser's owner just opened an account —
 * and what they chose in the cookie banner.
 *
 * The decision is in localStorage and nowhere the server can read it, so this
 * component is the only thing that can carry it (app/api/analytics/
 * signup-conversion/route.ts says why that is the design). It sends the
 * current marketing choice and nothing else; the route takes the identity from
 * the session and drops anything that is not a brand new account.
 *
 * It runs on the dashboard, which every signup door lands on: email+password,
 * email confirmation, and Google alike. Once per tab, so a dashboard that
 * remounts does not re-post; a repeat that slips through is collapsed anyway,
 * because the event id is derived from the account.
 *
 * Nothing here is allowed to matter to the person using the page: no state, no
 * UI, and a failure is swallowed.
 */
import { useEffect } from 'react'
import { currentChoices } from '@/lib/consent/client-store'

const ONCE_PER_TAB_KEY = 'gotop-signup-conversion-posted'

export default function SignupConversionReporter() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(ONCE_PER_TAB_KEY)) return
      window.sessionStorage.setItem(ONCE_PER_TAB_KEY, '1')
    } catch {
      // Storage blocked. Posting is still correct — the server deduplicates.
    }
    void fetch('/api/analytics/signup-conversion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // No decision yet reads as denied: currentChoices() returns CONSENT_DENIED.
      body: JSON.stringify({ marketing: currentChoices().marketing === true }),
      keepalive: true,
    }).catch(() => { /* measurement never disturbs the page */ })
  }, [])

  return null
}

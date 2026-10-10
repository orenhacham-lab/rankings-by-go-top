'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Notice from '@/components/ui/Notice'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

/**
 * The card-payment button for one plan, on the Creem path.
 *
 * It takes the plan code and nothing else. The price, the product and the
 * return URL are all decided by /api/creem/checkout on the server, from our
 * own configuration — this component cannot influence what is charged.
 *
 * NOTHING IS GRANTED HERE. The route hands back a Creem checkout URL; the
 * plan is written only when Creem reports the completed checkout to
 * /api/creem/webhook, which re-reads the subscription from Creem first.
 *
 * THE URL IS CHECKED BEFORE THE BROWSER FOLLOWS IT. It comes from our own
 * route, but a redirect target is still only ever an absolute https URL: a
 * javascript: or data: string would otherwise run in the page.
 *
 * THE PROVIDER IS NAMED, AND ONLY HERE. Creem's Merchant Terms 3.7 oblige us
 * to tell the buyer, BEFORE they pay, that Creem charges as the merchant of
 * record, and 3.8 to show them Creem's buyer terms — so the disclosure and a
 * real, clickable link sit under the button, in the buyer's own language. The
 * wording is the legal thread's, which is why it lives in the dictionaries and
 * not in this file: this component still contains no sentence of its own.
 *
 * ITS ERRORS ARE STILL NEVER SHOWN. The merchant reads our own sentence
 * (CLAUDE.md); the provider's detail stays in the console.
 */
/** Creem's own buyer terms. A fixed, absolute URL — never built from input. */
const CREEM_BUYER_TERMS_URL = 'https://www.creem.io/buyer-terms'

export default function CreemCheckoutButton({ plan }: { plan: string }) {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).billing.creem

  const [starting, setStarting] = useState(false)
  const [failed, setFailed] = useState(false)

  async function startCheckout() {
    setStarting(true)
    setFailed(false)
    try {
      const response = await fetch('/api/creem/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const payload = await response.json().catch(() => null)
      const url = (payload as { checkoutUrl?: unknown } | null)?.checkoutUrl
      if (!response.ok || typeof url !== 'string' || !/^https:\/\//.test(url)) {
        console.error('[creem-checkout-button] no checkout to open', { status: response.status })
        setFailed(true)
        setStarting(false)
        return
      }
      // Leaving the page: `starting` stays true so the button cannot be
      // pressed twice while the browser navigates.
      window.location.assign(url)
    } catch (error) {
      console.error('[creem-checkout-button] could not reach the checkout route', {
        name: error instanceof Error ? error.name : 'unknown',
      })
      setFailed(true)
      setStarting(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="commit"
        className="w-full"
        loading={starting}
        onClick={startCheckout}
        data-creem-checkout={plan}
      >
        {starting ? t.starting : t.payButton}
      </Button>
      {failed && <Notice tone="bad">{t.error}</Notice>}
      <p className="text-caption text-muted">
        {t.disclosure}{' '}
        <a
          href={CREEM_BUYER_TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
          data-creem-buyer-terms
        >
          {t.buyerTermsLabel}
        </a>
      </p>
    </div>
  )
}

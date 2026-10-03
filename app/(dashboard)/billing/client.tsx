'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Notice, { type NoticeTone } from '@/components/ui/Notice'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { resolveCheckoutPlans, type BillingMarket } from '@/lib/paypal/checkout-plans'
import { PAYPAL_LOCALE } from '@/lib/i18n/locales'

interface PayPalButtonsOptions {
  style: {
    shape: string
    color: string
    layout: string
    label: string
  }
  createSubscription: (data: Record<string, unknown>, actions: Record<string, unknown>) => Promise<string>
  onApprove: (data: Record<string, unknown>) => Promise<void>
  onError: (err: unknown) => void
}

interface PayPalWindow extends Window {
  paypal?: {
    Buttons: (options: PayPalButtonsOptions) => { render: (id: string) => Promise<void> }
  }
}

export default function BillingClient({ market }: { market: BillingMarket }) {
  const { uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale)
  const t = dict.billing.paypal
  const paypalLocale = PAYPAL_LOCALE[uiLocale]

  const [loading, setLoading] = useState(true)
  const [configError, setConfigError] = useState('')
  // What the PayPal buttons report, shown in the page (never a browser alert and
  // never PayPal's or our route's own error text: the console keeps those).
  const [message, setMessage] = useState<{ tone: NoticeTone; text: string } | null>(null)
  const messageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (message) messageRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [message])

  const initPayPalButtons = useCallback(() => {
    const paypalWindow = window as PayPalWindow
    if (!paypalWindow.paypal) return

    // Phase 3 — ONLY the market-specific checkout plan IDs are ever used for
    // a NEW checkout button. The legacy bare NEXT_PUBLIC_PAYPAL_PLAN_ID_*
    // vars (old prices) are NEVER read here — a missing market-specific ID
    // fails closed (shows "unavailable"), it never falls back to the legacy
    // ID or the other currency's ID. See lib/paypal/checkout-plans.ts.
    const planIds: Record<string, string | undefined> = resolveCheckoutPlans(market).plans as unknown as Record<string, string | undefined>

    const plans = [
      { id: 'paypal-button-regular',  plan: 'regular'  },
      { id: 'paypal-button-advanced', plan: 'advanced' },
      { id: 'paypal-button-premium',  plan: 'premium'  },
      { id: 'paypal-button-large_agency', plan: 'large_agency' },
    ]

    for (const { id, plan } of plans) {
      const container = document.getElementById(id)
      if (!container) continue

      const planId = planIds[plan]
      if (!planId) {
        const envVarName = `NEXT_PUBLIC_PAYPAL_PLAN_ID_${plan.toUpperCase()}`
        console.warn(`[PayPal] Plan ID for "${plan}" not configured. Set env var: ${envVarName}`)
        // The env var name is for the console only; the merchant reads our sentence.
        container.innerHTML = `<p class="rounded-control border border-line bg-sunk px-3 py-3 text-center text-caption text-muted">${t.planUnavailable}</p>`
        continue
      }

      try {
        paypalWindow.paypal!.Buttons({
          style: {
            shape: 'rect',
            color: 'blue',
            layout: 'vertical',
            label: 'subscribe',
          },
          createSubscription: async (_data: Record<string, unknown>, actions: Record<string, unknown>) => {
            console.log(`[PayPal] Creating subscription for plan: ${plan}, planId: ${planId}`)
            try {
              const subscriptionActions = actions as Record<string, Record<string, (config: Record<string, string>) => Promise<string>>>
              const subscriptionId = await subscriptionActions.subscription.create({ plan_id: planId })
              console.log(`[PayPal] Subscription created: ${subscriptionId}`)
              return subscriptionId
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error)
              console.error('[PayPal] Failed to create subscription:', errorMsg)
              setMessage({ tone: 'bad', text: t.createSubscriptionError })
              throw error
            }
          },
          onApprove: async (data: Record<string, unknown>) => {
            console.log('[PayPal] Subscription approved:', data.subscriptionID)
            try {
              const response = await fetch('/api/paypal/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscriptionId: data.subscriptionID, plan }),
              })
              if (!response.ok) {
                const err = await response.json() as Record<string, unknown>
                const errorMsg = (err.error as string) || 'unknown'
                console.error('[PayPal] Activate error:', err)
                console.error('[PayPal] Error message:', errorMsg)
                setMessage({ tone: 'bad', text: t.activateSubscriptionError })
                return
              }
              const result = await response.json()
              console.log('[PayPal] Subscription activation successful:', result)
              setMessage({ tone: 'ok', text: t.activatedSuccess })
              // The same reload as before, after a moment to read the confirmation.
              setTimeout(() => window.location.reload(), 1500)
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error)
              console.error('[PayPal] Failed to activate subscription:', error)
              console.error('[PayPal] Error details:', errorMsg)
              setMessage({ tone: 'bad', text: t.activateSubscriptionError })
            }
          },
          onError: (err: unknown) => {
            const errorDetails = err instanceof Error ? err.message : String(err)
            console.error('[PayPal] Button error:', err)
            console.error('[PayPal] Error details:', errorDetails)

            // The details stay in the console; the merchant gets our words for the
            // three cases (a plan PayPal does not know, a bad client id, anything else).
            let userMessage: string = t.buttonError
            if (errorDetails.includes('Invalid plan')) {
              console.error(`[PayPal] Invalid plan id ${planId}: check NEXT_PUBLIC_PAYPAL_PLAN_ID_${plan.toUpperCase()}`)
              userMessage = t.planUnavailable
            } else if (errorDetails.toLowerCase().includes('client')) {
              console.error('[PayPal] Invalid client id: check NEXT_PUBLIC_PAYPAL_CLIENT_ID')
              userMessage = t.notConfigured
            }

            setMessage({ tone: 'bad', text: userMessage })
          },
        }).render(`#${id}`)
      } catch (error) {
        console.error(`[PayPal] Failed to render button for plan "${plan}":`, error)
      }
    }
  }, [t, market])

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID

    if (!clientId) {
      console.warn('[PayPal] NEXT_PUBLIC_PAYPAL_CLIENT_ID is not configured. Set: NEXT_PUBLIC_PAYPAL_CLIENT_ID=<client-id>')
      setTimeout(() => {
        setConfigError(t.notConfigured)
        setLoading(false)
      }, 0)
      return
    }

    const existingScript = document.getElementById('paypal-sdk')
    if (existingScript) {
      initPayPalButtons()
      setTimeout(() => setLoading(false), 0)
      return
    }

    const script = document.createElement('script')
    script.id = 'paypal-sdk'
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&vault=true&intent=subscription&locale=${paypalLocale}`
    script.async = true
    script.onload = () => {
      console.log('[PayPal] SDK loaded successfully')
      initPayPalButtons()
      setLoading(false)
    }
    script.onerror = () => {
      console.error('[PayPal] Failed to load SDK from:', script.src)
      setConfigError(t.sdkLoadFailed)
      setLoading(false)
    }
    document.body.appendChild(script)

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script)
    }
  }, [initPayPalButtons, t.notConfigured, t.sdkLoadFailed, paypalLocale])

  if (loading) {
    return (
      <div className="py-4 text-center text-copy text-muted">{t.loading}</div>
    )
  }

  if (configError) {
    return (
      <div className="mt-4" data-paypal-unavailable="">
        <Notice tone="info">{configError}</Notice>
      </div>
    )
  }

  if (message) {
    return (
      <div ref={messageRef} className="mt-4 scroll-mt-24" data-paypal-message={message.tone}>
        <Notice tone={message.tone} onDismiss={message.tone === 'ok' ? undefined : () => setMessage(null)}>{message.text}</Notice>
      </div>
    )
  }

  return null
}

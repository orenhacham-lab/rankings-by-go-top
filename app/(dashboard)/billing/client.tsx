'use client'

import { useCallback, useEffect, useState } from 'react'

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

export default function BillingClient() {
  const [loading, setLoading] = useState(true)
  const [configError, setConfigError] = useState('')

  const initPayPalButtons = useCallback(() => {
    const paypalWindow = window as PayPalWindow
    if (!paypalWindow.paypal) return

    // Read plan IDs from env — must be real PayPal plan IDs from your account
    const planIds: Record<string, string | undefined> = {
      regular:  process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR,
      advanced: process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ADVANCED,
      premium:  process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_PREMIUM,
    }

    const plans = [
      { id: 'paypal-button-regular',  plan: 'regular'  },
      { id: 'paypal-button-advanced', plan: 'advanced' },
      { id: 'paypal-button-premium',  plan: 'premium'  },
    ]

    for (const { id, plan } of plans) {
      const container = document.getElementById(id)
      if (!container) continue

      const planId = planIds[plan]
      if (!planId) {
        console.warn(`[PayPal] Plan ID for "${plan}" not configured (NEXT_PUBLIC_PAYPAL_PLAN_ID_${plan.toUpperCase()})`)
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">תשלום טרם הוגדר</p>'
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
              console.error('[PayPal] Failed to create subscription:', error)
              alert('שגיאה ביצירת המנוי. בדוק שמזהה התוכנית תקין אצל PayPal.')
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
                console.error('[PayPal] Activate error:', err)
                alert(`שגיאה בהפעלת המנוי: ${err.error || 'שגיאה לא ידועה'}`)
                return
              }
              alert('המנוי הופעל בהצלחה! 🎉')
              window.location.reload()
            } catch (error) {
              console.error('[PayPal] Failed to activate subscription:', error)
              alert('שגיאה בהפעלת המנוי. אנא צור קשר עם התמיכה.')
            }
          },
          onError: (err: unknown) => {
            console.error('[PayPal] Button error:', err)
            alert('שגיאה ב-PayPal. אנא נסה שנית או פנה לתמיכה.')
          },
        }).render(`#${id}`)
      } catch (error) {
        console.error(`[PayPal] Failed to render button for plan "${plan}":`, error)
      }
    }
  }, [])

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID

    if (!clientId) {
      console.warn('[PayPal] NEXT_PUBLIC_PAYPAL_CLIENT_ID is not set')
      setTimeout(() => {
        setConfigError('PayPal אינו מוגדר כרגע. אנא פנה למנהל המערכת.')
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
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&vault=true&intent=subscription&locale=he_IL`
    script.async = true
    script.onload = () => {
      console.log('[PayPal] SDK loaded successfully')
      initPayPalButtons()
      setLoading(false)
    }
    script.onerror = () => {
      console.error('[PayPal] Failed to load SDK')
      setConfigError('לא ניתן לטעון את PayPal. בדוק את החיבור לאינטרנט ונסה שנית.')
      setLoading(false)
    }
    document.body.appendChild(script)

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script)
    }
  }, [initPayPalButtons])

  if (loading) {
    return (
      <div className="text-center py-4 text-slate-400 text-sm">טוען PayPal...</div>
    )
  }

  if (configError) {
    return (
      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm text-center">
        {configError}
      </div>
    )
  }

  return null
}

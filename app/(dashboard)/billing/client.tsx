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
        const envVarName = `NEXT_PUBLIC_PAYPAL_PLAN_ID_${plan.toUpperCase()}`
        console.warn(`[PayPal] Plan ID for "${plan}" not configured. Set env var: ${envVarName}`)
        container.innerHTML = `<p class="text-xs text-slate-500 text-center py-3 p-2 bg-amber-50 rounded border border-amber-200">
          תוכנית ${plan} טרם הוגדרה.<br/>
          <span class="text-xs">משתנה סביבה: ${envVarName}</span>
        </p>`
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
              alert(`שגיאה ביצירת המנוי. פרטים: ${errorMsg}`)
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
                const errorMsg = (err.error as string) || 'שגיאה לא ידועה'
                console.error('[PayPal] Activate error:', err)
                console.error('[PayPal] Error message:', errorMsg)
                alert(`שגיאה בהפעלת המנוי: ${errorMsg}`)
                return
              }
              const result = await response.json()
              console.log('[PayPal] Subscription activation successful:', result)
              alert('המנוי הופעל בהצלחה! 🎉')
              window.location.reload()
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error)
              console.error('[PayPal] Failed to activate subscription:', error)
              console.error('[PayPal] Error details:', errorMsg)
              alert(`שגיאה בהפעלת המנוי: ${errorMsg}`)
            }
          },
          onError: (err: unknown) => {
            const errorDetails = err instanceof Error ? err.message : String(err)
            console.error('[PayPal] Button error:', err)
            console.error('[PayPal] Error details:', errorDetails)

            // Show detailed error to help debug
            let userMessage = `שגיאה ב-PayPal: ${errorDetails}`
            if (errorDetails.includes('Invalid plan')) {
              userMessage = `מזהה התוכנית אינו תקין: ${planId}. בדוק את משתני הסביבה NEXT_PUBLIC_PAYPAL_PLAN_ID_${plan.toUpperCase()}`
            } else if (errorDetails.toLowerCase().includes('client')) {
              userMessage = 'שגיאה ב-client ID של PayPal. בדוק את NEXT_PUBLIC_PAYPAL_CLIENT_ID'
            }

            alert(userMessage)
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
      console.warn('[PayPal] NEXT_PUBLIC_PAYPAL_CLIENT_ID is not configured. Set: NEXT_PUBLIC_PAYPAL_CLIENT_ID=<client-id>')
      setTimeout(() => {
        setConfigError('PayPal אינו מוגדר כרגע. משתנה סביבה חסר: NEXT_PUBLIC_PAYPAL_CLIENT_ID')
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
      console.error('[PayPal] Failed to load SDK from:', script.src)
      setConfigError('לא ניתן לטעון את PayPal SDK. בדוק את החיבור לאינטרנט, את NEXT_PUBLIC_PAYPAL_CLIENT_ID, וspam filter ב-browser console.')
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

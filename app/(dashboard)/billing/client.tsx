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
  onError: (err: Record<string, unknown>) => void
}

interface PayPalWindow extends Window {
  paypal?: {
    Buttons: (options: PayPalButtonsOptions) => { render: (id: string) => Promise<void> }
  }
}

export default function BillingClient() {
  const [loading, setLoading] = useState(true)

  const initPayPalButtons = useCallback(() => {
    const paypalWindow = window as PayPalWindow
    if (!paypalWindow.paypal) return

    const plans = [
      { id: 'paypal-button-regular', plan: 'regular' },
      { id: 'paypal-button-advanced', plan: 'advanced' },
      { id: 'paypal-button-premium', plan: 'premium' },
    ]

    for (const { id, plan } of plans) {
      const container = document.getElementById(id)
      if (!container) continue

      try {
        paypalWindow.paypal!.Buttons({
          style: {
            shape: 'rect',
            color: 'blue',
            layout: 'vertical',
            label: 'subscribe',
          },
          createSubscription: async (data: Record<string, unknown>, actions: Record<string, unknown>) => {
            // Map our plans to PayPal plan IDs
            // In production, these would be real PayPal plan IDs from your PayPal account
            const planIds: Record<string, string> = {
              regular: 'P-1234567890',
              advanced: 'P-0987654321',
              premium: 'P-1122334455',
            }

            try {
              const subscriptionActions = actions as Record<string, Record<string, (config: Record<string, string>) => Promise<string>>>
              return await subscriptionActions.subscription.create({
                plan_id: planIds[plan],
              })
            } catch (error) {
              console.error('Failed to create subscription:', error)
              alert('שגיאה ביצירת המנוי. אנא נסה שוב.')
              throw error
            }
          },
          onApprove: async (data: Record<string, unknown>) => {
            // Send subscription ID to our API to activate the subscription
            try {
              const response = await fetch('/api/paypal/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  subscriptionId: data.subscriptionID,
                  plan,
                }),
              })

              if (!response.ok) {
                const error = await response.json() as Record<string, unknown>
                alert(`שגיאה: ${error.error}`)
                return
              }

              // Success
              alert('המנוי הופעל בהצלחה!')
              window.location.reload()
            } catch (error) {
              console.error('Failed to activate subscription:', error)
              alert('שגיאה בהפעלת המנוי. אנא צור קשר תמיכה.')
            }
          },
          onError: (err: Record<string, unknown>) => {
            console.error('PayPal error:', err)
            alert('שגיאה ב-PayPal. אנא נסה שוב.')
          },
        }).render(`#${id}`)
      } catch (error) {
        console.error(`Failed to render PayPal button for ${plan}:`, error)
      }
    }
  }, [])

  useEffect(() => {
    // Load PayPal SDK
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
    if (!clientId) {
      console.error('PayPal client ID not configured')
      return
    }

    const script = document.createElement('script')
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&vault=true&intent=subscription&locale=he_IL`
    script.async = true
    script.onload = () => {
      initPayPalButtons()
      setLoading(false)
    }
    script.onerror = () => {
      console.error('Failed to load PayPal SDK')
      setLoading(false)
    }
    document.body.appendChild(script)

    return () => {
      setLoading(true)
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [initPayPalButtons])

  if (loading) {
    return <div className="text-center py-8">טוען PayPal...</div>
  }

  return null
}

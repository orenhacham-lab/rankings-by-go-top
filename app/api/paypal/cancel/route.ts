import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: sub } = await admin
      .from('subscriptions')
      .select('id, status, paypal_subscription_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!sub) {
      return Response.json({ error: 'No active subscription found' }, { status: 404 })
    }

    if (!sub.paypal_subscription_id) {
      return Response.json(
        { error: 'No PayPal subscription ID found. Please contact support to cancel.' },
        { status: 400 }
      )
    }

    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) {
      return Response.json(
        { error: 'PayPal credentials not configured. Please contact support to cancel.' },
        { status: 500 }
      )
    }

    const token = await getPayPalToken()
    const cancelResponse = await fetch(
      `${process.env.PAYPAL_API_URL || 'https://api.paypal.com'}/v1/billing/subscriptions/${sub.paypal_subscription_id}/cancel`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'User requested cancellation from dashboard' }),
      }
    )

    if (!cancelResponse.ok && cancelResponse.status !== 204) {
      const errorText = await cancelResponse.text()
      console.error('[PayPal Cancel] PayPal API error:', cancelResponse.status, errorText)
      return Response.json(
        { error: `PayPal cancellation failed: ${cancelResponse.statusText}` },
        { status: 500 }
      )
    }

    const { error: updateError } = await admin
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('id', sub.id)

    if (updateError) {
      console.error('[PayPal Cancel] DB update error:', updateError)
      return Response.json(
        { error: `Failed to update subscription status: ${updateError.message}` },
        { status: 500 }
      )
    }

    return Response.json({ success: true })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[PayPal Cancel] Error:', error)
    return Response.json(
      { error: `Cancellation failed: ${errorMsg}` },
      { status: 500 }
    )
  }
}

interface PayPalTokenResponse {
  access_token: string
}

async function getPayPalToken(): Promise<string> {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`
  ).toString('base64')

  const response = await fetch(
    `${process.env.PAYPAL_API_URL || 'https://api.paypal.com'}/v1/oauth2/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to get PayPal token: ${response.statusText}`)
  }

  const data = await response.json() as PayPalTokenResponse
  return data.access_token
}

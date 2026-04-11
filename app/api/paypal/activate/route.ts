import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubscriptionPlan } from '@/lib/supabase/types'

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subscriptionId, plan } = body

    if (!subscriptionId || !plan) {
      return Response.json(
        { error: 'subscriptionId and plan are required' },
        { status: 400 }
      )
    }

    // Validate plan
    const validPlans = ['regular', 'advanced', 'premium']
    if (!validPlans.includes(plan)) {
      return Response.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Optional: Verify subscription with PayPal API
    // (requires PayPal credentials, can be skipped for now)
    if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET) {
      try {
        const token = await getPayPalToken()
        const subscriptionDetails = await verifyPayPalSubscription(
          subscriptionId,
          token
        )
        if (subscriptionDetails.status !== 'APPROVAL_PENDING' && subscriptionDetails.status !== 'ACTIVE') {
          return Response.json(
            { error: 'Invalid subscription status' },
            { status: 400 }
          )
        }
      } catch (error) {
        console.warn('Failed to verify PayPal subscription:', error)
        // Continue anyway - webhook will verify later
      }
    }

    // Mark all previous trial and active subscriptions as cancelled
    await admin
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('user_id', user.id)
      .in('status', ['trial', 'active'])

    // Create new subscription record
    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    const { error } = await admin.from('subscriptions').insert({
      user_id: user.id,
      plan: plan as SubscriptionPlan,
      status: 'active',
      paypal_subscription_id: subscriptionId,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      scans_this_period: 0,
      scans_period_key: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    })

    if (error) {
      console.error('Failed to create subscription record:', error)
      return Response.json(
        { error: 'Failed to activate subscription' },
        { status: 500 }
      )
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Subscription activation error:', error)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

interface PayPalTokenResponse {
  access_token: string
}

interface PayPalSubscription {
  status: string
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

  const data = await response.json() as PayPalTokenResponse
  return data.access_token
}

async function verifyPayPalSubscription(
  subscriptionId: string,
  token: string
): Promise<PayPalSubscription> {
  const response = await fetch(
    `${process.env.PAYPAL_API_URL || 'https://api.paypal.com'}/v1/billing/subscriptions/${subscriptionId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`PayPal API error: ${response.statusText}`)
  }

  return response.json() as Promise<PayPalSubscription>
}

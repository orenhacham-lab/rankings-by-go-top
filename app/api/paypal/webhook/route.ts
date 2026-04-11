import { createAdminClient } from '@/lib/supabase/admin'

// PayPal sends webhook events to this endpoint
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { event_type, resource } = body

    // Silent success for unknown events (PayPal expects 200 OK)
    if (!event_type || !resource) {
      return Response.json({ status: 'received' })
    }

    const admin = createAdminClient()

    // Get subscription by PayPal subscription ID
    const paypalSubscriptionId = resource.id
    const { data: subscription } = await admin
      .from('subscriptions')
      .select('*')
      .eq('paypal_subscription_id', paypalSubscriptionId)
      .maybeSingle()

    // Silently acknowledge unknown subscriptions
    if (!subscription) {
      console.warn(`[PayPal] Unknown subscription: ${paypalSubscriptionId}`)
      return Response.json({ status: 'received' })
    }

    // Handle different event types
    switch (event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await admin
          .from('subscriptions')
          .update({ status: 'active' })
          .eq('id', subscription.id)
        break

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await admin
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('id', subscription.id)
        break

      case 'BILLING.SUBSCRIPTION.EXPIRED':
        await admin
          .from('subscriptions')
          .update({ status: 'expired' })
          .eq('id', subscription.id)
        break

      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        await admin
          .from('subscriptions')
          .update({ status: 'inactive' })
          .eq('id', subscription.id)
        break

      case 'BILLING.SUBSCRIPTION.RENEWED':
      case 'PAYMENT.SALE.COMPLETED':
        // Extend period and reset scan counter
        const now = new Date()
        const periodEnd = new Date(subscription.current_period_end || now)
        periodEnd.setMonth(periodEnd.getMonth() + 1)

        const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

        await admin
          .from('subscriptions')
          .update({
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            scans_this_period: 0,
            scans_period_key: periodKey,
          })
          .eq('id', subscription.id)
        break
    }

    return Response.json({ status: 'received' })
  } catch (error) {
    console.error('[PayPal Webhook] Error:', error)
    // Return 200 OK even on error to prevent PayPal retries
    return Response.json({ status: 'received' }, { status: 200 })
  }
}

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPaddlePortalSession, paddleApiContextFromEnv } from '@/lib/paddle/api'

/**
 * w21 — "Manage subscription" for a Paddle subscriber: a one-time link to
 * Paddle's customer portal (cancel, payment method, invoices), created
 * server-side with PADDLE_API_KEY. proxy.ts does not cover /api, so this
 * route authenticates itself, and it only ever reads the SIGNED-IN user's own
 * row (createAdminClient bypasses RLS: filtered by user_id explicitly).
 * The response carries our codes only, never Paddle's error text, and the
 * returned URL is checked to be on paddle.com.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

    const ctx = paddleApiContextFromEnv()
    if (!ctx) return Response.json({ error: 'not_configured' }, { status: 503 })

    const admin = createAdminClient()
    const { data: sub, error } = await admin
      .from('subscriptions')
      .select('paddle_subscription_id, paddle_customer_id')
      .eq('user_id', user.id)
      .not('paddle_subscription_id', 'is', null)
      .in('status', ['active', 'cancelled', 'inactive'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error('[paddle-portal] lookup failed', { userId: user.id, message: error.message })
      return Response.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (!sub?.paddle_subscription_id || !sub.paddle_customer_id) return Response.json({ error: 'no_paddle_subscription' }, { status: 404 })

    const session = await createPaddlePortalSession(ctx, sub.paddle_customer_id, [sub.paddle_subscription_id])
    if (!session.ok) {
      console.error('[paddle-portal] portal session failed', { userId: user.id, reason: session.reason })
      return Response.json({ error: 'portal_unavailable' }, { status: 502 })
    }
    return Response.json({ url: session.url })
  } catch (err) {
    console.error('[paddle-portal] unexpected exception', { message: err instanceof Error ? err.message : 'unknown' })
    return Response.json({ error: 'portal_unavailable' }, { status: 500 })
  }
}

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isKnownPlanCode, verifyPayPalActivation } from '@/lib/paypal/client'
import { transitionSubscriptionToActivePlan } from '@/lib/paypal/activation-processing'

/**
 * Phase 1 hardening (goal E): activation is NEVER granted on client-submitted
 * data alone. PayPal verification is now mandatory (previously optional/
 * best-effort, and a failure fell through to "continue anyway — webhook will
 * verify later"). The stored plan_code is always the server-resolved value
 * from PayPal's own plan_id, never the raw client string, and a resolution
 * mismatch fails closed rather than trusting either side.
 *
 * Corrective pass (write-ordering defect): the original Phase 1 version
 * cancelled the user's existing trial/active row FIRST, then inserted the
 * new paid row — so a failed insert (any transient DB error) left the user
 * with NO valid entitlement at all, despite PayPal having already approved
 * the charge. lib/paypal/activation-processing.ts now UPDATEs the existing
 * trial/active row IN PLACE (a single atomic write to one row — nothing to
 * insert, so no uniqueness constraint on that table can be violated by this
 * operation) instead of cancel-then-insert. If no trial/active row exists,
 * it inserts fresh (safe on its own: there is no prior valid entitlement to
 * lose in that case). Either way, if the write fails, the prior state is
 * verifiably unchanged.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subscriptionId, plan } = body

    if (!subscriptionId || !plan) {
      return Response.json({ error: 'subscriptionId and plan are required' }, { status: 400 })
    }
    if (!isKnownPlanCode(plan)) {
      return Response.json({ error: 'Invalid plan' }, { status: 400 })
    }

    // Mandatory server-side verification — no env-gated skip, no "continue
    // anyway" on failure. Every branch here fails closed: nothing is written
    // to the database unless PayPal itself confirms the exact subscription id,
    // an acceptable status, AND a plan_id that resolves to the submitted plan.
    const verified = await verifyPayPalActivation({ submittedSubscriptionId: subscriptionId, submittedPlanCode: plan })
    if (!verified.ok) {
      console.warn('[paypal-activate] verification failed', { userId: user.id, reason: verified.reason })
      return Response.json({ error: 'PayPal verification failed', reason: verified.reason }, { status: 400 })
    }

    // Matches the REAL schema (plan_code, no current_period_start/
    // scans_this_period/scans_period_key columns). trial_ends_at is
    // intentionally omitted (NULL): a paid active row has no trial end, and
    // the column is nullable as of the Phase-1 migration.
    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    const admin = createAdminClient()
    const result = await transitionSubscriptionToActivePlan(admin, user.id, {
      plan_code: verified.planCode,
      status: 'active',
      paypal_subscription_id: subscriptionId,
      current_period_end: periodEnd.toISOString(),
    })

    if (result.kind === 'lookup_failed') {
      console.error('[paypal-activate] failed to look up existing subscription', { userId: user.id, message: result.message })
      return Response.json({ error: `Failed to check existing subscription: ${result.message}` }, { status: 500 })
    }
    if (result.kind === 'write_failed') {
      console.error('[paypal-activate] failed to save subscription', { userId: user.id, message: result.message })
      return Response.json({ error: `Failed to save subscription: ${result.message}` }, { status: 500 })
    }
    if (result.kind === 'multiple_current_entitlement_rows') {
      // Data-integrity violation that predates this request — never guess
      // which row is "the" entitlement. Surfaced loudly, not silently fixed.
      console.error('[paypal-activate] invariant violated: multiple current trial/active rows', { userId: user.id, count: result.count })
      return Response.json({ error: 'Account has more than one active entitlement record — contact support.' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('Subscription activation error:', error)
    console.error('Error details:', errorMsg)
    return Response.json(
      { error: `Subscription activation failed: ${errorMsg}` },
      { status: 500 }
    )
  }
}

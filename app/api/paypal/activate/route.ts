import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isKnownPlanCode, verifyPayPalActivation } from '@/lib/paypal/client'
import { transitionSubscriptionToActivePlan } from '@/lib/paypal/activation-processing'
import { isShopifyBillingRequiredForUser } from '@/lib/shopify/paypal-block'
import { hasPendingShopifyLinkCookie } from '@/lib/shopify/pending-link'
import { marketForPayPalPlanId } from '@/lib/paypal/checkout-plans'
import { lockBillingMarket } from '@/lib/billing/billing-market-selection'
import { resolveBillingMarket, storedMarketOf, STORED_MARKET_KEY } from '@/lib/billing/server-market'
import { logRestrictedAttempt, restrictionForRequest } from '@/lib/sanctions/guard'
import { notifyRefusedPayPalActivation } from '@/lib/shopify/paypal-migration-retry'

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
    // Taking money from a restricted country is the dealing the Trading with
    // the Enemy Ordinance makes criminal, so it is refused here as well as at
    // the /billing page (proxy.ts) — this route is reachable directly, and the
    // page block is the only thing in front of it. lib/sanctions/countries.ts
    // carries the list and the law; the payer is never told which.
    const restricted = restrictionForRequest(request.headers)
    if (restricted) {
      logRestrictedAttempt('paypal-activate', restricted)
      return Response.json({ error: 'Not available', reason: 'restricted_country' }, { status: 451 })
    }
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

    // Phase 2 (blocker fix) — defense-in-depth against the FULL
    // billing-provider state machine, not just a "connected" store: blocked
    // by a connected Shopify store, an unresolved PayPal→Shopify migration,
    // OR a pending Shopify install/link in THIS browser (a merchant mid
    // Shopify install who opens /billing in another tab, before any
    // project/user link exists yet, must not be able to slip through here).
    // Never decided by referrer, UTM, or any other client-supplied signal.
    //
    // Owner decision, 9 Oct 2026: ANY Shopify store connected to this account
    // (any status, any of its projects) blocks a PayPal subscription here too —
    // see lib/shopify/paypal-block.ts. Administrators are exempt from that rule.
    //
    // PayPal has already APPROVED this subscription by the time the browser
    // calls us (the JS SDK creates it), so a refusal here may leave a payment
    // with no plan behind it. The operator is told, so it can be cancelled and
    // refunded by hand; the subscription is never cancelled from here, because
    // its id is client-supplied and not provably this account's. The alert is
    // sent only when PayPal itself confirms that subscription id exists and was
    // approved, so a made-up id cannot be used to flood the operator's inbox;
    // nothing is ever written either way.
    const admin = createAdminClient()
    const refuse = async (reason: 'shopify_store_connected' | 'shopify_link_pending') => {
      await notifyRefusedPayPalActivation({ userId: user.id, subscriptionId: String(subscriptionId), plan, reason })
      return Response.json({ error: 'Shopify billing required', reason }, { status: 403 })
    }
    if (await isShopifyBillingRequiredForUser(admin, user.id)) {
      console.warn('[paypal-activate] blocked: account is billed through Shopify', { userId: user.id })
      return refuse('shopify_store_connected')
    }
    if (hasPendingShopifyLinkCookie(request)) {
      console.warn('[paypal-activate] blocked: pending Shopify install/link in this browser', { userId: user.id })
      return refuse('shopify_link_pending')
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

    // w17 — the market this request would be priced in (stored, legacy, then
    // country), read BEFORE the new row exists. Used only to log a mismatch:
    // what is stored below is what PayPal really charges.
    const expected = await resolveBillingMarket(supabase, user).catch(() => null)
    const paidMarket = marketForPayPalPlanId(verified.planId)

    // Phase 3 — current_period_end/current_period_start are the AUTHORITATIVE
    // values PayPal itself reported in the SAME verified fetch above — never
    // now()/now()+1 month. trial_ends_at is intentionally omitted (NULL): a
    // paid active row has no trial end, and the column is nullable as of the
    // Phase-1 migration.
    const result = await transitionSubscriptionToActivePlan(admin, user.id, {
      plan_code: verified.planCode,
      status: 'active',
      paypal_subscription_id: subscriptionId,
      current_period_end: verified.periodEnd,
      current_period_start: verified.periodStart,
    })

    if (result.kind === 'lookup_failed') {
      console.error('[paypal-activate] failed to look up existing subscription', { userId: user.id, message: result.message })
      return Response.json({ error: 'Failed to check existing subscription' }, { status: 500 })
    }
    if (result.kind === 'write_failed') {
      console.error('[paypal-activate] failed to save subscription', { userId: user.id, message: result.message })
      return Response.json({ error: 'Failed to save subscription' }, { status: 500 })
    }
    if (result.kind === 'multiple_current_entitlement_rows') {
      // Data-integrity violation that predates this request — never guess
      // which row is "the" entitlement. Surfaced loudly, not silently fixed.
      console.error('[paypal-activate] invariant violated: multiple current trial/active rows', { userId: user.id, count: result.count })
      return Response.json({ error: 'Account has more than one active entitlement record — contact support.' }, { status: 500 })
    }

    // w17 — the market LOCKS at the first PayPal checkout. After the
    // entitlement is saved (the customer has paid; a lock failure must never
    // cost them the plan), store the market of the VERIFIED plan id in
    // app_metadata — never user_metadata.locale, never a client value.
    if (paidMarket && expected && paidMarket !== expected.market) {
      console.warn('[paypal-activate] paid market differs from the server market', { userId: user.id, paidMarket, expected: expected.market, source: expected.source })
    }
    const lock = await lockBillingMarket(storedMarketOf(user), paidMarket, {
      // Already refused above; repeated so the lock never runs for Shopify.
      isShopifyGoverned: async () => hasPendingShopifyLinkCookie(request) || await isShopifyBillingRequiredForUser(admin, user.id),
      claimSelectionSlot: async () => {
        const { data, error } = await admin
          .from('profiles')
          .update({ billing_market_claimed_at: new Date().toISOString() })
          .eq('id', user.id)
          .is('billing_market_claimed_at', null)
          .select('id')
        if (error) return { ok: false, message: error.message }
        return { ok: true, wonClaim: !!data && data.length > 0 }
      },
      releaseSelectionSlot: async () => {
        await admin.from('profiles').update({ billing_market_claimed_at: null }).eq('id', user.id)
      },
      persistMarket: async (market) => {
        const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { [STORED_MARKET_KEY]: market } })
        if (error) return { ok: false, message: error.message }
        return { ok: true }
      },
    })
    if (lock.kind === 'claim_failed' || lock.kind === 'persist_failed') {
      console.error('[paypal-activate] could not lock the billing market', { userId: user.id, kind: lock.kind, message: lock.message })
    } else if (lock.kind === 'unknown_market') {
      console.warn('[paypal-activate] verified plan id belongs to no billing market (legacy plan?); market not locked', { userId: user.id })
    }

    return Response.json({ success: true })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('Subscription activation error:', error)
    console.error('Error details:', errorMsg)
    return Response.json(
      { error: 'Subscription activation failed' },
      { status: 500 }
    )
  }
}

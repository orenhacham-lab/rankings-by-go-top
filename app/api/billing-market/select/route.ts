/**
 * Phase 3 — POST /api/billing-market/select
 *
 * For a legacy account with no persisted signup locale (user_metadata.locale
 * unset), lets the user make an EXPLICIT, one-time billing-market choice
 * (ILS or USD) rather than the app silently defaulting to either currency.
 * Persists into the SAME user_metadata.locale field the signup flow already
 * seeds (app/(auth)/signup/page.tsx) — no new storage location, one durable
 * signal for both dashboard-language seeding and billing-currency selection.
 *
 * Never touches an ALREADY-set locale — this is a one-time fill-in for
 * accounts that predate the locale field, not a currency-switcher. The
 * "already set" check reads the LIVE Supabase Auth record on every request
 * (never a client-cached value), so repeated/concurrent calls after a value
 * is persisted are all correctly refused — there is no window where a
 * currency, once selected and observed, can be switched by calling again.
 *
 * Review correction — two additional cases must also be refused, neither of
 * which the plain existing-locale check alone covers:
 *  1. A user who ALREADY has an active or cancelled-but-not-yet-expired
 *     PayPal subscription (a paid entitlement whose real billing currency
 *     this app cannot re-derive — see below) but whose locale happens to be
 *     unset (e.g. a pre-Phase-3 paid account). Letting this endpoint pick a
 *     market for them could disagree with the currency PayPal is actually
 *     charging, so it is refused outright rather than guessed.
 *  2. A Shopify-governed account (connected store, or a pending
 *     install/link in this browser) — billing authority for that account
 *     belongs entirely to Shopify App Pricing; a PayPal billing-market
 *     selection is meaningless for it and must not be persisted.
 *
 * 2nd review correction — request-level hardening:
 *  - POST-only / no state change on GET: this file exports ONLY a POST
 *    handler — Next.js's route handler dispatch itself returns 405 for any
 *    other method on this path; there is no GET handler that could ever be
 *    tricked into mutating anything (see the SOURCE check in the QA file).
 *  - JSON content-type is REQUIRED (`application/json`, checked explicitly
 *    below) — this is deliberate CSRF hardening, not just parsing
 *    robustness: a cross-site form/img/script-tag CSRF attempt cannot set a
 *    custom Content-Type without triggering a CORS preflight, which this app
 *    does not answer for any cross-origin caller, so the browser blocks the
 *    request before it ever reaches this handler.
 *  - Origin validation: when the browser sends an `Origin` header (it does
 *    for essentially every same-origin POST fetch, and ALWAYS for a
 *    cross-origin one), it must match this app's own origin — an explicit
 *    rejection layer on top of the SameSite=Lax cookie defense already used
 *    by every other mutating route in this app (app/api/paypal/activate,
 *    app/api/paypal/cancel, etc.). A request with no Origin header at all
 *    (e.g. a non-browser API client presenting a valid session cookie
 *    directly) is not itself a CSRF signal — CSRF specifically means
 *    tricking a BROWSER into using ambient credentials — so absence alone is
 *    not rejected, only a MISMATCHED Origin is.
 *  - Atomic first-write: see lib/billing/billing-market-selection.ts and
 *    supabase/migrations/20260828180000_add_billing_market_claim_gate.sql — two
 *    genuinely concurrent requests can no longer both persist a (possibly
 *    different) market; only one ever wins the write.
 *
 * The DB/decision logic itself lives in
 * lib/billing/billing-market-selection.ts (directly behaviorally tested —
 * see lib/billing/__qa__/billing-market-selection.qa.ts) — this route only
 * wires the real request/cookie/Supabase primitives to it. Route-level
 * behavior (method, content-type, Origin, and the full request→response
 * flow against a fake Next.js Request) is tested separately in
 * lib/billing/__qa__/billing-market-select-route.qa.ts.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isShopifyBillingRequiredForUser } from '@/lib/shopify/paypal-block'
import { hasPendingShopifyLinkCookie } from '@/lib/shopify/pending-link'
import { resolveBillingMarketSelection } from '@/lib/billing/billing-market-selection'

/** Exported so the route-level QA file can exercise the exact same origin
 *  logic without duplicating it — PURE, no request/env access beyond its args. */
export function isAllowedOrigin(requestOrigin: string | null, appOrigin: string): boolean {
  if (!requestOrigin) return true // no Origin header at all — not a CSRF signal, see file header
  return requestOrigin === appOrigin
}

/** Exported for the same reason — PURE. Accepts `; charset=utf-8` etc.
 *  suffixes (a real JSON POST from fetch()/axios/curl -H commonly includes
 *  one) but rejects any other media type, absence, or a bare empty string. */
export function isValidJsonContentType(contentType: string | null): boolean {
  return (contentType || '').toLowerCase().includes('application/json')
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // 2nd review correction — explicit Origin check (defense-in-depth on top
  // of SameSite=Lax). appOrigin is resolved from the request's OWN URL
  // (never a client-supplied header) so this can't be tricked by a spoofed
  // Host-like header.
  const appOrigin = new URL(request.url).origin
  const requestOrigin = request.headers.get('origin')
  if (!isAllowedOrigin(requestOrigin, appOrigin)) {
    console.warn('[billing-market/select] blocked: cross-origin request', { userId: user.id, requestOrigin, appOrigin })
    return Response.json({ error: 'Cross-origin request rejected' }, { status: 403 })
  }

  // 2nd review correction — explicit JSON content-type requirement (see file header).
  if (!isValidJsonContentType(request.headers.get('content-type'))) {
    return Response.json({ error: 'Content-Type must be application/json' }, { status: 415 })
  }

  let body: { market?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const admin = createAdminClient()
  const existingLocale = (user.user_metadata as { locale?: string } | null)?.locale ?? null

  const outcome = await resolveBillingMarketSelection(existingLocale, body.market, {
    isShopifyGoverned: async () => hasPendingShopifyLinkCookie(request) || await isShopifyBillingRequiredForUser(admin, user.id),
    hasExistingPaidPaypalSubscription: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .in('status', ['active', 'cancelled'])
        .not('paypal_subscription_id', 'is', null)
        .limit(1)
        .maybeSingle()
      if (error) return { ok: false, message: error.message }
      return { ok: true, exists: !!data }
    },
    // 2nd review correction — atomic first-write gate. A CONDITIONAL UPDATE
    // (only matches while billing_market_claimed_at IS NULL) on the row
    // every user already has in public.profiles — see
    // supabase/migrations/20260828180000_add_billing_market_claim_gate.sql. This
    // column is used PURELY as a concurrency gate; the market VALUE itself
    // still lives only in user_metadata.locale, read exactly as before.
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
    persistLocale: async (locale) => {
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...(user.user_metadata as Record<string, unknown> | null), locale },
      })
      if (error) return { ok: false, message: error.message }
      return { ok: true }
    },
  })

  switch (outcome.kind) {
    case 'invalid_market':
      return Response.json({ error: 'market must be ILS or USD' }, { status: 400 })
    case 'already_set':
      return Response.json({ ok: true, alreadySet: true })
    case 'shopify_governed':
      console.warn('[billing-market/select] blocked: user is Shopify-governed', { userId: user.id })
      return Response.json({ error: 'Shopify billing required', reason: 'shopify_governed' }, { status: 403 })
    case 'existing_paid_subscription':
      console.warn('[billing-market/select] blocked: user already has a paid PayPal subscription with no stored market', { userId: user.id })
      return Response.json({ error: 'Existing subscription — contact support to set your billing market' }, { status: 409 })
    case 'lookup_failed':
      console.error('[billing-market/select] failed to check existing subscription', { userId: user.id, message: outcome.message })
      return Response.json({ error: 'Failed to check existing subscription' }, { status: 500 })
    case 'claim_failed':
      console.error('[billing-market/select] failed to claim the atomic selection slot', { userId: user.id, message: outcome.message })
      return Response.json({ error: 'Failed to save billing market' }, { status: 500 })
    case 'persist_failed':
      console.error('[billing-market/select] failed to persist locale', { userId: user.id, message: outcome.message })
      return Response.json({ error: 'Failed to save billing market' }, { status: 500 })
    case 'persisted':
      return Response.json({ ok: true })
  }
}

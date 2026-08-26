/**
 * Phase 2 (blocker fix) — GET /api/shopify/billing/return
 *
 * The redirect target after a merchant selects (or abandons) a plan on
 * Shopify's hosted App Pricing page. Authorization for every side effect
 * this route can cause (Partner API verification, billing-cache write,
 * PayPal→Shopify migration advance, and transitively a PayPal cancellation)
 * comes ONLY from the short-lived, single-use billing intent minted by
 * app/api/shopify/billing/start-intent/route.ts (an authenticated request)
 * and carried here in a scoped, HttpOnly cookie
 * (lib/shopify/billing-intent.ts). The `shop` query parameter Shopify
 * appends is read ONLY as an additional equality check against the intent's
 * own stored shop_domain — never used to look anything up, never treated as
 * authorization by itself.
 *
 * This route is now a thin wrapper: read the intent cookie, delegate to
 * lib/shopify/billing-return-processing.ts's processShopifyBillingReturn()
 * (extracted so it's directly testable with FakeAdmin — see
 * lib/shopify/__qa__/phase2-billing-intent.qa.ts for adversarial tests
 * covering a spoofed `shop`, a missing/tampered/expired/replayed intent, a
 * cross-connection mismatch, and proof that none of those paths ever call
 * recordShopifyBillingCache or confirmShopifyActiveAndAdvance), then
 * translates the returned outcome to a redirect.
 */

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { getShopifyOAuthConfig, projectReturnUrl } from '@/lib/shopify/oauth'
import { BILLING_INTENT_COOKIE } from '@/lib/shopify/billing-intent'
import { processShopifyBillingReturn, type BillingReturnOutcome } from '@/lib/shopify/billing-return-processing'

const OUTCOME_TO_QUERY: Record<BillingReturnOutcome, { shopify: string; reason: string }> = {
  billing_intent_missing: { shopify: 'error', reason: 'billing_intent_missing' },
  billing_intent_invalid: { shopify: 'error', reason: 'billing_intent_invalid' },
  billing_intent_expired: { shopify: 'error', reason: 'billing_intent_expired' },
  billing_intent_already_processed: { shopify: 'info', reason: 'billing_intent_already_processed' },
  connection_not_found: { shopify: 'error', reason: 'connection_not_found' },
  shop_mismatch: { shopify: 'error', reason: 'shop_mismatch' },
  shop_identity_unverified: { shopify: 'error', reason: 'shop_identity_unverified' },
  billing_verification_unavailable: { shopify: 'error', reason: 'billing_verification_unavailable' },
  no_active_plan: { shopify: 'warning', reason: 'no_active_plan' },
  unrecognized_plan: { shopify: 'warning', reason: 'unrecognized_plan' },
  success: { shopify: 'success', reason: 'billing_confirmed' },
}

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const config = getShopifyOAuthConfig()
  if (!config) return Response.json({ error: 'shopify_oauth_not_configured' }, { status: 500 })
  const appUrl = config.appUrl

  const admin = createAdminClient()
  const cookieStore = await cookies()
  const nonce = cookieStore.get(BILLING_INTENT_COOKIE)?.value
  const suppliedShopRaw = new URL(request.url).searchParams.get('shop')

  const result = await processShopifyBillingReturn(admin, { nonce, suppliedShopRaw })
  const q = OUTCOME_TO_QUERY[result.outcome]

  const destination = result.projectId
    ? projectReturnUrl(appUrl, result.projectId, q)
    : `${appUrl}/projects?${new URLSearchParams(q).toString()}`

  return Response.redirect(destination, 302)
}

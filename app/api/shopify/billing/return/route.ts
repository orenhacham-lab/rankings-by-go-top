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
import { buildShopifyAdminAppUrl } from '@/lib/shopify/billing-urls'
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
  // The Shopify plan IS active, but the PayPal→Shopify migration did not
  // finish — never reported as a plain success, because the customer's PayPal
  // subscription may still be live.
  migration_incomplete: { shopify: 'warning', reason: 'migration_incomplete' },
  // The intent cookie never arrived (Shopify framed this return, so our
  // SameSite=Lax cookie was third-party), but Shopify's own signature and a
  // live subscription check confirmed the plan and the cache was reconciled.
  reconciled_without_intent: { shopify: 'success', reason: 'billing_confirmed' },
  success: { shopify: 'success', reason: 'billing_confirmed' },
}

/**
 * Send the merchant back INTO the embedded Shopify app.
 *
 * A plain 302 is not enough here. Shopify renders this billing return inside
 * the Admin iframe, and admin.shopify.com refuses to be framed — a redirect
 * would land on a blocked frame. This returns a minimal document that performs
 * a TOP-LEVEL navigation instead, which is the same frame-breaking policy every
 * other Shopify destination in this app uses.
 *
 * `url` is always built server-side by buildShopifyAdminAppUrl from a
 * connection's own canonical shop domain — never a value from the request — so
 * this cannot become an open redirect. It is JSON-encoded into the script and
 * HTML-escaped into the link, so it cannot break out of either context.
 */
function topLevelRedirect(url: string): Response {
  const jsUrl = JSON.stringify(url)
  const htmlUrl = url.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>Returning to Shopify…</title></head>`
    + `<body><script>window.top.location.href=${jsUrl}</script>`
    + `<noscript><a href="${htmlUrl}" target="_top">Continue to the app</a></noscript></body></html>`
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const config = getShopifyOAuthConfig()
  if (!config) return Response.json({ error: 'shopify_oauth_not_configured' }, { status: 500 })
  const appUrl = config.appUrl

  const admin = createAdminClient()
  const cookieStore = await cookies()
  const nonce = cookieStore.get(BILLING_INTENT_COOKIE)?.value
  const url = new URL(request.url)
  const suppliedShopRaw = url.searchParams.get('shop')
  // The full query, passed ONLY so the processor can verify Shopify's own HMAC
  // over it when no intent cookie arrived. No individual parameter is read as
  // authorization — charge_id and plan_handle are never consulted at all.
  const callbackParams: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { callbackParams[k] = v })

  const result = await processShopifyBillingReturn(admin, { nonce, suppliedShopRaw, callbackParams })
  const q = OUTCOME_TO_QUERY[result.outcome]

  // EMBEDDED ORIGIN — return to the Shopify app, not the website dashboard.
  //
  // Production incident (Sep 2): a merchant who started the flow inside the
  // embedded app was redirected to the external dashboard, which inside the
  // Admin iframe has no Supabase session and rendered the website's Hebrew
  // login page framed in Shopify Admin, with a login that could never
  // complete. The destination now follows the flow's SERVER-STAMPED origin.
  // The website flow below is untouched.
  if (result.embedded && result.shopDomain) {
    const appHome = buildShopifyAdminAppUrl(result.shopDomain)
    if (appHome.ok) return topLevelRedirect(appHome.url)
    // Fall through to the website destination only if the Shopify URL cannot
    // be built at all (misconfigured app handle) — never silently.
  }

  const destination = result.projectId
    ? projectReturnUrl(appUrl, result.projectId, q)
    : `${appUrl}/projects?${new URLSearchParams(q).toString()}`

  return Response.redirect(destination, 302)
}

/**
 * POST /api/billing-market/select — RETIRED (w17).
 *
 * This route used to let an account without a stored market pick ILS or USD:
 * the client sent the currency and it was written into user_metadata.locale
 * (the account's LANGUAGE). The owner's decision of 2026-10-02 replaced that:
 * the currency follows the visitor's country (Israel pays in shekels,
 * everyone else in dollars), is decided on the server
 * (lib/billing/server-market.ts), and locks at the first PayPal checkout
 * (app/api/paypal/activate, lib/billing/billing-market-selection.ts).
 *
 * The route stays only so a page loaded before the deploy gets a clear
 * answer: it never reads the body, never trusts a client currency and never
 * writes anything (no user_metadata, no app_metadata, no profiles row).
 * Only POST is exported, so Next.js answers 405 to every other method.
 */

import { createClient } from '@/lib/supabase/server'

/** PURE, kept for the route guard: same-origin check (absence is allowed). */
export function isAllowedOrigin(requestOrigin: string | null, appOrigin: string): boolean {
  if (!requestOrigin) return true
  return requestOrigin === appOrigin
}

/** PURE, kept for the route guard: a JSON content type, with any suffix. */
export function isValidJsonContentType(contentType: string | null): boolean {
  return (contentType || '').toLowerCase().includes('application/json')
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return Response.json({ error: 'The billing currency is set automatically.', reason: 'market_decided_by_server' }, { status: 410 })
}

/**
 * THE server-side administrator-role check.
 *
 * The role lives in `profiles.role` and is read with the SERVICE-ROLE client
 * only. It is never taken from a request parameter, a request body, a header,
 * a cookie, or any client-supplied claim — an authenticated browser cannot
 * assert administrator status, it can only be one.
 *
 * Why this module exists: the same three-line lookup was written out
 * separately in lib/subscription.ts (getUserEntitlement and hasAccess) and in
 * app/api/shopify/billing/start-intent/route.ts, and a fourth place —
 * lib/content/entitlement-guard.ts, the gate every AI-generation action passes
 * through — simply did not have it. That omission is the production bug: an
 * administrator whose account happens to carry a Shopify connection was denied
 * content generation with `billing_required`, because the content gate went
 * straight to Shopify governance without ever asking whether the user was an
 * admin. One shared implementation makes a fifth divergent copy impossible.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** The single role value that grants administrator privileges. */
export const ADMIN_ROLE = 'admin'

/**
 * True when this user id is a verified administrator.
 *
 * Fails CLOSED: a missing profile, a read error, or any other role returns
 * false, so an unreadable role can never grant a bypass.
 */
export async function isAdminUser(admin: Admin, userId: string): Promise<boolean> {
  if (!userId) return false
  const { data } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
  return (data as { role?: string } | null)?.role === ADMIN_ROLE
}

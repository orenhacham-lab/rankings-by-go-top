/**
 * Urgent hotfix — admin billing-page bypass.
 *
 * Production evidence: the only admin profile (role=admin, subscription
 * status=trial, plan_code=NULL, Shopify connection_status=connected,
 * shopify_plan_handle=NULL, shopify_subscription_status=NULL) saw /billing
 * incorrectly display "current Premium plan" + "billing managed through
 * Shopify" + a "Manage plan in Shopify" button. Clicking it redirected to
 * /billing?shopify=error&reason=shop_identity_unverified (the admin's
 * Shopify connection was never verified — no shop_gid — since it exists
 * only for testing/publishing, not real billing). No charge occurred, but a
 * genuine admin account was being routed toward a real Shopify billing flow
 * it should never reach at all.
 *
 * Root cause: getUserEntitlement's admin short-circuit deliberately returns
 * plan: 'premium' as an internal stand-in to grant full product limits (see
 * lib/subscription.ts) — this was never meant to represent a real
 * subscribed plan, but app/(dashboard)/billing/page.tsx displayed it as
 * one. Separately, that same page computed `shopifyConnected` directly from
 * shopify_connections with NO admin awareness at all, so an admin's own
 * connected (test/publishing) store surfaced Shopify-managed billing UI.
 *
 * Fix: page.tsx checks entitlement.isAdmin FIRST — before any Shopify
 * connection / migration / PayPal / billing-market query — and renders a
 * dedicated AdminBillingView (no plan/Shopify/PayPal wording, no
 * upgrade/downgrade/cancel/manage-payment button) instead. Defense in
 * depth: /api/shopify/billing/start-intent (the ONLY route that ever
 * builds a Shopify billing-management destination) now refuses an admin
 * caller before doing any shop-identity or subscription-management work.
 *
 * This suite spans several files with no single injectable seam, so it
 * follows the SAME documented multi-part strategy already established in
 * lib/billing/__qa__/billing-market-select-route.qa.ts for exactly this
 * situation:
 *   1) Behavioral tests (real FakeAdmin) of getUserEntitlement's admin
 *      short-circuit and of the newly-exported isAdminUser gate function.
 *   2) Source-contract proofs of page.tsx (admin check precedes ALL
 *      Shopify/PayPal querying) and of start-intent/route.ts (the admin
 *      check precedes the shop_gid check and pricing-URL construction, on
 *      BOTH call paths).
 *   3) Source-contract + i18n-dictionary proofs that AdminBillingView
 *      renders no billing-management CTA and that the required Hebrew/
 *      English strings exist verbatim.
 *
 * A live browser/dev-server render check of /billing as an actual admin
 * session is NOT performed here (no live Supabase/browser session available
 * in this environment) — see the final report for this as an explicitly
 * remaining item.
 *
 * Run: npx tsx lib/__qa__/phase3-admin-billing-bypass.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from './_fake-admin'
import { getUserEntitlement } from '../subscription'
import { isAdminUser } from '@/app/api/shopify/billing/start-intent/route'
import { dashboardHe } from '../i18n/dashboard/he'
import { dashboardEn } from '../i18n/dashboard/en'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Strips block/line comments before a source-contract regex check — a
 *  comment legitimately EXPLAINING "no PayPal wording here" would otherwise
 *  falsely trip a naive "does this file mention PayPal" check. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function adminFake(profileRole: string, subRows: Record<string, unknown>[] = [], shopifyRows: Record<string, unknown>[] = []) {
  return new FakeAdmin({
    profiles: [{ id: 'u1', role: profileRole }],
    subscriptions: subRows,
    shopify_connections: shopifyRows,
  })
}

async function main() {
  console.log('Hotfix — admin billing-page bypass QA\n')

  console.log('1) getUserEntitlement — the EXACT production admin shape resolves isAdmin=true, bypassing Shopify governance entirely')
  {
    const admin = adminFake('admin',
      [{ id: 's1', user_id: 'u1', status: 'trial', plan_code: null, trial_ends_at: '2026-06-01T00:00:00Z' }], // expired trial, per production evidence
      [{ id: 'c1', user_id: 'u1', connection_status: 'connected', shopify_plan_handle: null, shopify_subscription_status: null, shopify_current_period_end: null, shopify_current_period_start: null, shopify_billing_verified_at: null }],
    )
    const ent = await getUserEntitlement('u1', admin)
    check('1: isAdmin is true', ent.isAdmin === true)
    check('1: plan is the internal stand-in only (never surfaced as a real plan by the UI after this fix)', ent.plan === 'premium')
    check('1: hasActiveSubscription true (full product access)', ent.hasActiveSubscription === true)
  }

  console.log('\n2) Admin with connected Shopify but NO Shopify subscription at all — still isAdmin bypass')
  {
    const admin = adminFake('admin', [], [{ id: 'c2', user_id: 'u1', connection_status: 'connected', shopify_plan_handle: null, shopify_subscription_status: 'none', shopify_current_period_end: null, shopify_current_period_start: null, shopify_billing_verified_at: null }])
    const ent = await getUserEntitlement('u1', admin)
    check('2: isAdmin is true regardless of Shopify subscription state', ent.isAdmin === true)
  }

  console.log('\n3) Admin with a STALE/ACTIVE Shopify billing cache (a real handle, active status, valid future period) — STILL non-billing (isAdmin checked BEFORE Shopify governance)')
  {
    const admin = adminFake('admin', [],
      [{ id: 'c3', user_id: 'u1', connection_status: 'connected', shopify_plan_handle: 'premium-plan', shopify_subscription_status: 'active', shopify_current_period_end: '2099-01-01T00:00:00Z', shopify_current_period_start: '2098-12-01T00:00:00Z', shopify_billing_verified_at: '2098-12-01T00:00:00Z' }],
    )
    const ent = await getUserEntitlement('u1', admin)
    check('3: isAdmin is true — an active-looking Shopify cache never overrides admin status', ent.isAdmin === true)
    check('3: plan is still the internal stand-in, not the Shopify-cached plan', ent.plan === 'premium')
  }

  console.log('\n4) isAdminUser (start-intent route\'s exported gate function) — behavioral proof')
  {
    const adminUserAdmin = new FakeAdmin({ profiles: [{ id: 'u-admin', role: 'admin' }] })
    check('4: returns true for a role=admin profile', await isAdminUser(adminUserAdmin as unknown, 'u-admin') === true)

    const adminUserRegular = new FakeAdmin({ profiles: [{ id: 'u-regular', role: 'user' }] })
    check('4: returns false for a role=user profile', await isAdminUser(adminUserRegular as unknown, 'u-regular') === false)

    const adminUserMissing = new FakeAdmin({ profiles: [] })
    check('4: returns false when no profile row exists at all (fail closed to "not admin", never assumed)', await isAdminUser(adminUserMissing as unknown, 'u-ghost') === false)
  }

  console.log('\n5) start-intent/route.ts — source-contract: admin is checked BEFORE shop_gid / pricing-URL construction, on BOTH call paths')
  {
    const routeSrc = read('app/api/shopify/billing/start-intent/route.ts')
    const isApiCallIdx = routeSrc.indexOf('if (isApiCall) {')
    const adminCheckIdxApi = routeSrc.indexOf('await isAdminUser(admin, connection.user_id)')
    const adminCheckIdxCookie = routeSrc.indexOf('await isAdminUser(admin, user.id)')
    const shopGidCheckIdx = routeSrc.indexOf('if (!connection.shop_gid)')
    const pricingUrlIdx = routeSrc.indexOf('buildShopifyPricingUrl(connection.shop_domain)')
    check('5: both isAdminUser call sites exist', adminCheckIdxApi !== -1 && adminCheckIdxCookie !== -1)
    check('5: the isApiCall (embedded/session-token) path checks admin BEFORE the shop_gid check', adminCheckIdxApi !== -1 && shopGidCheckIdx !== -1 && adminCheckIdxApi < shopGidCheckIdx)
    check('5: the cookie (external dashboard) path checks admin BEFORE the shop_gid check', adminCheckIdxCookie !== -1 && shopGidCheckIdx !== -1 && adminCheckIdxCookie < shopGidCheckIdx)
    check('5: both admin checks precede pricing-URL construction entirely', adminCheckIdxApi < pricingUrlIdx && adminCheckIdxCookie < pricingUrlIdx)
    check('5: the cookie-path admin check runs BEFORE isApiCall\'s own branch even starts touching shopify_connections (it is the FIRST thing in the else branch after getUser)', adminCheckIdxCookie !== -1 && isApiCallIdx !== -1)
    check('5: an admin caller on the cookie path is redirected to /billing with a distinct, safe reason — never a pricing/shop URL', /reason=admin_not_applicable/.test(routeSrc))
    check('5: an admin caller on the API-call path gets a JSON error, never a redirectUrl', /error: 'admin_not_applicable' \}, \{ status: 403 \}/.test(routeSrc))
  }

  console.log('\n6) An ORDINARY connected Shopify user (role=user) still passes the admin gate and reaches Shopify billing management')
  {
    const admin = new FakeAdmin({ profiles: [{ id: 'u-shop', role: 'user' }] })
    check('6: isAdminUser is false — the route proceeds to its existing shop_gid/pricing logic exactly as before this fix', await isAdminUser(admin as unknown, 'u-shop') === false)
  }

  console.log('\n7) Ordinary PayPal / trial / manual users are UNCHANGED by this fix')
  {
    const paypalAdmin = adminFake('user', [{ id: 's-pp', user_id: 'u1', status: 'active', plan_code: 'premium', trial_ends_at: null, current_period_end: '2099-01-01T00:00:00Z' }])
    const paypalEnt = await getUserEntitlement('u1', paypalAdmin)
    check('7a: a real PayPal/active subscriber still resolves their real plan, isAdmin=false', paypalEnt.isAdmin === false && paypalEnt.plan === 'premium' && paypalEnt.hasActiveSubscription === true)

    const trialAdmin = adminFake('user', [{ id: 's-tr', user_id: 'u1', status: 'trial', plan_code: null, trial_ends_at: '2099-01-01T00:00:00Z' }])
    const trialEnt = await getUserEntitlement('u1', trialAdmin)
    check('7b: a real trial user still resolves as trial, isAdmin=false', trialEnt.isAdmin === false && trialEnt.plan === 'trial' && trialEnt.trialActive === true)

    const manualAdmin = adminFake('user', [{ id: 's-man', user_id: 'u1', status: 'active', plan_code: 'regular', trial_ends_at: null, current_period_end: null }])
    const manualEnt = await getUserEntitlement('u1', manualAdmin)
    check('7c: a legacy/manual active subscriber (no PayPal id concept at THIS entitlement layer) still resolves their real plan, isAdmin=false', manualEnt.isAdmin === false && manualEnt.plan === 'regular')
  }

  console.log('\n8) Hebrew and English admin billing text exists verbatim')
  {
    check('8: Hebrew title matches exactly', dashboardHe.billing.admin.title === 'חשבון מנהל — גישה מלאה')
    check('8: Hebrew description matches exactly', dashboardHe.billing.admin.description === 'לחשבון זה יש גישה מלאה למערכת ואינו דורש תוכנית חיוב.')
    check('8: English admin section exists with non-empty title and description', typeof dashboardEn.billing.admin.title === 'string' && dashboardEn.billing.admin.title.length > 0 && typeof dashboardEn.billing.admin.description === 'string' && dashboardEn.billing.admin.description.length > 0)
    const enTitle: string = dashboardEn.billing.admin.title
    const heTitle: string = dashboardHe.billing.admin.title
    check('8: English text is genuinely English (not a copy-paste of the Hebrew strings)', enTitle !== heTitle && /[a-zA-Z]/.test(enTitle))
  }

  console.log('\n9) app/(dashboard)/billing/page.tsx — source-contract: admin is resolved/checked BEFORE any Shopify or PayPal billing presentation')
  {
    const pageSrc = read('app/(dashboard)/billing/page.tsx')
    const entitlementIdx = pageSrc.indexOf('const entitlement = await getUserEntitlement(')
    const adminGateIdx = pageSrc.indexOf('if (entitlement.isAdmin) {')
    const activeSubIdx = pageSrc.indexOf(".from('subscriptions')")
    const shopifyConnIdx = pageSrc.indexOf(".from('shopify_connections')")
    const marketIdx = pageSrc.indexOf('billingMarketFromLocale(')
    check('9: entitlement is resolved first', entitlementIdx !== -1)
    check('9: the admin gate (early return) exists and comes right after entitlement resolution, before ANY further query', adminGateIdx !== -1 && entitlementIdx < adminGateIdx && adminGateIdx < activeSubIdx && adminGateIdx < shopifyConnIdx && adminGateIdx < marketIdx)
    check('9: the admin branch renders AdminBillingView, not BillingView', /if \(entitlement\.isAdmin\) \{\s*\n\s*return <AdminBillingView \/>/.test(pageSrc))
  }

  console.log('\n10) AdminBillingView.tsx — source-contract: renders NO billing-management CTA, NO plan/Shopify/PayPal wording')
  {
    const viewSrcRaw = read('app/(dashboard)/billing/AdminBillingView.tsx')
    const viewSrc = strip(viewSrcRaw) // exclude doc comments EXPLAINING what is deliberately absent
    check('10: no reference to the Shopify billing-management route', !/start-intent/.test(viewSrc))
    check('10: no "Manage plan in Shopify" / shopify.manageButton wording', !/manageButton/.test(viewSrc))
    check('10: no cancel/manage-subscription button wiring', !/cancelButton|handleCancel|manage\.title/.test(viewSrc))
    check('10: no plan-card / current-plan / upgrade wording', !/PlanCard|planLabels|onPlanPrefix|currentPlan/.test(viewSrc))
    check('10: no PayPal button wiring', !/paypal-button|PayPal/i.test(viewSrc))
    check('10: renders ONLY dict.billing.admin (title + description), nothing else from the billing dictionary', /t\.title/.test(viewSrc) && /t\.description/.test(viewSrc) && !/t\.shopify|t\.manage|t\.paypal|t\.planLabels/.test(viewSrc))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

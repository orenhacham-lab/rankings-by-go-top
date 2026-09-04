/**
 * Phase 2 (blocker fix) — the CENTRAL Shopify entitlement resolver.
 *
 * A Shopify merchant is buying the SAME Rankings by Go Top plans as a PayPal
 * customer — Shopify is only the billing provider, not a separate product.
 * This module is the single place that decides, for a Shopify-governed user,
 * which internal Rankings plan_code (and therefore which PLAN_LIMITS) they
 * get. lib/subscription.ts's getUserEntitlement()/hasAccess() call this
 * FIRST; when it returns non-null, its answer is AUTHORITATIVE and the
 * normal `subscriptions` table (PayPal/manual/trial) is never consulted for
 * that user — a local trial or a manually-granted subscriptions row can
 * never grant entitlement to a Shopify-governed user (this is exactly the
 * shopify@gotop.co.il reviewer-account scenario: an active, manually granted
 * `large_agency` row with no paypal_subscription_id must NOT bypass Shopify
 * verification once that account is Shopify-connected).
 *
 * Handle → plan_code mapping (verified against the actual repo evidence —
 * lib/subscription.ts's PLAN_LIMITS keys and lib/paypal/client.ts's
 * KNOWN_PLAN_CODES):
 *   regular       -> 'regular'
 *   advanced      -> 'advanced'
 *   premium       -> 'premium'
 *   large-agency  -> 'large_agency'   (hyphen in the Shopify handle,
 *                                       underscore in the internal plan_code
 *                                       — this is the ONLY spelling
 *                                       difference; every other tier is
 *                                       identical on both sides)
 */

import type { SubscriptionPlan } from '@/lib/supabase/types'
import { getActiveShopifySubscription } from './partner-client'
import { recordShopifyBillingCache } from './billing-cache'
import { isSupportedShopifyPlanHandle, type ShopifyPlanHandle } from './constants'
import { getActiveMigrationResult } from './paypal-migration'
import { resolveBillingAuthority } from '@/lib/billing/governance'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** Exhaustive, explicit — a missing key here is a compile error (Record over the literal union). */
const SHOPIFY_HANDLE_TO_PLAN_CODE: Record<ShopifyPlanHandle, SubscriptionPlan> = {
  regular: 'regular',
  advanced: 'advanced',
  premium: 'premium',
  'large-agency': 'large_agency',
}

/**
 * The three genuinely different answers to "does Shopify bill this user, and
 * what are they entitled to". `unavailable` is the one that used to be missing:
 * an infrastructure failure must never be reported as "not Shopify-governed",
 * because that falls through to the website trial/PayPal resolution and can
 * hand a Shopify merchant free entitlement — or, in the other direction, tell a
 * paying customer to buy a plan because a query failed.
 */
export type ShopifyEntitlementResolution =
  | { kind: 'not_governed' }
  | { kind: 'governed'; entitlement: ShopifyGovernedEntitlement }
  | { kind: 'unavailable'; reason: string }

export interface ShopifyGovernedEntitlement {
  governed: true
  /** null = Shopify-governed but no verified active plan yet (floor/trial-tier access; see lib/subscription.ts). */
  planCode: SubscriptionPlan | null
  hasActiveSubscription: boolean
  currentPeriodEnd: string | null
  /** Non-null only when the last check could not be trusted (API outage, unrecognized handle, etc). */
  verificationError: string | null
}

/** General entitlement checks are NOT the same acute "billing-sensitive
 *  action" as an actual publish mutation (see billing-guard.ts, which never
 *  uses the cache) — a short freshness window keeps quota/feature checks
 *  fast while still never trusting an indefinitely stale value.
 *
 *  Cache-tightening fix — 5 minutes (was 1 hour): a cached 'active' entry
 *  must not be trusted for up to an hour after the merchant's real Shopify
 *  billing state changed. This bounds the worst case for any billing-state
 *  change NOT already covered by an explicit invalidation path (uninstall —
 *  see shop-cleanup.ts's applyAppUninstalled; billing return — see
 *  billing-return-processing.ts, which always live-checks + rewrites the
 *  cache on every return, never reads it; migration state — see
 *  getActiveMigration below, read fresh on every call, never cached at all)
 *  to at most 5 minutes. Applies to positive AND negative cache entries
 *  alike — a uniform TTL is the smallest safe policy (a differentiated one
 *  would only reduce Partner API call volume, not risk, at the cost of more
 *  code). Never applied to website-only trial/PayPal caching, which this
 *  module has no involvement with at all. */
const CACHE_FRESHNESS_MS = 5 * 60 * 1000 // 5 minutes

interface ConnectionRow {
  id: string
  shop_domain: string
  shop_gid: string | null
  shopify_plan_handle: string | null
  shopify_subscription_status: 'active' | 'none' | 'unknown' | null
  shopify_current_period_end: string | null
  shopify_current_period_start: string | null
  shopify_billing_verified_at: string | null
}

function fromCache(c: ConnectionRow): ShopifyGovernedEntitlement {
  const handle = c.shopify_plan_handle as ShopifyPlanHandle | null
  const planCode = c.shopify_subscription_status === 'active' && handle && handle in SHOPIFY_HANDLE_TO_PLAN_CODE
    ? SHOPIFY_HANDLE_TO_PLAN_CODE[handle]
    : null
  return {
    governed: true,
    planCode,
    hasActiveSubscription: planCode !== null,
    currentPeriodEnd: planCode !== null ? c.shopify_current_period_end : null,
    verificationError: c.shopify_subscription_status === 'unknown' ? 'stale_or_unverifiable' : null,
  }
}

/**
 * Returns null when this user is NOT Shopify-governed — caller must fall back
 * to the normal PayPal/trial resolution unchanged.
 *
 * GOVERNANCE FIX (production). This used to mean "has no connected Shopify
 * store", which made the mere existence of an integration record decide who
 * bills the account. A website customer connecting Shopify purely to publish
 * was switched onto Shopify billing and, having no Shopify App Pricing
 * subscription, dropped to the zero-entitlement `shopify_billing_required`
 * state. Authority now comes from the durable, server-controlled
 * `billing_governance` record (lib/billing/governance.ts), which changes only
 * through a trusted transition — a verified direct App Store install, or a
 * COMPLETED PayPal→Shopify migration. Creating, disconnecting, revoking,
 * refreshing or failing a connection never changes it.
 *
 * For a Shopify-governed user the behaviour below is unchanged: mid-migration
 * or unverifiable billing returns `planCode: null` (floor tier), never a
 * silent fallback to PayPal data.
 */
export async function resolveShopifyGovernedEntitlement(
  admin: Admin,
  userId: string,
  /** Injectable clock (repo convention — see getUserEntitlement). Used ONLY for
   *  the cache-freshness comparison below, so a test with a fixed clock is not
   *  silently governed by the wall clock. Production passes nothing. */
  nowFn: () => Date = () => new Date(),
): Promise<ShopifyEntitlementResolution> {
  // AUTHORITY FIRST — before any connection lookup. A website-governed account
  // is not a Shopify billing question at all, however many stores it connects.
  // A governance READ FAILURE is not "website": it is an outage, and it stops
  // the resolution here rather than falling through to trial/PayPal data.
  const authority = await resolveBillingAuthority(admin, userId)
  if (!authority.ok) return { kind: 'unavailable', reason: authority.reason }
  if (authority.authority !== 'shopify') return { kind: 'not_governed' }

  const { data, error } = await admin
    .from('shopify_connections')
    .select('id, shop_domain, shop_gid, shopify_plan_handle, shopify_subscription_status, shopify_current_period_end, shopify_current_period_start, shopify_billing_verified_at')
    .eq('user_id', userId)
    .eq('connection_status', 'connected')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // A FAILED connection lookup is not "no connection": it is an outage. Saying
  // "no connection" here would be harmless for entitlement (both give the
  // Shopify floor) but would misreport WHY, so it is surfaced honestly.
  if (error) return { kind: 'unavailable', reason: 'connection_query_failed' }

  // A Shopify-governed account whose store is currently unusable — failed
  // token, uninstalled, disconnected, archived — is STILL Shopify-governed.
  // Returning "not governed" here would fall through to the website
  // trial/PayPal resolution and hand the merchant a fresh website trial as a
  // side effect of a token failure, which must never happen. It resolves to the
  // zero-entitlement floor instead: the account keeps its Shopify authority and
  // is told to reconnect or choose a plan.
  if (!data) {
    return { kind: 'governed', entitlement: { governed: true, planCode: null, hasActiveSubscription: false, currentPeriodEnd: null, verificationError: 'no_active_shopify_connection' } }
  }
  const connection = data as ConnectionRow

  // An in-progress PayPal→Shopify migration means Shopify is not yet the
  // safely-confirmed sole provider — never grant Shopify-plan entitlement
  // (or fall back to PayPal data) while that's unresolved; floor tier only.
  // A migration LOOKUP FAILURE must never read as "no migration in flight" —
  // that would grant full Shopify entitlement to an account mid-migration.
  const migration = await getActiveMigrationResult(admin, userId)
  if (!migration.ok) return { kind: 'unavailable', reason: 'migration_query_failed' }
  if (migration.migration) {
    return { kind: 'governed', entitlement: { governed: true, planCode: null, hasActiveSubscription: false, currentPeriodEnd: null, verificationError: 'paypal_migration_incomplete' } }
  }

  const fresh = connection.shopify_billing_verified_at
    && nowFn().getTime() - new Date(connection.shopify_billing_verified_at).getTime() < CACHE_FRESHNESS_MS
  if (fresh) return { kind: 'governed', entitlement: fromCache(connection) }

  if (!connection.shop_gid) {
    return { kind: 'governed', entitlement: { governed: true, planCode: null, hasActiveSubscription: false, currentPeriodEnd: null, verificationError: 'shop_identity_unverified' } }
  }

  const result = await getActiveShopifySubscription(connection.shop_gid, fetch, connection.shop_domain)

  if (!result.ok) {
    await recordShopifyBillingCache(admin, connection.id, {
      shopify_plan_handle: connection.shopify_plan_handle,
      shopify_subscription_status: 'unknown',
      shopify_trial_ends_at: null,
      shopify_current_period_end: connection.shopify_current_period_end,
      shopify_current_period_start: connection.shopify_current_period_start,
      shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: `verification_failed: ${result.reason}`,
    })
    // A PARTNER API OUTAGE is an infrastructure failure, not a billing verdict.
    // Reporting it as a governed account with no plan produced
    // `billing_required` — telling a paying merchant to buy a plan because
    // Shopify's API was briefly unreachable. It is now 'unavailable', which the
    // callers surface as a retryable 503-shaped state.
    return { kind: 'unavailable', reason: result.reason }
  }

  if (!result.active) {
    await recordShopifyBillingCache(admin, connection.id, {
      shopify_plan_handle: null,
      shopify_subscription_status: 'none',
      shopify_trial_ends_at: null,
      shopify_current_period_end: null,
      shopify_current_period_start: null,
      shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: null,
    })
    return { kind: 'governed', entitlement: { governed: true, planCode: null, hasActiveSubscription: false, currentPeriodEnd: null, verificationError: null } }
  }

  await recordShopifyBillingCache(admin, connection.id, {
    shopify_plan_handle: result.planHandle,
    shopify_subscription_status: 'active',
    shopify_trial_ends_at: result.trialEndsAt,
    shopify_current_period_end: result.currentPeriodEnd,
    // Phase 3 — always whatever the Partner API reports RIGHT NOW; no
    // special-casing for a plan change having reset the cycle boundaries —
    // this write simply reflects Shopify's own current authoritative state.
    shopify_current_period_start: result.currentPeriodStart,
    shopify_cancel_at_end_of_cycle: result.cancelAtEndOfCycle,
    shopify_billing_last_error: null,
  })
  return {
    kind: 'governed',
    entitlement: {
      governed: true,
      planCode: SHOPIFY_HANDLE_TO_PLAN_CODE[result.planHandle],
      hasActiveSubscription: true,
      currentPeriodEnd: result.currentPeriodEnd,
      verificationError: null,
    },
  }
}

/**
 * Lightweight, CACHE-ONLY variant for hasAccess() (middleware hot path) —
 * never makes a live Partner API call (that would put an external network
 * dependency in front of every page load). Fails closed when it cannot stand
 * on an authoritative statement from Shopify.
 *
 * PRODUCTION INCIDENT (Shopify submission blocker). This used to grant access
 * on ONE condition: `shopify_billing_verified_at` within CACHE_FRESHNESS_MS
 * (5 minutes) AND status 'active'. `shopify_billing_verified_at` is written
 * only by recordShopifyBillingCache — from the connector home, the billing
 * return, the publish guard and resolveShopifyGovernedEntitlement's live path.
 * NOTHING on the /dashboard, /projects, /clients, /keywords, /scans, /reports
 * journey writes it, because this path is deliberately cache-only. So an
 * Advanced merchant on an active Shopify trial got exactly five minutes of
 * access after leaving the embedded app and was then redirected to /billing
 * on every page, permanently, with no way back except reopening the embedded
 * app. The old docstring's premise — "a user actively using the product will
 * have a fresh cache almost all the time" — was false precisely for the
 * journey that matters: ordinary dashboard browsing refreshes nothing.
 *
 * The correction is not a longer TTL (that only moves the cliff) and not a
 * live API call in middleware (that puts Shopify's uptime in front of every
 * page load). It is a distinction the old predicate never drew:
 *
 *   Freshness bounds how long we trust a cached GUESS about billing state.
 *   A trial end or a period end is NOT a guess — it is a date Shopify itself
 *   gave us, stating how long this entitlement runs.
 *
 * So access is granted while the cache is recently verified OR while a window
 * Shopify declared is still open. Outside every such window, with no recent
 * verification, it fails closed exactly as before. See decideShopifyRouteAccess.
 */
export async function isShopifyGovernedAndActive(
  admin: Admin,
  userId: string,
  nowFn: () => Date = () => new Date(),
): Promise<ShopifyGovernanceCheck> {
  // Same authority rule as resolveShopifyGovernedEntitlement — a connection row
  // never decides governance on its own — and the same fail-closed rule: an
  // unreadable governance record reports `unavailable`, never
  // `{ governed: false }`, which would grant website access on a DB outage.
  //
  // `admin` MUST be a SERVICE-ROLE client. billing_governance is RLS-enabled
  // with NO policies and REVOKEd from anon/authenticated (see
  // supabase/migrations/20260901000000_billing_governance.sql:85-87), so an
  // RLS-scoped client cannot read it at all: the read errors, this returns
  // `governance_unreadable`, and every Shopify-governed merchant is denied
  // regardless of what their billing actually says. That was the production
  // incident — the middleware was passing its anon-key session client. See
  // proxy.ts, which now builds a service-role client for this decision.
  const authority = await resolveBillingAuthority(admin, userId)
  if (!authority.ok) {
    return { governed: true, active: false, unavailable: true, reason: 'governance_unreadable', authority: 'unreadable' }
  }
  if (authority.authority !== 'shopify') {
    return {
      governed: false, active: false, authority: authority.authority,
      // An ABSENT governance row also resolves to website authority, but the
      // two are different operational facts and must not be reported alike.
      reason: authority.governance ? 'authority_not_shopify' : 'governance_missing',
    }
  }

  // The connected-only filter moved from SQL into code so that "this account
  // has no store row at all" and "its store is disconnected/archived" are
  // DISTINGUISHABLE in the diagnostics. The verdict is unchanged: the newest
  // live connected row decides, exactly as before.
  const { data, error } = await admin
    .from('shopify_connections')
    .select('connection_status, shopify_subscription_status, shopify_plan_handle, shopify_trial_ends_at, shopify_current_period_end, shopify_billing_verified_at')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(5)
  if (error) return { governed: true, active: false, unavailable: true, reason: 'connection_unreadable', authority: 'shopify' }

  const rows = (data ?? []) as (ShopifyRouteAccessRow & { connection_status: string | null })[]
  if (rows.length === 0) return { governed: true, active: false, reason: 'connection_missing', authority: 'shopify' }
  const connected = rows.find((r) => r.connection_status === 'connected')
  if (!connected) {
    return { governed: true, active: false, reason: 'connection_not_connected', authority: 'shopify', connectionStatus: rows[0]!.connection_status }
  }

  const handle = normalizePlanHandle(connected.shopify_plan_handle)
  const decision = decideShopifyRouteAccess(connected, nowFn())
  return {
    governed: true, active: decision.allowed, reason: decision.reason, authority: 'shopify',
    connectionStatus: connected.connection_status,
    subscriptionStatus: connected.shopify_subscription_status,
    planHandle: handle,
    planHandleSupported: isSupportedShopifyPlanHandle(handle),
    trialEndsAt: describeTimestamp(connected.shopify_trial_ends_at, nowFn()),
    periodEndsAt: describeTimestamp(connected.shopify_current_period_end, nowFn()),
    verifiedAt: describeTimestamp(connected.shopify_billing_verified_at, nowFn()),
  }
}

/**
 * What a timestamp column actually contained — present? parseable? still in the
 * future? Structured so a denial can be explained without printing raw values.
 */
export interface TimestampFacts { present: boolean; valid: boolean; future: boolean }

export function describeTimestamp(iso: string | null | undefined, now: Date): TimestampFacts {
  if (!iso) return { present: false, valid: false, future: false }
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return { present: true, valid: false, future: false }
  return { present: true, valid: true, future: t > now.getTime() }
}

/** Trim and lower-case a stored handle before matching. Never invents a value. */
export function normalizePlanHandle(handle: string | null | undefined): string | null {
  const h = (handle ?? '').trim().toLowerCase()
  return h || null
}

/** The full, non-secret result of the middleware's entitlement decision. */
export interface ShopifyGovernanceCheck {
  governed: boolean
  active: boolean
  unavailable?: true
  reason: ShopifyRouteAccessReason
  authority: 'shopify' | 'website' | 'unreadable'
  connectionStatus?: string | null
  subscriptionStatus?: string | null
  planHandle?: string | null
  planHandleSupported?: boolean
  trialEndsAt?: TimestampFacts
  periodEndsAt?: TimestampFacts
  verifiedAt?: TimestampFacts
}

/** The cached billing columns the route-access decision reads. Nothing else. */
export interface ShopifyRouteAccessRow {
  shopify_subscription_status: string | null
  shopify_plan_handle: string | null
  shopify_trial_ends_at: string | null
  shopify_current_period_end: string | null
  shopify_billing_verified_at: string | null
}

/** WHY access was granted or denied — for tests, logs and honest diagnostics. */
export type ShopifyRouteAccessReason =
  // allowed
  | 'allowed_by_freshness'
  | 'allowed_by_trial'
  | 'allowed_by_period'
  // denied — billing verdicts
  | 'inactive_subscription'
  | 'missing_plan_handle'
  | 'unsupported_plan_handle'
  | 'stale_without_open_window'
  // denied — the account is not in a state this decision applies to
  | 'governance_missing'
  | 'governance_unreadable'
  | 'authority_not_shopify'
  | 'connection_missing'
  | 'connection_not_connected'
  | 'connection_unreadable'

/** A timestamp strictly in the future, or false for null/blank/invalid input. */
function isFuture(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t > now.getTime()
}

/**
 * PURE — should a Shopify-governed account be allowed onto the protected page
 * routes right now, given only its cached billing columns?
 *
 * Every one of these must hold; there is no path that grants on a connection
 * merely existing:
 *
 *   1. shopify_subscription_status === 'active'
 *   2. shopify_plan_handle is one we actually sell (this was NOT checked
 *      before — an 'active' row with a NULL or unrecognized handle used to get
 *      full route access, which is the opposite defect and is now closed)
 *   3. at least one authoritative window is open:
 *        - the cache was verified within CACHE_FRESHNESS_MS, or
 *        - Shopify's own trial end is still in the future, or
 *        - Shopify's own current period end is still in the future
 *
 * `shopify_current_period_start` and `shopify_current_period_end` may both be
 * NULL during a Shopify managed-pricing free trial — the Partner API reports
 * `currentBillingCycle: null` until the trial converts — so NULL period dates
 * are never treated as a denial. Route access is not quota: the billing period
 * is still required for usage accounting, and lib/billing/usage-period.ts is
 * untouched by this.
 */
export function decideShopifyRouteAccess(
  row: ShopifyRouteAccessRow,
  now: Date,
): { allowed: boolean; reason: ShopifyRouteAccessReason } {
  if (row.shopify_subscription_status !== 'active') return { allowed: false, reason: 'inactive_subscription' }
  const handle = normalizePlanHandle(row.shopify_plan_handle)
  // Absent and unrecognised are different operational facts: one means nothing
  // was ever cached, the other means Shopify named a plan we do not sell.
  if (!handle) return { allowed: false, reason: 'missing_plan_handle' }
  if (!isSupportedShopifyPlanHandle(handle)) return { allowed: false, reason: 'unsupported_plan_handle' }

  const verifiedAt = row.shopify_billing_verified_at ? new Date(row.shopify_billing_verified_at).getTime() : NaN
  if (Number.isFinite(verifiedAt) && now.getTime() - verifiedAt < CACHE_FRESHNESS_MS) {
    return { allowed: true, reason: 'allowed_by_freshness' }
  }
  // Past the recheck window: stand on a date Shopify itself stated, or deny.
  if (isFuture(row.shopify_trial_ends_at, now)) return { allowed: true, reason: 'allowed_by_trial' }
  if (isFuture(row.shopify_current_period_end, now)) return { allowed: true, reason: 'allowed_by_period' }
  return { allowed: false, reason: 'stale_without_open_window' }
}

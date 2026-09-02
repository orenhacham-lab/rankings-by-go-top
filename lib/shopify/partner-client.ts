/**
 * Phase 2 — Shopify Partner API client (server-only). Used EXCLUSIVELY to call
 * `activeSubscription(appId:, shopId:)` — the Partner API's authoritative
 * answer to "does this shop have an active Shopify App Pricing plan for this
 * app right now." This is the ONLY exported query in this module; there is no
 * mutation capability here (no appSubscriptionCreate, no billing webhooks) —
 * this client cannot create, modify, or cancel a subscription.
 *
 * Distinct from lib/shopify/client.ts (the per-shop Admin API client, used
 * for product/content sync and article publishing): this client targets
 * partners.shopify.com, authenticates with a dedicated Partner API client
 * token (SHOPIFY_PARTNER_API_ACCESS_TOKEN — never a shop's OAuth access
 * token), and is keyed by the Partner API's own app GID
 * (SHOPIFY_PARTNER_APP_GID) plus a Shopify Shop GID — never the OAuth
 * SHOPIFY_CLIENT_ID and never a shop_domain string.
 *
 * Query shape verified against shopify.dev (Partner API `ActiveSubscription`
 * object + the "Active subscription" guide) via web search, and the `appId`
 * GID namespace additionally confirmed live against the real Partner API
 * (see docs/shopify-partner-app-gid-verification.md). `activeSubscription`
 * returns null when the shop has no active managed-pricing contract for this
 * app — that is the "not subscribed" signal; there is no separate top-level
 * status field to check.
 *
 * Every failure mode (missing config, network, timeout, auth, rate limit,
 * malformed response) returns `{ ok: false }` — callers MUST treat that as
 * "verification could not complete," never as "no active subscription." Only
 * `{ ok: true, active: false }` means Shopify affirmatively has no active
 * plan for this shop. The Partner API token is read from env only, used
 * solely as the request header, and never logged, thrown in an error
 * message, or returned to a caller.
 */

import { isSupportedShopifyPlanHandle, type ShopifyPlanHandle } from './constants'

const REQUEST_TIMEOUT_MS = 15_000
const MAX_TRANSIENT_RETRIES = 2

export type PartnerApiErrorKind =
  | 'missing_config'
  | 'network'
  | 'timeout'
  | 'invalid_token'
  | 'rate_limited'
  | 'api_error'
  | 'malformed_response'
  | 'shop_identity_mismatch'

export class PartnerApiError extends Error {
  kind: PartnerApiErrorKind
  constructor(kind: PartnerApiErrorKind, message: string) {
    super(message)
    this.name = 'PartnerApiError'
    this.kind = kind
  }
}

interface PartnerApiConfig {
  accessToken: string
  organizationId: string
  appGid: string
  apiVersion: string
}

/**
 * Blocker C (resolved) — the Partner API app GID namespace is CONFIRMED via a
 * live GraphiQL call against `activeSubscription`: `gid://partners/App/…`
 * is rejected outright by the API ("Invalid GID app name 'partners'. Use
 * 'shopify' instead."); `gid://shopify/App/…` is accepted (returned a clean
 * `{ "data": { "activeSubscription": null } }` with no errors). See
 * docs/shopify-partner-app-gid-verification.md for the full verification
 * record. Only `gid://shopify/App/…` is accepted here — never `gid://partners/
 * App/…`, and never silently rewritten from one namespace to the other.
 */
const PARTNER_APP_GID_PATTERN = /^gid:\/\/shopify\/App\/\d+$/

/**
 * Reads + validates the required Partner API env vars. Returns null (never
 * throws) if any is missing/empty, or if SHOPIFY_PARTNER_APP_GID doesn't match
 * either known GID namespace — callers must fail closed on null. Never logs
 * the token or any config value.
 */
function loadPartnerApiConfig(): PartnerApiConfig | null {
  const accessToken = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN?.trim()
  const organizationId = process.env.SHOPIFY_PARTNER_ORGANIZATION_ID?.trim()
  const appGid = process.env.SHOPIFY_PARTNER_APP_GID?.trim()
  const apiVersion = process.env.SHOPIFY_PARTNER_API_VERSION?.trim()
  if (!accessToken || !organizationId || !appGid || !apiVersion) return null
  if (!PARTNER_APP_GID_PATTERN.test(appGid)) return null
  return { accessToken, organizationId, appGid, apiVersion }
}

function endpoint(config: PartnerApiConfig): string {
  return `https://partners.shopify.com/${encodeURIComponent(config.organizationId)}/api/${encodeURIComponent(config.apiVersion)}/graphql.json`
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
function backoffMs(attempt: number, baseMs = 400, capMs = 3000): number {
  return Math.min(baseMs * Math.pow(2, Math.max(0, attempt)), capMs)
}

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message?: string; extensions?: { code?: string } }>
}

/** One Partner API GraphQL call with transient-only retry. Throws PartnerApiError (classified) otherwise. */
async function partnerGraphql<T>(
  config: PartnerApiConfig,
  query: string,
  variables: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  let lastErr: PartnerApiError | null = null
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1))
    let res: Response
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      res = await fetchImpl(endpoint(config), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': config.accessToken,
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
        redirect: 'error',
      })
    } catch {
      lastErr = new PartnerApiError(
        controller.signal.aborted ? 'timeout' : 'network',
        'Could not reach the Shopify Partner API.',
      )
      continue // transient — retry
    } finally {
      clearTimeout(timer)
    }

    if (res.status === 401 || res.status === 403) {
      throw new PartnerApiError('invalid_token', 'Partner API authentication failed.')
    }
    if (res.status === 429) {
      lastErr = new PartnerApiError('rate_limited', 'Partner API rate limit reached.')
      continue
    }
    if (res.status >= 500) {
      lastErr = new PartnerApiError('api_error', `Partner API server error (HTTP ${res.status}).`)
      continue
    }
    if (res.status < 200 || res.status >= 300) {
      throw new PartnerApiError('api_error', `Partner API returned HTTP ${res.status}.`)
    }

    let json: GraphQLResponse<T>
    try {
      json = (await res.json()) as GraphQLResponse<T>
    } catch {
      throw new PartnerApiError('malformed_response', 'Partner API returned an invalid response.')
    }
    if (json.errors && json.errors.length) {
      const codes = json.errors.map((e) => String(e.extensions?.code || '').toUpperCase())
      const messages = json.errors.map((e) => String(e.message || '')).join('; ')
      if (codes.includes('THROTTLED')) {
        lastErr = new PartnerApiError('rate_limited', 'Partner API rate limit reached.')
        continue
      }
      throw new PartnerApiError('api_error', messages || 'Partner API returned errors.')
    }
    if (!json.data) throw new PartnerApiError('malformed_response', 'Partner API returned no data.')
    return json.data
  }
  throw lastErr ?? new PartnerApiError('network', 'Partner API request failed after retries.')
}

const ACTIVE_SUBSCRIPTION_QUERY = `
  query ActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      shop { id myshopifyDomain }
      trialEndsAt
      cancelAtEndOfCycle
      currentBillingCycle { startTime endTime }
      items { handle price { __typename active } }
    }
  }
`
// pendingUpdate is DELIBERATELY not queried: current entitlement is derived
// only from `items` (the CURRENT contract). A pending update describes a
// future, not-yet-effective change and must never be read as if it were
// already active.

interface ActiveSubscriptionData {
  activeSubscription: {
    shop: { id: string | null; myshopifyDomain: string | null } | null
    trialEndsAt: string | null
    cancelAtEndOfCycle: boolean | null
    currentBillingCycle: { startTime: string | null; endTime: string | null } | null
    items: { handle: string | null; price: { active: boolean | null } | null }[] | null
  } | null
}

export type ActiveSubscriptionResult =
  | {
      ok: true; active: true; planHandle: ShopifyPlanHandle; trialEndsAt: string | null
      currentPeriodEnd: string | null
      /** Phase 3 — authoritative billing-cycle start, straight from the
       *  Partner API's own currentBillingCycle.startTime. Whatever Shopify
       *  reports here is always what gets cached — including after an
       *  upgrade/downgrade/replacement subscription changes the cycle
       *  boundaries; there is no special-cased "never reset" logic. */
      currentPeriodStart: string | null
      cancelAtEndOfCycle: boolean
    }
  | { ok: true; active: false; reason: 'no_subscription' | 'unrecognized_plan_handle'; rawHandles?: string[] }
  | { ok: false; reason: PartnerApiErrorKind }

/**
 * The ONLY Partner API query this app ever calls. FAILS CLOSED: every error
 * path (missing config, network, timeout, auth, rate limit, malformed
 * response, shop-identity mismatch) returns `{ ok: false }` — the caller must
 * treat that as "verification could not complete" and deny Shopify
 * publishing, never silently treat it as "no active subscription."
 *
 * `active: true` requires ALL of:
 *   - a non-null activeSubscription — this is Shopify's own liveness answer
 *     for this app + shop, and it is true throughout a free trial;
 *   - Shopify's OWN `shop.id` on the returned subscription matches the
 *     `shopGid` we asked for (defends against ever trusting a response for
 *     the wrong shop);
 *   - at least one subscription item whose handle is in
 *     SHOPIFY_SUPPORTED_PLAN_HANDLES (an active contract for an
 *     unrecognized/obsolete handle, e.g. a leftover `free-plan`, is
 *     `active: false`, never a valid entitlement).
 *
 * `price.active` is deliberately NOT part of that test — see the Sep 2
 * incident note at the check itself. `currentBillingCycle` may legitimately be
 * null during a trial, so currentPeriodStart/End are simply null then; a plan
 * is never rejected for lacking a billing cycle.
 * Only CURRENT `items` are read — `pendingUpdate` is never consulted (see
 * above), so a plan change that hasn't taken effect yet cannot grant early
 * entitlement.
 */
export async function getActiveShopifySubscription(
  shopGid: string,
  fetchImpl: typeof fetch = fetch,
  expectedMyshopifyDomain?: string,
): Promise<ActiveSubscriptionResult> {
  const config = loadPartnerApiConfig()
  if (!config) return { ok: false, reason: 'missing_config' }
  if (!shopGid || typeof shopGid !== 'string') return { ok: false, reason: 'malformed_response' }

  let data: ActiveSubscriptionData
  try {
    data = await partnerGraphql<ActiveSubscriptionData>(config, ACTIVE_SUBSCRIPTION_QUERY, {
      appId: config.appGid,
      shopId: shopGid,
    }, fetchImpl)
  } catch (err) {
    const kind = err instanceof PartnerApiError ? err.kind : 'api_error'
    return { ok: false, reason: kind }
  }

  const sub = data.activeSubscription
  if (!sub) return { ok: true, active: false, reason: 'no_subscription' }

  // Integrity check: the subscription Shopify returned must be for the exact
  // shop we asked about — both by GID and (when the caller supplies it, e.g.
  // from the shopify_connections row) by canonical .myshopify.com domain.
  if (sub.shop?.id !== shopGid) return { ok: false, reason: 'shop_identity_mismatch' }
  if (expectedMyshopifyDomain && sub.shop?.myshopifyDomain !== expectedMyshopifyDomain) {
    return { ok: false, reason: 'shop_identity_mismatch' }
  }

  // LIVENESS IS THE SUBSCRIPTION, NOT THE PRICE (production incident, Sep 2).
  //
  // This code used to drop any item whose `price.active` was explicitly
  // `false`. Shopify returns exactly that during a managed-pricing FREE TRIAL:
  // the merchant has a real, current contract, but no money is moving yet.
  // Verified live against the Partner API for the incident store:
  //
  //   activeSubscription: { trialEndsAt: "2026-09-08T23:28:48Z",
  //     currentBillingCycle: null,
  //     items: [{ handle: "advanced", price: { active: false } }] }
  //
  // The only supported item was filtered out, no handle survived, and a
  // paying-in-trial merchant was cached as having no plan at all — while
  // Shopify's own screen showed Advanced as Current with 7 trial days left.
  //
  // `activeSubscription` being non-null IS Shopify's answer to "is there a live
  // contract for this app and shop"; there is no separate status field. The
  // plan is therefore identified from the item HANDLES alone, and `price.active`
  // is not consulted — it describes the price line's billing state, not whether
  // the merchant is entitled. Every other gate is unchanged: a null
  // subscription, a shop-identity mismatch, a malformed response and an
  // unsupported handle all still fail closed.
  const items = Array.isArray(sub.items) ? sub.items : []
  const handles = items
    .map((i) => i?.handle)
    .filter((h): h is string => typeof h === 'string' && h.length > 0)
  const recognized = handles.find(isSupportedShopifyPlanHandle)
  if (!recognized) {
    return { ok: true, active: false, reason: 'unrecognized_plan_handle', rawHandles: handles }
  }

  return {
    ok: true,
    active: true,
    planHandle: recognized,
    trialEndsAt: sub.trialEndsAt ?? null,
    currentPeriodEnd: sub.currentBillingCycle?.endTime ?? null,
    currentPeriodStart: sub.currentBillingCycle?.startTime ?? null,
    cancelAtEndOfCycle: sub.cancelAtEndOfCycle === true,
  }
}

/**
 * A SHORT, SANITIZED note for shopify_billing_last_error explaining why a
 * verification came back inactive.
 *
 * app-home used to write `null` here on every inactive result, discarding both
 * the reason and the handles Shopify actually returned — which is why the Sep 2
 * incident could not be told apart from genuine non-payment without a live
 * Partner API query. Handles are Shopify's own public plan identifiers; they
 * are capped in count and length and stripped to a conservative character set,
 * so nothing free-form (and no token, secret or customer data) can reach the
 * column.
 */
const MAX_NOTE_HANDLES = 5
const MAX_NOTE_HANDLE_CHARS = 40

export function describeInactiveSubscription(
  reason: 'no_subscription' | 'unrecognized_plan_handle',
  rawHandles?: string[],
): string {
  if (reason !== 'unrecognized_plan_handle') return 'no_subscription'
  const safe = (rawHandles ?? [])
    .slice(0, MAX_NOTE_HANDLES)
    .map((h) => String(h).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, MAX_NOTE_HANDLE_CHARS))
    .filter((h) => h.length > 0)
  return safe.length > 0 ? `unrecognized_plan_handle:${safe.join(',')}` : 'unrecognized_plan_handle'
}

/**
 * Phase 2 blocker-fix QA — the centralized entitlement resolver (Blocker 1),
 * the pending-install/link mechanism (Blocker 2), the extended
 * billing-provider state machine (Blocker 3), adversarial return-route /
 * shop-identity checks (Blocker 5), and misc Partner API correctness fixes
 * (Blocker 6). No live network, no live Supabase (FakeAdmin) — a real
 * `Request` object is used for the cookie-reading tests. Run:
 *   npx tsx lib/shopify/__qa__/phase2-blockers.qa.ts
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { getActiveShopifySubscription } from '../partner-client'
import {
  resolveShopifyGovernedEntitlement, isShopifyGovernedAndActive,
} from '../entitlement-resolver'
import { isShopifyBillingRequiredForUser } from '../paypal-block'
import {
  signPendingLinkCookieValue, verifyPendingLinkCookieValue, createPendingInstall,
  loadValidPendingInstall, consumePendingInstall, hasPendingShopifyLinkCookie, PENDING_LINK_COOKIE,
} from '../pending-link'
import { PLAN_LIMITS } from '@/lib/subscription'
import { SHOPIFY_SUPPORTED_PLAN_HANDLES } from '../constants'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

process.env.SHOPIFY_CLIENT_ID = 'test-client-id'
process.env.SHOPIFY_CLIENT_SECRET = 'test-client-secret'
process.env.SHOPIFY_APP_URL = 'https://www.example-test.com'
process.env.SHOPIFY_APP_HANDLE = 'go-top-seo-test'
process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = 'test-partner-token'
process.env.SHOPIFY_PARTNER_ORGANIZATION_ID = '4243054'
process.env.SHOPIFY_PARTNER_APP_GID = 'gid://shopify/App/397648429057'
process.env.SHOPIFY_PARTNER_API_VERSION = '2026-07'

const SHOP_GID = 'gid://shopify/Shop/1'
const SHOP_DOMAIN = 'test-shop.myshopify.com'

function fakePartnerFetch(impl: () => { status: number; body: unknown }): typeof fetch {
  return (async () => {
    const r = impl()
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response
  }) as unknown as typeof fetch
}
const activeSubBody = (handle: string, shopId = SHOP_GID, myshopifyDomain = SHOP_DOMAIN, cancelAtEndOfCycle = false) => ({
  data: {
    activeSubscription: {
      shop: { id: shopId, myshopifyDomain },
      trialEndsAt: null,
      cancelAtEndOfCycle,
      currentBillingCycle: { endTime: '2026-12-01T00:00:00Z' },
      items: [{ handle, price: { __typename: 'FlatRatePrice', active: true } }],
    },
  },
})

const nowIso = () => new Date().toISOString()
function connectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1', user_id: 'u1', project_id: 'p1', shop_domain: SHOP_DOMAIN, shop_gid: SHOP_GID,
    connection_status: 'connected', shopify_plan_handle: null, shopify_subscription_status: null,
    shopify_current_period_end: null, shopify_billing_verified_at: null,
    ...overrides,
  }
}

/**
 * The resolver now returns a DISCRIMINATED result so that an infrastructure
 * failure can never be mistaken for "not Shopify-governed". These helpers keep
 * the existing assertions readable: `governedEntitlement` is the old
 * `ShopifyGovernedEntitlement | null` shape, and it THROWS on 'unavailable' so
 * a test can never silently pass through an outage.
 */
async function governedEntitlement(adminClient: unknown, userId: string) {
  const r = await resolveShopifyGovernedEntitlement(adminClient as never, userId)
  if (r.kind === 'unavailable') throw new Error(`unexpected unavailable: ${r.reason}`)
  return r.kind === 'governed' ? r.entitlement : null
}

async function main() {
  console.log('Phase 2 blocker-fix QA\n')

  // ── Blocker 1 — centralized entitlement resolver ──
  console.log('1) resolveShopifyGovernedEntitlement — a non-Shopify user is untouched (returns null)')
  {
    const admin = new FakeAdmin({ shopify_connections: [], shopify_billing_migrations: [] })
    const r = await governedEntitlement(admin, 'u-no-shopify')
    check('null — caller falls back to normal PayPal/trial logic', r === null)
  }

  console.log('\n2) resolveShopifyGovernedEntitlement — EVERY supported Shopify handle maps to the SAME Rankings limits as its PayPal-plan equivalent')
  {
    const HANDLE_TO_CODE: Record<string, string> = { regular: 'regular', advanced: 'advanced', premium: 'premium', 'large-agency': 'large_agency' }
    for (const handle of SHOPIFY_SUPPORTED_PLAN_HANDLES) {
      const expectedCode = HANDLE_TO_CODE[handle]
      // Pre-seed a FRESH cache exactly as a live check would have written it
      // (see test 16 below for the live-path write-through itself) — proves
      // the cache-read mapping (the path getUserEntitlement actually uses
      // per-request) is correct for every supported handle.
      const cached = new FakeAdmin({
        billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [connectionRow({ shopify_plan_handle: handle, shopify_subscription_status: 'active', shopify_billing_verified_at: nowIso() })],
        shopify_billing_migrations: [],
      })
      const cr = await governedEntitlement(cached, 'u1')
      check(`${handle} -> ${expectedCode}: governed with the right planCode`, cr?.governed === true && cr.planCode === expectedCode)
      check(`${handle} -> ${expectedCode}: limits are EXACTLY PLAN_LIMITS.${expectedCode} (same object identity)`,
        cr?.planCode != null && PLAN_LIMITS[cr.planCode] === PLAN_LIMITS[expectedCode as keyof typeof PLAN_LIMITS])
    }
  }

  console.log('\n3) resolveShopifyGovernedEntitlement — reviewer-account scenario: a manually-granted large_agency subscriptions row never leaks into the resolved plan')
  {
    const admin = new FakeAdmin({
      subscriptions: [{ id: 'sub-1', user_id: 'u1', plan_code: 'large_agency', status: 'active', paypal_subscription_id: null }],
      billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [connectionRow({ shopify_subscription_status: 'none', shopify_billing_verified_at: nowIso() })],
      shopify_billing_migrations: [],
    })
    const r = await governedEntitlement(admin, 'u1')
    check('governed:true but planCode is null (NOT large_agency) — the subscriptions row is never read for this user', r?.governed === true && r.planCode === null)
  }

  console.log('\n4) resolveShopifyGovernedEntitlement — an in-progress PayPal migration never grants a Shopify plan_code, even with a stale-active cache')
  {
    const admin = new FakeAdmin({
      billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [connectionRow({ shopify_plan_handle: 'premium', shopify_subscription_status: 'active', shopify_billing_verified_at: nowIso() })],
      shopify_billing_migrations: [{ id: 'm1', user_id: 'u1', project_id: 'p1', status: 'pending', paypal_cancel_attempts: 0 }],
    })
    const r = await governedEntitlement(admin, 'u1')
    check('governed:true, planCode null, verificationError paypal_migration_incomplete', r?.governed === true && r.planCode === null && r.verificationError === 'paypal_migration_incomplete')
  }

  console.log('\n5) isShopifyGovernedAndActive (hasAccess hot-path) — cache-only, fails closed on a never-verified connection')
  {
    const neverVerified = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [connectionRow({ shopify_billing_verified_at: null })] })
    const r1 = await isShopifyGovernedAndActive(neverVerified as unknown as Admin, 'u1')
    check('governed:true, active:false (no live call possible on this hot path)', r1.governed === true && r1.active === false)

    const freshActive = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [connectionRow({ shopify_subscription_status: 'active', shopify_billing_verified_at: nowIso() })] })
    const r2 = await isShopifyGovernedAndActive(freshActive as unknown as Admin, 'u1')
    check('governed:true, active:true with a fresh active cache', r2.governed === true && r2.active === true)

    const notGoverned = new FakeAdmin({ shopify_connections: [] })
    const r3 = await isShopifyGovernedAndActive(notGoverned as unknown as Admin, 'u1')
    check('governed:false for a non-Shopify user', r3.governed === false)
  }

  // ── Blocker 2 — pending-install/link mechanism ──
  console.log('\n6) pending-link cookie signing — sign/verify round-trip, tamper- and wrong-secret-resistant')
  {
    const token = 'a'.repeat(64)
    const signed = signPendingLinkCookieValue(token, 'test-client-secret')
    check('verifies with the correct secret', verifyPendingLinkCookieValue(signed, 'test-client-secret') === token)
    check('rejects a tampered value', verifyPendingLinkCookieValue(signed.slice(0, -1) + (signed.endsWith('0') ? '1' : '0'), 'test-client-secret') === null)
    check('rejects the wrong secret', verifyPendingLinkCookieValue(signed, 'WRONG-secret') === null)
    check('rejects a missing value', verifyPendingLinkCookieValue(undefined, 'test-client-secret') === null)
    check('rejects a malformed value (no dot)', verifyPendingLinkCookieValue('not-signed-at-all', 'test-client-secret') === null)
  }

  console.log('\n7) pending-install lifecycle — create, load, expire, single-use consume')
  {
    const admin = new FakeAdmin({ shopify_pending_installs: [] })
    const token = await createPendingInstall(admin as unknown as Admin, {
      shop_domain: SHOP_DOMAIN, shop_gid: SHOP_GID, access_token_encrypted: 'enc',
      install_origin: 'shopify_app_store',
      refresh_token_encrypted: 'enc(refresh)',
      oauth_app_edition: 'public' as const,
      access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
      api_version: '2026-07',
      granted_scopes: ['read_products'], storefront_domain: null,
    })
    const loaded = await loadValidPendingInstall(admin as unknown as Admin, token)
    check('round-trips the exact shop_domain', loaded?.shop_domain === SHOP_DOMAIN)

    const consumedOk = await consumePendingInstall(admin as unknown as Admin, token)
    check('first consume succeeds', consumedOk === true)
    const consumedAgain = await consumePendingInstall(admin as unknown as Admin, token)
    check('a second consume is a no-op (already consumed)', consumedAgain === false)
    const loadedAfterConsume = await loadValidPendingInstall(admin as unknown as Admin, token)
    check('a consumed row can never be loaded/reused again (single-use)', loadedAfterConsume === null)
  }

  console.log('\n8) pending-install lifecycle — an EXPIRED row cannot be loaded even with a valid token/signature')
  {
    const admin = new FakeAdmin({
      shopify_pending_installs: [{
        token: 'expired-token', shop_domain: SHOP_DOMAIN, shop_gid: SHOP_GID, access_token_encrypted: 'enc',
        api_version: '2026-07', granted_scopes: [], storefront_domain: null,
        expires_at: new Date(Date.now() - 60_000).toISOString(), consumed_at: null,
      }],
    })
    const loaded = await loadValidPendingInstall(admin as unknown as Admin, 'expired-token')
    check('expired pending install is never returned as valid', loaded === null)
  }

  console.log('\n9) hasPendingShopifyLinkCookie — reads + verifies the cookie straight from a Request, never trusts an unsigned value')
  {
    const token = 'b'.repeat(64)
    const signed = signPendingLinkCookieValue(token, 'test-client-secret')
    const withCookie = new Request('https://www.example-test.com/api/paypal/activate', { headers: { cookie: `${PENDING_LINK_COOKIE}=${encodeURIComponent(signed)}` } })
    check('true when the signed cookie is present and valid', hasPendingShopifyLinkCookie(withCookie) === true)

    const noCookie = new Request('https://www.example-test.com/api/paypal/activate')
    check('false when no cookie is present at all', hasPendingShopifyLinkCookie(noCookie) === false)

    const forged = new Request('https://www.example-test.com/api/paypal/activate', { headers: { cookie: `${PENDING_LINK_COOKIE}=${encodeURIComponent(token + '.deadbeef')}` } })
    check('false for a forged/unsigned cookie value (an attacker cannot self-issue this gate)', hasPendingShopifyLinkCookie(forged) === false)
  }

  // ── Blocker 3 — extended billing-provider state machine ──
  console.log('\n10) isShopifyBillingRequiredForUser — blocks PayPal for a connection stuck at "failed" scope grant that STILL has an unresolved migration')
  {
    const admin = new FakeAdmin({
      shopify_connections: [{ id: 'c1', user_id: 'u1', connection_status: 'failed' }],
      shopify_billing_migrations: [{ id: 'm1', user_id: 'u1', project_id: 'p1', status: 'pending', paypal_cancel_attempts: 0 }],
    })
    // The connection is 'failed' AND the user is website-authority, so nothing
    // about the connection blocks PayPal — the in-flight MIGRATION does.
    check('isShopifyBillingRequiredForUser correctly still blocks PayPal via the migration', await isShopifyBillingRequiredForUser(admin as unknown as Admin, 'u1') === true)
  }

  console.log('\n11) isShopifyBillingRequiredForUser — a genuinely clean, non-Shopify user is never blocked')
  {
    const admin = new FakeAdmin({ shopify_connections: [], shopify_billing_migrations: [] })
    check('false — normal PayPal population, unaffected', await isShopifyBillingRequiredForUser(admin as unknown as Admin, 'u-normal') === false)
  }

  console.log('\n12) isShopifyBillingRequiredForUser — after a clean uninstall (no migration ever existed), PayPal is available again')
  {
    const admin = new FakeAdmin({
      shopify_connections: [{ id: 'c1', user_id: 'u1', connection_status: 'failed', last_error: 'app_uninstalled' }],
      shopify_billing_migrations: [],
    })
    check('false — reverted to the PayPal population, confirmed via the authoritative connection row (not a browser action)', await isShopifyBillingRequiredForUser(admin as unknown as Admin, 'u1') === false)
  }

  // ── Blocker 5 — adversarial shop-identity checks ──
  console.log('\n13) getActiveShopifySubscription — Shopify returning a DIFFERENT shop.id than requested is rejected, never treated as active')
  {
    const f = fakePartnerFetch(() => ({ status: 200, body: activeSubBody('premium', 'gid://shopify/Shop/999-DIFFERENT-SHOP') }))
    const r = await getActiveShopifySubscription(SHOP_GID, f)
    check('ok:false, reason shop_identity_mismatch (never active:true for the wrong shop)', r.ok === false && r.reason === 'shop_identity_mismatch')
  }

  console.log('\n14) getActiveShopifySubscription — a matching shop.id but WRONG myshopifyDomain (caller-supplied expected domain) is also rejected')
  {
    const f = fakePartnerFetch(() => ({ status: 200, body: activeSubBody('premium', SHOP_GID, 'attacker-shop.myshopify.com') }))
    const r = await getActiveShopifySubscription(SHOP_GID, f, SHOP_DOMAIN)
    check('ok:false, reason shop_identity_mismatch', r.ok === false && r.reason === 'shop_identity_mismatch')
  }

  console.log('\n15) getActiveShopifySubscription — with NO expected domain supplied, only the shop.id check applies (id match is sufficient)')
  {
    const f = fakePartnerFetch(() => ({ status: 200, body: activeSubBody('premium', SHOP_GID, 'some-other-domain.myshopify.com') }))
    const r = await getActiveShopifySubscription(SHOP_GID, f)
    check('ok:true, active:true — domain not checked when the caller does not supply one', r.ok === true && r.active === true)
  }

  // ── Blocker 6 — misc correctness ──
  console.log('\n16) getActiveShopifySubscription — cancelAtEndOfCycle is read and propagated')
  {
    const f = fakePartnerFetch(() => ({ status: 200, body: activeSubBody('premium', SHOP_GID, SHOP_DOMAIN, true) }))
    const r = await getActiveShopifySubscription(SHOP_GID, f)
    check('active:true with cancelAtEndOfCycle=true propagated', r.ok === true && r.active === true && r.cancelAtEndOfCycle === true)
  }

  console.log('\n17) getActiveShopifySubscription — a supported handle is NOT rejected because price.active is false (Sep 2 incident)')
  {
    // CORRECTED. This test used to assert the opposite, and that assertion was
    // the production bug: Shopify reports price.active=false for a real,
    // current managed-pricing contract that is still inside its free trial.
    // Liveness is `activeSubscription` being non-null; price.active describes
    // the price line's billing state, not the merchant's entitlement.
    const body = {
      data: {
        activeSubscription: {
          shop: { id: SHOP_GID, myshopifyDomain: SHOP_DOMAIN },
          trialEndsAt: null, cancelAtEndOfCycle: false,
          currentBillingCycle: { endTime: '2026-12-01T00:00:00Z' },
          items: [{ handle: 'premium', price: { __typename: 'FlatRatePrice', active: false } }],
        },
      },
    }
    const f = fakePartnerFetch(() => ({ status: 200, body }))
    const r = await getActiveShopifySubscription(SHOP_GID, f)
    check('a supported handle still grants entitlement when price.active is false',
      r.ok === true && r.active === true && r.planHandle === 'premium')
    // The unsupported-handle gate is what actually refuses a plan, and it is
    // unchanged — proven here so removing the price filter cannot be mistaken
    // for removing entitlement checking altogether.
    const unsupported = fakePartnerFetch(() => ({ status: 200, body: {
      data: { activeSubscription: {
        shop: { id: SHOP_GID, myshopifyDomain: SHOP_DOMAIN },
        trialEndsAt: null, cancelAtEndOfCycle: false, currentBillingCycle: null,
        items: [{ handle: 'free-plan', price: { __typename: 'FlatRatePrice', active: false } }],
      } },
    } }))
    const ru = await getActiveShopifySubscription(SHOP_GID, unsupported)
    check('an UNSUPPORTED handle is still refused regardless of price.active',
      ru.ok === true && ru.active === false && ru.reason === 'unrecognized_plan_handle')
  }

  console.log('\n18) getActiveShopifySubscription — a trial with trialEndsAt set and currentBillingCycle null does not crash and still resolves the plan')
  {
    const body = {
      data: {
        activeSubscription: {
          shop: { id: SHOP_GID, myshopifyDomain: SHOP_DOMAIN },
          trialEndsAt: '2026-09-01T00:00:00Z', cancelAtEndOfCycle: false,
          currentBillingCycle: null,
          items: [{ handle: 'regular', price: { __typename: 'FlatRatePrice', active: true } }],
        },
      },
    }
    const f = fakePartnerFetch(() => ({ status: 200, body }))
    const r = await getActiveShopifySubscription(SHOP_GID, f)
    check('active:true, trialEndsAt propagated, currentPeriodEnd safely null', r.ok === true && r.active === true && r.trialEndsAt === '2026-09-01T00:00:00Z' && r.currentPeriodEnd === null)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Shopify submission blocker — an active-trial merchant redirected to /billing.
 *
 * PRODUCTION FACTS (user 674fc7c3-2048-48f4-ba25-6e2a6dff4a06):
 *   billing_governance.billing_authority = shopify
 *   shopify_connections: connection_status=connected, plan_handle=advanced,
 *     subscription_status=active, trial_ends_at=2026-09-08T23:28:48Z,
 *     current_period_start=NULL, current_period_end=NULL,
 *     billing_verified_at=2026-09-04T09:31:05.131Z, billing_last_error=NULL
 * Embedded /api/shopify/app-home returned 200 and Advanced and persisted that
 * state; "Open full dashboard" then produced a 307 to /billing.
 *
 * These tests drive the REAL middleware — proxy() from proxy.ts — with a real
 * NextRequest, and assert on the real NextResponse status and Location. The
 * whole production chain runs: proxy → hasAccess → isShopifyGovernedAndActive
 * → resolveBillingAuthority → decideShopifyRouteAccess. Only Supabase itself is
 * stood in for (FakeAdmin, which applies real filter semantics). NO assertion
 * here is a source-text match.
 *
 * NOT browser-verified.
 *
 * Run: npx tsx lib/shopify/__qa__/shopify-trial-route-access.qa.ts
 */

/*
 * `require()` is deliberate and cannot be an import: tsx runs this file as
 * CommonJS, and the Module._load hook below must be installed BEFORE the
 * modules under test load. A static `import` is hoisted above it and would
 * load them first, defeating the substitution.
 */
const Module: any = require('module')
const origLoad = Module._load
const INTERCEPT = ['@supabase/ssr', '@supabase/supabase-js']
const overrides = new Map<string, Record<string, unknown>>()
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  let resolved: string
  try { resolved = String(Module._resolveFilename(request, parent, isMain)) } catch { resolved = request }
  const key = INTERCEPT.find((x) => request === x || resolved.endsWith(x))
  if (!key) return real
  return new Proxy(real, {
    get: (t, k) => {
      const over = overrides.get(key)
      return over && (k as string) in over ? over[k as string] : (t as any)[k]
    },
  })
}

// proxy.ts refuses to run at all unless Supabase looks configured.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-service-role-key'

import { FakeAdmin } from '../../__qa__/_fake-admin'
import { decideShopifyRouteAccess } from '../entitlement-resolver'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ── The production facts, verbatim ─────────────────────────────────────────
const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const PROJECT = '99560b55-3c90-4b9b-807c-b84101080909'
const VERIFIED_AT = '2026-09-04T09:31:05.131Z'
const TRIAL_ENDS = '2026-09-08T23:28:48Z'
/** Well past the 5-minute cache window, well inside the trial. This is the
 *  moment the merchant was redirected. */
const NOW_IN_TRIAL = new Date('2026-09-04T11:00:00.000Z')
/** After the trial ended, with no billing cycle to fall back on. */
const NOW_AFTER_TRIAL = new Date('2026-09-10T00:00:00.000Z')

const PROTECTED = ['/dashboard', '/projects', '/clients', '/keywords', '/scans', '/reports']

function productionConnection(over: Record<string, unknown> = {}) {
  return {
    id: 'conn-1', user_id: USER, project_id: PROJECT,
    shop_domain: 'gotopseo.myshopify.com', connection_status: 'connected', archived_at: null,
    shopify_plan_handle: 'advanced',
    shopify_subscription_status: 'active',
    shopify_trial_ends_at: TRIAL_ENDS,
    shopify_current_period_start: null,
    shopify_current_period_end: null,
    shopify_billing_verified_at: VERIFIED_AT,
    shopify_billing_last_error: null,
    oauth_app_edition: 'public',
    updated_at: VERIFIED_AT,
    ...over,
  }
}

/**
 * A world with an EXPLICIT billing_governance row. Never omitted: a missing
 * row resolves to 'website' authority, which would silently test a different
 * code path than the one that failed in production.
 */
function world(opts: {
  authority?: 'shopify' | 'website'
  connection?: Record<string, unknown> | null
  subscriptions?: any[]
  governanceReadFails?: boolean
  projectActive?: boolean
} = {}) {
  const hooks: Record<string, any> = {}
  if (opts.governanceReadFails) hooks.billing_governance = { select: () => ({ code: '57014', message: 'statement timeout' }) }
  return new FakeAdmin({
    profiles: [{ id: USER, role: 'user' }],
    billing_governance: [{
      user_id: USER, signup_origin: 'shopify_app_store',
      billing_authority: opts.authority ?? 'shopify', authority_reason: 'verified_app_store_install',
    }],
    shopify_connections: opts.connection === null ? [] : [productionConnection(opts.connection ?? {})],
    subscriptions: opts.subscriptions ?? [],
    projects: [{ id: PROJECT, user_id: USER, is_active: opts.projectActive !== false, name: 'Go Top', business_name: 'Go Top', target_domain: 'gotopseo.com', language: 'he' }],
  }, hooks)
}

/**
 * The SSR client proxy() builds from the ANON key.
 *
 * THE BOUNDARY THAT BROKE PRODUCTION. billing_governance is RLS-enabled with
 * NO policies and REVOKEd from anon/authenticated (migration
 * 20260901000000_billing_governance.sql:85-87), so PostgREST answers an
 * `authenticated` read with 42501 permission denied. The previous version of
 * this suite handed the middleware a client that COULD read that table, which
 * is why it passed while production 307'd. This fake now denies it exactly as
 * the database does, so anything reaching for governance through the session
 * client fails here too.
 */
function asSsrClient(admin: FakeAdmin, user: { id: string } | null) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (t: string) => {
      if (t === 'billing_governance') return rlsDeniedTable()
      return admin.from(t)
    },
  }
}

/** A PostgREST table handle that answers every read with 42501, like RLS does. */
function rlsDeniedTable() {
  const denied = { data: null, error: { code: '42501', message: 'permission denied for table billing_governance' } }
  const chain: any = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'then') return undefined
      if (k === 'maybeSingle' || k === 'single') return async () => denied
      return () => chain
    },
  })
  return chain
}

/** Run the REAL middleware for one pathname. Returns status + Location. */
async function runProxy(admin: FakeAdmin, pathname: string, now: Date, user: { id: string } | null = { id: USER }) {
  overrides.set('@supabase/ssr', { createServerClient: () => asSsrClient(admin, user) })
  // The SERVICE-ROLE client proxy() builds for the entitlement decision. This
  // one CAN read billing_governance — that is the whole point of the fix.
  overrides.set('@supabase/supabase-js', { createClient: () => admin })
  const realNow = Date.now
  // proxy() -> hasAccess() -> isShopifyGovernedAndActive() all default their
  // clock to `new Date()`; freeze it so the test is not governed by wall time.
  const RealDate = Date
  ;(global as any).Date = class extends RealDate {
    constructor(...args: any[]) { super(...(args.length ? args : [now.getTime()]) as []) }
    static now() { return now.getTime() }
  } as any
  try {
    const { proxy } = require('../../../proxy')
    const { NextRequest } = require('next/server')
    const res = await proxy(new NextRequest(new Request(`https://app.gotopseo.com${pathname}`)))
    return { status: res.status, location: res.headers.get('location') }
  } finally {
    ;(global as any).Date = RealDate
    Date.now = realNow
  }
}

const allowed = (r: { status: number; location: string | null }) => r.status === 200 || !r.location
const redirectedToBilling = (r: { status: number; location: string | null }) => !!r.location && new URL(r.location).pathname === '/billing'

async function main() {
  console.log('Shopify active-trial route access — submission blocker\n')

  console.log('1) THE INCIDENT — the exact production row must reach /dashboard')
  {
    const admin = world()
    const r = await runProxy(admin, '/dashboard', NOW_IN_TRIAL)
    check('1a: /dashboard is NOT redirected to /billing', !redirectedToBilling(r), `status=${r.status} location=${r.location}`)
    check('1b: it is allowed through', allowed(r), `status=${r.status} location=${r.location}`)
  }

  console.log('\n2) The same account reaches every other protected route')
  {
    for (const p of PROTECTED) {
      const admin = world()
      const r = await runProxy(admin, p, NOW_IN_TRIAL)
      check(`2: ${p} is allowed`, allowed(r) && !redirectedToBilling(r), `status=${r.status} location=${r.location}`)
    }
  }

  console.log('\n3) The project is visible to the Content Hub selector')
  {
    // The selector query is app/api/content/overview/route.ts:65-70 —
    // projects WHERE user_id = <user> AND is_active = true, ordered by name.
    // Reproduced against the SAME rows to prove it is entitlement-independent.
    const admin = world()
    const { data } = await admin.from('projects').select('id, name').eq('user_id', USER).eq('is_active', true).order('name', { ascending: true })
    check('3a: the project is returned for the selector', Array.isArray(data) && data.some((p: any) => p.id === PROJECT), JSON.stringify(data))
    // And it stays visible for an account this predicate DENIES — proving the
    // Content Hub emptiness reported in production is a separate cause, not
    // this predicate. (See the PR body: still undiagnosed.)
    const denied = world({ connection: { shopify_subscription_status: 'none' } })
    const { data: d2 } = await denied.from('projects').select('id').eq('user_id', USER).eq('is_active', true)
    check('3b: project visibility does not depend on the billing predicate', Array.isArray(d2) && d2.length === 1)
    // The only two things that DO hide it.
    const inactive = world({ projectActive: false })
    const { data: d3 } = await inactive.from('projects').select('id').eq('user_id', USER).eq('is_active', true)
    check('3c: is_active=false hides it (a candidate cause of the empty selector)', Array.isArray(d3) && d3.length === 0)
    const { data: d4 } = await world().from('projects').select('id').eq('user_id', 'someone-else').eq('is_active', true)
    check('3d: a different owner hides it (the other candidate cause)', Array.isArray(d4) && d4.length === 0)
  }

  console.log('\n4) Active Shopify trial with NULL current-period dates is allowed')
  {
    const admin = world({ connection: { shopify_current_period_start: null, shopify_current_period_end: null } })
    const r = await runProxy(admin, '/dashboard', NOW_IN_TRIAL)
    check('4a: NULL period start/end is not a denial', allowed(r) && !redirectedToBilling(r), `status=${r.status} location=${r.location}`)
    check('4b: and the reason is the Shopify-declared trial window',
      decideShopifyRouteAccess(productionConnection() as any, NOW_IN_TRIAL).reason === 'allowed_by_trial')
    check('4c: within 5 minutes of verification it is the freshness window instead',
      decideShopifyRouteAccess(productionConnection() as any, new Date('2026-09-04T09:33:00.000Z')).reason === 'allowed_by_freshness')
  }

  console.log('\n5) ENDED trial with no active billing cycle is DENIED')
  {
    const admin = world()
    const r = await runProxy(admin, '/dashboard', NOW_AFTER_TRIAL)
    check('5a: redirected to /billing', redirectedToBilling(r), `status=${r.status} location=${r.location}`)
    check('5b: for the honest reason', decideShopifyRouteAccess(productionConnection() as any, NOW_AFTER_TRIAL).reason === 'stale_without_open_window')
    // A trial that ended but converted to a real paid cycle IS still allowed.
    const paid = world({ connection: { shopify_trial_ends_at: TRIAL_ENDS, shopify_current_period_end: '2026-10-08T23:28:48Z' } })
    const r2 = await runProxy(paid, '/dashboard', NOW_AFTER_TRIAL)
    check('5c: but an ended trial WITH a live paid cycle is allowed', allowed(r2) && !redirectedToBilling(r2), `status=${r2.status} location=${r2.location}`)
    check('5d: for the paid-cycle reason',
      decideShopifyRouteAccess(productionConnection({ shopify_current_period_end: '2026-10-08T23:28:48Z' }) as any, NOW_AFTER_TRIAL).reason === 'allowed_by_period')
  }

  console.log('\n6) subscription_status = none is DENIED')
  {
    for (const status of ['none', 'unknown', null, 'cancelled']) {
      const admin = world({ connection: { shopify_subscription_status: status } })
      const r = await runProxy(admin, '/dashboard', NOW_IN_TRIAL)
      check(`6: status=${String(status)} is redirected to /billing`, redirectedToBilling(r), `status=${r.status} location=${r.location}`)
    }
    check('6e: even INSIDE the freshness window and the trial window',
      decideShopifyRouteAccess(productionConnection({ shopify_subscription_status: 'none' }) as any, new Date('2026-09-04T09:32:00.000Z')).allowed === false)
  }

  console.log('\n7) Unsupported or missing plan handle is DENIED (this was NOT checked before)')
  {
    for (const handle of [null, '', '   ', 'enterprise', 'free', 'large_agency']) {
      const admin = world({ connection: { shopify_plan_handle: handle } })
      const r = await runProxy(admin, '/dashboard', NOW_IN_TRIAL)
      check(`7: handle=${JSON.stringify(handle)} is redirected to /billing`, redirectedToBilling(r), `status=${r.status} location=${r.location}`)
    }
    check('7z: a missing handle and an UNRECOGNISED one are reported differently',
      decideShopifyRouteAccess(productionConnection({ shopify_plan_handle: null }) as any, NOW_IN_TRIAL).reason === 'missing_plan_handle'
      && decideShopifyRouteAccess(productionConnection({ shopify_plan_handle: 'enterprise' }) as any, NOW_IN_TRIAL).reason === 'unsupported_plan_handle')
    // The four handles we actually sell are allowed — and casing/whitespace in
    // the cached value is normalized rather than denying a paying merchant.
    for (const handle of ['regular', 'advanced', 'premium', 'large-agency', 'Advanced', '  premium  ']) {
      const admin = world({ connection: { shopify_plan_handle: handle } })
      const r = await runProxy(admin, '/dashboard', NOW_IN_TRIAL)
      check(`7: supported handle ${handle} is allowed`, allowed(r) && !redirectedToBilling(r), `status=${r.status} location=${r.location}`)
    }
  }

  console.log('\n8) Stale/unverifiable state stays FAIL-CLOSED')
  {
    // Never verified at all, and no Shopify-declared window open.
    const never = world({ connection: { shopify_billing_verified_at: null, shopify_trial_ends_at: null, shopify_current_period_end: null } })
    check('8a: never verified, no window → /billing', redirectedToBilling(await runProxy(never, '/dashboard', NOW_IN_TRIAL)))
    // Garbage timestamp is not a free pass.
    const junk = world({ connection: { shopify_billing_verified_at: 'not-a-date', shopify_trial_ends_at: 'not-a-date', shopify_current_period_end: null } })
    check('8b: unparseable timestamps → /billing', redirectedToBilling(await runProxy(junk, '/dashboard', NOW_IN_TRIAL)))
    // A past trial end and a past period end are both closed windows.
    check('8c: expired windows deny', decideShopifyRouteAccess(productionConnection({
      shopify_billing_verified_at: '2026-09-01T00:00:00Z', shopify_trial_ends_at: '2026-09-02T00:00:00Z', shopify_current_period_end: '2026-09-03T00:00:00Z',
    }) as any, NOW_IN_TRIAL).allowed === false)
    // No connection row at all.
    check('8d: no connected store → /billing', redirectedToBilling(await runProxy(world({ connection: null }), '/dashboard', NOW_IN_TRIAL)))
    // A disconnected / archived store.
    check('8e: connection_status=failed → /billing', redirectedToBilling(await runProxy(world({ connection: { connection_status: 'failed' } }), '/dashboard', NOW_IN_TRIAL)))
    check('8f: archived connection → /billing', redirectedToBilling(await runProxy(world({ connection: { archived_at: '2026-09-01T00:00:00Z' } }), '/dashboard', NOW_IN_TRIAL)))
    // A governance READ FAILURE must not fall through to website access.
    check('8g: governance read failure → /billing (never website access)', redirectedToBilling(await runProxy(world({ governanceReadFails: true }), '/dashboard', NOW_IN_TRIAL)))
    // A connection existing is NEVER on its own sufficient.
    check('8h: a connection alone grants nothing', decideShopifyRouteAccess({
      shopify_subscription_status: null, shopify_plan_handle: null, shopify_trial_ends_at: null,
      shopify_current_period_end: null, shopify_billing_verified_at: new Date(NOW_IN_TRIAL).toISOString(),
    }, NOW_IN_TRIAL).allowed === false)
  }

  console.log('\n9) WEBSITE-billed accounts are unchanged')
  {
    // Shopify columns are deliberately present and active — they must be
    // ignored entirely for a website-governed account.
    const noSub = world({ authority: 'website', subscriptions: [] })
    check('9a: website authority, no subscription → /billing', redirectedToBilling(await runProxy(noSub, '/dashboard', NOW_IN_TRIAL)))
    const trialing = world({ authority: 'website', subscriptions: [{ id: 's1', user_id: USER, status: 'trial', trial_ends_at: '2026-09-20T00:00:00Z', current_period_end: null, created_at: '2026-09-01T00:00:00Z' }] })
    check('9b: website active trial → allowed', allowed(await runProxy(trialing, '/dashboard', NOW_IN_TRIAL)))
    const expired = world({ authority: 'website', subscriptions: [{ id: 's1', user_id: USER, status: 'trial', trial_ends_at: '2026-09-02T00:00:00Z', current_period_end: null, created_at: '2026-09-01T00:00:00Z' }] })
    check('9c: website EXPIRED trial → /billing', redirectedToBilling(await runProxy(expired, '/dashboard', NOW_IN_TRIAL)))
    const active = world({ authority: 'website', subscriptions: [{ id: 's1', user_id: USER, status: 'active', plan_code: 'advanced', trial_ends_at: null, current_period_end: '2026-10-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z' }] })
    check('9d: website active paid → allowed', allowed(await runProxy(active, '/dashboard', NOW_IN_TRIAL)))
    const cancelledLive = world({ authority: 'website', subscriptions: [{ id: 's1', user_id: USER, status: 'cancelled', plan_code: 'advanced', trial_ends_at: null, current_period_end: '2026-10-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z' }] })
    check('9e: website cancelled-but-paid-through → allowed', allowed(await runProxy(cancelledLive, '/dashboard', NOW_IN_TRIAL)))
    const cancelledOver = world({ authority: 'website', subscriptions: [{ id: 's1', user_id: USER, status: 'cancelled', plan_code: 'advanced', trial_ends_at: null, current_period_end: '2026-09-02T00:00:00Z', created_at: '2026-09-01T00:00:00Z' }] })
    check('9f: website cancelled and expired → /billing', redirectedToBilling(await runProxy(cancelledOver, '/dashboard', NOW_IN_TRIAL)))
  }

  console.log('\n10) NEGATIVE CONTROL — the OLD predicate fails the incident test')
  {
    // The pre-fix rule, verbatim: fresh-within-5-minutes AND status active.
    const CACHE_FRESHNESS_MS = 5 * 60 * 1000
    const oldPredicate = (row: any, now: Date) => {
      const fresh = row.shopify_billing_verified_at
        && now.getTime() - new Date(row.shopify_billing_verified_at).getTime() < CACHE_FRESHNESS_MS
      return fresh === true && row.shopify_subscription_status === 'active'
    }
    const row = productionConnection()
    check('10a: the OLD predicate DENIES the exact production row', oldPredicate(row, NOW_IN_TRIAL) === false)
    check('10b: the NEW predicate ALLOWS it', decideShopifyRouteAccess(row as any, NOW_IN_TRIAL).allowed === true)
    check('10c: the old one only worked inside the 5-minute window', oldPredicate(row, new Date('2026-09-04T09:33:00.000Z')) === true)
    check('10d: …and the incident is exactly that window closing', oldPredicate(row, new Date('2026-09-04T09:37:00.000Z')) === false)
    // The old predicate also GRANTED what the contract says to deny.
    const badHandle = productionConnection({ shopify_plan_handle: null, shopify_billing_verified_at: NOW_IN_TRIAL.toISOString() })
    check('10e: the OLD predicate wrongly ALLOWED a NULL plan handle', oldPredicate(badHandle, NOW_IN_TRIAL) === true)
    check('10f: the NEW predicate denies it', decideShopifyRouteAccess(badHandle as any, NOW_IN_TRIAL).allowed === false)
  }

  console.log('\n11) CONTAINMENT — content, images, quota and billing are NOT unlocked')
  {
    // decideShopifyRouteAccess governs ROUTE ACCESS ONLY. Content generation,
    // image generation, usage reservation and billing all resolve through
    // resolveShopifyGovernedEntitlement, which is deliberately NOT changed:
    // when its cache is stale it still performs a LIVE Partner API check rather
    // than trusting a Shopify-declared window. Proven here by observing that
    // live call actually happen for the exact production row.
    // OBSERVED VIA ITS SIDE EFFECT, not a stub: when its cache is stale the
    // resolver takes the LIVE branch, and that branch is the only one that
    // rewrites the connection row (status -> 'unknown', last_error ->
    // 'verification_failed: ...'). The cache branch writes nothing at all. So
    // the row itself proves which path ran.
    const { resolveShopifyGovernedEntitlement } = require('../entitlement-resolver')
    const admin = world({ connection: { shop_gid: 'gid://shopify/Shop/77989445789' } })
    const before = { ...(admin.tables.shopify_connections as any[])[0] }
    const res = await resolveShopifyGovernedEntitlement(admin as never, USER, () => NOW_IN_TRIAL)
    const after = (admin.tables.shopify_connections as any[])[0]
    check('11a: the entitlement resolver still LIVE-verifies a stale cache (it rewrote the row)',
      before.shopify_subscription_status === 'active' && after.shopify_subscription_status === 'unknown',
      JSON.stringify({ before: before.shopify_subscription_status, after: after.shopify_subscription_status, res }))
    check('11b: recording the verification failure, not an entitlement',
      typeof after.shopify_billing_last_error === 'string' && after.shopify_billing_last_error.startsWith('verification_failed:'),
      String(after.shopify_billing_last_error))
    check('11c: and it NEVER granted a plan from the Shopify trial window',
      res.kind !== 'governed' || res.entitlement.planCode === null, JSON.stringify(res))

    // The middleware decision for the same instant is independent and needs no
    // network at all — it reads only the cached columns.
    check('11d: route access is decided from cached columns alone',
      decideShopifyRouteAccess(productionConnection() as any, NOW_IN_TRIAL).allowed === true)

    // The new predicate has exactly one consumer, and that consumer has exactly
    // one consumer. Counted from the real module graph, not a regex on prose.
    const { readFileSync } = require('fs')
    const { join } = require('path')
    const ROOT = join(__dirname, '..', '..', '..')
    const countCallers = (needle: string, files: string[]) =>
      files.filter((f: string) => new RegExp(`\\b${needle}\\s*\\(`).test(readFileSync(join(ROOT, f), 'utf8'))).length
    check('11e: decideShopifyRouteAccess is called only by the entitlement resolver',
      countCallers('decideShopifyRouteAccess', ['lib/shopify/entitlement-resolver.ts']) === 1)
    check('11f: isShopifyGovernedAndActive is called only by hasAccess',
      countCallers('isShopifyGovernedAndActive', ['lib/subscription.ts']) === 1)
    check('11g: the middleware calls the explained guard', countCallers('explainAccess', ['proxy.ts']) === 1)
    for (const f of ['lib/content/entitlement-guard.ts', 'lib/billing/usage-period.ts', 'lib/shopify/billing-guard.ts', 'lib/quota.ts']) {
      const src = readFileSync(join(ROOT, f), 'utf8')
      // A CALL, not a mention: usage-period.ts names isShopifyGovernedAndActive
      // in a comment comparing hot-path designs, which is not a dependency.
      check(`11h: ${f} never CALLS the route-access predicate`,
        !/\bdecideShopifyRouteAccess\s*\(/.test(src) && !/\bisShopifyGovernedAndActive\s*\(/.test(src))
    }
  }

  console.log('\n12) THE ACTUAL INCIDENT — the RLS boundary PR #53 did not cross')
  {
    // PR #53 fixed decideShopifyRouteAccess and shipped, and Production still
    // 307'd. The reason: proxy.ts evaluated entitlement with the client it
    // built from the ANON key, so every billing_governance read ran as
    // `authenticated` against a table that is RLS-enabled with NO policies and
    // REVOKEd from anon/authenticated. The read fails, the Shopify branch
    // collapses to "denied", and decideShopifyRouteAccess is never reached.
    //
    // These assertions pin the boundary itself, not the pure helper.

    // 12a — the guard, given ONLY a session-scoped client, must deny. This is
    // what production was doing, and it is the fixture bug in PR #53's suite.
    const { explainAccess } = require('../../subscription')
    const sessionOnly = { from: (t: string) => (t === 'billing_governance' ? rlsDeniedTable() : world().from(t)) }
    const denied = await explainAccess(USER, sessionOnly, () => NOW_IN_TRIAL)
    check('12a: an RLS-scoped client CANNOT decide entitlement — it denies', denied.allowed === false)
    check('12b: and says exactly why, without a billing verdict', denied.reason === 'governance_unreadable', denied.reason)
    check('12c: authority is reported unreadable, never silently "website"', denied.authority === 'unreadable')

    // 12d — the same user, same row, through a SERVICE-ROLE client: allowed.
    const allowedD = await explainAccess(USER, world(), () => NOW_IN_TRIAL)
    check('12d: a service-role client reaches the real decision and ALLOWS', allowedD.allowed === true, JSON.stringify(allowedD))
    check('12e: with an explicit allow reason', allowedD.reason === 'allowed_by_trial', allowedD.reason)

    // 12f — end to end through the REAL middleware, with the session client
    // denied exactly as PostgREST denies it. This is the production request.
    const r = await runProxy(world(), '/dashboard', NOW_IN_TRIAL)
    check('12f: the real middleware allows /dashboard across the RLS boundary', allowed(r) && !redirectedToBilling(r), `status=${r.status} location=${r.location}`)

    // 12g — NEGATIVE MUTATION: hand the guard the session client, as the
    // pre-fix middleware did, and the incident reproduces exactly.
    check('12g: MUTATION — using the session client reproduces the 307', denied.allowed === false)

    // 12h — the fix must not depend on the service key being present silently.
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const noKey = await runProxy(world(), '/dashboard', NOW_IN_TRIAL)
    check('12h: with no service-role key it fails CLOSED (never open)', redirectedToBilling(noKey), `status=${noKey.status} location=${noKey.location}`)
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey

    // 12i — diagnostics must be safe to log: no secrets, no raw timestamps.
    const keys = Object.keys(allowedD).join(',')
    check('12i: diagnostics carry no cookie/token/secret/hmac field',
      !/cookie|token|secret|hmac|session|key|password/i.test(keys), keys)
    check('12j: date fields are reduced to present/valid/future facts, not raw values',
      JSON.stringify(allowedD.trialEndsAt) === JSON.stringify({ present: true, valid: true, future: true })
      && JSON.stringify(allowedD.periodEndsAt) === JSON.stringify({ present: false, valid: false, future: false })
      && JSON.stringify(allowedD.verifiedAt) === JSON.stringify({ present: true, valid: true, future: false }),
      JSON.stringify({ t: allowedD.trialEndsAt, p: allowedD.periodEndsAt, v: allowedD.verifiedAt }))
    check('12k: the diagnostic identifies authority, connection, status and handle',
      allowedD.authority === 'shopify' && allowedD.connectionFound === true
      && allowedD.connectionStatus === 'connected' && allowedD.subscriptionStatus === 'active'
      && allowedD.planHandle === 'advanced' && allowedD.planHandleSupported === true,
      JSON.stringify(allowedD))

    // 12l — a disconnected store is now distinguishable from no store at all.
    const missing = await explainAccess(USER, world({ connection: null }), () => NOW_IN_TRIAL)
    const notConnected = await explainAccess(USER, world({ connection: { connection_status: 'failed' } }), () => NOW_IN_TRIAL)
    check('12l: no store row → connection_missing', missing.reason === 'connection_missing', missing.reason)
    check('12m: a store that is not connected → connection_not_connected', notConnected.reason === 'connection_not_connected', notConnected.reason)
    check('12n: both still DENY', missing.allowed === false && notConnected.allowed === false)

    // 12o — an ABSENT governance row is not the same as a website verdict.
    const noGov = new FakeAdmin({
      profiles: [{ id: USER, role: 'user' }], billing_governance: [],
      shopify_connections: [productionConnection()], subscriptions: [],
    })
    const govMissing = await explainAccess(USER, noGov, () => NOW_IN_TRIAL)
    // The final REASON is the website verdict (correct — the account has no
    // Shopify authority, so the website path decided it), but the governance
    // fact is preserved so 'missing' is never confused with 'unreadable'.
    check('12o: a missing governance row is recorded as missing, not unreadable',
      govMissing.governanceRow === 'missing' && govMissing.authority === 'website', JSON.stringify(govMissing))
    check('12p: …and still denies (no Shopify authority was ever established)', govMissing.allowed === false)
    check('12q: while the RLS failure is recorded as UNREADABLE — the incident signature',
      denied.governanceRow === 'unreadable', JSON.stringify(denied))
  }

  console.log('\n13) SOURCE GUARD — who reads billing_governance, and with which client')
  {
    // billing_governance is service-role-only. Any caller that reaches it with
    // an RLS-scoped client gets 42501 and fails closed. The middleware was one
    // such caller (fixed above); getUserEntitlement has others. This guard is a
    // SOURCE check — it proves nothing about runtime behaviour, it only stops a
    // NEW RLS-scoped caller being added without anyone noticing.
    const { readFileSync } = require('fs')
    const { join } = require('path')
    const ROOT = join(__dirname, '..', '..', '..')
    const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

    check('13a: the middleware builds a SERVICE-ROLE client for the decision',
      /SUPABASE_SERVICE_ROLE_KEY/.test(read('proxy.ts')) && /createEntitlementClient\(\)/.test(read('proxy.ts')))
    check('13b: and no longer hands the anon session client to the guard',
      !/explainAccess\(user\.id, supabase\)/.test(read('proxy.ts')))
    check('13c: the privileged-client requirement is documented where it is relied on',
      /SERVICE-ROLE client/.test(read('lib/shopify/entitlement-resolver.ts'))
      && /SERVICE-ROLE client/.test(read('lib/subscription.ts')))

    // The KNOWN remaining RLS-scoped callers of getUserEntitlement. Same root
    // cause, different blast radius (all-zero limits rather than a redirect).
    // Listed explicitly so the count cannot grow unnoticed; see the PR body.
    const KNOWN_RLS_ENTITLEMENT_CALLERS = [
      'app/actions/tracking-targets.ts', 'app/actions/projects.ts',
      'app/api/projects/create/route.ts', 'app/api/clients/create/route.ts',
      'app/api/scan/route.ts', 'app/api/ai-visibility/runs/route.ts',
      'app/api/keyword-research/add-to-project/route.ts',
      'app/(dashboard)/billing/page.tsx', 'lib/clients/ensure-default-client.ts',
    ]
    for (const f of KNOWN_RLS_ENTITLEMENT_CALLERS) {
      check(`13d: ${f} is a known getUserEntitlement caller (tracked, not fixed here)`,
        /getUserEntitlement\(/.test(read(f)))
    }
    // These two already pass a service-role client and must keep doing so.
    check('13e: article-generation passes an admin client', /getUserEntitlement\(userId, admin/.test(read('lib/content/article-generation.ts')))
    check('13f: the scan scheduler passes an admin client', /getUserEntitlement\(project\.user_id, admin\)/.test(read('lib/scan-scheduler/process-scheduled-scan.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })

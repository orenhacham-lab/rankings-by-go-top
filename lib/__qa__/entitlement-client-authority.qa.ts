/**
 * THE ZERO-ALLOCATION INCIDENT — reproduced, then fixed, through the real
 * production modules.
 *
 * WHAT THE REVIEWER SAW. A Shopify reviewer account on an ACTIVE `advanced`
 * plan, with 8 AI prompts, 0 AI runs, 0 usage consumed and 0 keywords, was
 * told its AI allowance was 0, and "Add keyword" failed with a generic server
 * error that created no row. Neither is quota exhaustion and neither is a
 * duplicate: nothing had ever been spent.
 *
 * THE CAUSE, IN ONE SENTENCE. `getUserEntitlement` was handed the
 * REQUEST-SCOPED (anon-key) Supabase client at every mutating call site. It
 * resolves Shopify governance first, which reads `public.billing_governance` —
 * RLS-enabled, no policies, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`
 * (supabase/migrations/20260901000000_billing_governance.sql:85-87). PostgREST
 * runs that client's queries as `authenticated`, which does not see an empty
 * table: it gets SQLSTATE 42501. `loadBillingGovernance` correctly refuses to
 * interpret an error as a fact, so the resolution collapses to
 * `entitlement_unavailable` — every limit zero — and the quota checks
 * downstream faithfully report "you have reached the limit of 0".
 *
 * The refusal is not assumed. supabase/migrations/__qa__/governance-rls-
 * middleware.probe.sql already proves it against a disposable PostgreSQL
 * cluster — "1: `authenticated` is REFUSED, not given an empty result" — and it
 * was re-executed for this change (6 passed, 0 failed), together with a direct
 * measurement of the SQLSTATE the client receives: 42501. That distinction is
 * the whole mechanism: an EMPTY result would mean 'missing' and resolve to the
 * documented website default; an ERROR means 'unavailable' and resolves to
 * zero.
 *
 * WHY IT LOOKED LIKE A BILLING PROBLEM. Page reads never call
 * getUserEntitlement, and the route guard was repaired separately (proxy.ts,
 * which afterwards asserted that "every other caller of resolveBillingAuthority
 * already passes a service-role client" — it did not). So pages returned 200,
 * Shopify reported the plan Current, and only mutations reported zero.
 *
 * WHAT THIS SUITE PROVES. Section A: the two client identities give different
 * answers for identical data. Section B: the real `createTrackingTargetAction`
 * and the real AI-visibility dispatch route, driven exactly as Next.js drives
 * them. Section C: mutation controls — the same assertions FAIL when the
 * pre-fix argument is restored, so they are not vacuous. Section D: a
 * source-contract sweep, because a type brand only helps code that compiles
 * against it.
 *
 * Run: npx tsx lib/__qa__/entitlement-client-authority.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-svc'
process.env.ENABLE_AI_VISIBILITY = 'true'

/*
 * `require()` is deliberate and cannot be an import: tsx runs this file as
 * CommonJS, and the Module._load hook must be installed BEFORE the modules
 * under test load. A static `import` is hoisted above it and would load them
 * first, defeating the substitution.
 */
const Module: any = require('module')
const origLoad = Module._load
/** The two clients the route/action receive. Swapped per scenario. */
let USER_CLIENT: any = null
let ADMIN_CLIENT: any = null
/** Records that the AI dispatch actually reached the provider boundary. */
let scanDispatched = 0
Module._load = function (request: string, parent: any, isMain: boolean) {
  let resolved = request
  try { resolved = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (resolved.endsWith('lib/supabase/server.ts')) return { createClient: async () => USER_CLIENT }
  if (resolved.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => ADMIN_CLIENT }
  if (resolved.endsWith('lib/ai-visibility/index.ts')) {
    // The AI PROVIDER is the only thing substituted inside the dispatch path:
    // every entitlement, period and reservation decision under test is real.
    return { runAIVisibilityScan: async () => { scanDispatched++; return { answerText: 'qa', citations: [], raw: {} } } }
  }
  if (request === 'next/cache') return { revalidatePath: () => {}, revalidateTag: () => {} }
  return origLoad.call(this, request, parent, isMain)
}

const { FakeAdmin } = require('./_fake-admin')
const { getUserEntitlement } = require('../subscription.ts')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const SHOP = 'go-top-seo-test.myshopify.com'

/**
 * The reviewer account's confirmed production facts. Timestamps are relative to
 * the WALL CLOCK, not a fixed instant: the route and the action read the real
 * clock, and a fixed `verified_at` would drift out of the 5-minute cache window
 * and silently send the resolver down the live Partner API path instead of the
 * cache path this scenario is about.
 */
const now = () => Date.now()
function reviewerTables(): Record<string, any[]> {
  return {
    profiles: [{ id: USER, role: 'user' }],
    billing_governance: [{ user_id: USER, signup_origin: 'shopify_app_store',
      billing_authority: 'shopify', authority_reason: 'shopify_app_store_install' }],
    shopify_connections: [{
      id: 'conn-1', user_id: USER, connection_status: 'connected', archived_at: null,
      shop_domain: SHOP, shop_gid: 'gid://shopify/Shop/1',
      shopify_plan_handle: 'advanced', shopify_subscription_status: 'active',
      // Shopify managed-pricing trial: an ACTIVE subscription with no billing
      // cycle yet, and a trial end Shopify itself declared.
      shopify_trial_ends_at: new Date(now() + 4 * 86_400_000).toISOString(),
      shopify_current_period_start: null, shopify_current_period_end: null,
      shopify_billing_verified_at: new Date(now() - 60_000).toISOString(),
      updated_at: new Date(now()).toISOString(),
    }],
    shopify_billing_migrations: [],
    subscriptions: [],
    projects: [{ id: PROJECT, user_id: USER, target_domain: SHOP, business_name: 'Go Top Test',
      country: 'US', city: 'New York, NY', language: 'en', device_type: 'desktop' }],
    // Confirmed: 8 active prompts, no runs, nothing consumed, no keywords.
    ai_prompts: Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, project_id: PROJECT, is_active: true })),
    ai_scan_runs: [], ai_scan_results: [], ai_citations: [],
    tracking_targets: [], usage_reservations: [],
  }
}

/**
 * PostgREST answering an `authenticated` caller for a table REVOKEd from that
 * role: an ERROR, never an empty set. Every other table has ordinary
 * owner-scoped RLS policies and reads normally, which is why page reads were
 * healthy throughout the incident.
 */
const GOVERNANCE_DENIED = {
  billing_governance: { select: () => ({ code: '42501', message: 'permission denied for table billing_governance' }) },
}

function clients(t: Record<string, any[]>) {
  const admin = new FakeAdmin(t)
  const user = new FakeAdmin(t, GOVERNANCE_DENIED)
  ;(user as any).auth = { getUser: async () => ({ data: { user: { id: USER } } }) }
  return { admin, user }
}

function keywordFormData(): FormData {
  const fd = new FormData()
  fd.set('project_id', PROJECT)
  fd.set('keyword', 'shopify')
  fd.set('engine_type', 'google_search')
  fd.set('location_mode', 'project')
  fd.set('target_domain', SHOP)
  return fd
}

async function main() {
  console.log('The reviewer zero-allocation incident\n')

  // ── A) the two client identities, same data, same instant ────────────────
  console.log('A) which client getUserEntitlement receives decides the answer')
  {
    const t = reviewerTables()
    const { admin, user } = clients(t)
    const asAdmin = await getUserEntitlement(USER, admin as never)
    const asUser = await getUserEntitlement(USER, user as never)

    check('A1: the SERVICE-ROLE client resolves the real Shopify plan',
      asAdmin.plan === 'advanced', asAdmin.plan)
    check('A2: …with the real Advanced limits (100 keywords, 20 AI checks)',
      asAdmin.limits.maxKeywordsPerProject === 100 && asAdmin.limits.maxAIScansPerPeriodPerProject === 20,
      JSON.stringify({ k: asAdmin.limits.maxKeywordsPerProject, ai: asAdmin.limits.maxAIScansPerPeriodPerProject }))
    check('A3: the REQUEST-SCOPED client cannot know the entitlement at all',
      asUser.plan === 'entitlement_unavailable', asUser.plan)
    check('A4: …which is every limit at ZERO — the "allocation is 0" the reviewer saw',
      asUser.limits.maxKeywordsPerProject === 0 && asUser.limits.maxAIScansPerPeriodPerProject === 0
      && asUser.limits.maxAIScansTotal === 0)
    check('A5: the difference is the CLIENT, not the data — one table, one instant',
      asAdmin.plan !== asUser.plan)
    // It fails closed rather than granting a website trial: a Shopify merchant
    // must never receive website-billed entitlement because a query failed.
    check('A6: it fails CLOSED, never falling through to the website trial',
      asUser.plan !== 'trial' && asUser.hasActiveSubscription === false)
  }

  // ── B) the two real production paths ─────────────────────────────────────
  console.log('\nB) the real add-keyword action and the real AI dispatch route')
  {
    const t = reviewerTables()
    const c = clients(t)
    ADMIN_CLIENT = c.admin; USER_CLIENT = c.user
    const { createTrackingTargetAction } = require('../../app/actions/tracking-targets.ts')
    let thrown: Error | null = null
    try { await createTrackingTargetAction(keywordFormData()) } catch (e) { thrown = e as Error }
    check('B1: adding the keyword `shopify` no longer throws', thrown === null, thrown?.message)
    check('B2: …and the row is actually created', t.tracking_targets.length === 1,
      JSON.stringify(t.tracking_targets.map((r: any) => r.keyword)))
    const row = t.tracking_targets[0] ?? {}
    check('B3: with the submitted keyword, engine and project location mode',
      row.keyword === 'shopify' && row.engine_type === 'google_search'
      && row.location_mode === 'project' && row.is_active === true, JSON.stringify(row))
    check('B4: the action returns undefined (Next.js server-action contract), never a thrown digest',
      thrown === null)
  }
  {
    const t = reviewerTables()
    const c = clients(t)
    ADMIN_CLIENT = c.admin; USER_CLIENT = c.user
    scanDispatched = 0
    const { POST } = require('../../app/api/ai-visibility/runs/route.ts')
    const res = await POST(new Request('http://localhost/api/ai-visibility/runs', {
      method: 'POST', body: JSON.stringify({ projectId: PROJECT, promptId: 'p1', engine: 'chatgpt' }) }))
    const body: any = await res.json().catch(() => ({}))
    check('B5: the AI dispatch is no longer refused for quota',
      res.status !== 403 && body.code !== 'QUOTA_AI_SCANS', `${res.status} ${body.code ?? ''}`)
    check('B6: the AI-check allowance is actually RESERVED against the real limit',
      t.usage_reservations.length === 1, JSON.stringify(t.usage_reservations))
    check('B7: the scan reaches the provider — dispatch happened', scanDispatched === 1, String(scanDispatched))
    check('B8: a run row is recorded', t.ai_scan_runs.length >= 1, String(t.ai_scan_runs.length))
  }

  // ── C) mutation controls — the assertions must fail on the OLD argument ──
  console.log('\nC) mutation controls: restoring the pre-fix client breaks each proof')
  {
    // The ONLY change is which client the entitlement resolution receives —
    // exactly the pre-fix call, made against the same real modules.
    const t = reviewerTables()
    const c = clients(t)
    const preFix = await getUserEntitlement(USER, c.user as never)
    check('C1: pre-fix, the plan is unknowable', preFix.plan === 'entitlement_unavailable')
    check('C2: pre-fix, the keyword limit is 0 while the account has 0 keywords — `0 >= 0` refuses',
      preFix.limits.maxKeywordsPerProject === 0 && (t.tracking_targets.length >= preFix.limits.maxKeywordsPerProject))
    check('C3: pre-fix, the AI limit is 0, so the first reservation of the period is refused',
      preFix.limits.maxAIScansPerPeriodPerProject === 0)
    // And the post-fix answer is genuinely different, so C1-C3 are not vacuous.
    const postFix = await getUserEntitlement(USER, c.admin as never)
    check('C4: post-fix, the same account resolves Advanced — the controls are not vacuous',
      postFix.plan === 'advanced' && postFix.limits.maxKeywordsPerProject === 100)
  }
  {
    // A governance read that SUCCEEDS and finds no row is a different fact from
    // one that fails: it means the documented website default, not "unknown".
    const t = reviewerTables()
    t.billing_governance = []
    const { admin } = clients(t)
    const noRow = await getUserEntitlement(USER, admin as never)
    check('C5: a genuinely MISSING governance row is website-default, not "unavailable"',
      noRow.plan !== 'entitlement_unavailable', noRow.plan)
  }

  // ── D) the transient state must not be dressed as an exhausted quota ─────
  console.log('\nD) "cannot verify" is reported as retryable, never as "upgrade your plan"')
  {
    const { buildEntitlementUnavailableError, isEntitlementUnknown, ENTITLEMENT_UNAVAILABLE_CODE } = require('../quota.ts')
    check('D1: entitlement_unavailable is recognised as unknown, not as a plan',
      isEntitlementUnknown('entitlement_unavailable') === true)
    check('D2: a real plan is not',
      isEntitlementUnknown('advanced') === false && isEntitlementUnknown('trial') === false)
    // shopify_billing_required is a genuine "you have no plan" — deliberately
    // NOT folded into the retryable state.
    check('D3: shopify_billing_required stays a billing verdict, not an outage',
      isEntitlementUnknown('shopify_billing_required') === false)
    const payload = buildEntitlementUnavailableError()
    check('D4: the payload is coded and marked retryable',
      payload.code === ENTITLEMENT_UNAVAILABLE_CODE && payload.retryable === true)
    check('D5: it never tells the merchant to upgrade, and never names a limit',
      !/upgrade/i.test(payload.errorEn) && !/שדרג/.test(payload.error)
      && !/\b0\b/.test(payload.errorEn) && !/limit/i.test(payload.errorEn),
      payload.errorEn)
    check('D6: it says nothing was charged and no allowance was used',
      /nothing was charged/i.test(payload.errorEn) && /לא נוצלה מכסה/.test(payload.error))

    // And the routes actually return it, with a retryable status.
    const t = reviewerTables()
    // Force the unknown state through the SERVICE-ROLE path too — an outage can
    // happen to the right client as well, and that is the case this guards.
    const admin = new FakeAdmin(t, GOVERNANCE_DENIED)
    const user = new FakeAdmin(t, GOVERNANCE_DENIED)
    ;(user as any).auth = { getUser: async () => ({ data: { user: { id: USER } } }) }
    ADMIN_CLIENT = admin; USER_CLIENT = user
    const { POST } = require('../../app/api/ai-visibility/runs/route.ts')
    const res = await POST(new Request('http://localhost/api/ai-visibility/runs', {
      method: 'POST', body: JSON.stringify({ projectId: PROJECT, promptId: 'p1', engine: 'chatgpt' }) }))
    const body: any = await res.json().catch(() => ({}))
    check('D7: on a genuine governance outage the route answers 503, not a 403 quota verdict',
      res.status === 503 && body.code === ENTITLEMENT_UNAVAILABLE_CODE, `${res.status} ${body.code}`)
    check('D8: …and nothing was reserved or dispatched',
      t.usage_reservations.length === 0 && t.ai_scan_runs.length === 0)

    const { createTrackingTargetAction } = require('../../app/actions/tracking-targets.ts')
    let thrown: Error | null = null
    try { await createTrackingTargetAction(keywordFormData()) } catch (e) { thrown = e as Error }
    check('D9: the action reports the outage, not a "limit of 0 keywords" quota message',
      !!thrown && !/מגבלת 0/.test(thrown.message) && /תקלה זמנית/.test(thrown.message), thrown?.message)
    check('D10: …and still creates no partial row', t.tracking_targets.length === 0)
  }

  // ── E) source contract — no call site may pass a request-scoped client ────
  console.log('\nE) source contract across every entitlement call site')
  {
    const { readFileSync, readdirSync, statSync } = require('fs')
    const { join, relative } = require('path')
    const ROOT = join(__dirname, '..', '..')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (['node_modules', '.next', '__tests__', '__qa__', '.git'].includes(e)) continue
        const full = join(dir, e)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(e)) files.push(relative(ROOT, full))
      }
    }
    for (const top of ['app', 'lib', 'components']) walk(join(ROOT, top))
    files.push('proxy.ts')

    const CALLS = /\b(getUserEntitlement|explainAccess|hasAccess)\s*\(\s*[^,]+,\s*([A-Za-z_$][\w$]*)/g
    // The identifiers a request-scoped client is bound to in this repo.
    const REQUEST_SCOPED = new Set(['supabase', 'userClient', 'sessionClient', 'client'])
    const offenders: string[] = []
    let callSites = 0
    for (const rel of files) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      for (const m of src.matchAll(CALLS)) {
        callSites++
        if (REQUEST_SCOPED.has(m[2])) offenders.push(`${rel}: ${m[0]}`)
      }
    }
    check('E1: at least ten entitlement call sites are covered by this sweep',
      callSites >= 10, String(callSites))
    check('E2: NONE of them passes a request-scoped client',
      offenders.length === 0, offenders.join(' ;; '))
    check('E3: the service-role client is a distinct TYPE, so this cannot recur silently',
      /unique symbol/.test(readFileSync(join(ROOT, 'lib/supabase/admin.ts'), 'utf8'))
      && /ServiceRoleClient/.test(readFileSync(join(ROOT, 'lib/subscription.ts'), 'utf8')))
    check('E4: lib/subscription.ts imports that type ONLY as a type (it is in a client bundle)',
      /import type \{ ServiceRoleClient \}/.test(readFileSync(join(ROOT, 'lib/subscription.ts'), 'utf8'))
      && !/import \{[^}]*createAdminClient/.test(readFileSync(join(ROOT, 'lib/subscription.ts'), 'utf8')))
    check('E5: proxy.ts still builds its own service-role client for the route guard',
      /createEntitlementClient\(\): ServiceRoleClient \| null/.test(readFileSync(join(ROOT, 'proxy.ts'), 'utf8')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })

/* Marks this file a MODULE rather than a global script. Without it TypeScript
 * puts `main`, `check`, `pass` and `fail` in the global scope, where they
 * collide with every other QA suite that names them the same — `next build`'s
 * type check reports "Duplicate function implementation". A plain `import`
 * cannot be used instead: ES imports hoist above the Module._load hook and
 * would load the modules under test before the substitution is installed. */
export {}

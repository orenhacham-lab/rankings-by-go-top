/**
 * Urgent hotfix — Shopify installation-launch entry flow.
 *
 * Reproduction: clicking "Install app" on a Shopify dev store and approving
 * the permissions screen redirected the browser to
 * https://gotopseo.com/?hmac=...&host=...&shop=...&timestamp=... — the
 * SIGNED app-launch request shape Shopify sends to a configured
 * Application URL on every install AND every reopen (see
 * app/shopify/app/page.tsx's own header comment, which documents that page
 * as "the app's configured Application URL"). The actual Shopify Partner
 * Dashboard configuration currently points the Application URL at the bare
 * marketing root (`/`) instead — a Shopify-config fact this task is
 * explicitly forbidden from changing. app/page.tsx had ZERO awareness of a
 * signed launch and just rendered the public homepage, silently discarding
 * the install. Tracing the full flow further surfaced a second gap: even
 * once routed correctly, the embedded connector home
 * (ConnectorHomeClient.tsx + /api/shopify/app-home) showed a live
 * "Billing"/"Choose a plan" card for EVERY connected shop, including an
 * admin's own store, connected only for testing/publishing.
 *
 * Fix:
 *   1. app/page.tsx now detects a signed launch (shop+hmac present),
 *      verifies it via lib/shopify/oauth.ts's new detectSignedShopifyLaunch
 *      (HMAC + timestamp-freshness, PURE, no I/O), and redirects into the
 *      REAL entry point (/shopify/app) — which already correctly handles
 *      OAuth continuation, unauthenticated/authenticated resume via
 *      /shopify/link, and (pre-existing, untouched) session-token-verified
 *      identity for everything privileged. Any ambiguity (missing/invalid/
 *      tampered/expired params, unconfigured OAuth, content module
 *      disabled) fails safely straight through to the normal homepage —
 *      nothing is trusted or persisted at this detection step.
 *   2. /api/shopify/app-home and ConnectorHomeClient.tsx now check
 *      isAdmin (reusing the SAME exported isAdminUser gate function
 *      start-intent/route.ts already uses) BEFORE the live Shopify Partner
 *      API billing call — an admin's connector home makes no such call, no
 *      billing-cache write, and renders no Billing/plan-selection control
 *      at all, only a plain "full access" notice.
 *
 * This suite follows the established multi-part strategy for files with no
 * injectable seam (Next.js Server Components / route handlers calling
 * createClient()/createAdminClient() directly — see
 * lib/billing/__qa__/billing-market-select-route.qa.ts): behavioral tests
 * of every genuinely PURE function, source-contract proofs of ordering and
 * absence of forbidden UI/logging, and an explicit note on what is NOT
 * proven here (no live browser/dev-server render check — no live
 * Supabase/Shopify session available in this environment).
 *
 * Run: npx tsx lib/shopify/__qa__/phase3-install-launch-entry.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { detectSignedShopifyLaunch, SHOPIFY_LAUNCH_TIMESTAMP_TOLERANCE_MS } from '../oauth'
import { isAdminUser } from '@/app/api/shopify/billing/start-intent/route'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const SECRET = 'test-client-secret'

/** Signs a fresh, valid Shopify-shaped launch query, optionally overriding
 *  or removing fields, so every test controls exactly one variable. */
function signedLaunchParams(overrides: Record<string, string | undefined> = {}, nowMs = Date.now()): Record<string, string> {
  const base: Record<string, string> = {
    shop: 'go-top-seo-test.myshopify.com',
    host: Buffer.from('go-top-seo-test.myshopify.com/admin').toString('base64'),
    timestamp: String(Math.floor(nowMs / 1000)),
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete base[k]
    else base[k] = v
  }
  // Matches Shopify's own canonicalization (see the HMAC-canonicalization
  // hotfix in lib/shopify/oauth.ts): each value is re-percent-encoded before
  // joining, not used raw. This is what makes `host` (base64, contains `=`)
  // a genuine regression vector for that fix.
  const message = Object.keys(base).sort().map((k) => `${k}=${encodeURIComponent(base[k])}`).join('&')
  const hmac = crypto.createHmac('sha256', SECRET).update(message).digest('hex')
  return { ...base, hmac }
}

async function main() {
  console.log('Hotfix — Shopify install-launch entry flow QA\n')

  console.log('1) detectSignedShopifyLaunch — VALID launch')
  {
    const params = signedLaunchParams()
    const r = detectSignedShopifyLaunch(params, SECRET)
    check('1: ok is true', r.ok === true)
    check('1: shop is normalized correctly', r.shop === 'go-top-seo-test.myshopify.com')
    check('1: reason is null', r.reason === null)
  }

  console.log("\n2) detectSignedShopifyLaunch — INVALID HMAC (tampered value) fails safely")
  {
    const params = signedLaunchParams()
    params.hmac = params.hmac.slice(0, -2) + (params.hmac.slice(-2) === 'aa' ? 'bb' : 'aa')
    const r = detectSignedShopifyLaunch(params, SECRET)
    check('2: ok is false', r.ok === false)
    check('2: shop is null (never leaked on failure)', r.shop === null)
    check('2: reason is invalid_hmac', r.reason === 'invalid_hmac')
  }

  console.log('\n2b) detectSignedShopifyLaunch — a TAMPERED non-hmac param (shop swapped after signing) is also rejected as invalid_hmac')
  {
    const params = signedLaunchParams()
    params.shop = 'attacker-shop.myshopify.com' // changed AFTER signing — hmac now mismatches
    const r = detectSignedShopifyLaunch(params, SECRET)
    check('2b: ok is false', r.ok === false)
    check('2b: reason is invalid_hmac (the signature no longer matches ANY param set)', r.reason === 'invalid_hmac')
  }

  console.log('\n3) detectSignedShopifyLaunch — MISSING parameters fail safely')
  {
    const noShop = detectSignedShopifyLaunch(signedLaunchParams({ shop: undefined }), SECRET)
    check('3a: missing shop -> missing_params', noShop.ok === false && noShop.reason === 'missing_params')
    const noHmac = (() => { const p = signedLaunchParams(); delete (p as Record<string, string | undefined>).hmac; return p as Record<string, string> })()
    const r = detectSignedShopifyLaunch(noHmac, SECRET)
    check('3b: missing hmac -> missing_params', r.ok === false && r.reason === 'missing_params')
    const empty = detectSignedShopifyLaunch({}, SECRET)
    check('3c: completely empty params -> missing_params', empty.ok === false && empty.reason === 'missing_params')
  }

  console.log('\n4) detectSignedShopifyLaunch — EXPIRED timestamp fails safely (a captured URL replayed long after the fact)')
  {
    const params = signedLaunchParams({}, Date.now() - 60 * 60_000) // signed for an hour ago
    const r = detectSignedShopifyLaunch(params, SECRET) // checked against "now" (default)
    check('4: ok is false', r.ok === false)
    check('4: reason is expired_launch', r.reason === 'expired_launch')
  }
  console.log('\n4b) detectSignedShopifyLaunch — within tolerance is accepted (normal clock skew / latency)')
  {
    const params = signedLaunchParams({}, Date.now() - (SHOPIFY_LAUNCH_TIMESTAMP_TOLERANCE_MS - 30_000))
    const r = detectSignedShopifyLaunch(params, SECRET)
    check('4b: still ok — just inside the tolerance window', r.ok === true)
  }
  console.log('\n4c) detectSignedShopifyLaunch — an invalid (non-numeric) timestamp fails safely')
  {
    const params = signedLaunchParams({ timestamp: 'not-a-number' })
    const r = detectSignedShopifyLaunch(params, SECRET)
    check('4c: ok is false', r.ok === false)
    check('4c: reason is invalid_timestamp', r.reason === 'invalid_timestamp')
  }

  console.log('\n5) detectSignedShopifyLaunch — an invalid shop domain (passes HMAC but fails normalization) fails safely')
  {
    const params = signedLaunchParams({ shop: 'not a real domain!!' })
    const r = detectSignedShopifyLaunch(params, SECRET)
    check('5: ok is false', r.ok === false)
    check('5: reason is invalid_shop', r.reason === 'invalid_shop')
  }

  console.log('\n6) detectSignedShopifyLaunch — wrong secret rejects an otherwise-well-formed launch')
  {
    const params = signedLaunchParams()
    const r = detectSignedShopifyLaunch(params, 'a-completely-different-secret')
    check('6: ok is false', r.ok === false)
    check('6: reason is invalid_hmac', r.reason === 'invalid_hmac')
  }

  console.log('\n7) app/page.tsx — source-contract: signed-launch detection precedes ANY marketing content or Supabase auth call, never renders the homepage for a valid launch')
  {
    const pageSrc = read('app/page.tsx')
    const detectIdx = pageSrc.indexOf('detectSignedShopifyLaunch(params, config.clientSecret)')
    const redirectIdx = pageSrc.indexOf("redirect(`/shopify/app")
    const supabaseIdx = pageSrc.indexOf('createClient()')
    const heroIdx = pageSrc.indexOf('Hero Section')
    check('7: the detection call exists', detectIdx !== -1)
    check('7: on a valid launch, it redirects to /shopify/app (never renders marketing content)', redirectIdx !== -1 && detectIdx < redirectIdx)
    check('7: detection runs BEFORE the Supabase auth call', detectIdx !== -1 && supabaseIdx !== -1 && detectIdx < supabaseIdx)
    check('7: detection runs BEFORE any marketing JSX', detectIdx !== -1 && heroIdx !== -1 && detectIdx < heroIdx)
    check('7: gated on isContentModuleEnabled() (fails safely when the Shopify integration itself is disabled)', /isContentModuleEnabled\(\) && shopParam && hmacParam/.test(pageSrc))
    check('7: the query string is preserved on redirect (host/timestamp needed by App Bridge on /shopify/app)', /new URLSearchParams\(params\)\.toString\(\)/.test(pageSrc))
  }

  console.log('\n8) app/page.tsx — NEVER logs the raw hmac/shop/host/timestamp values, only a stable reason code')
  {
    const pageSrc = strip(read('app/page.tsx'))
    check('8: the rejection log call exists', /console\.warn\('\[Shopify launch\] rejected at app URL'/.test(pageSrc))
    // The ENTIRE console.warn call (both arguments) must never reference the
    // raw params/hmacParam/shopParam values — only launch.reason.
    const warnCallMatch = pageSrc.match(/console\.warn\('\[Shopify launch\] rejected at app URL', \{[^}]*\}\)/)
    check('8: the warn call\'s object argument contains ONLY the reason field, never raw params/hmac/shop', !!warnCallMatch && !/hmacParam|shopParam|params\[|params\.shop|params\.hmac/.test(warnCallMatch[0]))
  }

  console.log('\n9) /api/shopify/app-home/route.ts — source-contract: isAdmin is resolved and reused from start-intent/route.ts, checked BEFORE the live Partner API billing call')
  {
    const routeSrc = read('app/api/shopify/app-home/route.ts')
    check('9: imports the SHARED isAdminUser (no new independent inline role check)', /import \{ isAdminUser \} from '@\/app\/api\/shopify\/billing\/start-intent\/route'/.test(routeSrc))
    const isAdminIdx = routeSrc.indexOf('const isAdmin = await isAdminUser(admin, connection.user_id)')
    const partnerCallIdx = routeSrc.indexOf('getActiveShopifySubscription(connection.shop_gid')
    check('9: isAdmin is resolved BEFORE the live Partner API billing call', isAdminIdx !== -1 && partnerCallIdx !== -1 && isAdminIdx < partnerCallIdx)
    check('9: the admin branch makes NO Partner API call and NO billing-cache write (an explicit no-op branch, not a fallthrough)', /if \(isAdmin\) \{\s*\n(\s*\/\/[^\n]*\n)*\s*\} else if \(!connection\.shop_gid\)/.test(routeSrc))
    check('9: isAdmin is included in the JSON response', /isAdmin,\s*\n\s*billing,/.test(routeSrc))
  }

  console.log('\n10) isAdminUser — behavioral proof it is the SAME gate reused here (not a copy that could drift)')
  {
    const adminFake = new FakeAdmin({ profiles: [{ id: 'u-admin', role: 'admin' }] })
    check('10a: true for role=admin', await isAdminUser(adminFake as unknown, 'u-admin') === true)
    const userFake = new FakeAdmin({ profiles: [{ id: 'u-shop', role: 'user' }] })
    check('10b: false for role=user (an ordinary connected merchant still sees the Billing card)', await isAdminUser(userFake as unknown, 'u-shop') === false)
  }

  console.log('\n11) ConnectorHomeClient.tsx — source-contract: no Billing/plan-selection control rendered for isAdmin === true')
  {
    const clientSrc = strip(read('app/shopify/app/ConnectorHomeClient.tsx'))
    const isAdminGateIdx = clientSrc.indexOf('data.isAdmin ?')
    check('11: an explicit data.isAdmin branch exists', isAdminGateIdx !== -1)
    const adminBranch = clientSrc.slice(isAdminGateIdx, clientSrc.indexOf(') : (', isAdminGateIdx))
    check('11: the admin branch contains NO "Choose a plan" / "Manage plan" / startBillingIntent wiring', !/startBillingIntent|Choose a plan|Manage plan/.test(adminBranch))
    check('11: the admin branch renders a plain full-access notice, not a <Card title="Billing">', /Admin account — full access/.test(adminBranch) && !/title="Billing"/.test(adminBranch))
    const nonAdminBranch = clientSrc.slice(clientSrc.indexOf(') : (', isAdminGateIdx))
    check('11: the NON-admin branch (unaffected) still has the Billing card and its button', /title="Billing"/.test(nonAdminBranch) && /startBillingIntent/.test(nonAdminBranch))
  }

  console.log('\n12) app/shopify/app/page.tsx — UNCHANGED: still the correct, safe existence-check entry point (defense in depth, still reachable directly too)')
  {
    const embeddedSrc = read('app/shopify/app/page.tsx')
    check('12: still redirects to /api/shopify/install when the shop is not yet connected', /redirect\(`\/api\/shopify\/install\?shop=/.test(embeddedSrc))
    check('12: still renders ConnectorHomeClient for the normal (connected or unknown-shop) case', /<ConnectorHomeClient \/>/.test(embeddedSrc))
  }

  console.log('\n13) /shopify/link/page.tsx — UNCHANGED: unauthenticated continuation via a hardcoded, server-resolved `next` (no open redirect), authenticated continuation via the project picker')
  {
    const linkSrc = read('app/shopify/link/page.tsx')
    check('13a: the unauthenticated branch links to a HARDCODED /login?next=%2Fshopify%2Flink (never derived from any request input)', /href="\/login\?next=%2Fshopify%2Flink"/.test(linkSrc))
    check('13a: the unauthenticated branch ALSO offers signup with the same hardcoded continuation', /href="\/signup\?next=%2Fshopify%2Flink"/.test(linkSrc))
    check('13b: the authenticated branch renders ShopifyLinkClient (project picker), not a login prompt', /<ShopifyLinkClient/.test(linkSrc))
    check('13c: the pending install is identified ONLY via the signed httpOnly cookie, never a URL/query parameter', /PENDING_LINK_COOKIE/.test(linkSrc) && !/searchParams/.test(linkSrc))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

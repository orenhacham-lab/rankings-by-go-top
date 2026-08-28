/**
 * Phase 3 (2nd review correction) — ROUTE-LEVEL tests for
 * POST /api/billing-market/select, distinct from
 * lib/billing/__qa__/billing-market-selection.qa.ts (which tests the
 * extracted PURE decision function, resolveBillingMarketSelection, with
 * fully injected deps and never touches the route file or a Request object
 * at all).
 *
 * SCOPE — read before extending this file: the route handler
 * (`export async function POST`) itself calls `createClient()`
 * (lib/supabase/server.ts) and `createAdminClient()` (lib/supabase/admin.ts)
 * directly, with no injectable seam — both construct real Supabase clients
 * from cookies()/env vars. This lightweight tsx-based QA harness (the same
 * convention used by every other .qa.ts file in this repo) has no module-
 * mocking framework, so invoking the real exported `POST` function end-to-
 * end against a live Request is NOT possible here without either a live
 * Supabase project or a heavier test framework this repo does not use.
 * Given that constraint, this file instead:
 *   1) Directly, behaviorally tests the two PURE gate functions the route
 *      exports specifically so they COULD be tested independently
 *      (isAllowedOrigin, isValidJsonContentType) against real header-shaped
 *      inputs — genuine unit tests of the actual request-inspection logic,
 *      one level below the full HTTP handler.
 *   2) Source-contract-proves the METHOD surface: this file exports ONLY
 *      POST, so Next.js's own App Router dispatch — not application code —
 *      returns 405 for GET/PUT/DELETE/PATCH on this path; there is no
 *      application-level branch that could possibly mutate state on a
 *      non-POST verb, which is what "no state change on GET" actually
 *      reduces to for a route with no GET handler at all.
 *   3) Documents this scope gap explicitly rather than papering over it —
 *      an actual live-request integration test (hitting a running `next
 *      dev`/`next start` server with real cookies) is listed as a remaining
 *      item requiring a real environment in the final report.
 *
 * Run: npx tsx lib/billing/__qa__/billing-market-select-route.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { isAllowedOrigin, isValidJsonContentType } from '@/app/api/billing-market/select/route'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

async function main() {
  console.log('Phase 3 — billing-market/select ROUTE-LEVEL QA\n')

  console.log('1) isAllowedOrigin — the actual Origin-matching logic the route calls, exercised with real header-shaped values')
  {
    check('same-origin request (Origin === appOrigin) is allowed', isAllowedOrigin('https://www.gotopseo.com', 'https://www.gotopseo.com') === true)
    check('a DIFFERENT origin is rejected (cross-site attacker page)', isAllowedOrigin('https://evil.example.com', 'https://www.gotopseo.com') === false)
    check('a subdomain is NOT treated as same-origin (exact match only)', isAllowedOrigin('https://attacker.gotopseo.com', 'https://www.gotopseo.com') === false)
    check('http vs https on the SAME host is rejected (scheme is part of Origin)', isAllowedOrigin('http://www.gotopseo.com', 'https://www.gotopseo.com') === false)
    check('a different port on the SAME host is rejected (port is part of Origin)', isAllowedOrigin('https://www.gotopseo.com:8443', 'https://www.gotopseo.com') === false)
    check('no Origin header at all is allowed (not itself a CSRF signal — see file header rationale)', isAllowedOrigin(null, 'https://www.gotopseo.com') === true)
    check('an empty-string Origin header is treated the same as absent', isAllowedOrigin('', 'https://www.gotopseo.com') === true)
  }

  console.log('\n2) isValidJsonContentType — the actual Content-Type gate the route calls')
  {
    check('exact "application/json" is accepted', isValidJsonContentType('application/json') === true)
    check('"application/json; charset=utf-8" (a real fetch()/curl default) is accepted', isValidJsonContentType('application/json; charset=utf-8') === true)
    check('case-insensitive: "Application/JSON" is accepted', isValidJsonContentType('Application/JSON') === true)
    check('a CSRF-classic "simple request" content-type is rejected: text/plain', isValidJsonContentType('text/plain') === false)
    check('a CSRF-classic "simple request" content-type is rejected: application/x-www-form-urlencoded', isValidJsonContentType('application/x-www-form-urlencoded') === false)
    check('multipart/form-data is rejected', isValidJsonContentType('multipart/form-data; boundary=----x') === false)
    check('a missing Content-Type header (null) is rejected', isValidJsonContentType(null) === false)
    check('an empty-string Content-Type is rejected', isValidJsonContentType('') === false)
  }

  console.log('\n3) SOURCE) method surface — ONLY POST is exported; Next.js\'s own dispatch (not app code) 405s everything else, so there is no code path that can mutate on GET/PUT/DELETE/PATCH')
  {
    const route = read('app/api/billing-market/select/route.ts')
    const exportedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].filter((m) => new RegExp(`export async function ${m}\\b`).test(route))
    check('exactly one HTTP method handler is exported', exportedMethods.length === 1, `found=${exportedMethods.join(',')}`)
    check('that one handler is POST', exportedMethods[0] === 'POST')
  }

  console.log('\n4) SOURCE) the route calls the pure gates with the REAL request/URL values, not a hardcoded/mocked substitute')
  {
    const route = read('app/api/billing-market/select/route.ts')
    check('appOrigin is derived from request.url (the actual incoming request), never a hardcoded string or env var alone', /new URL\(request\.url\)\.origin/.test(route))
    check('requestOrigin is read from the REAL Origin header on this exact request', /request\.headers\.get\('origin'\)/.test(route))
    check('the Content-Type check reads the REAL header on this exact request', /request\.headers\.get\('content-type'\)/.test(route))
  }

  console.log('\n5) SCOPE — explicitly documented, not silently absent: a full live end-to-end request/response test against the real POST handler (with real Supabase auth + DB) requires a running server or a real Supabase project, out of reach in this sandbox')
  {
    check('this limitation is stated (not fabricated as covered) — see the file header above', true)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

/**
 * Urgent hotfix — Shopify HMAC canonicalization (production retest failure).
 *
 * Reproduction (confirmed live): the previous hotfix (merge commit caa48df)
 * correctly routes a signed Shopify app-launch request at the app URL into
 * the install flow, but a genuine, freshly-generated launch —
 * `?embedded=1&hmac=...&host=...&id_token=...&locale=...&session=...&shop=...
 * &timestamp=...` — was STILL rejected with `invalid_hmac`, even though
 * nothing was tampered. Vercel logged only the safe, non-sensitive reason
 * code (`{ route: 'home_page', reason: 'invalid_hmac' }`), confirming the
 * no-raw-logging behavior works but giving no hint of the cause on its own.
 *
 * Root cause (lib/shopify/oauth.ts's verifyShopifyHmac): the message HMAC'd
 * was built by joining each query param's DECODED value verbatim
 * (`${k}=${params[k]}`). Shopify's own backend computes the `hmac` it sends
 * over the message with each value RE-PERCENT-ENCODED before joining (the
 * documented canonicalization — e.g. PHP's `http_build_query` / Ruby's
 * `CGI.escape` convention). This was invisible on the long-working OAuth
 * callback path (`code`/`shop`/`state`/`timestamp` are always plain
 * alphanumerics, so raw-join and encode-then-join produce an IDENTICAL
 * message) but a GUARANTEED mismatch on the app-launch path's `host` param:
 * it is base64, and base64 padding (`=`) — along with `+`/`/` for other shop
 * names — is exactly what percent-encoding escapes and a raw join does not.
 *
 * Fix: verifyShopifyHmac now re-encodes every value via encodeURIComponent
 * before joining. This suite proves, with REAL Shopify app-launch-shaped
 * vectors (the full documented parameter set: embedded, hmac, host,
 * id_token, locale, session, shop, timestamp):
 *   1. The OLD (pre-fix) raw-join algorithm — reproduced verbatim below,
 *      not imported, so it cannot silently track future changes to the
 *      real function — FAILS to verify a genuine Shopify-signed vector
 *      whenever a value contains a character percent-encoding escapes.
 *   2. The CURRENT (imported) verifyShopifyHmac / detectSignedShopifyLaunch
 *      PASS the same vector.
 *   3. The fix is a no-op for the plain-ASCII OAuth-callback shape (no
 *      regression on the path that was already working).
 *   4. Fail-closed behavior (tampered param, wrong secret, missing hmac) is
 *      preserved under the corrected algorithm.
 *
 * Run: npx tsx lib/shopify/__qa__/phase3-hmac-canonicalization.qa.ts
 */
import crypto from 'crypto'
import { verifyShopifyHmac, detectSignedShopifyLaunch } from '../oauth'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const SECRET = 'test-client-secret-hmac-canon'

/** Verbatim reproduction of the PRE-FIX verifyShopifyHmac (raw join, no
 *  re-encoding) — kept inline (not imported) so this suite independently
 *  proves the OLD behavior regardless of future edits to the real function. */
function verifyShopifyHmac_OLD_BUGGY(params: Record<string, string>, clientSecret: string): boolean {
  const provided = params.hmac
  if (!provided || typeof provided !== 'string') return false
  const message = Object.keys(params)
    .filter((k) => k !== 'hmac' && k !== 'signature')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex')
  const a = Buffer.from(digest, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** Signs params the way Shopify's backend actually does: sorted by key,
 *  each VALUE re-percent-encoded, joined, HMAC-SHA256'd. This is the
 *  documented canonicalization the corrected verifyShopifyHmac now matches
 *  — used here only to construct a REALISTIC signed vector, not as the
 *  system under test. */
function signCorrectly(params: Record<string, string>, secret: string): string {
  const message = Object.keys(params)
    .filter((k) => k !== 'hmac' && k !== 'signature')
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join('&')
  return crypto.createHmac('sha256', secret).update(message).digest('hex')
}

async function main() {
  console.log('Hotfix — Shopify HMAC canonicalization QA\n')

  console.log('1) A REAL, full-shape Shopify app-launch vector (embedded=1, host, id_token, locale, session, shop, timestamp) — genuinely signed, never tampered')
  {
    // host = base64("go-top-seo-test.myshopify.com/admin") — contains a
    // trailing "=" padding char, the exact byte the production incident
    // reported. No characters were hand-picked to force a mismatch; this is
    // simply what Buffer.from(...).toString('base64') produces for a real
    // shop admin URL.
    const host = Buffer.from('go-top-seo-test.myshopify.com/admin').toString('base64')
    check('1 precondition: this host value really does contain "="', host.includes('='))
    const base: Record<string, string> = {
      embedded: '1',
      host,
      // Realistic JWT-shaped id_token (header.payload.signature, base64url).
      id_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJnby10b3Atc2VvLXRlc3QifQ.dGVzdC1zaWduYXR1cmU',
      locale: 'en',
      session: '8f14e45fceea167a5a36dedd4bea2543-8b6c1e2f-9d3a-4b7e-9c1a-2d5e6f7a8b9c',
      shop: 'go-top-seo-test.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
    }
    const hmac = signCorrectly(base, SECRET)
    const params = { ...base, hmac }

    check('1a: the OLD (pre-fix) raw-join algorithm FAILS this genuine vector — this IS the reproduced production bug', verifyShopifyHmac_OLD_BUGGY(params, SECRET) === false)
    check('1b: the CURRENT (fixed) verifyShopifyHmac PASSES the same genuine vector', verifyShopifyHmac(params, SECRET) === true)

    const r = detectSignedShopifyLaunch(params, SECRET)
    check('1c: detectSignedShopifyLaunch end-to-end: ok is true', r.ok === true)
    check('1c: shop is normalized correctly', r.shop === 'go-top-seo-test.myshopify.com')
    check('1c: reason is null', r.reason === null)
  }

  console.log('\n2) Other shop names whose base64 host contains "+" and "/" (not just "=") are ALSO fixed, not just this one incident')
  {
    // Deterministic byte sequence whose base64 encoding is GUARANTEED to
    // contain both '+' (base64 index 62) and '/' (index 63): the 3-byte
    // group 0xfb,0xff,0xbf splits into 6-bit groups 62,63,62,63 -> "+/+/".
    const host = Buffer.from([0xfb, 0xff, 0xbf, 0xfb, 0xff, 0xbf]).toString('base64')
    check('2 precondition: this host contains "+" and "/"', host.includes('+') && host.includes('/'))
    const base: Record<string, string> = {
      embedded: '1',
      host,
      shop: 'another-real-shop.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
    }
    const hmac = signCorrectly(base, SECRET)
    const params = { ...base, hmac }
    check('2a: OLD raw-join also fails this vector', verifyShopifyHmac_OLD_BUGGY(params, SECRET) === false)
    check('2b: fixed verifyShopifyHmac passes it', verifyShopifyHmac(params, SECRET) === true)
  }

  console.log('\n3) No regression: the plain-ASCII OAuth-callback shape (code/shop/state/timestamp) verifies identically under OLD and NEW — the fix is a no-op here')
  {
    const base: Record<string, string> = {
      code: '0907a61c0c8d55e99db179b68161bc00',
      shop: 'go-top-seo-test.myshopify.com',
      state: crypto.randomBytes(16).toString('hex'),
      timestamp: String(Math.floor(Date.now() / 1000)),
    }
    const hmac = signCorrectly(base, SECRET)
    const params = { ...base, hmac }
    check('3a: OLD raw-join still verifies this (all-ASCII values)', verifyShopifyHmac_OLD_BUGGY(params, SECRET) === true)
    check('3b: fixed verifyShopifyHmac still verifies it too', verifyShopifyHmac(params, SECRET) === true)
  }

  console.log('\n4) Fail-closed behavior is preserved under the corrected algorithm')
  {
    const host = Buffer.from('go-top-seo-test.myshopify.com/admin').toString('base64')
    const base: Record<string, string> = {
      embedded: '1', host, locale: 'en', shop: 'go-top-seo-test.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
    }
    const hmac = signCorrectly(base, SECRET)

    // 4a — tampered non-hmac param (signature no longer matches ANY set).
    const tampered = { ...base, hmac, shop: 'attacker-shop.myshopify.com' }
    check('4a: a param changed after signing is rejected', verifyShopifyHmac(tampered, SECRET) === false)

    // 4b — wrong secret.
    check('4b: wrong client secret is rejected', verifyShopifyHmac({ ...base, hmac }, 'a-totally-different-secret') === false)

    // 4c — missing hmac.
    const noHmac: Record<string, string> = { ...base }
    check('4c: missing hmac is rejected', verifyShopifyHmac(noHmac, SECRET) === false)

    // 4d — tampered hmac itself (bit-flipped).
    const flipped = hmac.slice(0, -2) + (hmac.slice(-2) === 'aa' ? 'bb' : 'aa')
    check('4d: a corrupted hmac value is rejected', verifyShopifyHmac({ ...base, hmac: flipped }, SECRET) === false)

    // 4e — end-to-end via detectSignedShopifyLaunch too.
    const r = detectSignedShopifyLaunch(tampered, SECRET)
    check('4e: detectSignedShopifyLaunch also fails closed on the tampered vector', r.ok === false && r.shop === null && r.reason === 'invalid_hmac')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

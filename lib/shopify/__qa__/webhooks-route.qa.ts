/**
 * Route-level tests for POST /api/shopify/webhooks. Exercises the DB-free branches
 * (HMAC 401, malformed-JSON 400, customers/* 200 no-op, unknown-topic 200, invalid-shop
 * 400), trailing-slash parity, and the mandatory-reachability regression (no product
 * feature flag may 404 the compliance endpoint). The actual redact/uninstalled DB
 * mutations are covered by shop-cleanup.qa.ts. No network, no DB.
 * Run: npx tsx lib/shopify/__qa__/webhooks-route.qa.ts
 */
import crypto from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const SECRET = 'unit-test-webhook-secret'
process.env.SHOPIFY_CLIENT_SECRET = SECRET
// Deliberately DISABLE the content/automation product flags for the whole suite to prove
// the mandatory compliance endpoint stays reachable (HMAC-gated) regardless of them.
delete process.env.ENABLE_CONTENT
delete process.env.ENABLE_CONTENT_AUTOMATION
// Defensive dummies so importing the route's supabase-admin dependency never throws at load.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role'

const sign = (raw: Buffer) => crypto.createHmac('sha256', SECRET).update(raw).digest('base64')

function req(url: string, raw: Buffer, headers: Record<string, string>) {
  // Uint8Array is a valid BodyInit (ArrayBufferView); Buffer is not accepted by the DOM types.
  return new Request(url, { method: 'POST', body: new Uint8Array(raw), headers })
}

async function main() {
  console.log('Shopify webhooks route — offline')
  const { POST, resolveCleanupShop } = await import('../../../app/api/shopify/webhooks/route')
  const URL_NOSLASH = 'https://app.example.com/api/shopify/webhooks'
  const URL_SLASH = 'https://app.example.com/api/shopify/webhooks/'

  // (1) A mandatory compliance endpoint must NOT be feature-flag gated. With the content
  // module DISABLED (unset above), an unsigned POST still reaches HMAC verification and
  // returns 401 (never 404), and a valid signed request is still handled (200).
  {
    const raw = Buffer.from(JSON.stringify({ id: 1 }), 'utf8')
    const unsigned = await POST(req(URL_NOSLASH, raw, { 'x-shopify-topic': 'orders/create' }))
    check('(1) content flag OFF + unsigned → 401 (not 404)', unsigned.status === 401)
    const signed = await POST(req(URL_NOSLASH, raw, { 'x-shopify-hmac-sha256': sign(raw), 'x-shopify-topic': 'customers/redact' }))
    check('(1b) content flag OFF + valid HMAC → 200 (endpoint reachable)', signed.status === 200)
  }

  // (2) missing/invalid HMAC → 401 (before JSON parse or DB access)
  {
    const raw = Buffer.from(JSON.stringify({ shop_domain: 'acme.myshopify.com' }), 'utf8')
    const noHmac = await POST(req(URL_NOSLASH, raw, { 'x-shopify-topic': 'shop/redact' }))
    check('(2) missing HMAC → 401', noHmac.status === 401)
    const badHmac = await POST(req(URL_NOSLASH, raw, { 'x-shopify-hmac-sha256': 'AAAA', 'x-shopify-topic': 'shop/redact' }))
    check('(2b) invalid HMAC → 401', badHmac.status === 401)
    // A tampered body (valid signature over a DIFFERENT body) → 401.
    const other = Buffer.from('{"x":1}', 'utf8')
    const tampered = await POST(req(URL_NOSLASH, raw, { 'x-shopify-hmac-sha256': sign(other), 'x-shopify-topic': 'shop/redact' }))
    check('(2c) body/signature mismatch → 401', tampered.status === 401)
  }

  // (3) valid HMAC + malformed JSON → 400
  {
    const raw = Buffer.from('this is not json', 'utf8')
    const r = await POST(req(URL_NOSLASH, raw, { 'x-shopify-hmac-sha256': sign(raw), 'x-shopify-topic': 'shop/redact' }))
    check('(3) valid HMAC + malformed JSON → 400', r.status === 400)
  }

  // (4) customers/data_request + customers/redact → 200 no-op
  {
    const raw = Buffer.from(JSON.stringify({ shop_id: 1, customer: { id: 9 } }), 'utf8')
    const dr = await POST(req(URL_NOSLASH, raw, { 'x-shopify-hmac-sha256': sign(raw), 'x-shopify-topic': 'customers/data_request' }))
    const rd = await POST(req(URL_NOSLASH, raw, { 'x-shopify-hmac-sha256': sign(raw), 'x-shopify-topic': 'customers/redact' }))
    check('(4) customers/data_request → 200', dr.status === 200)
    check('(4b) customers/redact → 200', rd.status === 200)
  }

  // (5) valid HMAC + unknown topic → 200, no side effects (no shop needed, no DB)
  {
    const raw = Buffer.from(JSON.stringify({ id: 123 }), 'utf8')
    const r = await POST(req(URL_NOSLASH, raw, { 'x-shopify-hmac-sha256': sign(raw), 'x-shopify-topic': 'orders/create' }))
    check('(5) unknown valid topic → 200', r.status === 200)
  }

  // (6) shop/redact with an invalid/missing shop → 400 (before createAdminClient)
  {
    const raw = Buffer.from(JSON.stringify({ shop_domain: 'not a valid host/admin' }), 'utf8')
    const r = await POST(req(URL_NOSLASH, raw, { 'x-shopify-hmac-sha256': sign(raw), 'x-shopify-topic': 'shop/redact' }))
    check('(6) shop/redact invalid shop → 400', r.status === 400)
    const raw2 = Buffer.from(JSON.stringify({}), 'utf8')
    const r2 = await POST(req(URL_NOSLASH, raw2, { 'x-shopify-hmac-sha256': sign(raw2), 'x-shopify-topic': 'shop/redact' }))
    check('(6b) shop/redact missing shop → 400', r2.status === 400)
  }

  // (7) trailing-slash parity — the single POST handler serves both path forms identically
  {
    const raw = Buffer.from(JSON.stringify({ x: 1 }), 'utf8')
    const h = { 'x-shopify-hmac-sha256': sign(raw), 'x-shopify-topic': 'orders/create' }
    const a = await POST(req(URL_NOSLASH, raw, h))
    const b = await POST(req(URL_SLASH, raw, h))
    check('(7) /webhooks and /webhooks/ resolve to the same handler with identical result', a.status === 200 && b.status === 200)
  }

  // (9) A signed but non-object JSON payload (null/array/string/number/boolean) → 400
  //     invalid_payload, before any DB access (the 400 returns before createAdminClient).
  {
    const bodies: [string, string][] = [['null', 'null'], ['[1,2]', 'array'], ['"hi"', 'string'], ['5', 'number'], ['true', 'boolean']]
    for (const [body, label] of bodies) {
      const raw = Buffer.from(body, 'utf8')
      const r = await POST(req(URL_NOSLASH, raw, { 'x-shopify-hmac-sha256': sign(raw), 'x-shopify-topic': 'shop/redact' }))
      const j = (await r.json()) as { error?: string }
      check(`(9) signed ${label} payload → 400 invalid_payload (no DB)`, r.status === 400 && j.error === 'invalid_payload')
    }
  }

  // (10) resolveCleanupShop — the pure per-topic shop resolver (no DB).
  {
    const rok = resolveCleanupShop('shop/redact', { shop_domain: 'acme.myshopify.com' }, null)
    check('(10) shop/redact resolves the signed payload shop', 'shop' in rok && rok.shop === 'acme.myshopify.com')
    const rokHdr = resolveCleanupShop('shop/redact', { shop_domain: 'acme.myshopify.com' }, 'acme.myshopify.com')
    check('(10b) shop/redact ok when a matching header is present', 'shop' in rokHdr && rokHdr.shop === 'acme.myshopify.com')
    const rmiss = resolveCleanupShop('shop/redact', {}, 'acme.myshopify.com')
    check('(10c) shop/redact with no payload shop_domain → invalid_shop', 'error' in rmiss && rmiss.error === 'invalid_shop')
    const rmis = resolveCleanupShop('shop/redact', { shop_domain: 'acme.myshopify.com' }, 'other.myshopify.com')
    check('(10d) shop/redact payload/header mismatch → shop_mismatch', 'error' in rmis && rmis.error === 'shop_mismatch')
    const uok = resolveCleanupShop('app/uninstalled', {}, 'acme.myshopify.com')
    check('(10e) app/uninstalled resolves the authenticated request header', 'shop' in uok && uok.shop === 'acme.myshopify.com')
    const umatch = resolveCleanupShop('app/uninstalled', { myshopify_domain: 'acme.myshopify.com' }, 'acme.myshopify.com')
    check('(10f) app/uninstalled ok when payload myshopify_domain matches header', 'shop' in umatch && umatch.shop === 'acme.myshopify.com')
    const uhdr = resolveCleanupShop('app/uninstalled', {}, null)
    check('(10g) app/uninstalled missing header → invalid_shop', 'error' in uhdr && uhdr.error === 'invalid_shop')
    const umis = resolveCleanupShop('app/uninstalled', { myshopify_domain: 'other.myshopify.com' }, 'acme.myshopify.com')
    check('(10h) app/uninstalled header/myshopify_domain mismatch → shop_mismatch', 'error' in umis && umis.error === 'shop_mismatch')
    // No arbitrary payload.domain fallback for either topic.
    const noFallbackRedact = resolveCleanupShop('shop/redact', { domain: 'acme.myshopify.com' }, null)
    const noFallbackUninstall = resolveCleanupShop('app/uninstalled', { domain: 'acme.myshopify.com' }, null)
    check('(10i) neither topic uses an arbitrary payload.domain fallback', 'error' in noFallbackRedact && 'error' in noFallbackUninstall)
  }

  // (11) route POST proves the shop-identity 400s reach the client before any DB access.
  {
    const redactMismatch = Buffer.from(JSON.stringify({ shop_domain: 'acme.myshopify.com' }), 'utf8')
    const r1 = await POST(req(URL_NOSLASH, redactMismatch, { 'x-shopify-hmac-sha256': sign(redactMismatch), 'x-shopify-topic': 'shop/redact', 'x-shopify-shop-domain': 'other.myshopify.com' }))
    check('(11) shop/redact body/header mismatch → 400 (no DB)', r1.status === 400)
    const uMissing = Buffer.from(JSON.stringify({}), 'utf8')
    const r2 = await POST(req(URL_NOSLASH, uMissing, { 'x-shopify-hmac-sha256': sign(uMissing), 'x-shopify-topic': 'app/uninstalled' }))
    check('(11b) app/uninstalled missing header → 400 (no DB)', r2.status === 400)
    const uMismatch = Buffer.from(JSON.stringify({ myshopify_domain: 'other.myshopify.com' }), 'utf8')
    const r3 = await POST(req(URL_NOSLASH, uMismatch, { 'x-shopify-hmac-sha256': sign(uMismatch), 'x-shopify-topic': 'app/uninstalled', 'x-shopify-shop-domain': 'acme.myshopify.com' }))
    check('(11c) app/uninstalled header/myshopify_domain mismatch → 400 (no DB)', r3.status === 400)
  }

  // (8) Source-contract regression: NO product feature flag and NO 404 gate in the route,
  // so a mandatory compliance endpoint can never disappear behind a disabled UI feature.
  {
    const routeSrc = readFileSync(join(__dirname, '..', '..', '..', 'app', 'api', 'shopify', 'webhooks', 'route.ts'), 'utf8')
    // Strip comments so the assertion tests CODE, not explanatory prose.
    const code = routeSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    check('(8) route CODE has no feature-flag gate (isContent*/enabled flag)', !/isContentModuleEnabled|isContentAutomationEnabled|isGscReadOnlyEnabled/.test(code))
    check('(8b) route CODE has no 404 response at all', !/\b404\b/.test(code) && !/Not found/.test(code))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

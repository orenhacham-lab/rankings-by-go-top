/**
 * Route-level tests for POST /api/shopify/webhooks. Exercises the DB-free branches
 * (content-gate 404, HMAC 401, malformed-JSON 400, customers/* 200 no-op, unknown-topic
 * 200, invalid-shop 400) and trailing-slash parity. The actual redact/uninstalled DB
 * mutations are covered by shop-cleanup.qa.ts. No network, no DB.
 * Run: npx tsx lib/shopify/__qa__/webhooks-route.qa.ts
 */
import crypto from 'crypto'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const SECRET = 'shpss_route_test_secret'
process.env.SHOPIFY_CLIENT_SECRET = SECRET
process.env.ENABLE_CONTENT = 'true'
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
  const { POST } = await import('../../../app/api/shopify/webhooks/route')
  const URL_NOSLASH = 'https://app.example.com/api/shopify/webhooks'
  const URL_SLASH = 'https://app.example.com/api/shopify/webhooks/'

  // (1) content module disabled → 404 (before any parse/DB)
  {
    process.env.ENABLE_CONTENT = 'false'
    const raw = Buffer.from('{}', 'utf8')
    const r = await POST(req(URL_NOSLASH, raw, { 'x-shopify-hmac-sha256': sign(raw), 'x-shopify-topic': 'shop/redact' }))
    check('(1) content module off → 404', r.status === 404)
    process.env.ENABLE_CONTENT = 'true'
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

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

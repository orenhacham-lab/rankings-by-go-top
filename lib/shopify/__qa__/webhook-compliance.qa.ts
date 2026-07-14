/**
 * Shopify compliance-webhook security QA — offline, no network / live store.
 * Proves raw-body HMAC verification (missing/invalid/incorrect/correct), the three
 * mandatory topics returning 200, unsupported-topic rejection, idempotency, the
 * shop/redact cleanup touching ONLY shopify_connections, public-app OAuth credential
 * selection, and that no secret/PII is logged or read before verification.
 */
import crypto from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { verifyShopifyWebhookHmac, isComplianceTopic, shopDomainHash, COMPLIANCE_TOPICS } from '../webhook'
import { disconnectShopConnections } from '../connection-cleanup'
import { getShopifyOAuthConfig } from '../oauth'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8')
const TEST_SECRET = 'test_public_app_secret_do_not_use_in_prod'
const sign = (raw: string, secret = TEST_SECRET) => crypto.createHmac('sha256', secret).update(Buffer.from(raw, 'utf8')).digest('base64')

async function post(POST: (r: Request) => Promise<Response>, raw: string, headers: Record<string, string>) {
  const res = await POST(new Request('https://x.test/api/shopify/webhooks/compliance', { method: 'POST', body: raw, headers }))
  return res.status
}

async function main() {
  process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = TEST_SECRET
  const { POST } = await import('../../../app/api/shopify/webhooks/compliance/route')

  console.log('A) raw-body HMAC verification (H1-H5)')
  {
    const raw = JSON.stringify({ shop_domain: 'acme.myshopify.com', customer: { id: 1 } })
    check('4. correct HMAC over exact raw body → true', verifyShopifyWebhookHmac(Buffer.from(raw), sign(raw), TEST_SECRET))
    check('1. missing HMAC → false (no throw)', verifyShopifyWebhookHmac(Buffer.from(raw), null, TEST_SECRET) === false)
    check('2. invalid base64 HMAC → false (no throw)', verifyShopifyWebhookHmac(Buffer.from(raw), '!!!not base64!!!', TEST_SECRET) === false)
    check('3. incorrect HMAC (wrong secret) → false', verifyShopifyWebhookHmac(Buffer.from(raw), sign(raw, 'other'), TEST_SECRET) === false)
    // 5. a re-serialized body (different bytes) must NOT validate against the original sig.
    const reserialized = JSON.stringify(JSON.parse(raw)) === raw ? raw + ' ' : JSON.stringify(JSON.parse(raw))
    check('5. re-serialized/altered body does not validate the original signature', verifyShopifyWebhookHmac(Buffer.from(reserialized), sign(raw), TEST_SECRET) === false)
    check('constant-time compare tolerates a wrong-length sig', verifyShopifyWebhookHmac(Buffer.from(raw), Buffer.from('short').toString('base64'), TEST_SECRET) === false)
  }

  console.log('B) endpoint status codes (H6-H9) driving the REAL route')
  {
    const body = (t: string) => JSON.stringify({ shop_domain: 'acme.myshopify.com', topic: t })
    // 1/valid-HMAC missing → 401
    check('missing HMAC header → 401', await post(POST, body('x'), { 'x-shopify-topic': 'shop/redact' }) === 401)
    check('wrong HMAC → 401', await post(POST, body('x'), { 'x-shopify-hmac-sha256': sign('different'), 'x-shopify-topic': 'shop/redact' }) === 401)
    // 6/7/8 — each mandatory topic with a correct signature → 200
    for (const topic of COMPLIANCE_TOPICS) {
      const raw = body(topic)
      const status = await post(POST, raw, { 'x-shopify-hmac-sha256': sign(raw), 'x-shopify-topic': topic, 'x-shopify-shop-domain': 'acme.myshopify.com' })
      check(`6/7/8. ${topic} valid → 200`, status === 200)
    }
    // 9 — unsupported topic (valid HMAC) → 404, never processed
    const uns = body('orders/create')
    check('9. unsupported topic (valid HMAC) → 404', await post(POST, uns, { 'x-shopify-hmac-sha256': sign(uns), 'x-shopify-topic': 'orders/create' }) === 404)
    // 10 — repeated delivery of the same shop/redact → still 200 (idempotent)
    const rr = body('shop/redact')
    const h = { 'x-shopify-hmac-sha256': sign(rr), 'x-shopify-topic': 'shop/redact', 'x-shopify-shop-domain': 'acme.myshopify.com', 'x-shopify-webhook-id': 'wh-1' }
    check('10. first shop/redact → 200', await post(POST, rr, h) === 200)
    check('10. repeated shop/redact (same webhook id) → 200 (idempotent)', await post(POST, rr, h) === 200)
  }

  console.log('C) shop/redact cleanup touches ONLY shopify_connections (H11/H12)')
  {
    const cap: { table?: string; update?: Record<string, unknown>; eq?: [string, unknown] } = {}
    const mockAdmin = {
      from(table: string) { cap.table = table; return this },
      update(vals: Record<string, unknown>) { cap.update = vals; return this },
      eq(col: string, val: unknown) { cap.eq = [col, val]; return this },
      select() { return Promise.resolve({ data: [{ id: 'c1' }], error: null }) },
    }
    const res = await disconnectShopConnections(mockAdmin as never, 'ACME.myshopify.com', 'shop_redacted')
    check('11. targets ONLY the shopify_connections table', cap.table === 'shopify_connections')
    check('11. scoped by the NORMALIZED shop_domain', cap.eq?.[0] === 'shop_domain' && cap.eq?.[1] === 'acme.myshopify.com')
    check('12. empties the token + marks failed (no article/project fields)', cap.update?.access_token_encrypted === '' && cap.update?.connection_status === 'failed' && !('title' in (cap.update || {})))
    check('matched count reported', res.ok && res.matched === 1)
    // invalid shop domain → no DB call, safe result
    const cap2: { table?: string } = {}
    const guard = await disconnectShopConnections({ from() { cap2.table = 'shopify_connections'; return this } } as never, 'not a shop', 'shop_redacted')
    check('invalid shop domain → no DB call + invalidDomain', guard.invalidDomain === true && cap2.table === undefined)
  }

  console.log('D) OAuth public-app credential selection (H15-H17) + source safety (H13/H14/H16)')
  {
    const save = { pid: process.env.SHOPIFY_PUBLIC_CLIENT_ID, ps: process.env.SHOPIFY_PUBLIC_CLIENT_SECRET, cid: process.env.SHOPIFY_CLIENT_ID, cs: process.env.SHOPIFY_CLIENT_SECRET, url: process.env.SHOPIFY_APP_URL }
    process.env.SHOPIFY_APP_URL = 'https://www.gotopseo.com'
    process.env.SHOPIFY_CLIENT_ID = 'legacy_id'; process.env.SHOPIFY_CLIENT_SECRET = 'legacy_secret'
    process.env.SHOPIFY_PUBLIC_CLIENT_ID = 'public_id'; process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = 'public_secret'
    check('15. new installs use the PUBLIC client id/secret when set', getShopifyOAuthConfig()?.clientId === 'public_id' && getShopifyOAuthConfig()?.clientSecret === 'public_secret')
    delete process.env.SHOPIFY_PUBLIC_CLIENT_ID; delete process.env.SHOPIFY_PUBLIC_CLIENT_SECRET
    check('17. legacy custom-app still works when public creds are unset (not broken)', getShopifyOAuthConfig()?.clientId === 'legacy_id')
    process.env.SHOPIFY_PUBLIC_CLIENT_ID = save.pid; process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = save.ps; process.env.SHOPIFY_CLIENT_ID = save.cid; process.env.SHOPIFY_CLIENT_SECRET = save.cs; process.env.SHOPIFY_APP_URL = save.url

    const routeSrc = read('../../../app/api/shopify/webhooks/compliance/route.ts')
    check('14. raw body read via arrayBuffer, NOT request.json() before verify', /Buffer\.from\(await request\.arrayBuffer\(\)\)/.test(routeSrc) && !/await request\.json\(/.test(routeSrc))
    check('14. HMAC verified BEFORE any JSON.parse', routeSrc.indexOf('verifyShopifyWebhookHmac') < routeSrc.indexOf('JSON.parse'))
    check('13. logs use a shop-domain HASH, never raw payload/PII', /shopDomainHash/.test(routeSrc) && !/console\.(?:log|error)\([^)]*(?:rawBody|payload)/.test(routeSrc))
    check('16. the public secret is server-only (read from process.env, never returned)', /process\.env\.SHOPIFY_PUBLIC_CLIENT_SECRET/.test(read('../webhook.ts')) && !/NEXT_PUBLIC_SHOPIFY/.test(read('../webhook.ts')))
    check('cleanup never touches generated_articles / projects / topics', !/\.from\('(?:generated_articles|projects|article_topics)'\)/.test(read('../connection-cleanup.ts')))

    const toml = read('../../../shopify.app.toml')
    check('toml: three compliance topics', COMPLIANCE_TOPICS.every((t) => toml.includes(t)))
    check('toml: api_version matches the app (2026-07)', /api_version = "2026-07"/.test(toml))
    check('toml: compliance uri points at the implemented endpoint', /uri = "https:\/\/www\.gotopseo\.com\/api\/shopify\/webhooks\/compliance"/.test(toml))
    check('toml: minimal scopes (no customer/order/staff)', /read_products,read_content,write_content/.test(toml) && !/read_customers|write_customers|read_orders|write_orders|read_users/.test(toml))
    const complianceBlock = (toml.match(/compliance_topics = \[([\s\S]*?)\]/) || [])[1] || ''
    check('toml: app/uninstalled is a SEPARATE subscription (not a compliance_topic)', /topics = \[ "app\/uninstalled" \]/.test(toml) && !complianceBlock.includes('app/uninstalled'))
    check('toml: embedded = false (external dashboard)', /embedded = false/.test(toml))
  }

  console.log('E) helpers', true as unknown as string ? '' : '')
  {
    check('isComplianceTopic accepts only the 3 topics', isComplianceTopic('shop/redact') && !isComplianceTopic('orders/create') && !isComplianceTopic(null))
    check('shopDomainHash is non-reversible + non-empty', /^[a-f0-9]{12}$/.test(shopDomainHash('acme.myshopify.com')) && !shopDomainHash('acme.myshopify.com').includes('acme'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

/**
 * Route-level tests for the PUBLIC-app compliance endpoints:
 *   POST /api/shopify/webhooks/compliance        (customers/*, shop/redact)
 *   POST /api/shopify/webhooks/app-uninstalled    (app/uninstalled)
 * Both verify the raw-body HMAC with SHOPIFY_PUBLIC_CLIENT_SECRET. DB-free branches only
 * (the shop/redact + app/uninstalled DB dispatch is covered by shop-cleanup.qa.ts).
 * Run: npx tsx lib/shopify/__qa__/webhooks-public-routes.qa.ts
 */
import crypto from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const PUBLIC_SECRET = 'unit-test-public-webhook-secret'
process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = PUBLIC_SECRET
// The compliance endpoints must NOT depend on any product feature flag.
delete process.env.ENABLE_CONTENT
delete process.env.ENABLE_CONTENT_AUTOMATION
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role'

const sign = (raw: Buffer) => crypto.createHmac('sha256', PUBLIC_SECRET).update(raw).digest('base64')
const req = (url: string, raw: Buffer, headers: Record<string, string>) =>
  new Request(url, { method: 'POST', body: new Uint8Array(raw), headers })
const jbody = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8')

/**
 * Run `fn` with the Supabase env vars REMOVED, so any path that reaches
 * createAdminClient() throws ("supabaseUrl is required") rather than quietly building a
 * client. This makes every "no DB" claim below a PROOF instead of a label; the positive
 * control in each block shows the harness genuinely catches a database touch. The env is
 * always restored.
 */
async function withoutSupabaseEnv<T>(fn: () => Promise<T>): Promise<{ reached: false; value: T } | { reached: true; error: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  try {
    return { reached: false, value: await fn() }
  } catch (e) {
    return { reached: true, error: e instanceof Error ? e.message : 'unknown' }
  } finally {
    if (url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = url
    if (key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = key
  }
}

/** Assert a request returns `status` AND never reached the database. */
async function checkNoDb(label: string, run: () => Promise<Response>, status: number) {
  const out = await withoutSupabaseEnv(run)
  check(label, out.reached === false && out.value.status === status,
    out.reached ? `reached the database: ${out.error}` : undefined)
}

async function main() {
  console.log('Shopify PUBLIC-app compliance routes — offline')
  const { POST: compliancePOST } = await import('../../../app/api/shopify/webhooks/compliance/route')
  const { POST: uninstallPOST } = await import('../../../app/api/shopify/webhooks/app-uninstalled/route')
  const CU = 'https://app.example.com/api/shopify/webhooks/compliance'
  const UU = 'https://app.example.com/api/shopify/webhooks/app-uninstalled'

  // ── /compliance ──
  {
    const raw = jbody({ shop_domain: 'acme.myshopify.com' })
    check('compliance: unsigned → 401', (await compliancePOST(req(CU, raw, { 'x-shopify-topic': 'shop/redact' }))).status === 401)
    check('compliance: invalid HMAC → 401', (await compliancePOST(req(CU, raw, { 'x-shopify-hmac-sha256': 'AAAA', 'x-shopify-topic': 'shop/redact' }))).status === 401)
    check('compliance: signed customers/data_request → 200', (await compliancePOST(req(CU, jbody({ shop_id: 1 }), { 'x-shopify-hmac-sha256': sign(jbody({ shop_id: 1 })), 'x-shopify-topic': 'customers/data_request' }))).status === 200)
    const rd = jbody({ customer: { id: 9 } })
    check('compliance: signed customers/redact → 200', (await compliancePOST(req(CU, rd, { 'x-shopify-hmac-sha256': sign(rd), 'x-shopify-topic': 'customers/redact' }))).status === 200)
    const bad = Buffer.from('not json', 'utf8')
    check('compliance: signed malformed JSON → 400', (await compliancePOST(req(CU, bad, { 'x-shopify-hmac-sha256': sign(bad), 'x-shopify-topic': 'shop/redact' }))).status === 400)
    const nul = Buffer.from('null', 'utf8')
    const nulRes = await compliancePOST(req(CU, nul, { 'x-shopify-hmac-sha256': sign(nul), 'x-shopify-topic': 'shop/redact' }))
    check('compliance: signed non-object payload → 400 invalid_payload', nulRes.status === 400 && ((await nulRes.json()) as { error?: string }).error === 'invalid_payload')
    // POSITIVE CONTROL — a request that DOES reach the cleanup path must throw under the
    // no-DB harness, so the checks that follow cannot pass vacuously.
    const reaching = jbody({ shop_domain: 'acme.myshopify.com' })
    const control = await withoutSupabaseEnv(() => compliancePOST(req(CU, reaching, { 'x-shopify-hmac-sha256': sign(reaching), 'x-shopify-topic': 'shop/redact' })))
    check('compliance: the no-DB harness DOES catch a database touch (not vacuous)',
      control.reached === true && /supabaseUrl is required/i.test(control.error))
    const noShop = jbody({})
    await checkNoDb('compliance: signed shop/redact missing shop → 400, database never reached',
      () => compliancePOST(req(CU, noShop, { 'x-shopify-hmac-sha256': sign(noShop), 'x-shopify-topic': 'shop/redact' })), 400)
    const badShop = jbody({ shop_domain: 'not a host/admin' })
    await checkNoDb('compliance: signed shop/redact invalid shop → 400, database never reached',
      () => compliancePOST(req(CU, badShop, { 'x-shopify-hmac-sha256': sign(badShop), 'x-shopify-topic': 'shop/redact' })), 400)
    const mism = jbody({ shop_domain: 'acme.myshopify.com' })
    await checkNoDb('compliance: signed shop/redact body/header mismatch → 400, database never reached',
      () => compliancePOST(req(CU, mism, { 'x-shopify-hmac-sha256': sign(mism), 'x-shopify-topic': 'shop/redact', 'x-shopify-shop-domain': 'other.myshopify.com' })), 400)
    const unk = jbody({ id: 1 })
    await checkNoDb('compliance: signed unrelated topic → 200 no-op, database never reached',
      () => compliancePOST(req(CU, unk, { 'x-shopify-hmac-sha256': sign(unk), 'x-shopify-topic': 'orders/create' })), 200)
  }

  // ── /app-uninstalled ──
  {
    const raw = jbody({})
    check('uninstalled: unsigned → 401', (await uninstallPOST(req(UU, raw, { 'x-shopify-topic': 'app/uninstalled', 'x-shopify-shop-domain': 'acme.myshopify.com' }))).status === 401)
    // POSITIVE CONTROL for this endpoint's own harness.
    const reaching = jbody({})
    const control = await withoutSupabaseEnv(() => uninstallPOST(req(UU, reaching, { 'x-shopify-hmac-sha256': sign(reaching), 'x-shopify-topic': 'app/uninstalled', 'x-shopify-shop-domain': 'acme.myshopify.com' })))
    check('uninstalled: the no-DB harness DOES catch a database touch (not vacuous)',
      control.reached === true && /supabaseUrl is required/i.test(control.error))
    const unk = jbody({ id: 1 })
    await checkNoDb('uninstalled: signed unrelated topic → 200 (signature accepted), database never reached',
      () => uninstallPOST(req(UU, unk, { 'x-shopify-hmac-sha256': sign(unk), 'x-shopify-topic': 'orders/create' })), 200)
    const bad = Buffer.from('nope', 'utf8')
    check('uninstalled: signed malformed JSON → 400', (await uninstallPOST(req(UU, bad, { 'x-shopify-hmac-sha256': sign(bad), 'x-shopify-topic': 'app/uninstalled' }))).status === 400)
    const noHdr = jbody({})
    await checkNoDb('uninstalled: signed app/uninstalled missing shop header → 400, database never reached',
      () => uninstallPOST(req(UU, noHdr, { 'x-shopify-hmac-sha256': sign(noHdr), 'x-shopify-topic': 'app/uninstalled' })), 400)
    const mism = jbody({ myshopify_domain: 'other.myshopify.com' })
    await checkNoDb('uninstalled: signed header/myshopify_domain mismatch → 400, database never reached',
      () => uninstallPOST(req(UU, mism, { 'x-shopify-hmac-sha256': sign(mism), 'x-shopify-topic': 'app/uninstalled', 'x-shopify-shop-domain': 'acme.myshopify.com' })), 400)
  }

  // ── Source contracts ──
  {
    const shared = read('lib/shopify/webhook-public.ts')
    const sharedCode = shared.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    check('SRC: shared verifier reads env SHOPIFY_PUBLIC_CLIENT_SECRET, never env SHOPIFY_CLIENT_SECRET', /process\.env\.SHOPIFY_PUBLIC_CLIENT_SECRET/.test(sharedCode) && !/process\.env\.SHOPIFY_CLIENT_SECRET/.test(sharedCode))
    check('SRC: shared verifier reuses verifyShopifyWebhookHmac from webhook-hmac', /from '\.\/webhook-hmac'/.test(shared) && /verifyShopifyWebhookHmac/.test(shared))

    const comp = read('app/api/shopify/webhooks/compliance/route.ts')
    const unin = read('app/api/shopify/webhooks/app-uninstalled/route.ts')
    for (const [name, src] of [['compliance', comp], ['app-uninstalled', unin]] as const) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      check(`SRC: ${name} route uses the public verifier + reuses resolveCleanupShop`, /readVerifiedPublicWebhook/.test(code) && /resolveCleanupShop/.test(code) && /from '\.\.\/route'/.test(code))
      check(`SRC: ${name} route never references SHOPIFY_CLIENT_SECRET`, !/SHOPIFY_CLIENT_SECRET\b/.test(code.replace(/PUBLIC_CLIENT_SECRET/g, '')))
      check(`SRC: ${name} route is POST-only Node runtime, no feature-flag/404 gate`, /export const runtime = 'nodejs'/.test(code) && !/export async function GET/.test(code) && !/isContentModuleEnabled|\b404\b|Not found/.test(code))
    }

    // The base route + OAuth are UNTOUCHED and still use the custom-app secret path.
    check('SRC: base webhook route unchanged (still uses getShopifyWebhookSecret)', /getShopifyWebhookSecret\(\)/.test(read('app/api/shopify/webhooks/route.ts')))
    check('SRC: OAuth still uses SHOPIFY_CLIENT_SECRET (unchanged, not touched)', /process\.env\.SHOPIFY_CLIENT_SECRET/.test(read('lib/shopify/oauth.ts')))
    check('SRC: webhook-hmac.ts base getter still SHOPIFY_CLIENT_SECRET-only (unchanged)', /process\.env\.SHOPIFY_CLIENT_SECRET/.test(read('lib/shopify/webhook-hmac.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

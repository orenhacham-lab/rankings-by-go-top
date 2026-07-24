/**
 * Tests the default-deny inactive-connection policy in loadShopifyConnection, plus
 * source contracts proving only test-connection may load an inactive connection.
 * No network, no DB. Run: npx tsx lib/shopify/__qa__/connection-guard.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadShopifyConnection } from '../api-auth'
import { encryptCredential } from '../../security/credentials-crypto'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY = 'b'.repeat(64)
const ENC_TOKEN = encryptCredential('shpat_real_token')

function makeRow(status: 'connected' | 'failed' | 'untested') {
  return {
    id: 'c1', user_id: 'u1', project_id: 'p1', shop_domain: 'acme.myshopify.com',
    storefront_domain: null, access_token_encrypted: ENC_TOKEN, api_version: '2026-07',
    connection_status: status, last_tested_at: null, last_synced_at: null, last_error: null,
    default_blog_id: null, granted_scopes: ['read_products', 'read_content', 'write_content'],
    auth_method: 'oauth', created_at: 't', updated_at: 't',
  }
}
function admin(row: Record<string, unknown> | null, error: unknown = null) {
  const api = { select() { return api }, eq() { return api }, maybeSingle() { return Promise.resolve({ data: row, error }) } }
  return { from: () => api } as never
}

async function main() {
  console.log('Shopify inactive-connection guard')

  // connected → loads normally (creds present, token decrypted)
  {
    const r = await loadShopifyConnection(admin(makeRow('connected')), 'p1')
    check('connected → loads with creds', !('error' in r) && r.creds.accessToken === 'shpat_real_token')
  }
  // failed → default-denied with 409
  {
    const r = await loadShopifyConnection(admin(makeRow('failed')), 'p1')
    check('failed → default-denied (409, no creds)', 'error' in r && r.status === 409)
  }
  // untested → default-denied with 409
  {
    const r = await loadShopifyConnection(admin(makeRow('untested')), 'p1')
    check('untested → default-denied (409)', 'error' in r && r.status === 409)
  }
  // failed + allowInactive → recovery load succeeds (test-connection path)
  {
    const r = await loadShopifyConnection(admin(makeRow('failed')), 'p1', { allowInactive: true })
    check('failed + allowInactive:true → loads for recovery', !('error' in r) && r.creds.accessToken === 'shpat_real_token')
  }
  // missing row → 404 (unchanged)
  {
    const r = await loadShopifyConnection(admin(null), 'p1')
    check('missing connection → 404', 'error' in r && r.status === 404)
  }
  // DB error → 500 (unchanged)
  {
    const r = await loadShopifyConnection(admin(null, { message: 'boom' }), 'p1')
    check('DB error → 500', 'error' in r && r.status === 500)
  }

  // ── Source contracts ──
  const loaderSrc = read('lib/shopify/api-auth.ts')
  check('loader: default-deny unless connected (guard present)', /connection\.connection_status !== 'connected' && !opts\?\.allowInactive/.test(loaderSrc) && /status: 409/.test(loaderSrc))
  check('loader: allowInactive is an opt-in option', /opts\?: \{ allowInactive\?: boolean \}/.test(loaderSrc))

  const withAllow = (rel: string) => /loadShopifyConnection\([^)]*allowInactive:\s*true/.test(read(rel))
  const callsLoader = (rel: string) => /loadShopifyConnection\(/.test(read(rel))
  check('ONLY test-connection passes allowInactive:true', withAllow('app/api/shopify/test-connection/route.ts'))
  check('blogs does NOT pass allowInactive', callsLoader('app/api/shopify/blogs/route.ts') && !withAllow('app/api/shopify/blogs/route.ts'))
  check('sync does NOT pass allowInactive', callsLoader('app/api/shopify/sync/route.ts') && !withAllow('app/api/shopify/sync/route.ts'))
  check('manual publish (articles/[id]/shopify) does NOT pass allowInactive', callsLoader('app/api/content/articles/[id]/shopify/route.ts') && !withAllow('app/api/content/articles/[id]/shopify/route.ts'))
  check('automatic publish (publish-item-shopify) does NOT pass allowInactive', callsLoader('lib/content/automation/publish-item-shopify.ts') && !withAllow('lib/content/automation/publish-item-shopify.ts'))
  check('blogs/sync/manual-publish surface the inactive reason (409 → shopify_connection_inactive)',
    /loaded\.status === 409 \? 'shopify_connection_inactive'/.test(read('app/api/shopify/blogs/route.ts'))
    && /loaded\.status === 409 \? 'shopify_connection_inactive'/.test(read('app/api/shopify/sync/route.ts'))
    && /loaded\.status === 409 \? 'shopify_connection_inactive'/.test(read('app/api/content/articles/[id]/shopify/route.ts')))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

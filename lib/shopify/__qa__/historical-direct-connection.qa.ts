/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * REGRESSION — an intentional historical DIRECT Shopify connection stopped
 * publishing, and the app blamed the merchant for not having a store.
 *
 * The account: website/Admin-billed, connected directly to its store under the
 * single pre-approval connection permitted before the public app existed. Its
 * connection row is live and its encrypted token is present, but `shop_gid` and
 * `oauth_app_edition` are both NULL — the edition column was added later
 * (migration 20260901010000) with no backfill.
 *
 * The chain that broke it, all in code:
 *   isAccessTokenSafelyValid(null)      -> false  (a non-expiring token has no expiry)
 *   classifyStoredCredential(...)       -> 'unusable'  (NULL edition was not 'legacy')
 *   resolveShopifyAccessToken           -> reauthorization_required
 *   loadShopifyConnection               -> 409
 *   publishShopifyPoolItem              -> paused, reason 'no_shopify_connection', attempts UNCHANGED
 *   AutomationSchedule                  -> "לאחר 0 ניסיונות · לפרויקט הזה אין חנות Shopify מחוברת"
 *
 * Two defects, fixed together: the credential was refused, and the refusal was
 * then reported as a missing store.
 *
 * Run: npx tsx lib/shopify/__qa__/historical-direct-connection.qa.ts
 */

const Module: any = require('module')
const origLoad = Module._load
const INTERCEPT = ['lib/shopify/client.ts', 'lib/shopify/billing-guard.ts']
const overrides = new Map<string, Record<string, unknown>>()
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  let resolved: string
  try { resolved = String(Module._resolveFilename(request, parent, isMain)) } catch { resolved = request }
  const key = INTERCEPT.find((x) => resolved.endsWith(x))
  if (!key) return real
  return new Proxy(real, { get: (t, k) => { const o = overrides.get(key); return o && (k as string) in o ? o[k as string] : (t as any)[k] } })
}

// A REAL key, so the REAL encrypt/decrypt runs — stubbing the crypto module is
// not possible here (static imports load before the Module hook) and using the
// real thing is the stronger test anyway.
process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY = '0'.repeat(64)

import { FakeAdmin } from '../../__qa__/_fake-admin'
import { encryptCredential } from '../../security/credentials-crypto'
import { classifyStoredCredential } from '../token-resolver'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const PROJECT = 'oligarch-project'
const ARTICLE = 'art-1'
const ITEM = 'item-1'
const BLOG = { id: 'gid://shopify/Blog/1', title: 'News', handle: 'news' }
/** The historical row: live, token present, shop_gid and edition both NULL. */
const HISTORICAL = {
  id: 'conn-1', user_id: 'admin-user', project_id: PROJECT,
  shop_domain: 'oligarch.myshopify.com', storefront_domain: null,
  shop_gid: null,                       // never captured — predates shop-identity capture
  oauth_app_edition: null,              // predates the column; no backfill
  refresh_token_encrypted: null,        // non-expiring credential
  access_token_expires_at: null,
  access_token_encrypted: encryptCredential('shpat_historical_direct_token'),
  connection_status: 'connected', archived_at: null, api_version: '2026-07',
  granted_scopes: ['read_content', 'write_content'],
  default_blog_id: BLOG.id, updated_at: '2026-08-01T00:00:00Z',
}

function world(over: Record<string, unknown> = {}) {
  return new FakeAdmin({
    // Website/Admin-billed — Shopify is a publishing destination, not the biller.
    billing_governance: [{ user_id: 'admin-user', signup_origin: 'website', billing_authority: 'website', authority_reason: 'website_signup' }],
    shopify_connections: [{ ...HISTORICAL, ...over }],
    generated_articles: [{
      id: ARTICLE, project_id: PROJECT, topic_id: 't1', title: 'Post', slug: 'post',
      excerpt: 'x', meta_description: 'x', content_html: '<p>body</p>', featured_image_url: null,
      shopify_blog_id: BLOG.id, shopify_article_id: null, shopify_tags: [], status: 'generated', published_at: null,
    }],
    article_pool_items: [{ id: ITEM, project_id: PROJECT, topic_id: 't1', article_id: ARTICLE, status: 'generated', attempts: 0, last_error: null }],
  })
}
const item = (a: FakeAdmin) => (a.tables.article_pool_items as any[])[0]!

function installEdge() {
  const spy = { creates: 0, blogCalls: 0 }
  overrides.set('lib/shopify/client.ts', {
    getShopifyBlogs: async () => { spy.blogCalls++; return [BLOG] },
    shopifyArticleCreate: async () => { spy.creates++; return { ok: true, article: { id: 'gid://shopify/Article/1', handle: 'post', isPublished: true, publishedAt: '2026-09-05T00:00:00Z', blogHandle: 'news' } } },
    shopifyArticleUpdate: async () => ({ ok: true, article: { id: 'gid://shopify/Article/1', handle: 'post', isPublished: true, publishedAt: null, blogHandle: 'news' } }),
    shopifyGetArticle: async () => null,
  })
  overrides.set('lib/shopify/billing-guard.ts', { checkShopifyPublishEntitlement: async () => ({ ok: true }) })
  return spy
}

async function main() {
  console.log('Historical direct Shopify connection — publishing regression\n')

  console.log('1) THE CLASSIFIER — the exact condition that excluded the connection')
  {
    const base = { id: 'x', shop_domain: 's.myshopify.com', access_token_encrypted: 'e' }
    check('1a: a pre-column NULL edition, non-expiring, no refresh → legacy (was: unusable)',
      classifyStoredCredential({ ...base, oauth_app_edition: null }) === 'legacy')
    check('1b: an explicit legacy edition is unchanged',
      classifyStoredCredential({ ...base, oauth_app_edition: 'legacy' }) === 'legacy')
    // THE PUBLIC-APP ARCHITECTURE IS NOT WEAKENED — this is the guard that must hold.
    check('1c: a PUBLIC non-expiring token is STILL refused (deprecated by Shopify)',
      classifyStoredCredential({ ...base, oauth_app_edition: 'public' }) === 'unusable')
    check('1d: a NULL edition WITH an expiry is still incomplete, not admitted',
      classifyStoredCredential({ ...base, oauth_app_edition: null, access_token_expires_at: '2020-01-01T00:00:00Z' }) === 'incomplete')
    check('1e: a NULL edition WITH refresh material is the normal expiring grant',
      classifyStoredCredential({ ...base, oauth_app_edition: null, refresh_token_encrypted: 'r' }) === 'expiring')
  }

  console.log('\n2) THE FULL PUBLISH PATH — the historical connection publishes again')
  {
    const admin = world()
    const spy = installEdge()
    const { publishShopifyPoolItem } = require('../../content/automation/publish-item-shopify')
    const res = await publishShopifyPoolItem(admin as never, { ...item(admin) })
    check('2a: the item publishes', res.status === 'published', JSON.stringify(res))
    check('2b: Shopify was actually contacted — the code no longer stops before it', spy.creates === 1)
    check('2c: with NULL shop_gid still on the row (irrelevant to publishing)',
      (admin.tables.shopify_connections as any[])[0].shop_gid === null)
    check('2d: and billing authority untouched — still website',
      (admin.tables.billing_governance as any[])[0].billing_authority === 'website')
  }

  console.log('\n3) NEGATIVE CONTROL — the old classifier reproduces the incident exactly')
  {
    const oldClassify = (c: any) => {
      if (c.refresh_token_encrypted) return 'expiring'
      if (c.access_token_expires_at) return 'incomplete'
      return c.oauth_app_edition === 'legacy' ? 'legacy' : 'unusable'
    }
    check('3a: the OLD rule called the historical credential unusable', oldClassify(HISTORICAL) === 'unusable')
    check('3b: the NEW rule calls it legacy', classifyStoredCredential(HISTORICAL as any) === 'legacy')
    check('3c: and the old rule agreed with the new one on a PUBLIC token (no behaviour traded away)',
      oldClassify({ oauth_app_edition: 'public' }) === classifyStoredCredential({ id: 'x', shop_domain: 's', access_token_encrypted: 'e', oauth_app_edition: 'public' }))
  }

  console.log('\n4) TRUTHFUL REPORTING — a credential failure is no longer "you have no store"')
  {
    // A genuinely unusable credential (public app, non-expiring) must still fail —
    // but it must say WHY, and must not claim the store is missing.
    const admin = world({ oauth_app_edition: 'public' })
    installEdge()
    const { publishShopifyPoolItem } = require('../../content/automation/publish-item-shopify')
    const res = await publishShopifyPoolItem(admin as never, { ...item(admin) })
    check('4a: it is paused (fail-closed preserved)', res.status === 'paused', JSON.stringify(res))
    check('4b: with the REAL reason, not no_shopify_connection', res.reason === 'shopify_reauthorization_required', String(res.reason))
    check('4c: the stored reason matches', item(admin).last_error === 'shopify_reauthorization_required')
    check('4d: attempts are still not burned on a config blocker', item(admin).attempts === 0)

    // And a genuinely absent connection still says exactly that.
    const none = new FakeAdmin({
      billing_governance: [], shopify_connections: [],
      generated_articles: [{ id: ARTICLE, project_id: PROJECT, title: 'Post', content_html: '<p>b</p>', shopify_blog_id: null, shopify_article_id: null, shopify_tags: [], status: 'generated' }],
      article_pool_items: [{ id: ITEM, project_id: PROJECT, topic_id: 't1', article_id: ARTICLE, status: 'generated', attempts: 0, last_error: null }],
    })
    const res2 = await publishShopifyPoolItem(none as never, { ...item(none) })
    check('4e: a genuinely missing store still reports no_shopify_connection', res2.reason === 'no_shopify_connection', String(res2.reason))

    for (const lang of ['en', 'he'] as const) {
      const g = (getDashboardDictionary(lang).contentHub as any).genErrors
      for (const code of ['shopify_reauthorization_required', 'shopify_app_not_configured', 'shopify_credentials_unavailable', 'shopify_credential_unreadable', 'shopify_connection_unreadable']) {
        check(`4f[${lang}] ${code} is localized, never shown raw`, typeof g[code] === 'string' && g[code].length > 10)
      }
      check(`4g[${lang}] the reconnect message does NOT claim the store is missing`,
        !/no Shopify store|אין חנות/.test(g.shopify_reauthorization_required), g.shopify_reauthorization_required)
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })

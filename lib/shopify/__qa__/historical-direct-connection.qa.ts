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
const INTERCEPT = ['lib/shopify/client.ts']
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
import { classifyStoredCredential, DIRECT_LEGACY_PROVENANCE } from '../token-resolver'
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
  connection_provenance: 'direct_legacy_preapproval', // EXPLICIT, reviewed marking
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
    // A REAL, active website subscription. The entitlement guard is NOT stubbed:
    // the website-authority path actually runs and actually checks this row.
    subscriptions: [{ id: 'sub-1', user_id: 'admin-user', plan_code: 'advanced', status: 'active', paypal_subscription_id: 'I-PP', current_period_end: '2099-01-01T00:00:00Z' }],
    profiles: [{ id: 'admin-user', role: 'user' }],
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
  return spy
}

async function main() {
  console.log('Historical direct Shopify connection — publishing regression\n')

  console.log('1) THE CLASSIFIER — provenance is ASSERTED, never inferred')
  {
    const base = { id: 'x', shop_domain: 's.myshopify.com', access_token_encrypted: 'e' }
    // UNKNOWN STAYS REFUSED. A NULL edition also covers manually imported,
    // partially written and corrupt rows; absence of a value is not evidence.
    check('1a: a NULL edition alone is UNKNOWN and refused (fail closed)',
      classifyStoredCredential({ ...base, oauth_app_edition: null }) === 'unusable')
    check('1b: a bare row with no provenance at all is refused',
      classifyStoredCredential({ ...base }) === 'unusable')
    check('1c: an unrecognised provenance value is refused',
      classifyStoredCredential({ ...base, connection_provenance: 'something_else' }) === 'unusable')
    // ONLY an explicit, reviewed marking admits it.
    check('1d: a POSITIVELY MARKED direct connector is admitted',
      classifyStoredCredential({ ...base, connection_provenance: DIRECT_LEGACY_PROVENANCE }) === 'legacy')
    check('1e: an explicit legacy edition is unchanged',
      classifyStoredCredential({ ...base, oauth_app_edition: 'legacy' }) === 'legacy')
    // THE PUBLIC-APP GUARD — a marking must never launder a public grant.
    check('1f: a PUBLIC non-expiring token is refused',
      classifyStoredCredential({ ...base, oauth_app_edition: 'public' }) === 'unusable')
    check('1g: …and is STILL refused even if wrongly marked',
      classifyStoredCredential({ ...base, oauth_app_edition: 'public', connection_provenance: DIRECT_LEGACY_PROVENANCE }) === 'unusable')
    // The marking only matters when there is nothing to rotate with.
    check('1h: a marked row WITH an expiry is still incomplete',
      classifyStoredCredential({ ...base, connection_provenance: DIRECT_LEGACY_PROVENANCE, access_token_expires_at: '2020-01-01T00:00:00Z' }) === 'incomplete')
    check('1i: a marked row WITH refresh material is the normal expiring grant',
      classifyStoredCredential({ ...base, connection_provenance: DIRECT_LEGACY_PROVENANCE, refresh_token_encrypted: 'r' }) === 'expiring')
    check('1j: the provenance constant is the only admitting value', DIRECT_LEGACY_PROVENANCE === 'direct_legacy_preapproval')
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
    // The rule f9a9324 shipped: provenance REQUIRED, and only via the edition.
    const afterRegression = (c: any) => {
      if (c.refresh_token_encrypted) return 'expiring'
      if (c.access_token_expires_at) return 'incomplete'
      return c.oauth_app_edition === 'legacy' ? 'legacy' : 'unusable'
    }
    // The rule 4515de4 had, immediately BEFORE it: purely structural.
    const beforeRegression = (c: any) => (!c.refresh_token_encrypted && !c.access_token_expires_at) ? 'legacy' : 'other'
    check('3a: before f9a9324 the historical credential was usable (structural test)',
      beforeRegression(HISTORICAL) === 'legacy')
    check('3b: f9a9324 made it unusable — the regression', afterRegression(HISTORICAL) === 'unusable')
    check('3c: it is usable again ONLY because it is now positively marked',
      classifyStoredCredential(HISTORICAL as any) === 'legacy'
      && classifyStoredCredential({ ...HISTORICAL, connection_provenance: null } as any) === 'unusable')
    check('3d: and the public-app verdict is identical before and after (nothing traded away)',
      afterRegression({ oauth_app_edition: 'public' }) === classifyStoredCredential({ id: 'x', shop_domain: 's', access_token_encrypted: 'e', oauth_app_edition: 'public' }))
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

  console.log('\n5) AN INVALID LEGACY TOKEN REACHES SHOPIFY AND IS REJECTED TRUTHFULLY')
  {
    const admin = world()
    let reached = 0
    overrides.set('lib/shopify/client.ts', {
      getShopifyBlogs: async () => [BLOG],
      shopifyArticleCreate: async () => {
        reached++
        const { ShopifyClientError } = require('../client')
        throw new ShopifyClientError('invalid_token', 'Shopify rejected the credential')
      },
      shopifyArticleUpdate: async () => ({ ok: true, article: { id: 'x', handle: 'h', isPublished: true, publishedAt: null, blogHandle: null } }),
      shopifyGetArticle: async () => null,
    })
    const { publishShopifyPoolItem } = require('../../content/automation/publish-item-shopify')
    const res = await publishShopifyPoolItem(admin as never, { ...item(admin) })
    check('5a: the credential was actually SENT to Shopify — not pre-judged locally', reached === 1)
    check('5b: Shopify rejected it and the item FAILS (retry-bounded)', res.status === 'failed', JSON.stringify(res))
    check('5c: the reason is the token verdict, not a missing store',
      res.reason === 'token_invalid' && res.reason !== 'no_shopify_connection', String(res.reason))
    check('5d: and the stored error says so', String(item(admin).last_error).startsWith('shopify_token_invalid'), String(item(admin).last_error))
    check('5e: the article is preserved', (admin.tables.generated_articles as any[])[0].content_html === '<p>body</p>')
  }

  console.log('\n6) SCOPING — a connection belongs to exactly one project, and cannot be borrowed')
  {
    const { loadShopifyConnection } = require('../api-auth')
    const admin = world()
    const ok = await loadShopifyConnection(admin as never, PROJECT)
    check('6a: the owning project resolves the connection', !('error' in ok))
    const other = await loadShopifyConnection(admin as never, 'some-other-project')
    check('6b: a DIFFERENT project cannot borrow it', 'error' in other && other.reason === 'no_shopify_connection', JSON.stringify(other))
    check('6c: …and the connection row names its owner explicitly',
      (admin.tables.shopify_connections as any[])[0].user_id === 'admin-user'
      && (admin.tables.shopify_connections as any[])[0].project_id === PROJECT)

    // ARCHIVED — a retired connection is never resurrected by publishing.
    const archived = world({ archived_at: '2026-09-01T00:00:00Z' })
    const ar = await loadShopifyConnection(archived as never, PROJECT)
    check('6d: an ARCHIVED connection is not usable', 'error' in ar && ar.reason === 'no_shopify_connection', JSON.stringify(ar))

    // DISCONNECTED / failed status.
    const failed = world({ connection_status: 'failed' })
    const fr = await loadShopifyConnection(failed as never, PROJECT)
    check('6e: a non-connected status is refused, and says which', 'error' in fr && fr.reason === 'shopify_connection_inactive', JSON.stringify(fr))

    // A MISSING credential is refused — a marking never substitutes for a token.
    const noToken = world({ access_token_encrypted: '' })
    const nr = await loadShopifyConnection(noToken as never, PROJECT)
    check('6f: a marked connection with NO token is still refused',
      'error' in nr && nr.reason === 'shopify_credential_unreadable', JSON.stringify(nr))
  }

  console.log('\n7) shop_gid — not needed to PUBLISH, still required for Partner billing')
  {
    const { checkShopifyPublishEntitlement } = require('../billing-guard')
    const conn = () => ({ ...HISTORICAL })

    // Website-governed: publishing proceeds with NO shop_gid at all.
    const websiteWorld = world()
    const wr = await checkShopifyPublishEntitlement(websiteWorld as never, conn() as never)
    check('7a: website-billed + no shop_gid → entitled, governed by the WEBSITE',
      wr.ok === true && wr.governedBy === 'website', JSON.stringify(wr))

    // Shopify-governed: the SAME missing shop_gid is a hard refusal, because a
    // Partner API verification genuinely cannot be performed without it.
    const shopifyWorld = new FakeAdmin({
      billing_governance: [{ user_id: 'admin-user', signup_origin: 'shopify_app_store', billing_authority: 'shopify', authority_reason: 'verified_app_store_install' }],
      shopify_connections: [conn()], shopify_billing_migrations: [],
    })
    const sr = await checkShopifyPublishEntitlement(shopifyWorld as never, conn() as never)
    check('7b: Shopify-billed + no shop_gid → refused as shop_identity_unverified',
      sr.ok === false && sr.reason === 'shop_identity_unverified', JSON.stringify(sr))
    check('7c: the two answers differ ONLY by billing authority — the separation is real',
      wr.ok === true && sr.ok === false)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })

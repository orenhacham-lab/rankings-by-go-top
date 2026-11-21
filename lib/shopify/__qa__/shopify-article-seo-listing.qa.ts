/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * EVERY ARTICLE PUBLISHED TO A SHOPIFY BLOG WENT UP WITHOUT A SEARCH-ENGINE
 * LISTING.
 *
 * Measured 21 Nov 2026 in Production: of 616 published customer articles, 368
 * have `seo_status` NULL, and every recent one of those is a Shopify article —
 * `buildArticleInput` built title, body, handle, summary, tags, author, publish
 * date and image, and NO SEO fields at all. So Shopify fell back to the article
 * title and the opening words of the body for the page title and the meta
 * description, while the same article published to WordPress had both fields
 * written and verified (lib/content/seo-publish.ts). Customers pay for the
 * Shopify app too.
 *
 * An Article has no `seo` field — `SEOInput` exists for Product and Collection
 * only — so the listing is the two metafields Shopify documents for it:
 * `global.title_tag` and `global.description_tag`, `single_line_text_field`.
 *
 * The rule that makes this safe to run on a live store: on an UPDATE, a value
 * the merchant typed into Shopify's "Edit website SEO" panel is theirs and is
 * never replaced. Same rule the WordPress backfill states as "NEVER REPLACE A
 * VALUE THAT IS ALREADY THERE".
 *
 * BEHAVIORAL: the automation queue, the publishing orchestrator and the payload
 * builder all really run. Only the Shopify API, the credential edge and
 * Postgres are stood in for.
 *
 * NOT browser-verified.
 *
 * Run: npx tsx lib/shopify/__qa__/shopify-article-seo-listing.qa.ts
 */

/*
 * `require()` is deliberate: tsx runs this file as CommonJS and the Module._load
 * hook must be installed BEFORE the modules under test load. A static import is
 * hoisted above it and would defeat the substitution. Scoped to this harness.
 */
const Module: any = require('module')
const origLoad = Module._load
const INTERCEPT = ['lib/shopify/client.ts', 'lib/shopify/billing-guard.ts', 'lib/shopify/token-resolver.ts']
const overrides = new Map<string, Record<string, unknown>>()
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  let resolved: string
  try { resolved = String(Module._resolveFilename(request, parent, isMain)) } catch { resolved = request }
  const suffix = INTERCEPT.find((x) => resolved.endsWith(x))
  if (!suffix) return real
  return new Proxy(real, { get: (t, k) => {
    const over = overrides.get(suffix)
    return over && (k as string) in over ? over[k as string] : (t as any)[k]
  } })
}

/*
 * `publish-article` is loaded LAZILY, inside main(). A static import becomes a
 * require hoisted above the hook above, which would load it — and the real
 * billing guard with it — before the substitution exists, and every behavioural
 * case below would then stop at `billing_not_entitled`.
 */
type SeoOutcomeFn = (sent: Record<string, string>, node: { seoTitle?: string | null; seoDescription?: string | null }) =>
  { seo_status: string; seo_plugin: string; seo_verified_at: string | null } | null

import fs from 'node:fs'
import path from 'node:path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import {
  buildArticleInput, buildSeoMetafields,
  SEO_DESCRIPTION_METAFIELD_KEY, SEO_METAFIELD_NAMESPACE, SEO_METAFIELD_TYPE, SEO_TITLE_METAFIELD_KEY,
} from '../article-payload'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++ } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const BLOG = { id: 'gid://shopify/Blog/111', title: 'News', handle: 'news' }
const PROJECT = 'proj-1'
const ARTICLE = 'art-1'
const ITEM = 'item-1'
const CONN = 'conn-1'
const REMOTE = 'gid://shopify/Article/777'

const OUR_TITLE = 'מחקר מילות מפתח לחנות: המדריך המלא'
const OUR_DESC = 'איך בוחרים מילות מפתח לחנות אונליין, שלב אחר שלב, עם דוגמאות מהחנות שלכם.'
const MERCHANT_TITLE = 'Coffee guides | Our shop'

const base = {
  mode: 'create' as const, blogId: BLOG.id, title: 'How to brew', bodyHtml: '<p>b</p>', published: true,
}

// ── A: the payload carries the listing ─────────────────────────────────────

const created = buildArticleInput({ ...base, metaTitle: OUR_TITLE, metaDescription: OUR_DESC })
const createdMf = (created.metafields ?? []) as Record<string, string>[]
check('A1 a create sends both SEO metafields', createdMf.length === 2)
check('A2 in the namespace, keys and type Shopify documents for a search-engine listing',
  createdMf.every((m) => m.namespace === SEO_METAFIELD_NAMESPACE && m.type === SEO_METAFIELD_TYPE)
  && createdMf.map((m) => m.key).sort().join(',') === [SEO_DESCRIPTION_METAFIELD_KEY, SEO_TITLE_METAFIELD_KEY].sort().join(','))
check('A3 carrying our words, in Hebrew, unchanged',
  createdMf.find((m) => m.key === SEO_TITLE_METAFIELD_KEY)?.value === OUR_TITLE
  && createdMf.find((m) => m.key === SEO_DESCRIPTION_METAFIELD_KEY)?.value === OUR_DESC)
check('A4 an article with nothing to say about its listing sends no metafields field at all',
  !('metafields' in buildArticleInput({ ...base, metaTitle: null, metaDescription: null })))
check('A5 a description alone sends one metafield, not an empty title',
  (() => {
    const mf = (buildArticleInput({ ...base, metaDescription: OUR_DESC }).metafields ?? []) as Record<string, string>[]
    return mf.length === 1 && mf[0]!.key === SEO_DESCRIPTION_METAFIELD_KEY
  })())
check('A6 whitespace is not a value', !('metafields' in buildArticleInput({ ...base, metaTitle: '   ', metaDescription: '\n' })))

// ── B: the merchant's own listing is never replaced ────────────────────────

const kept = buildSeoMetafields({ mode: 'update', metaTitle: OUR_TITLE, metaDescription: OUR_DESC, existingSeoTitle: MERCHANT_TITLE, existingSeoDescription: null })
check('B1 an update does NOT send our title over a title the merchant typed',
  !kept.some((m) => m.key === SEO_TITLE_METAFIELD_KEY))
check('B2 and still fills the description the merchant left empty',
  kept.length === 1 && kept[0]!.key === SEO_DESCRIPTION_METAFIELD_KEY && kept[0]!.value === OUR_DESC)
check('B3 an update to an article with no listing at all writes both',
  buildSeoMetafields({ mode: 'update', metaTitle: OUR_TITLE, metaDescription: OUR_DESC }).length === 2)
check('B4 a merchant value of only spaces is not a value worth keeping',
  buildSeoMetafields({ mode: 'update', metaTitle: OUR_TITLE, existingSeoTitle: '   ' }).length === 1)
check('B5 on a CREATE there is nothing of the merchant to protect, so an existing value is ignored',
  buildSeoMetafields({ mode: 'create', metaTitle: OUR_TITLE, existingSeoTitle: MERCHANT_TITLE }).length === 1)

// ── D: the client asks Shopify for the listing ────────────────────────────

const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const clientSrc = stripComments(fs.readFileSync(path.join(process.cwd(), 'lib/shopify/client.ts'), 'utf8'))
check('D1 the reconcile read selects title_tag', /metafield\(namespace: "global", key: "title_tag"\)/.test(clientSrc))
check('D2 and description_tag', /metafield\(namespace: "global", key: "description_tag"\)/.test(clientSrc))
check('D3 the mutation payloads select them too, so a publish can verify itself without a second call',
  (clientSrc.match(/key: "title_tag"/g) ?? []).length >= 2)

// ── E: the whole publish, through the queue ──────────────────────────────

function world(opts: { remoteArticleId?: string | null } = {}) {
  return new FakeAdmin({
    shopify_connections: [{
      id: CONN, project_id: PROJECT, shop_domain: 's.myshopify.com', storefront_domain: null,
      connection_status: 'connected', archived_at: null, api_version: '2026-07',
      granted_scopes: ['read_content', 'write_content'], access_token_encrypted: 'enc',
      default_blog_id: BLOG.id, updated_at: '2026-09-01T00:00:00Z',
    }],
    generated_articles: [{
      id: ARTICLE, project_id: PROJECT, topic_id: 't1', title: 'How to brew', slug: 'how-to-brew',
      excerpt: 'x', meta_title: OUR_TITLE, meta_description: OUR_DESC,
      content_html: '<p>the already generated body</p>', featured_image_url: null,
      shopify_blog_id: BLOG.id, shopify_article_id: opts.remoteArticleId ?? null, shopify_tags: [],
      status: 'generated', seo_status: null, seo_plugin: null, seo_verified_at: null,
    }],
    article_pool_items: [{ id: ITEM, project_id: PROJECT, topic_id: 't1', article_id: ARTICLE, status: 'failed', attempts: 1, last_error: null }],
    projects: [{ id: PROJECT, business_name: 'Shop' }],
  })
}

interface Spy { creates: any[]; updates: any[] }

/**
 * The Shopify edge. `remoteSeo` is what the store ALREADY has, and the fake
 * behaves like the API: a metafield the mutation wrote comes back in the
 * response, and one it did not write comes back as the store's own value.
 */
function installEdge(remoteSeo: { title?: string | null; description?: string | null } = {}): Spy {
  const spy: Spy = { creates: [], updates: [] }
  const node = (input: any) => {
    const mf = (input?.metafields ?? []) as Record<string, string>[]
    const sent = (key: string) => mf.find((m) => m.key === key)?.value ?? null
    return {
      id: REMOTE, handle: 'how-to-brew', title: 'How to brew', isPublished: true, publishedAt: '2026-09-03T00:00:00Z', blogHandle: 'news',
      seoTitle: sent(SEO_TITLE_METAFIELD_KEY) ?? remoteSeo.title ?? null,
      seoDescription: sent(SEO_DESCRIPTION_METAFIELD_KEY) ?? remoteSeo.description ?? null,
    }
  }
  overrides.set('lib/shopify/client.ts', {
    getShopifyBlogs: async () => [BLOG],
    shopifyArticleCreate: async (_c: unknown, input: any) => { spy.creates.push(input); return { ok: true, article: node(input) } },
    shopifyArticleUpdate: async (_c: unknown, _id: string, input: any) => { spy.updates.push(input); return { ok: true, article: node(input) } },
    shopifyGetArticle: async () => ({
      id: REMOTE, handle: 'how-to-brew', title: 'How to brew', isPublished: true, publishedAt: null, blogHandle: 'news',
      seoTitle: remoteSeo.title ?? null, seoDescription: remoteSeo.description ?? null,
    }),
  })
  overrides.set('lib/shopify/billing-guard.ts', { checkShopifyPublishEntitlement: async () => ({ ok: true }) })
  overrides.set('lib/shopify/token-resolver.ts', { resolveShopifyAccessToken: async () => ({ ok: true, accessToken: 'shpat_test' }) })
  return spy
}

const art = (a: FakeAdmin) => (a.tables.generated_articles as any[])[0]!
async function runQueue(admin: FakeAdmin) {
  const { publishShopifyPoolItem } = require('../../content/automation/publish-item-shopify')
  return await publishShopifyPoolItem(admin as never, { ...(admin.tables.article_pool_items as any[])[0]! })
}

async function main() {
  const { seoOutcomeForPublish } = require('../publish-article') as { seoOutcomeForPublish: SeoOutcomeFn }

  // ── C: what gets recorded on the article ──────────────────────────────────

  check('C1 a listing Shopify confirms is verified', (() => {
    const o = seoOutcomeForPublish({ [SEO_TITLE_METAFIELD_KEY]: OUR_TITLE }, { seoTitle: OUR_TITLE })
    return o?.seo_status === 'verified' && o.seo_plugin === 'shopify' && !!o.seo_verified_at
  })())
  check('C2 a listing Shopify does not read back is written_not_verifiable, never verified', (() => {
    const o = seoOutcomeForPublish({ [SEO_TITLE_METAFIELD_KEY]: OUR_TITLE }, { seoTitle: null })
    return o?.seo_status === 'written_not_verifiable' && o.seo_verified_at === null
  })())
  check('C3 a value that came back DIFFERENT is not verified either',
    seoOutcomeForPublish({ [SEO_TITLE_METAFIELD_KEY]: OUR_TITLE }, { seoTitle: MERCHANT_TITLE })?.seo_status === 'written_not_verifiable')
  check('C4 sending nothing makes NO claim, so the columns are left alone',
    seoOutcomeForPublish({}, { seoTitle: MERCHANT_TITLE }) === null)
  check('C5 both fields must be confirmed, not just one',
    seoOutcomeForPublish({ [SEO_TITLE_METAFIELD_KEY]: OUR_TITLE, [SEO_DESCRIPTION_METAFIELD_KEY]: OUR_DESC },
      { seoTitle: OUR_TITLE, seoDescription: null })?.seo_status === 'written_not_verifiable')

  // E — a first publish of a real article, all the way through the queue.
  {
    const spy = installEdge()
    const admin = world()
    await runQueue(admin)
    const sent = (spy.creates[0]?.metafields ?? []) as Record<string, string>[]
    check('E1 the automatic publish really sends the listing', sent.length === 2, JSON.stringify(sent))
    check('E2 with the article\'s own Hebrew meta title and description',
      sent.find((m) => m.key === SEO_TITLE_METAFIELD_KEY)?.value === OUR_TITLE
      && sent.find((m) => m.key === SEO_DESCRIPTION_METAFIELD_KEY)?.value === OUR_DESC)
    check('E3 and the article now RECORDS that it has one — the null that 368 rows carry',
      art(admin).seo_status === 'verified' && art(admin).seo_plugin === 'shopify' && !!art(admin).seo_verified_at)
    check('E4 the publish itself is unchanged: the article is published, with its Shopify id and date',
      art(admin).status === 'published' && art(admin).shopify_article_id === REMOTE && !!art(admin).published_at)
  }

  // E — a re-export of an article whose listing the merchant has edited.
  {
    const spy = installEdge({ title: MERCHANT_TITLE })
    const admin = world({ remoteArticleId: REMOTE })
    await runQueue(admin)
    const sent = (spy.updates[0]?.metafields ?? []) as Record<string, string>[]
    check('E5 a re-export leaves the merchant\'s own page title alone',
      !sent.some((m) => m.key === SEO_TITLE_METAFIELD_KEY), JSON.stringify(sent))
    check('E6 and fills in the meta description they never set',
      sent.length === 1 && sent[0]!.key === SEO_DESCRIPTION_METAFIELD_KEY)
    check('E7 the row records the half it did write', art(admin).seo_status === 'verified')
  }

  // E — an article with no meta title of its own still gets a listing.
  {
    const spy = installEdge()
    const admin = world()
    art(admin).meta_title = null
    await runQueue(admin)
    const sent = (spy.creates[0]?.metafields ?? []) as Record<string, string>[]
    check('E8 with no meta_title, the article title is used rather than nothing',
      sent.find((m) => m.key === SEO_TITLE_METAFIELD_KEY)?.value === 'How to brew')
  }

  // ── MUTATION CONTROLS ───────────────────────────────────────────────────

  check('MUTATION CONTROL: the payload before this change carried no SEO field of any kind', (() => {
    const old = buildArticleInput({ ...base })
    return !('metafields' in old) && !('seo' in old)
  })())
  check('MUTATION CONTROL: sending ours unconditionally on an update would overwrite the merchant\'s title', (() => {
    const unconditional = buildSeoMetafields({ mode: 'create', metaTitle: OUR_TITLE, existingSeoTitle: MERCHANT_TITLE })
    return unconditional.some((m) => m.value === OUR_TITLE)
  })())
  check('MUTATION CONTROL: trusting the mutation instead of its read-back would report verified with no proof',
    seoOutcomeForPublish({ [SEO_TITLE_METAFIELD_KEY]: OUR_TITLE }, {})?.seo_status !== 'verified')
  check('MUTATION CONTROL: an Article has no `seo` input field, so a listing sent as `seo` would be silently nothing',
    !('seo' in buildArticleInput({ ...base, metaTitle: OUR_TITLE })))

  console.log(`${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

void main()
export {}

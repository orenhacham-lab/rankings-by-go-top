/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ACCEPTANCE AUDIT — the real merchant journey for a Shopify publishing
 * destination, end to end, across module boundaries.
 *
 * Journey under test:
 *   connected store → the visible Content Hub card → destination UI/API →
 *   retry/publish action → publish route OR automation queue → blog resolver →
 *   Shopify article creation → database persistence → HTTP response →
 *   localized merchant-facing text.
 *
 * These are BEHAVIORAL: the automation queue, the publishing orchestrator, the
 * resolver and the HTTP route all really run. Only the two true externals are
 * substituted — the Shopify Admin API (via a CommonJS module override, so the
 * production call sites are exercised unchanged) and Postgres (FakeAdmin, which
 * applies real filter/update semantics). Nothing asserts on regexes except the
 * clearly marked SOURCE section at the end.
 *
 * NOT browser-verified: no DOM is rendered here and no Preview session was
 * available. Section 8 inspects component source and says so.
 *
 * Run: npx tsx lib/shopify/__qa__/publish-destination-journey.qa.ts
 */

// ---------------------------------------------------------------------------
// Module override harness. tsx runs this file as CommonJS, so a Module._load
// hook can hand callers a Proxy over the real module with selected exports
// replaced. This keeps the production import graph, the real call sites and
// the real argument shapes — only the network edge is swapped.
// ---------------------------------------------------------------------------
/*
 * `require()` is deliberate and cannot be an import here: tsx runs this file as
 * CommonJS, and the Module._load hook below must be installed BEFORE the modules
 * under test are loaded. A static `import` is hoisted above it and would load
 * them first, defeating the substitution entirely. Scoped to this harness.
 */
const Module: any = require('module')
const origLoad = Module._load
/**
 * The modules whose exports this suite may substitute. Fixed UP FRONT, because
 * a module is wrapped once at first load and every consumer keeps that binding
 * forever — so the wrapper must consult `overrides` at CALL time, not capture
 * whatever happened to be registered when the module was first required.
 */
const INTERCEPT = [
  'lib/shopify/client.ts',
  'lib/shopify/billing-guard.ts',
  'lib/shopify/token-resolver.ts',
  'lib/content/article-generation.ts',
  'lib/quota/reserve.ts',
  'lib/content/api-auth.ts',
  'lib/supabase/admin.ts',
]
const overrides = new Map<string, Record<string, unknown>>()
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  let resolved: string
  try { resolved = String(Module._resolveFilename(request, parent, isMain)) } catch { resolved = request }
  const suffix = INTERCEPT.find((x) => resolved.endsWith(x))
  if (!suffix) return real
  return new Proxy(real, {
    get: (t, k) => {
      const over = overrides.get(suffix)
      return over && (k as string) in over ? over[k as string] : (t as any)[k]
    },
  })
}

import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { localizeShopifyPublishError } from '../../i18n/dashboard/shopify-publish-error'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const BLOG_ONE = { id: 'gid://shopify/Blog/111', title: 'News', handle: 'news' }
const BLOG_TWO = { id: 'gid://shopify/Blog/222', title: 'Guides', handle: 'guides' }
const PROJECT = 'proj-1'
const ARTICLE = 'art-1'
const ITEM = 'item-1'
const CONN = 'conn-1'

/** Everything the Shopify Admin API edge did during one run. */
interface Spy {
  blogCalls: number
  createCalls: { blogId: string; author: unknown }[]
  updateCalls: number
  getCalls: number
}

/**
 * Validate an ArticleCreateInput the way Shopify's 2026-07 schema does, and
 * throw the SAME variable-coercion error it does. A permissive stub that only
 * read input.blogId is exactly why this suite passed while production failed —
 * see lib/shopify/__qa__/article-author-required.qa.ts for the dedicated
 * coverage of this invariant.
 */
function assertValidArticleCreateInput(input: any) {
  if (!('author' in input) || input.author === null || input.author === undefined) {
    throw new Error('Variable $article of type ArticleCreateInput! was provided invalid value for author (Expected value to not be null)')
  }
  if (typeof input.author.name !== 'string' || input.author.name.trim() === '') {
    throw new Error('Variable $article of type ArticleCreateInput! was provided invalid value for author.name (Expected value to not be null)')
  }
}

/** A world with a healthy connected store and ONE already-generated article. */
function world(opts: { defaultBlogId?: string | null; itemStatus?: string; attempts?: number; connUpdateFails?: boolean } = {}) {
  const hooks: Record<string, any> = {}
  if (opts.connUpdateFails) hooks.shopify_connections = { update: () => ({ code: '23514', message: 'update rejected' }) }
  return new FakeAdmin({
    shopify_connections: [{
      id: CONN, project_id: PROJECT, shop_domain: 's.myshopify.com', storefront_domain: null,
      connection_status: 'connected', archived_at: null, api_version: '2026-07',
      granted_scopes: ['read_content', 'write_content'], access_token_encrypted: 'enc',
      default_blog_id: opts.defaultBlogId ?? null, updated_at: '2026-09-01T00:00:00Z',
    }],
    generated_articles: [{
      id: ARTICLE, project_id: PROJECT, topic_id: 't1', title: 'How to brew',
      slug: 'how-to-brew', excerpt: 'x', meta_description: 'x',
      // The article ALREADY EXISTS and is fully generated. Nothing in this
      // journey may regenerate it.
      content_html: '<p>body</p>', featured_image_url: null,
      shopify_blog_id: null, shopify_article_id: null, shopify_tags: [],
      status: opts.itemStatus === 'failed' ? 'draft' : 'generated',
    }],
    article_pool_items: [{
      id: ITEM, project_id: PROJECT, topic_id: 't1', article_id: ARTICLE,
      status: opts.itemStatus ?? 'generated', attempts: opts.attempts ?? 0, last_error: null,
    }],
  }, hooks)
}

/**
 * Install the Shopify + entitlement edge for one run and return the spy.
 * `blogs` may be a list or the string 'outage' (the Blogs call throws).
 */
function installEdge(blogs: typeof BLOG_ONE[] | 'outage'): Spy {
  const spy: Spy = { blogCalls: 0, createCalls: [], updateCalls: 0, getCalls: 0 }
  overrides.set('lib/shopify/client.ts', {
    getShopifyBlogs: async () => {
      spy.blogCalls++
      if (blogs === 'outage') throw new Error('shopify unavailable')
      return blogs
    },
    shopifyArticleCreate: async (_creds: unknown, input: any) => {
      assertValidArticleCreateInput(input)
      spy.createCalls.push({ blogId: input.blogId, author: input.author })
      return { ok: true, article: { id: 'gid://shopify/Article/1', handle: 'how-to-brew', isPublished: true, publishedAt: '2026-09-03T00:00:00Z', blogHandle: 'news' } }
    },
    shopifyArticleUpdate: async () => { spy.updateCalls++; return { ok: true, article: { id: 'gid://shopify/Article/1', handle: 'h', isPublished: true, publishedAt: null, blogHandle: 'news' } } },
    shopifyGetArticle: async () => { spy.getCalls++; return { id: 'gid://shopify/Article/1' } },
  })
  overrides.set('lib/shopify/billing-guard.ts', { checkShopifyPublishEntitlement: async () => ({ ok: true }) })
  // The credential edge (envelope decryption + Shopify's token endpoint) is the
  // other true external. loadShopifyConnection itself still runs for real — row
  // lookup, archived_at, connection_status — only the token is handed over.
  overrides.set('lib/shopify/token-resolver.ts', { resolveShopifyAccessToken: async () => ({ ok: true, accessToken: 'shpat_test' }) })
  return spy
}

/**
 * Counters for the things a PUBLISH RETRY must never touch. Article generation
 * and quota reservation are separate modules; if the publish path ever called
 * them these would move.
 */
function installGenerationTripwires() {
  const t = { gemini: 0, reserve: 0, consume: 0 }
  overrides.set('lib/content/article-generation.ts', { generateArticleForTopic: async () => { t.gemini++; throw new Error('generation must not run on publish retry') } })
  overrides.set('lib/quota/reserve.ts', {
    reserveUsage: async () => { t.reserve++; throw new Error('reservation must not run on publish retry') },
    consumeUsage: async () => { t.consume++; throw new Error('usage must not be consumed on publish retry') },
  })
  return t
}

const item = (admin: FakeAdmin) => (admin.tables.article_pool_items as any[])[0]!
const art = (admin: FakeAdmin) => (admin.tables.generated_articles as any[])[0]!
const conn = (admin: FakeAdmin) => (admin.tables.shopify_connections as any[])[0]!

async function runQueue(admin: FakeAdmin) {
  const { publishShopifyPoolItem } = require('../../content/automation/publish-item-shopify')
  return await publishShopifyPoolItem(admin as never, { ...item(admin) })
}

async function main() {
  console.log('Shopify publishing-destination acceptance audit\n')
  const tripwires = installGenerationTripwires()

  // -----------------------------------------------------------------------
  console.log('1) QUEUE RETRY, one blog: resolved ONCE, created ONCE with THAT id, persisted')
  {
    const admin = world({ itemStatus: 'failed', attempts: 1 })
    const spy = installEdge([BLOG_ONE])
    const res = await runQueue(admin)
    check('1a: the item publishes', res.status === 'published', JSON.stringify(res))
    check('1b: the blog was resolved EXACTLY ONCE for this attempt (no double lookup)', spy.blogCalls === 1, `blogCalls=${spy.blogCalls}`)
    check('1c: Shopify article creation happened exactly once', spy.createCalls.length === 1)
    check('1d: with the EXACT id the resolver returned', spy.createCalls[0]?.blogId === BLOG_ONE.id, JSON.stringify(spy.createCalls))
    check('1e: the connection default was persisted', conn(admin).default_blog_id === BLOG_ONE.id)
    check('1f: the article carries the resolved blog', art(admin).shopify_blog_id === BLOG_ONE.id)
    check('1g: the article id was stored (idempotent retry anchor)', art(admin).shopify_article_id === 'gid://shopify/Article/1')
    check('1h: the pool item is published', item(admin).status === 'published')
    check('1i: and the create payload carried a schema-valid author', JSON.stringify(spy.createCalls[0]?.author) === JSON.stringify({ name: 'Go Top SEO' }))
  }

  // -----------------------------------------------------------------------
  console.log('\n2) A SECOND lookup would fail — proving no second lookup happens')
  {
    // connUpdateFails is deliberate: it stops the resolved id from being saved,
    // so nothing downstream can short-circuit on a stored default. The ONLY
    // reason a second lookup does not happen here is that the queue hands its
    // resolution to the publisher. Restore the old double resolution and this
    // section fails.
    const admin = world({ itemStatus: 'failed', attempts: 1, connUpdateFails: true })
    const spy: Spy = { blogCalls: 0, createCalls: [], updateCalls: 0, getCalls: 0 }
    overrides.set('lib/shopify/client.ts', {
      // The FIRST call answers; any SECOND call throws. Before this fix the
      // publisher re-resolved and this run failed with blog_lookup_failed.
      getShopifyBlogs: async () => {
        spy.blogCalls++
        if (spy.blogCalls > 1) throw new Error('second blog lookup — the destination was resolved twice')
        return [BLOG_ONE]
      },
      shopifyArticleCreate: async (_c: unknown, input: any) => { assertValidArticleCreateInput(input); spy.createCalls.push({ blogId: input.blogId, author: input.author }); return { ok: true, article: { id: 'gid://shopify/Article/2', handle: 'h', isPublished: true, publishedAt: null, blogHandle: 'news' } } },
      shopifyArticleUpdate: async () => ({ ok: true, article: { id: 'x', handle: 'h', isPublished: true, publishedAt: null, blogHandle: null } }),
      shopifyGetArticle: async () => null,
    })
    overrides.set('lib/shopify/billing-guard.ts', { checkShopifyPublishEntitlement: async () => ({ ok: true }) })
    overrides.set('lib/shopify/token-resolver.ts', { resolveShopifyAccessToken: async () => ({ ok: true, accessToken: 'shpat_test' }) })
    const res = await runQueue(admin)
    check('2a: it still publishes', res.status === 'published', JSON.stringify(res))
    check('2b: Shopify Blogs was called exactly once', spy.blogCalls === 1, `blogCalls=${spy.blogCalls}`)
    check('2c: the article was created against the first (and only) resolution', spy.createCalls[0]?.blogId === BLOG_ONE.id)
  }

  // -----------------------------------------------------------------------
  console.log('\n3) The EXISTING article is reused — no generation, no reservation, no usage')
  {
    const admin = world({ itemStatus: 'failed', attempts: 1 })
    installEdge([BLOG_ONE])
    const before = { ...tripwires }
    const res = await runQueue(admin)
    check('3a: published', res.status === 'published')
    check('3b: article generation was never called', tripwires.gemini === before.gemini && tripwires.gemini === 0)
    check('3c: no quota was reserved', tripwires.reserve === 0)
    check('3d: no usage was consumed', tripwires.consume === 0)
    check('3e: the SAME article row was published (no new row)', (admin.tables.generated_articles as any[]).length === 1)
    check('3f: its body is the one that already existed', art(admin).content_html === '<p>body</p>')
  }

  // -----------------------------------------------------------------------
  console.log('\n4) Auto-selection persistence SUCCEEDS — reported as persisted')
  {
    const { resolvePublishBlogTarget } = require('../resolve-publish-blog')
    const admin = world()
    let calls = 0
    const r = await resolvePublishBlogTarget(admin as never, conn(admin) as never, {} as never, { shopify_blog_id: null }, { listBlogs: async () => { calls++; return [BLOG_ONE] } })
    check('4a: resolved to the only blog', r.ok === true && r.blogId === BLOG_ONE.id)
    check('4b: reported as auto-resolved', r.ok === true && r.autoResolved === true)
    check('4c: reported as PERSISTED', r.ok === true && r.persisted === true)
    check('4d: and the row really changed', conn(admin).default_blog_id === BLOG_ONE.id)
    check('4e: Shopify asked once', calls === 1)
  }

  // -----------------------------------------------------------------------
  console.log('\n5) Auto-selection persistence FAILS — reported honestly, publish still succeeds')
  {
    const { resolvePublishBlogTarget } = require('../resolve-publish-blog')
    const admin = world({ connUpdateFails: true })
    const r = await resolvePublishBlogTarget(admin as never, conn(admin) as never, {} as never, { shopify_blog_id: null }, { listBlogs: async () => [BLOG_ONE] })
    check('5a: it still resolves — a bookkeeping failure must not block a ready publish', r.ok === true && r.blogId === BLOG_ONE.id)
    check('5b: persisted is FALSE, not silently true', r.ok === true && r.persisted === false)
    check('5c: the row is genuinely unchanged (the claim matches reality)', conn(admin).default_blog_id === null)

    // And the whole queue journey still completes with the correct destination.
    const admin2 = world({ itemStatus: 'failed', attempts: 1, connUpdateFails: true })
    const spy = installEdge([BLOG_ONE])
    const res = await runQueue(admin2)
    check('5d: the queue still publishes', res.status === 'published', JSON.stringify(res))
    check('5e: to the correct blog', spy.createCalls[0]?.blogId === BLOG_ONE.id)
    check('5f: still only one lookup', spy.blogCalls === 1)
  }

  // -----------------------------------------------------------------------
  console.log('\n6) SEVERAL blogs and no default — blocked until the merchant chooses')
  {
    const admin = world()
    const spy = installEdge([BLOG_ONE, BLOG_TWO])
    const res = await runQueue(admin)
    check('6a: the item is PAUSED, not failed', res.status === 'paused', JSON.stringify(res))
    check('6b: with the distinct missing_default_blog reason', res.reason === 'missing_default_blog')
    check('6c: no attempt was burned', item(admin).attempts === 0)
    check('6d: NOTHING was published', spy.createCalls.length === 0)
    check('6e: the article is preserved', art(admin).shopify_article_id === null && art(admin).content_html === '<p>body</p>')
    check('6f: the stored reason is the localizable code', item(admin).last_error === 'missing_default_blog')

    // Saving the default unblocks the exact same journey.
    const admin2 = world({ defaultBlogId: BLOG_TWO.id })
    const spy2 = installEdge([BLOG_ONE, BLOG_TWO])
    const res2 = await runQueue(admin2)
    check('6g: with a default saved it publishes', res2.status === 'published', JSON.stringify(res2))
    check('6h: to the CHOSEN blog', spy2.createCalls[0]?.blogId === BLOG_TWO.id)
    check('6i: and no Blogs lookup was needed at all', spy2.blogCalls === 0)
  }

  // -----------------------------------------------------------------------
  console.log('\n7) ZERO blogs / lookup OUTAGE — distinct outcomes, exact statuses, localized text')
  {
    // 7.1 queue, zero blogs → paused (deterministic, action required)
    const admin = world()
    const spy = installEdge([])
    const res = await runQueue(admin)
    check('7a: zero blogs pauses the item', res.status === 'paused' && res.reason === 'no_shopify_blog', JSON.stringify(res))
    check('7b: no attempt burned', item(admin).attempts === 0)
    check('7c: the article survives', art(admin).content_html === '<p>body</p>')
    check('7d: nothing was created', spy.createCalls.length === 0)

    // 7.2 queue, outage → FAILED (retryable), never "your store has no blog"
    const admin2 = world()
    const spy2 = installEdge('outage')
    const res2 = await runQueue(admin2)
    check('7e: a lookup outage FAILS (retryable), it does not pause', res2.status === 'failed', JSON.stringify(res2))
    check('7f: with the transient reason, never no_shopify_blog', res2.reason === 'blog_lookup_failed')
    check('7g: the outage was looked up once, not twice', spy2.blogCalls === 1, `blogCalls=${spy2.blogCalls}`)
    check('7h: the attempt is bounded (it was claimed)', item(admin2).attempts === 1)
    check('7i: the article is restored to draft, never lost', art(admin2).status === 'draft' && art(admin2).content_html === '<p>body</p>')
    check('7j: the stored reason is the prefixed localizable code', item(admin2).last_error === 'shopify_blog_lookup_failed')

    // 7.3 the DIRECT publish route — real Response objects, real statuses.
    const routeStatus = async (blogs: typeof BLOG_ONE[] | 'outage', defaultBlogId: string | null) => {
      const a = world({ defaultBlogId })
      installEdge(blogs)
      overrides.set('lib/content/api-auth.ts', {
        isContentModuleEnabled: () => true,
        authContentProject: async () => ({ admin: a, project: { id: PROJECT } }),
      })
      overrides.set('lib/supabase/admin.ts', { createAdminClient: () => a })
      const mod = require('../../../app/api/content/articles/[id]/shopify/route')
      const response: Response = await mod.POST(
        new Request('https://x/api', { method: 'POST', body: JSON.stringify({ status: 'publish' }), headers: { 'Content-Type': 'application/json' } }),
        { params: Promise.resolve({ id: ARTICLE }) },
      )
      const body = await response.json()
      overrides.delete('lib/content/api-auth.ts')
      overrides.delete('lib/supabase/admin.ts')
      return { status: response.status, body, admin: a }
    }

    const zero = await routeStatus([], null)
    check('7k: route — no blog in the store is 400 (a settled fact)', zero.status === 400, `got ${zero.status}`)
    check('7l: with reason no_shopify_blog', zero.body.reason === 'no_shopify_blog')
    check('7m: and the article is untouched', art(zero.admin).shopify_article_id === null && art(zero.admin).content_html === '<p>body</p>')

    const many = await routeStatus([BLOG_ONE, BLOG_TWO], null)
    check('7n: route — several blogs and no default is 400', many.status === 400, `got ${many.status}`)
    check('7o: with the DISTINCT missing_default_blog reason', many.body.reason === 'missing_default_blog')
    check('7p: article preserved', art(many.admin).content_html === '<p>body</p>')

    const outage = await routeStatus('outage', null)
    check('7q: route — a Blogs OUTAGE is 503, not 400 and not 502', outage.status === 503, `got ${outage.status}`)
    check('7r: with reason blog_lookup_failed', outage.body.reason === 'blog_lookup_failed')
    check('7s: article preserved', art(outage.admin).content_html === '<p>body</p>')

    const ok = await routeStatus([BLOG_ONE], null)
    check('7t: route — the single-blog store publishes (200)', ok.status === 200, `got ${ok.status}`)
    check('7u: to the store’s only blog', art(ok.admin).shopify_blog_id === BLOG_ONE.id)

    // 7.4 every one of those reaches the merchant as a localized sentence, in
    // all three shapes the server can produce, in both languages.
    for (const lang of ['en', 'he'] as const) {
      const d = getDashboardDictionary(lang).contentHub as any
      const dict = { codes: d.genErrors as Record<string, string>, fallback: d.rowShopify.errGeneric as string }
      const forms = (code: string) => [code, `shopify_${code}`, `shopify_${code}: Blog not found`]
      for (const code of ['no_shopify_blog', 'missing_default_blog', 'blog_lookup_failed', 'missing_write_content_scope', 'no_shopify_connection']) {
        for (const form of forms(code)) {
          const text = localizeShopifyPublishError(form, dict)
          check(`7v[${lang}] "${form}" is localized`, text !== dict.fallback && !text.includes(code) && text.length > 10, text)
        }
      }
      check(`7w[${lang}] the detail is APPENDED, never shown alone`, localizeShopifyPublishError(`shopify_no_shopify_blog: Blog not found`, dict).includes('Blog not found'))
      check(`7x[${lang}] a genuinely unknown code falls back to a sentence, not a code`, localizeShopifyPublishError('totally_unknown_code_42', dict) === dict.fallback)
      check(`7y[${lang}] an empty reason falls back too`, localizeShopifyPublishError(undefined, dict) === dict.fallback)
    }
  }

  // -----------------------------------------------------------------------
  console.log('\n8) The card the merchant actually sees — SOURCE (NOT browser-verified)')
  {
    const card = strip(read('components/content/ContentHubPlatformCard.tsx'))
    const panel = strip(read('components/content/ShopifyConnectionPanel.tsx'))
    const dest = strip(read('components/content/ShopifyDestinationSection.tsx'))
    const hub = strip(read('components/content/ContentHub.tsx'))

    check('8a: SOURCE — the hub renders ContentHubPlatformCard', hub.includes('<ContentHubPlatformCard'))
    check('8b: SOURCE — and renders ShopifyConnectionPanel ONLY when nothing is connected (why the card must carry the destination)',
      /activePlatform === 'none' &&[\s\S]{0,200}<ShopifyConnectionPanel/.test(hub))
    check('8c: SOURCE — the visible card renders the destination section', card.includes('<ShopifyDestinationSection'))
    check('8d: SOURCE — it passes the real connection fields, not constants',
      /canPublish=\{shopify\.can_publish\}/.test(card) && /defaultBlogId=\{shopify\.default_blog_id\}/.test(card))
    check('8e: SOURCE — its connection type actually carries those fields', /can_publish: boolean/.test(card) && /default_blog_id: string \| null/.test(card))
    check('8f: SOURCE — the panel renders the SAME shared component (no second implementation)', panel.includes('<ShopifyDestinationSection'))
    check('8g: SOURCE — neither card defines its own blog list state any more',
      !/const \[blogs, setBlogs\]/.test(card) && !/const \[blogs, setBlogs\]/.test(panel))
    check('8h: SOURCE — the section distinguishes an outage from an empty store', /state === 'error'/.test(dest) && /defaultBlogLoadError/.test(dest))
    check('8i: SOURCE — and offers a visible retry on that outage', /defaultBlogRetry/.test(dest) && /onClick=\{load\}/.test(dest))
    check('8j: SOURCE — a non-ok blogs response sets error, it never falls through to "no blog"',
      /if \(!res\.ok \|\| !Array\.isArray\(data\.blogs\)\) \{ setState\('error'\); return \}/.test(dest))
    check('8k: SOURCE — one blog is STATED as auto-selected, not demanded as an action', /defaultBlogAuto/.test(dest))
    check('8l: SOURCE — several blogs get a selector plus Save', /<select/.test(dest) && /defaultBlogSave/.test(dest))
    check('8m: SOURCE — a missing scope is explained without hiding the destination',
      /defaultBlogNeedsScope/.test(dest) && !/if \(!canPublish\) return null/.test(dest))
    for (const lang of ['en', 'he'] as const) {
      const s = getDashboardDictionary(lang).projectDetail.contentSection.shopify as any
      for (const k of ['defaultBlogLabel', 'defaultBlogLoading', 'defaultBlogLoadError', 'defaultBlogRetry', 'defaultBlogNone', 'defaultBlogAuto', 'defaultBlogSelect', 'defaultBlogSave', 'defaultBlogMissing', 'defaultBlogNeedsScope']) {
        check(`8n[${lang}] ${k} is localized`, typeof s[k] === 'string' && s[k].length > 2)
      }
    }
    check('8o: SOURCE — the route no longer shares one status for verdict and outage',
      /result\.reason === 'blog_lookup_failed' \? 503/.test(strip(read('app/api/content/articles/[id]/shopify/route.ts'))))
    check('8p: SOURCE — the publisher only resolves when no prepared target was supplied',
      /if \(opts\.blogTarget\)/.test(strip(read('lib/shopify/publish-article.ts'))))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })

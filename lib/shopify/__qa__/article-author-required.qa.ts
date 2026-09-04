/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ArticleCreateInput.author is REQUIRED — the production incident.
 *
 * LIVE FACT. Shopify rejected every automatic publish with:
 *   "Variable $article of type ArticleCreateInput! was provided invalid value
 *    for author (Expected value to not be null)"
 * The payload builder only added `author` when a name was non-empty, and the
 * automation queue calls the publisher with `authorName: null` (the manual route
 * resolves null too whenever projects.business_name is NULL) — so a REQUIRED
 * field was simply absent.
 *
 * The previous acceptance suite did not catch it because its create stub read
 * only `input.blogId` and returned success. The fake here VALIDATES the input
 * the way the schema does and throws the same coercion error, so an invalid
 * payload fails the test instead of passing it.
 *
 * These are BEHAVIORAL: the automation queue, the publishing orchestrator, the
 * payload builder and the HTTP route all really run. Only the Shopify API, the
 * credential edge and Postgres are stood in for.
 *
 * NOT browser-verified.
 *
 * Run: npx tsx lib/shopify/__qa__/article-author-required.qa.ts
 */

/*
 * `require()` is deliberate and cannot be an import here: tsx runs this file as
 * CommonJS, and the Module._load hook below must be installed BEFORE the modules
 * under test are loaded. A static `import` is hoisted above it and would load
 * them first, defeating the substitution entirely. Scoped to this harness.
 */
const Module: any = require('module')
const origLoad = Module._load
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

import { FakeAdmin } from '../../__qa__/_fake-admin'
import { buildArticleInput, resolveCreateAuthorName, SHOPIFY_DEFAULT_ARTICLE_AUTHOR } from '../article-payload'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const BLOG = { id: 'gid://shopify/Blog/111', title: 'News', handle: 'news' }
const PROJECT = 'proj-1'
const ARTICLE = 'art-1'
const ITEM = 'item-1'
const CONN = 'conn-1'
const REMOTE_ARTICLE = 'gid://shopify/Article/777'

/** The exact message Shopify returns for a null/absent required author. */
const SHOPIFY_AUTHOR_ERROR =
  'Variable $article of type ArticleCreateInput! was provided invalid value for author (Expected value to not be null)'

/**
 * A SCHEMA-VALIDATING create fake. It rejects exactly what Shopify rejects:
 * a missing author, an explicit null, and a blank name — and it still checks
 * the blogId, so the PR #51 destination guarantee is not weakened here.
 */
function validateCreateInput(input: any, expectBlogId: string) {
  if (input.blogId !== expectBlogId) throw new Error(`wrong blogId: ${input.blogId}`)
  if (!('author' in input)) throw new Error(SHOPIFY_AUTHOR_ERROR)
  if (input.author === null || input.author === undefined) throw new Error(SHOPIFY_AUTHOR_ERROR)
  if (typeof input.author !== 'object') throw new Error(SHOPIFY_AUTHOR_ERROR)
  if (typeof input.author.name !== 'string' || input.author.name.trim() === '') {
    throw new Error('Variable $article of type ArticleCreateInput! was provided invalid value for author.name (Expected value to not be null)')
  }
}

interface Spy { creates: any[]; updates: any[]; blogCalls: number; createError: string | null }

function world(opts: { businessName?: string | null; remoteArticleId?: string | null } = {}) {
  const tables: Record<string, any[]> = {
    shopify_connections: [{
      id: CONN, project_id: PROJECT, shop_domain: 's.myshopify.com', storefront_domain: null,
      connection_status: 'connected', archived_at: null, api_version: '2026-07',
      granted_scopes: ['read_content', 'write_content'], access_token_encrypted: 'enc',
      default_blog_id: BLOG.id, updated_at: '2026-09-01T00:00:00Z',
    }],
    generated_articles: [{
      id: ARTICLE, project_id: PROJECT, topic_id: 't1', title: 'How to brew',
      slug: 'how-to-brew', excerpt: 'x', meta_description: 'x',
      content_html: '<p>the already generated body</p>', featured_image_url: null,
      shopify_blog_id: BLOG.id, shopify_article_id: opts.remoteArticleId ?? null, shopify_tags: [],
      status: 'generated',
    }],
    article_pool_items: [{ id: ITEM, project_id: PROJECT, topic_id: 't1', article_id: ARTICLE, status: 'failed', attempts: 1, last_error: null }],
    // `projects` exists but business_name may be absent/blank — the real reason
    // the manual route can resolve a null author.
    projects: [{ id: PROJECT, business_name: opts.businessName === undefined ? null : opts.businessName }],
  }
  return new FakeAdmin(tables)
}

/** Install the Shopify edge. `permissiveCreate` reproduces the OLD stub for the negative control. */
function installEdge(opts: { permissiveCreate?: boolean } = {}): Spy {
  const spy: Spy = { creates: [], updates: [], blogCalls: 0, createError: null }
  overrides.set('lib/shopify/client.ts', {
    getShopifyBlogs: async () => { spy.blogCalls++; return [BLOG] },
    shopifyArticleCreate: async (_c: unknown, input: any) => {
      spy.creates.push(input)
      if (!opts.permissiveCreate) {
        try { validateCreateInput(input, BLOG.id) } catch (e) { spy.createError = (e as Error).message; throw e }
      }
      return { ok: true, article: { id: REMOTE_ARTICLE, handle: 'how-to-brew', isPublished: true, publishedAt: '2026-09-03T00:00:00Z', blogHandle: 'news' } }
    },
    shopifyArticleUpdate: async (_c: unknown, _id: string, input: any) => {
      spy.updates.push(input)
      return { ok: true, article: { id: REMOTE_ARTICLE, handle: 'how-to-brew', isPublished: true, publishedAt: null, blogHandle: 'news' } }
    },
    shopifyGetArticle: async () => ({ id: REMOTE_ARTICLE, handle: 'how-to-brew', title: 'How to brew', isPublished: true, publishedAt: null, blogHandle: 'news' }),
  })
  overrides.set('lib/shopify/billing-guard.ts', { checkShopifyPublishEntitlement: async () => ({ ok: true }) })
  overrides.set('lib/shopify/token-resolver.ts', { resolveShopifyAccessToken: async () => ({ ok: true, accessToken: 'shpat_test' }) })
  return spy
}

/** Counters for what a publish retry must never touch. */
const tripwires = { gemini: 0, reserve: 0, consume: 0 }
overrides.set('lib/content/article-generation.ts', { generateArticleForTopic: async () => { tripwires.gemini++; throw new Error('generation must not run on publish retry') } })
overrides.set('lib/quota/reserve.ts', {
  reserveUsage: async () => { tripwires.reserve++; throw new Error('reservation must not run on publish retry') },
  consumeUsage: async () => { tripwires.consume++; throw new Error('usage must not be consumed on publish retry') },
})

const art = (a: FakeAdmin) => (a.tables.generated_articles as any[])[0]!
const item = (a: FakeAdmin) => (a.tables.article_pool_items as any[])[0]!

async function runQueue(admin: FakeAdmin) {
  const { publishShopifyPoolItem } = require('../../content/automation/publish-item-shopify')
  return await publishShopifyPoolItem(admin as never, { ...item(admin) })
}

async function runRoute(admin: FakeAdmin) {
  overrides.set('lib/content/api-auth.ts', {
    isContentModuleEnabled: () => true,
    authContentProject: async () => ({ admin, project: { id: PROJECT } }),
  })
  overrides.set('lib/supabase/admin.ts', { createAdminClient: () => admin })
  const mod = require('../../../app/api/content/articles/[id]/shopify/route')
  const response: Response = await mod.POST(
    new Request('https://x/api', { method: 'POST', body: JSON.stringify({ status: 'publish' }), headers: { 'Content-Type': 'application/json' } }),
    { params: Promise.resolve({ id: ARTICLE }) },
  )
  const body = await response.json()
  overrides.delete('lib/content/api-auth.ts')
  overrides.delete('lib/supabase/admin.ts')
  return { status: response.status, body }
}

async function main() {
  console.log('Shopify ArticleCreateInput.author — required-field incident\n')

  console.log('0) PURE — the invariant at the payload-construction boundary')
  {
    const base = { blogId: BLOG.id, title: 'T', bodyHtml: '<p>b</p>', published: true } as const
    for (const [label, name] of [['null', null], ['undefined', undefined], ['empty string', ''], ['whitespace', '   ']] as const) {
      const input = buildArticleInput({ ...base, mode: 'create', authorName: name as never })
      check(`0a: CREATE with ${label} author still sends a non-empty author`,
        !!input.author && (input.author as any)?.name === SHOPIFY_DEFAULT_ARTICLE_AUTHOR, JSON.stringify(input.author))
    }
    check('0b: CREATE never emits author: null', buildArticleInput({ ...base, mode: 'create', authorName: null }).author !== null)
    // Read through a helper: under a regression `author` can be absent, and the
    // suite must REPORT that rather than crash and hide every later section.
    const authorName = (input: Record<string, unknown>): unknown => (input.author as any)?.name
    check('0c: CREATE never emits { name: "" }', authorName(buildArticleInput({ ...base, mode: 'create', authorName: '' })) !== '')
    check('0d: an explicit author is trimmed and WINS over the fallback',
      authorName(buildArticleInput({ ...base, mode: 'create', authorName: '  Acme Coffee  ' })) === 'Acme Coffee')
    check('0e: UPDATE with no author OMITS the key entirely (never overwrites the remote author)',
      !('author' in buildArticleInput({ ...base, mode: 'update', authorName: null })))
    check('0f: UPDATE with a blank author also omits it',
      !('author' in buildArticleInput({ ...base, mode: 'update', authorName: '   ' })))
    check('0g: UPDATE with an explicit author DOES send it',
      authorName(buildArticleInput({ ...base, mode: 'update', authorName: 'Dana' })) === 'Dana')
    check('0h: the resolver never returns an empty string', resolveCreateAuthorName('') === SHOPIFY_DEFAULT_ARTICLE_AUTHOR && resolveCreateAuthorName(null).length > 0)
    check('0i: the fallback is a fixed product name, not store- or article-derived', SHOPIFY_DEFAULT_ARTICLE_AUTHOR === 'Go Top SEO')
  }

  console.log('\nA) AUTOMATION QUEUE create with authorName: null')
  {
    const admin = world()
    const spy = installEdge()
    const res = await runQueue(admin)
    check('A1: the item publishes', res.status === 'published', JSON.stringify(res))
    check('A2: the schema-validating fake accepted the payload', spy.createError === null, String(spy.createError))
    check('A3: author is exactly { name: "Go Top SEO" }', JSON.stringify(spy.creates[0]?.author) === JSON.stringify({ name: SHOPIFY_DEFAULT_ARTICLE_AUTHOR }), JSON.stringify(spy.creates[0]?.author))
    check('A4: the resolved blog is still the exact target (PR #51 preserved)', spy.creates[0]?.blogId === BLOG.id)
    check('A5: a saved default needed no Blogs lookup at all', spy.blogCalls === 0)
    check('A6: exactly one article was created — no duplicate', spy.creates.length === 1)
    check('A7: the Shopify article id was stored', art(admin).shopify_article_id === REMOTE_ARTICLE)
  }

  console.log('\nB) DIRECT/MANUAL route create with business_name NULL')
  {
    const admin = world({ businessName: null })
    const spy = installEdge()
    const r = await runRoute(admin)
    check('B1: the route returns 200', r.status === 200, `${r.status} ${JSON.stringify(r.body)}`)
    check('B2: the create was accepted by the validating fake', spy.createError === null, String(spy.createError))
    check('B3: author fell back to the stable default', JSON.stringify(spy.creates[0]?.author) === JSON.stringify({ name: SHOPIFY_DEFAULT_ARTICLE_AUTHOR }))
    check('B4: to the right blog', spy.creates[0]?.blogId === BLOG.id)
  }

  console.log('\nC) EXPLICIT business_name is trimmed and wins over the fallback')
  {
    const admin = world({ businessName: '  Acme Coffee  ' })
    const spy = installEdge()
    const r = await runRoute(admin)
    check('C1: the route returns 200', r.status === 200, `${r.status} ${JSON.stringify(r.body)}`)
    check('C2: author is the trimmed business name, not the fallback',
      JSON.stringify(spy.creates[0]?.author) === JSON.stringify({ name: 'Acme Coffee' }), JSON.stringify(spy.creates[0]?.author))
    // A blank business_name must behave like none at all.
    const admin2 = world({ businessName: '   ' })
    const spy2 = installEdge()
    const r2 = await runRoute(admin2)
    check('C3: a WHITESPACE business_name falls back rather than sending { name: "" }',
      r2.status === 200 && JSON.stringify(spy2.creates[0]?.author) === JSON.stringify({ name: SHOPIFY_DEFAULT_ARTICLE_AUTHOR }))
  }

  console.log('\nD) UPDATE with no authorName omits author — the remote byline is not overwritten')
  {
    const admin = world({ remoteArticleId: REMOTE_ARTICLE })
    const spy = installEdge()
    const res = await runQueue(admin)
    check('D1: the update path ran (idempotent — no create)', res.status === 'published' && spy.updates.length === 1 && spy.creates.length === 0, JSON.stringify(res))
    check('D2: the update payload has NO author key', spy.updates[0] && !('author' in spy.updates[0]), JSON.stringify(spy.updates[0]?.author))
    check('D3: it is not merely null/blank — the key is absent', !Object.keys(spy.updates[0] ?? {}).includes('author'))
    check('D4: the SAME remote article was updated, never duplicated', art(admin).shopify_article_id === REMOTE_ARTICLE)

    // An explicit author on an update IS sent.
    const admin2 = world({ remoteArticleId: REMOTE_ARTICLE, businessName: 'Acme Coffee' })
    const spy2 = installEdge()
    const r2 = await runRoute(admin2)
    check('D5: an explicit author on an update IS sent', r2.status === 200 && JSON.stringify(spy2.updates[0]?.author) === JSON.stringify({ name: 'Acme Coffee' }))
  }

  console.log('\nE) NEGATIVE CONTROL — the old omitted-author payload must FAIL the fake')
  {
    // Reconstruct the pre-fix payload exactly: author added only when non-empty.
    const oldStyle: Record<string, unknown> = { blogId: BLOG.id, title: 'T', body: '<p>b</p>', isPublished: true }
    const authorName: string | null = null
    const trimmed = (authorName || '').trim()
    if (trimmed) oldStyle.author = { name: trimmed }

    let threw: string | null = null
    try { validateCreateInput(oldStyle, BLOG.id) } catch (e) { threw = (e as Error).message }
    check('E1: the old payload is rejected', threw !== null)
    check('E2: with the SAME error Shopify returned in production', threw === SHOPIFY_AUTHOR_ERROR, String(threw))

    for (const [label, author] of [['explicit null', null], ['blank name', { name: '' }], ['whitespace name', { name: '  ' }]] as const) {
      let msg: string | null = null
      try { validateCreateInput({ blogId: BLOG.id, author }, BLOG.id) } catch (e) { msg = (e as Error).message }
      check(`E3: the fake also rejects ${label}`, msg !== null, String(msg))
    }
    let okMsg: string | null = null
    try { validateCreateInput({ blogId: BLOG.id, author: { name: 'Go Top SEO' } }, BLOG.id) } catch (e) { okMsg = (e as Error).message }
    check('E4: and ACCEPTS a non-empty author (not a fake that rejects everything)', okMsg === null, String(okMsg))
    let blogMsg: string | null = null
    try { validateCreateInput({ blogId: 'gid://shopify/Blog/999', author: { name: 'x' } }, BLOG.id) } catch (e) { blogMsg = (e as Error).message }
    check('E5: it still validates the exact blogId (PR #51 guarantee not weakened)', blogMsg !== null)

    // End to end: the old builder behavior really does break the real queue.
    const admin = world()
    const spy = installEdge()
    overrides.set('lib/shopify/client.ts', {
      ...(overrides.get('lib/shopify/client.ts') as Record<string, unknown>),
      shopifyArticleCreate: async (_c: unknown, input: any) => {
        const withoutAuthor = { ...input }                  // simulate the pre-fix omission
        delete withoutAuthor.author
        spy.creates.push(withoutAuthor)
        validateCreateInput(withoutAuthor, BLOG.id)
        return { ok: true, article: { id: REMOTE_ARTICLE, handle: 'h', isPublished: true, publishedAt: null, blogHandle: 'news' } }
      },
    })
    const res = await runQueue(admin)
    check('E6: with the author stripped, the real queue FAILS (the incident reproduces)', res.status === 'failed', JSON.stringify(res))
    check('E7: and the article is preserved, not lost', art(admin).content_html === '<p>the already generated body</p>')
    check('E8: no Shopify article id was recorded for a failed create', art(admin).shopify_article_id === null)
  }

  console.log('\nF) PR #51 behavior preserved — same article, no generation, no quota, no usage')
  {
    const admin = world()
    const spy = installEdge()
    const res = await runQueue(admin)
    check('F1: published', res.status === 'published')
    check('F2: article generation was never called', tripwires.gemini === 0)
    check('F3: no quota was reserved', tripwires.reserve === 0)
    check('F4: no usage was consumed', tripwires.consume === 0)
    check('F5: the SAME generated article row was published (no new row)', (admin.tables.generated_articles as any[]).length === 1)
    check('F6: with the body that already existed', spy.creates[0]?.body === '<p>the already generated body</p>')
    check('F7: exactly one Shopify article — no duplicate', spy.creates.length === 1 && spy.updates.length === 0)

    // A second run of the SAME item now takes the update path — still idempotent.
    const spy2 = installEdge()
    item(admin).status = 'failed'
    const res2 = await runQueue(admin)
    check('F8: a further retry UPDATES the same article instead of creating another',
      res2.status === 'published' && spy2.updates.length === 1 && spy2.creates.length === 0, JSON.stringify(res2))
    check('F9: still pointing at the same remote article', art(admin).shopify_article_id === REMOTE_ARTICLE)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })

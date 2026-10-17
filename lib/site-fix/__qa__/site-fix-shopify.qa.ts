/**
 * Site fixes on Shopify: the store's own articles and pages, through its existing connection.
 *
 *   C) capabilities: with write_content, exactly the Shopify types go through 'shopify'; without it the
 *      store is read-only; another owner's connection does not count.
 *   A) approve, apply, undo through the API with a fake store: the search engine listing title and
 *      description, an FAQ block, a broken link, image alt text, an extra main heading. A product,
 *      another owner's item, a store changed since the preview, a refused or unconfirmed write: nothing
 *      counts as applied. Undo restores, or clears a field the store did not have.
 *   P) preview: read through the store; llms.txt is never offered on a store.
 *   R) the real Admin API client: only *.myshopify.com, never follows a redirect, maps refusals to stable
 *      codes, and its source holds no mutation but articleUpdate, pageUpdate and metafieldsDelete.
 *   H) the body heading helpers.
 *   U) the screen offers "fix it for me" on a store only for articles and pages.
 * Every guard has a mutation control.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { TIME_MS } from '../read-pool'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import * as API from '../api'
import * as CHANNEL from '../channel'
import { sha256 } from '../content'
import {
  bodyH1s, demoteBodyH1s, fixMarker, SHOPIFY_FIX_TYPES, ShopFixError, shopifyFixClient,
  type ShopCreds, type ShopifyFixClient, type ShopItem, type ShopItemRef,
} from '../shopify-admin'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  PASS  ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

function mutant<T>(rel: string, from: string, to: string): { mod: T | null; found: boolean } {
  const src = read(rel)
  const found = src.includes(from)
  if (!found) return { mod: null, found }
  const dir = mkdtempSync(join(tmpdir(), 'site-fix-shop-mutant-'))
  try {
    const here = join(ROOT, rel, '..')
    const body = src.split(from).join(to)
      .replace(/from '@\/([^']+)'/g, (_m, p) => `from '${join(ROOT, p)}'`)
      .replace(/from '\.\/([^']+)'/g, (_m, p) => `from '${join(here, p)}'`)
    const file = join(dir, rel.split('/').pop()!)
    writeFileSync(file, body)
    return { mod: require(file) as T, found }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Several changes at once (every one must be found). */
function mutantMany<T>(rel: string, changes: [string, string][]): { mod: T | null; found: boolean } {
  const src = read(rel)
  if (!changes.every(([from]) => src.includes(from))) return { mod: null, found: false }
  const [first, ...rest] = changes
  const marker = '/*__MUTANT_MARKER__*/'
  const body = rest.reduce((acc, [from, to]) => acc.split(from).join(to), src).split(first[0]).join(`${marker}${first[1]}`)
  const dir = mkdtempSync(join(tmpdir(), 'site-fix-shop-mutant-'))
  try {
    const file = join(dir, `mutant-${rel.split('/').pop()!}`)
    const here = join(ROOT, rel, '..')
    writeFileSync(file, body.replace(/from '@\/([^']+)'/g, (_m, p) => `from '${join(ROOT, p)}'`).replace(/from '\.\/([^']+)'/g, (_m, p) => `from '${join(here, p)}'`))
    return { mod: require(file) as T, found: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const U = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const P = 'a1111111-2222-4333-8444-555555555555'
const SITE = 'https://boots.example.org'
const ARTICLE = `${SITE}/blogs/news/care-guide`
const PAGE = `${SITE}/pages/about`
const PRODUCT = `${SITE}/products/boot`
const OTHERS = `${SITE}/pages/others`
const CREDS: ShopCreds = { shopDomain: 'boots.myshopify.com', accessToken: 'shpat_test', apiVersion: '2026-07' }
let idN = 0
const newId = () => `${String(++idN).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(idN).padStart(12, '0')}`

type Row = Record<string, unknown>
const rows = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: [{ id: P, user_id: U, target_domain: 'boots.example.org', business_name: 'Boot Shop', name: 'Boots' }],
  project_profiles: [{ project_id: P, user_id: U, detected_platform: 'shopify' }],
  shopify_connections: [{ project_id: P, user_id: U, connection_status: 'connected', archived_at: null, granted_scopes: ['read_content', 'write_content'] }],
  shopify_entities: [
    { project_id: P, user_id: U, entity_type: 'article', canonical_url: ARTICLE, shopify_gid: 'gid://shopify/Article/11', is_active: true },
    { project_id: P, user_id: U, entity_type: 'page', canonical_url: PAGE, shopify_gid: 'gid://shopify/Page/21', is_active: true },
    { project_id: P, user_id: U, entity_type: 'product', canonical_url: PRODUCT, shopify_gid: 'gid://shopify/Product/31', is_active: true },
    { project_id: P, user_id: OTHER, entity_type: 'page', canonical_url: OTHERS, shopify_gid: 'gid://shopify/Page/99', is_active: true },
  ],
  site_fix_jobs: [] as Row[],
  site_fix_audit: [] as Row[],
  ...over,
})

/** An in-memory store: the article and the page, every write recorded. */
function fakeStore(opts: { ignoreWrites?: boolean; failWith?: ShopFixError } = {}) {
  const items = new Map<string, ShopItem>([
    ['gid://shopify/Article/11', {
      kind: 'article', gid: 'gid://shopify/Article/11', url: ARTICLE, title: 'Caring for leather boots',
      body: '<h1>Caring for leather boots</h1><p>Clean them weekly. See <a href="/pages/old-guide">the old guide</a>.</p><p><img src="https://cdn.shopify.com/a.jpg"></p>',
      titleTag: null, descriptionTag: 'Old description', image: { url: 'https://cdn.shopify.com/featured.jpg', alt: null },
    }],
    ['gid://shopify/Page/21', { kind: 'page', gid: 'gid://shopify/Page/21', url: PAGE, title: 'About us', body: '<p>We make boots by hand.</p>', titleTag: 'Old title', descriptionTag: null, image: null }],
  ])
  const writes: { gid: string; patch: unknown }[] = []
  const clears: { gid: string; key: string }[] = []
  const client: ShopifyFixClient = {
    async read(_c, ref) { const it = items.get(ref.gid); return it ? { ...it } : null },
    async write(_c, ref, patch) {
      if (opts.failWith) throw opts.failWith
      writes.push({ gid: ref.gid, patch })
      if (opts.ignoreWrites) return
      const it = items.get(ref.gid)
      if (!it) return
      if (patch.body !== undefined) it.body = patch.body
      if (patch.meta) it[patch.meta.key === 'title_tag' ? 'titleTag' : 'descriptionTag'] = patch.meta.value
      if (patch.imageAlt !== undefined && it.image) it.image = { ...it.image, alt: patch.imageAlt }
    },
    async clearMeta(_c, ref, key) {
      clears.push({ gid: ref.gid, key })
      const it = items.get(ref.gid)
      if (it) it[key === 'title_tag' ? 'titleTag' : 'descriptionTag'] = null
    },
  }
  return { client, items, writes, clears }
}

function depsFor(admin: FakeAdmin, store: ReturnType<typeof fakeStore>, over: Partial<API.FixesDeps> = {}): API.FixesDeps {
  return {
    userId: U, ip: '203.0.113.9', admin: admin as never,
    decrypt: (s) => s, encrypt: (s) => s, wp: {} as API.FixesDeps['wp'], readLive: async () => null, newId,
    shopify: { client: store.client, creds: async (scope) => (scope.userId === U ? CREDS : null) },
    ...over,
  }
}
const approve = (fix: Record<string, unknown>, pageUrl: string, over: Record<string, unknown> = {}) => ({
  projectId: P, action: 'approve', approved: true, kind: 'title_long', pageUrl, fix, ...over,
})
type JobBody = { ok?: boolean; code?: string; job?: { id: string; status: string; channel: string; errorCode: string | null; canUndo: boolean } }

async function main() {
  console.log('Site fixes on Shopify — articles and pages only\n')

  // ── C) capabilities ───────────────────────────────────────────────────────
  console.log('C) capabilities')
  {
    const store = fakeStore()
    const g = await API.handleFixesGet(P, depsFor(new FakeAdmin(rows()), store))
    const caps = (g.body as { capabilities: { readOnly: boolean; shopify?: boolean; channelFor: Record<string, string> } }).capabilities
    const types = Object.keys(caps.channelFor).sort()
    check('C1: with write_content: not read-only, exactly the Shopify types, each through "shopify"',
      !caps.readOnly && caps.shopify === true && types.join() === [...SHOPIFY_FIX_TYPES].sort().join() && Object.values(caps.channelFor).every((c) => c === 'shopify'), types.join())
    check('C2: canonical, focus keyphrase, schema, internal link and llms.txt are never offered on a store',
      ['canonical', 'focus_keyphrase', 'schema_jsonld', 'internal_link', 'llms_txt'].every((t) => !(t in caps.channelFor)))
    const ro = await API.handleFixesGet(P, depsFor(new FakeAdmin(rows({
      shopify_connections: [{ project_id: P, user_id: U, connection_status: 'connected', archived_at: null, granted_scopes: ['read_content', 'read_products'] }],
    })), store))
    const roCaps = (ro.body as { capabilities: { readOnly: boolean; channelFor: object } }).capabilities
    check('C3: a connection without write_content: read-only, no channel', roCaps.readOnly && Object.keys(roCaps.channelFor).length === 0)
    const other = await API.handleFixesGet(P, depsFor(new FakeAdmin(rows({
      shopify_connections: [{ project_id: P, user_id: OTHER, connection_status: 'connected', archived_at: null, granted_scopes: ['write_content'] }],
    })), store))
    check('C4: another owner\'s store connection under the same project id does not make this a store', !(other.body as { capabilities: { shopify?: boolean } }).capabilities.shopify)
    const m = mutant<typeof CHANNEL>('lib/site-fix/channel.ts', "    for (const type of SHOPIFY_FIX_TYPES) shopFor[type] = 'shopify'\n", "    for (const type of ['seo_title', 'canonical'] as const) shopFor[type] = 'shopify'\n")
    const mc = m.mod?.resolveCapabilities({ shopify: true, shopifyWrite: true, wordpressDetected: false, creds: null, plugin: null, pluginLink: null, webhook: null, siteUrls: [SITE] }, true)
    check('MUTATION CONTROL: a resolver that offers a type outside the Shopify list is caught by C1/C2', m.found && !!mc && 'canonical' in mc.channelFor)
  }

  // ── A) approve, apply, undo ───────────────────────────────────────────────
  console.log('\nA) approve, apply, undo')
  {
    const admin = new FakeAdmin(rows())
    const store = fakeStore()
    const r = await API.handleFixesPost(approve({ type: 'seo_title', value: 'About Boot Shop | Handmade boots' }, PAGE, { expected: 'Old title', before: 'Old title' }), depsFor(admin, store))
    const job = (r.body as JobBody).job
    const item = store.items.get('gid://shopify/Page/21')!
    const audit = admin.tables.site_fix_audit as Row[]
    check('A1: an SEO title on a page: applied through "shopify", written to the listing, the page text unchanged',
      job?.status === 'applied' && job.channel === 'shopify' && item.titleTag === 'About Boot Shop | Handmade boots' && item.body === '<p>We make boots by hand.</p>', JSON.stringify(r.body))
    check('A2: the approval and the outcome are on the audit trail, with the previous value',
      audit.some((a) => a.action === 'approved' && a.channel === 'shopify') && audit.some((a) => a.action === 'applied' && a.previous_value === 'Old title'))
    const u = await API.handleFixesPost({ projectId: P, action: 'undo', jobId: job?.id }, depsFor(admin, store))
    check('A3: undo puts the previous title back', (u.body as JobBody).job?.status === 'reverted' && item.titleTag === 'Old title')
  }
  {
    const admin = new FakeAdmin(rows())
    const store = fakeStore()
    const r = await API.handleFixesPost(approve({ type: 'seo_title', value: 'Leather boot care guide | Boot Shop' }, ARTICLE, { expected: '' }), depsFor(admin, store))
    const id = (r.body as JobBody).job?.id
    await API.handleFixesPost({ projectId: P, action: 'undo', jobId: id }, depsFor(admin, store))
    check('A4: a title the article did not have: undo clears the field instead of writing an empty one',
      store.clears.length === 1 && store.clears[0].key === 'title_tag' && store.items.get('gid://shopify/Article/11')!.titleTag === null)
  }
  {
    const admin = new FakeAdmin(rows())
    const store = fakeStore()
    const r = await API.handleFixesPost(approve({ type: 'seo_title', value: 'Our best boot | Boot Shop' }, PRODUCT, { expected: '' }), depsFor(admin, store))
    check('A5: a product is never written: the fix fails (not_in_store) and the store gets nothing',
      (r.body as JobBody).job?.status === 'failed' && (r.body as JobBody).job?.errorCode === 'not_in_store' && store.writes.length === 0, JSON.stringify(r.body))
    const o = await API.handleFixesPost(approve({ type: 'seo_title', value: 'About them | Boot Shop' }, OTHERS, { expected: '' }), depsFor(admin, store))
    check('A6: an item another owner\'s sync recorded is not ours: not_in_store, nothing written',
      (o.body as JobBody).job?.errorCode === 'not_in_store' && store.writes.length === 0)
    const loose = mutantMany<typeof import('../shopify-admin')>('lib/site-fix/shopify-admin.ts', [
      [".in('entity_type', ['article', 'page'])", ''],
      ["const row = rows.find((r) => (r.entity_type === 'article' || r.entity_type === 'page') && GID.test(String(r.shopify_gid ?? '')))", 'const row = rows[0]'],
      ["  if (!String(row.shopify_gid).startsWith(kind === 'article' ? 'gid://shopify/Article/' : 'gid://shopify/Page/')) return null\n", ''],
    ])
    const lref = loose.mod ? await loose.mod.findShopItem(admin as never, { projectId: P, userId: U }, PRODUCT) : null
    check('MUTATION CONTROL: a lookup without its article/page checks resolves the product (A5 catches it)', loose.found && lref !== null)
    const m2 = mutant<typeof import('../shopify-admin')>('lib/site-fix/shopify-admin.ts', ".eq('user_id', scope.userId)", '')
    const mref2 = m2.mod ? await m2.mod.findShopItem(admin as never, { projectId: P, userId: U }, OTHERS) : null
    check('MUTATION CONTROL: a lookup that forgets the owner filter resolves another owner\'s page (A6 catches it)', m2.found && mref2 !== null)
  }
  {
    const admin = new FakeAdmin(rows())
    const store = fakeStore()
    const r = await API.handleFixesPost(approve({ type: 'meta_description', value: 'How to clean, oil and store leather boots so they last for years.' }, ARTICLE, { expected: 'Something else', kind: 'description_length' }), depsFor(admin, store))
    check('A7: the store changed since the preview: refused (changed_since_preview), nothing written',
      (r.body as JobBody).job?.errorCode === 'changed_since_preview' && store.writes.length === 0)
    const m = mutant<typeof import('../shopify-apply')>('lib/site-fix/shopify-apply.ts', "if (job.expected !== null && (stored ?? '') !== job.expected) return { ok: false, code: 'changed_since_preview' }", '')
    const mr = m.mod ? await m.mod.applyViaShopify(CREDS, fakeStore().client, { id: newId(), ref: { kind: 'article', gid: 'gid://shopify/Article/11', url: ARTICLE }, payload: { type: 'meta_description', value: 'New text for the description of the guide.' }, expected: 'Something else' }) : null
    check('MUTATION CONTROL: an apply without the compare is caught by A7 (it writes over the newer value)', m.found && !!mr && mr.ok)
  }
  {
    const admin = new FakeAdmin(rows())
    const store = fakeStore()
    const art = store.items.get('gid://shopify/Article/11')!
    const before = art.body
    const r = await API.handleFixesPost(approve({ type: 'faq_block', heading: 'Questions', items: [{ q: 'How often should I clean them?', a: 'Once a week.' }] }, ARTICLE, { expected: sha256(before), kind: 'faq_missing' }), depsFor(admin, store))
    const id = (r.body as JobBody).job?.id ?? ''
    check('A8: an FAQ block is added at the end of the article as plain HTML, with its marker; the text before it stays',
      (r.body as JobBody).job?.status === 'applied' && art.body.startsWith(before) && art.body.includes(fixMarker(id)) && !art.body.includes('<!-- wp:'), art.body)
    art.body = `<p>Edited later.</p>${art.body}`
    await API.handleFixesPost({ projectId: P, action: 'undo', jobId: id }, depsFor(admin, store))
    check('A9: undo after a later edit takes out only our block', art.body === `<p>Edited later.</p>${before}`, art.body)
  }
  {
    const admin = new FakeAdmin(rows())
    const store = fakeStore()
    const art = store.items.get('gid://shopify/Article/11')!
    const r = await API.handleFixesPost(approve({ type: 'broken_link', href: `${SITE}/pages/old-guide`, replacement: PAGE }, ARTICLE, { expected: sha256(art.body), kind: 'broken_links' }), depsFor(admin, store))
    check('A10: a broken link in an article points to the right page, its words unchanged',
      (r.body as JobBody).job?.status === 'applied' && /<a\s+href="https:\/\/boots\.example\.org\/pages\/about">the old guide<\/a>/.test(art.body), art.body)
    const a = await API.handleFixesPost(approve({ type: 'image_alt', images: [{ src: 'https://cdn.shopify.com/a.jpg', alt: 'Brown leather boots' }] }, ARTICLE, { expected: sha256(art.body), kind: 'images_alt' }), depsFor(admin, store))
    check('A11: an image without a description gets the approved one', (a.body as JobBody).job?.status === 'applied' && art.body.includes('alt="Brown leather boots"'), art.body)
    {
      // The featured image only (the body has no image left without alt): its alt is written, the image is not.
      const fs = fakeStore()
      const fa = fs.items.get('gid://shopify/Article/11')!
      fa.body = '<p>No images in the text.</p>'
      const fx = await API.handleFixesPost(approve({ type: 'image_alt', images: [{ src: 'https://cdn.shopify.com/featured.jpg', alt: 'Leather boots on a shelf' }] }, ARTICLE, { expected: sha256(fa.body), kind: 'images_alt' }), depsFor(new FakeAdmin(rows()), fs))
      check('A11b: an article\'s featured image gets the approved alt text; the image and the body stay as they were',
        (fx.body as JobBody).job?.status === 'applied' && fa.image?.alt === 'Leather boots on a shelf' && fa.image?.url === 'https://cdn.shopify.com/featured.jpg' && fa.body === '<p>No images in the text.</p>'
        && fs.writes.every((w) => (w.patch as { body?: string }).body === undefined), JSON.stringify(fs.writes))
    }
    {
      const fs = fakeStore()
      const fadmin = new FakeAdmin(rows())
      const fa = fs.items.get('gid://shopify/Article/11')!
      fa.body = '<p>No images in the text.</p>'
      const fx = await API.handleFixesPost(approve({ type: 'image_alt', images: [{ src: 'https://cdn.shopify.com/featured.jpg', alt: 'Leather boots on a shelf' }] }, ARTICLE, { expected: sha256(fa.body), kind: 'images_alt' }), depsFor(fadmin, fs))
      const u = await API.handleFixesPost({ projectId: P, action: 'undo', jobId: (fx.body as JobBody).job?.id }, depsFor(fadmin, fs))
      check('A11c: undo puts the featured image\'s empty alt back', (u.body as JobBody).job?.status === 'reverted' && fa.image?.alt === '', JSON.stringify(fa.image))
      const fx2 = await API.handleFixesPost(approve({ type: 'image_alt', images: [{ src: 'https://cdn.shopify.com/featured.jpg', alt: 'Boots' }] }, ARTICLE, { expected: sha256(fa.body), kind: 'images_alt' }), depsFor(fadmin, fs))
      fa.image = { url: 'https://cdn.shopify.com/featured.jpg', alt: 'Changed by the owner' }
      const u2 = await API.handleFixesPost({ projectId: P, action: 'undo', jobId: (fx2.body as JobBody).job?.id }, depsFor(fadmin, fs))
      check('A11d: the owner changed the featured alt after the fix: undo leaves it alone', (u2.body as JobBody).job?.status !== 'reverted' && fa.image?.alt === 'Changed by the owner', JSON.stringify(u2.body))
    }
    const h = await API.handleFixesPost(approve({ type: 'h1_demote', headings: [{ n: 0, text: 'Caring for leather boots' }] }, ARTICLE, { expected: sha256(art.body), kind: 'h1_multiple' }), depsFor(admin, store))
    check('A12: the article body\'s extra main heading becomes a subheading, words unchanged',
      (h.body as JobBody).job?.status === 'applied' && art.body.startsWith('<h2>Caring for leather boots</h2>'), art.body)
  }
  {
    const admin = new FakeAdmin(rows())
    const deny = fakeStore({ failWith: new ShopFixError('store_permission') })
    const r = await API.handleFixesPost(approve({ type: 'seo_title', value: 'About Boot Shop | Handmade boots' }, PAGE, { expected: 'Old title' }), depsFor(admin, deny))
    check('A13: the store refuses the token: failed with store_permission, a stable code only', (r.body as JobBody).job?.errorCode === 'store_permission')
    const quiet = fakeStore({ ignoreWrites: true })
    const q = await API.handleFixesPost(approve({ type: 'seo_title', value: 'About Boot Shop | Handmade boots' }, PAGE, { expected: 'Old title' }), depsFor(new FakeAdmin(rows()), quiet))
    check('A14: a write the store does not show afterwards is not "applied" (write_not_confirmed)', (q.body as JobBody).job?.errorCode === 'write_not_confirmed')
    const none = await API.handleFixesPost(approve({ type: 'seo_title', value: 'About Boot Shop | Handmade boots' }, PAGE, { expected: 'Old title' }),
      depsFor(new FakeAdmin(rows()), fakeStore(), { shopify: { client: fakeStore().client, creds: async () => null } }))
    check('A15: no usable store credentials: failed with store_permission, nothing written', (none.body as JobBody).job?.errorCode === 'store_permission')
  }

  // ── P) preview ────────────────────────────────────────────────────────────
  console.log('\nP) preview')
  {
    const admin = new FakeAdmin(rows())
    const store = fakeStore()
    const art = store.items.get('gid://shopify/Article/11')!
    const p = await API.handleFixesPost({ projectId: P, action: 'preview', type: 'image_alt', url: ARTICLE, kind: 'images_alt' }, depsFor(admin, store))
    const b = p.body as { ok?: boolean; channel?: string; images?: { src: string }[]; expected?: string }
    check('P1: an alt-text preview reads the article body through the store, with its hash to compare, and the featured image without alt comes first',
      !!b.ok && b.channel === 'shopify' && b.images?.[0]?.src === 'https://cdn.shopify.com/featured.jpg' && b.images?.[1]?.src === 'https://cdn.shopify.com/a.jpg' && b.expected === sha256(art.body), JSON.stringify(b))
    art.image = { url: 'https://cdn.shopify.com/featured.jpg', alt: 'Already described' }
    const p2 = await API.handleFixesPost({ projectId: P, action: 'preview', type: 'image_alt', url: ARTICLE, kind: 'images_alt' }, depsFor(admin, store))
    check('P1b: a featured image that already has alt text is not offered', ((p2.body as { images?: { src: string }[] }).images ?? []).every((i) => !i.src.includes('featured')), JSON.stringify(p2.body))
    art.image = { url: 'https://cdn.shopify.com/featured.jpg', alt: null }
    const noFeatured = mutant<typeof import('../preview')>('lib/site-fix/preview.ts', "if (it.image && !String(it.image.alt ?? '').trim() && !missing.includes(it.image.url)) missing.unshift(it.image.url)", '')
    const shopCtx = { channel: 'shopify', creds: null, link: null, siteName: 'Boot Shop', shop: { creds: CREDS, client: store.client, ref: { kind: 'article', gid: 'gid://shopify/Article/11', url: ARTICLE } } } as never
    const pm = noFeatured.mod ? await noFeatured.mod.previewFixJob({ type: 'image_alt', url: ARTICLE, kind: 'images_alt' }, shopCtx, { wp: {} as never, readLive: async () => null }) as { images?: { src: string }[] } : null
    check('MUTATION CONTROL: a preview that skips the featured image is caught (it is no longer offered)', noFeatured.found && !!pm && (pm.images ?? []).every((i) => !i.src.includes('featured')), JSON.stringify(pm))
    const pr = await API.handleFixesPost({ projectId: P, action: 'preview', type: 'image_alt', url: PRODUCT, kind: 'images_alt' }, depsFor(admin, store))
    check('P2: a product preview: not_in_store', (pr.body as { code?: string }).code === 'not_in_store')
    const l = await API.handleFixesPost({ projectId: P, action: 'preview', type: 'llms_txt', url: `${SITE}/`, kind: 'llms_missing' }, depsFor(admin, store))
    check('P3: llms.txt is never offered on a store, not even to copy', (l.body as { code?: string }).code === 'not_allowed')
    const m = mutant<typeof API>('lib/site-fix/api.ts', "  if (l.caps.shopify && type === 'llms_txt') return refuse('not_allowed')\n", '')
    const ml = m.mod ? await m.mod.handleFixesPost({ projectId: P, action: 'preview', type: 'llms_txt', url: `${SITE}/`, kind: 'llms_missing' }, depsFor(admin, store)) : null
    check('MUTATION CONTROL: without the llms.txt refusal a store gets the copy text (P3 catches it)', m.found && !!ml && (ml.body as { code?: string }).code !== 'not_allowed')
  }

  // ── R) the real client ────────────────────────────────────────────────────
  console.log('\nR) the Admin API client')
  {
    const calls: { url: string; init: RequestInit }[] = []
    const answer = (status: number, json: unknown) => (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const ref: ShopItemRef = { kind: 'page', gid: 'gid://shopify/Page/21', url: PAGE }
    const ok = shopifyFixClient(answer(200, { data: { node: { id: ref.gid, title: 'About', body: '<p>x</p>', titleTag: { value: 'T' }, descriptionTag: null } } }))
    const it = await ok.read(CREDS, ref)
    const sent = calls[0]
    check('R1: one POST to the store\'s own Admin API, the pinned version, redirects refused',
      sent?.url === 'https://boots.myshopify.com/admin/api/2026-07/graphql.json' && sent.init.method === 'POST' && sent.init.redirect === 'error' && it?.titleTag === 'T')
    calls.length = 0
    let code = ''
    try { await ok.read({ ...CREDS, shopDomain: 'evil.example.com' }, ref) } catch (e) { code = (e as ShopFixError).code }
    check('R2: a store domain that is not *.myshopify.com is refused before any request', code === 'store_permission' && calls.length === 0)
    const rejecting = shopifyFixClient(answer(200, { data: { result: { userErrors: [{ field: ['body'], message: 'Body is invalid <raw>' }] } } }))
    let rc = ''
    try { await rejecting.write(CREDS, ref, { body: '<p>y</p>' }) } catch (e) { rc = (e as ShopFixError).code; check('R3: the store\'s own words never reach the error', !String((e as Error).message).includes('raw')) }
    check('R4: userErrors read as store_rejected', rc === 'store_rejected')
    const denied = shopifyFixClient(answer(200, { errors: [{ message: 'Access denied for pageUpdate', extensions: { code: 'ACCESS_DENIED' } }] }))
    let dc = ''
    try { await denied.write(CREDS, ref, { body: '<p>y</p>' }) } catch (e) { dc = (e as ShopFixError).code }
    check('R5: ACCESS_DENIED reads as store_permission', dc === 'store_permission')
    const src = strip(read('lib/site-fix/shopify-admin.ts'))
    const ops = [...src.matchAll(/\b(mutation|query)\s+\w+[^{]*\{\s*(?:\w+:\s*)?(\w+)\s*\(/g)].map((m) => `${m[1]}:${m[2]}`).sort()
    check('R6: the only operations are reading an article or a page, articleUpdate, pageUpdate and metafieldsDelete',
      ops.join() === ['mutation:articleUpdate', 'mutation:metafieldsDelete', 'mutation:pageUpdate', 'query:article', 'query:page'].join(), ops.join())
    check('R7: no product, collection, theme or settings operation anywhere in the Shopify channel',
      !/\b(product|collection|theme|shop)(Update|Create|Delete|Set)\b/i.test(src + strip(read('lib/site-fix/shopify-apply.ts'))))
  }

  // ── H) body headings ──────────────────────────────────────────────────────
  console.log('\nH) body headings')
  {
    check('H1: the body\'s headings, in order', bodyH1s('<h1>A</h1><p>x</p><h1 class="t">B <em>c</em></h1>')?.join('|') === 'A|B c')
    check('H2: an unclosed or nested heading is not simple markup (null)', bodyH1s('<h1>A<p>x</p>') === null && bodyH1s('<h1>A<h1>B</h1></h1>') === null)
    const d = demoteBodyH1s('<h1>A</h1><h1 id="x">B</h1>', [{ n: 1, text: 'B' }])
    check('H3: only the chosen heading becomes h2, its attributes kept', d.count === 1 && d.html === '<h1>A</h1><h2 id="x">B</h2>', d.html)
    check('H4: a heading whose words changed since the preview changes nothing', demoteBodyH1s('<h1>A</h1><h1>B2</h1>', [{ n: 1, text: 'B' }]).count === 0)
  }

  // ── S) after a scan: is the problem in what we may edit? ───────────────
  console.log('\nS) the scan\'s store check')
  {
    const SCAN = require('../shopify-scan') as typeof import('../shopify-scan')
    const finding = (fixType: string, pages: Record<string, unknown>[]) => ({ id: 'x', severity: 'minor', pages: pages.map((p) => ({ path: '/', value: null, measure: null, fixable: true, adminUrl: null, ...p })), total: pages.length, field: null, guide: 'alt', fixable: true, fixType }) as never
    const run = async (store: ReturnType<typeof fakeStore>, fs: never[], mod: typeof SCAN = SCAN) => {
      await mod.markShopifyOutsideContent(fs, { admin: new FakeAdmin(rows()) as never, scope: { projectId: P, userId: U }, creds: CREDS, client: store.client })
      return fs as unknown as { pages: { outside?: string; fixable: boolean }[] }[]
    }
    {
      const store = fakeStore()
      const art = store.items.get('gid://shopify/Article/11')!
      art.image = { url: 'https://cdn.shopify.com/featured.jpg', alt: 'Described' }
      art.body = '<p>Text only, <img src="x.jpg" alt="ok"></p>'
      const out = await run(store, [finding('image_alt', [{ url: ARTICLE, kind: 'article' }])]) as unknown as { pages: unknown[]; themeAlt?: { pages: number } }[]
      // Theme-only pages are no longer one dead row each: they are said once, for the whole site.
      check('S1: images without alt only in the theme (body and featured image are fine): no row with a fix button, said once for the site',
        out[0].pages.length === 0 && out[0].themeAlt?.pages === 1, JSON.stringify(out[0]))
      art.image = { url: 'https://cdn.shopify.com/featured.jpg', alt: null }
      const out2 = await run(store, [finding('image_alt', [{ url: ARTICLE, kind: 'article' }])])
      check('S2: the featured image has no alt: the fix stays offered', out2[0].pages[0].outside === undefined && out2[0].pages[0].fixable === true)
      const mutAlt = mutant<typeof SCAN>('lib/site-fix/shopify-scan.ts', "reach.set(url, item === 'not_ours' ? 'not_ours' : reachableAlt(item))", '')
      art.image = { url: 'https://cdn.shopify.com/featured.jpg', alt: 'Described' }
      const outA = mutAlt.mod ? await run(store, [finding('image_alt', [{ url: ARTICLE, kind: 'article' }])], mutAlt.mod) : null
      check('MUTATION CONTROL: without counting what the store holds, S1 is caught (the dead row would stay)', mutAlt.found && !!outA && outA[0].pages.length === 1 && outA[0].pages[0].outside === undefined)
      const mut = mutant<typeof SCAN>('lib/site-fix/shopify-scan.ts', "if (item === 'not_ours' || !inEditableContent(f.fixType, item, p)) { p.outside = 'theme'; p.fixable = false }", '')
      const outM = mut.mod ? await run(store, [finding('broken_link', [{ url: `${SITE}/pages/gone`, kind: 'other', from: ARTICLE }])], mut.mod) : null
      check('MUTATION CONTROL: without the marking, a broken link only in the theme (S4) keeps its button', mut.found && !!outM && outM[0].pages[0].outside === undefined)
    }
    {
      const store = fakeStore()
      const out = await run(store, [finding('broken_link', [{ url: `${SITE}/pages/old-guide`, kind: 'other', from: ARTICLE }, { url: `${SITE}/pages/gone`, kind: 'other', from: ARTICLE }, { url: `${SITE}/pages/old-guide`, kind: 'other', from: PRODUCT }])])
      const [inBody, inTheme, onProduct] = out[0].pages
      check('S3: a broken link in the article text stays fixable', inBody.outside === undefined && inBody.fixable)
      check('S4: a broken link not in the text (menu, footer) is marked outside', inTheme.outside === 'theme' && !inTheme.fixable)
      check('S5: a broken link found on a product is marked outside (products are not ours to edit)', onProduct.outside === 'theme' && !onProduct.fixable)
    }
    {
      const store = fakeStore()
      const art = store.items.get('gid://shopify/Article/11')!
      art.body = '<p>No heading in the text.</p>'
      const out = await run(store, [finding('h1_demote', [{ url: ARTICLE, kind: 'article' }])])
      check('S6: a second main heading that only the theme adds is marked outside', out[0].pages[0].outside === 'theme')
      const slow = fakeStore()
      const realRead = slow.client.read
      slow.client.read = async (c, r) => { await new Promise((res) => setTimeout(res, TIME_MS + 1_500)); return realRead(c, r) }
      const t0 = Date.now()
      const outSlow = await run(slow, [finding('h1_demote', [{ url: ARTICLE, kind: 'article' }])])
      check('S7: a store that does not answer in time: the report does not wait for it, and nothing is marked', Date.now() - t0 < TIME_MS + 1_000 && outSlow[0].pages[0].outside === undefined, String(Date.now() - t0))
      const failing = fakeStore()
      failing.client.read = async () => { throw new ShopFixError('store_unreachable') }
      const outFail = await run(failing, [finding('h1_demote', [{ url: ARTICLE, kind: 'article' }])])
      check('S8: a store read that fails leaves the finding as scanned', outFail[0].pages[0].outside === undefined && outFail[0].pages[0].fixable === true)
      check('S9: the store check never writes', slow.writes.length === 0 && failing.writes.length === 0 && store.writes.length === 0)
    }
  }

  // ── U) the screen ─────────────────────────────────────────────────────────
  console.log('\nU) the screen')
  {
    const screen = strip(read('components/site-health/SiteHealthScreen.tsx'))
    const gate = /if \(caps\.shopify && \(finding\.fixType === 'llms_txt' \|\| \(finding\.fixType !== 'broken_link' && page\.kind !== 'article' && page\.kind !== 'page'\)\)\) return null/
    check('U1: on a store, "fix it for me" shows only on articles and pages (products, collections, llms.txt keep their instructions)', gate.test(screen))
    check('MUTATION CONTROL: U1 fails on a screen without the gate', !gate.test(screen.replace(gate, '')))
    const dicts = ['he', 'en', 'es', 'pt-BR'] as const
    const { getDashboardDictionary } = require('../../i18n/dashboard/getDashboardDictionary') as { getDashboardDictionary: (l: string) => { siteHealth: { autofix: { approve: { lead: Record<string, string>; via: Record<string, string> }; queue: { channel: Record<string, string> }; errors: Record<string, string> } } } }
    const missing = dicts.flatMap((l) => {
      const a = getDashboardDictionary(l).siteHealth.autofix
      return [a.approve.lead.shopify, a.approve.via.shopify_seo, a.queue.channel.shopify, a.errors.not_in_store, a.errors.store_permission, a.errors.store_unreachable, a.errors.store_rejected]
        .map((v, i) => (typeof v === 'string' && v.trim() ? null : `${l}#${i}`)).filter(Boolean)
    })
    check('U2: every Shopify line of the screen exists in all four languages', missing.length === 0, missing.join(','))
    const outsideGate = /if \(page\.outside === 'theme'\) return null/
    check('U3: a page whose problem is outside the store\'s editable content gets no fix button', outsideGate.test(screen))
    check('MUTATION CONTROL: U3 fails on a screen without that gate', !outsideGate.test(screen.replace(outsideGate, '')))
    const { PUBLIC_LOCALES } = require('../../i18n/locales') as { PUBLIC_LOCALES: string[] }
    const noNote = PUBLIC_LOCALES.filter((l) => {
      const v = (getDashboardDictionary(l).siteHealth as unknown as { inTheme?: unknown }).inTheme
      return typeof v !== 'string' || !v.trim()
    })
    check('U4: the "the problem is in the theme" note exists in every site language', noNote.length === 0, noNote.join(','))
    // The card renders the row's one note (lib/site-health/row-note.ts decides which one).
    check('U5: the card shows that note on such a page', /page\.outside === 'theme'\) return \{ note: 'inTheme'/.test(strip(read('lib/site-health/row-note.ts')))
      && /copy\[guidance\.note\]/.test(strip(read('components/site-health/FindingCard.tsx'))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
export {}

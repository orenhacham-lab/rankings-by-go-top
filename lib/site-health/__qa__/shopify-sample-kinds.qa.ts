/**
 * A STORE'S SCAN READS ITS ARTICLES AND PAGES, NOT ONLY ITS PRODUCTS.
 *
 * Reported on a real store (2026-10-06): 616 products, 135 collections, 22 articles and 10 pages.
 * The scan took the newest 400 items overall, and only 2 of the articles and 1 of the pages were in
 * them, so almost every finding was on a product or a collection, which the store connection cannot
 * edit, and the owner saw instructions everywhere. Now each kind is read on its own
 * (lib/site-health/sources.ts shopifyEntities), so the article and page quotas fill.
 *
 * Run: npx tsx lib/site-health/__qa__/shopify-sample-kinds.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'

let passed = 0
let failed = 0
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const P = '11111111-1111-4111-8111-111111111111'
const U = '22222222-2222-4222-8222-222222222222'
const at = (n: number) => new Date(Date.UTC(2026, 9, 6) - n * 60_000).toISOString()

function store() {
  const rows: Record<string, unknown>[] = []
  let n = 0
  // Products and collections are the newest; articles and pages were last edited long ago.
  for (let i = 0; i < 616; i++) rows.push({ project_id: P, user_id: U, is_active: true, entity_type: 'product', canonical_url: `https://shop.example/products/p${i}`, shopify_gid: `gid://shopify/Product/${i + 1}`, shopify_updated_at: at(n++) })
  for (let i = 0; i < 135; i++) rows.push({ project_id: P, user_id: U, is_active: true, entity_type: 'collection', canonical_url: `https://shop.example/collections/c${i}`, shopify_gid: `gid://shopify/Collection/${i + 1}`, shopify_updated_at: at(n++) })
  for (let i = 0; i < 22; i++) rows.push({ project_id: P, user_id: U, is_active: true, entity_type: 'article', canonical_url: `https://shop.example/blogs/news/a${i}`, shopify_gid: `gid://shopify/Article/${i + 1}`, shopify_updated_at: at(n++) })
  for (let i = 0; i < 10; i++) rows.push({ project_id: P, user_id: U, is_active: true, entity_type: 'page', canonical_url: `https://shop.example/pages/g${i}`, shopify_gid: `gid://shopify/Page/${i + 1}`, shopify_updated_at: at(n++) })
  // Another owner's article must never be read.
  rows.push({ project_id: P, user_id: 'someone-else', is_active: true, entity_type: 'article', canonical_url: 'https://shop.example/blogs/news/foreign', shopify_gid: 'gid://shopify/Article/999', shopify_updated_at: at(0) })
  return new FakeAdmin({
    projects: [{ id: P, user_id: U, target_domain: 'shop.example', name: 'Shop', business_name: 'Shop' }],
    shopify_connections: [{ project_id: P, user_id: U, connection_status: 'connected', archived_at: null, shop_domain: 'shop-example.myshopify.com' }],
    shopify_entities: rows,
  })
}

async function kinds(mod: typeof import('../sources')) {
  const src = await mod.loadProjectSources(store() as never, { projectId: P, userId: U })
  const count = (k: string) => (src?.candidates ?? []).filter((c) => c.kind === k).length
  return { src, article: count('article'), page: count('page'), product: count('product'), collection: count('collection') }
}

async function main() {
  const real = await kinds(await import('../sources'))
  check('S1: the article and page quotas fill on a store full of newer products', real.article >= 6 && real.page >= 5, JSON.stringify({ a: real.article, p: real.page }))
  check('S2: products and collections keep their quotas', real.product >= 8 && real.collection >= 4, JSON.stringify({ pr: real.product, c: real.collection }))
  check('S3: another owner\'s item is never read', !(real.src?.candidates ?? []).some((c) => c.url.includes('foreign')))
  check('S4: room left after the quotas goes to an article before a product', real.article + real.page > 11 && real.product === 8, JSON.stringify({ a: real.article, p: real.page, pr: real.product }))

  // MUTATION CONTROL: the old single "newest 400 overall" read leaves the articles and pages out.
  const file = join(process.cwd(), 'lib/site-health/sources.ts')
  const old = readFileSync(file, 'utf8').replace(
    /async function shopifyEntities\([^]*?\n}\n/,
    `async function shopifyEntities(admin: Admin, projectId: string, userId: string): Promise<{ data: unknown[] | null; error: unknown }> {
  const r = await admin.from('shopify_entities').select('entity_type, canonical_url, shopify_gid')
    .eq('project_id', projectId).eq('user_id', userId).eq('is_active', true)
    .order('shopify_updated_at', { ascending: false }).limit(400)
  return { data: (r.data ?? []) as unknown[], error: r.error }
}
`)
  const mutant = join(process.cwd(), 'lib/site-health', `.mutant-sources-${process.pid}.ts`)
  writeFileSync(mutant, old)
  try {
    const m = await kinds(await import(mutant) as typeof import('../sources'))
    check('MUTATION CONTROL: the old single read starves the articles and pages (so S1 would fail)', m.article < 6 || m.page < 5, JSON.stringify({ a: m.article, p: m.page }))
  } finally {
    unlinkSync(mutant)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}

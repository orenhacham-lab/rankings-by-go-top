/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * THE 22 ARTICLES ALREADY ON A MERCHANT'S SHOPIFY BLOG WITH NO LISTING.
 *
 * Measured in Production 21 Nov 2026: of 616 published customer articles, 368
 * have `seo_status` NULL — 337 of them WordPress, **22 Shopify**, 9 neither.
 * PR #486 fixed the payload so every new publish carries the listing; these 22
 * went up before it and nothing will ever revisit them on its own.
 *
 * This suite is about the two things that make a backfill against merchants'
 * LIVE stores safe to let run by itself:
 *
 *   1. it never replaces a value the merchant typed, and
 *   2. it sends NOTHING but the two metafields — no body, no title, no publish
 *      state — so it cannot re-render a live article for the sake of a meta
 *      description.
 *
 * Both are asserted against the real `buildSeoMetafields` and the real
 * verification function the live publisher uses, so the backfill and the
 * publisher cannot drift apart.
 *
 * NOT browser-verified.
 *
 * Run: npx tsx lib/shopify/__qa__/shopify-seo-backfill.qa.ts
 */
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { SEO_DESCRIPTION_METAFIELD_KEY, SEO_TITLE_METAFIELD_KEY } from '../article-payload'
import {
  backfillShopifyArticleSeo, loadShopifySeoCandidates, runShopifySeoBackfillPage,
  type ShopifyBackfillArticle, type ShopifyBackfillDeps,
} from '../seo-backfill'
import { handleShopifySeoBackfill, SHOPIFY_BACKFILL_MAX_LIMIT } from '../seo-backfill-api'
import { runIsolatedShopifySeoBackfill, SHOPIFY_SEO_BACKFILL_PAGE } from '../seo-backfill-isolated'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++ } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const PROJECT = '11111111-1111-4111-8111-111111111111'
const ARTICLE = 'art-1'
const REMOTE = 'gid://shopify/Article/777'
const OUR_TITLE = 'מחקר מילות מפתח לחנות: המדריך המלא'
const OUR_DESC = 'איך בוחרים מילות מפתח לחנות אונליין, שלב אחר שלב.'
const MERCHANT_TITLE = 'Coffee guides | Our shop'

const article = (over: Partial<ShopifyBackfillArticle> = {}): ShopifyBackfillArticle => ({
  id: ARTICLE, projectId: PROJECT, projectName: 'Shop', title: 'How to brew',
  metaTitle: OUR_TITLE, metaDescription: OUR_DESC, shopifyArticleId: REMOTE, seoStatus: null, ...over,
})

interface Spy { updates: { id: string; input: any }[]; reads: number }

/**
 * The Shopify edge. `remote` is what the store already has, and the fake
 * behaves like the API: a metafield the update wrote comes back in the
 * response, one it did not comes back as the store's own value.
 */
function deps(remote: { title?: string | null; description?: string | null } = {}, opts: { missing?: boolean; userError?: boolean; throws?: boolean } = {}): { deps: ShopifyBackfillDeps; spy: Spy } {
  const spy: Spy = { updates: [], reads: 0 }
  return {
    spy,
    deps: {
      loadConnection: (async () => ({ connection: {} as never, creds: {} as never })) as never,
      getArticle: (async () => {
        spy.reads++
        if (opts.missing) return null
        return { id: REMOTE, handle: 'h', title: 'How to brew', isPublished: true, publishedAt: null, blogHandle: 'news',
          seoTitle: remote.title ?? null, seoDescription: remote.description ?? null }
      }) as never,
      updateArticle: (async (_c: unknown, id: string, input: any) => {
        spy.updates.push({ id, input })
        if (opts.throws) throw new Error('network')
        if (opts.userError) return { ok: false, userErrors: [{ field: null, message: 'nope', code: 'INVALID' }] }
        const mf = (input?.metafields ?? []) as Record<string, string>[]
        const sent = (k: string) => mf.find((m) => m.key === k)?.value ?? null
        return { ok: true, article: { id: REMOTE, handle: 'h', title: 'How to brew', isPublished: true, publishedAt: null, blogHandle: 'news',
          seoTitle: sent(SEO_TITLE_METAFIELD_KEY) ?? remote.title ?? null,
          seoDescription: sent(SEO_DESCRIPTION_METAFIELD_KEY) ?? remote.description ?? null } }
      }) as never,
    },
  }
}

const db = (rows: Record<string, unknown>[] = [{
  id: ARTICLE, project_id: PROJECT, title: 'How to brew', meta_title: OUR_TITLE, meta_description: OUR_DESC,
  shopify_article_id: REMOTE, seo_status: null, seo_verified_at: null, created_at: '2026-10-01T00:00:00Z', published_at: '2026-10-01T00:00:00Z',
}]) => new FakeAdmin({ generated_articles: rows, projects: [{ id: PROJECT, name: 'Shop' }] })

async function main() {
  // ── A: a dry run touches nothing ──────────────────────────────────────────
  {
    const { deps: d, spy } = deps()
    const admin = db()
    const r = await backfillShopifyArticleSeo(admin as never, article(), {}, d)
    check('A1 a dry run reads the article', spy.reads === 1)
    check('A2 and sends NO update at all', spy.updates.length === 0)
    check('A3 reporting what it would write', r.title === 'would_write' && r.description === 'would_write')
    check('A4 and it does not record anything on the row',
      (admin.tables.generated_articles as any[])[0]!.seo_verified_at === null)
    const noOpts = await backfillShopifyArticleSeo(db() as never, article(), {}, deps().deps)
    check('A5 a dry run is the DEFAULT: with no options at all, nothing is written',
      noOpts.title === 'would_write')
  }

  // ── B: --apply, and the merchant's own value ─────────────────────────────
  {
    const { deps: d, spy } = deps()
    const admin = db()
    const r = await backfillShopifyArticleSeo(admin as never, article(), { apply: true }, d)
    const input = spy.updates[0]!.input
    check('B1 it writes both fields when the store has none', (input.metafields ?? []).length === 2)
    check('B2 and sends NOTHING ELSE — no body, no title, no publish state',
      Object.keys(input).length === 1 && 'metafields' in input, JSON.stringify(Object.keys(input)))
    check('B3 the article is updated by the stored Shopify id, never by title', spy.updates[0]!.id === REMOTE)
    check('B4 the outcome is verified, because Shopify read it back', r.title === 'written' && r.persisted?.seo_status === 'verified')
    check('B5 and the row now records it',
      (admin.tables.generated_articles as any[])[0]!.seo_status === 'verified'
      && !!(admin.tables.generated_articles as any[])[0]!.seo_verified_at)
  }
  {
    const { deps: d, spy } = deps({ title: MERCHANT_TITLE })
    const r = await backfillShopifyArticleSeo(db() as never, article(), { apply: true }, d)
    const mf = (spy.updates[0]!.input.metafields ?? []) as Record<string, string>[]
    check('B6 a title the merchant typed is NOT replaced', !mf.some((m) => m.key === SEO_TITLE_METAFIELD_KEY), JSON.stringify(mf))
    check('B7 and the description they never set still gets filled',
      mf.length === 1 && mf[0]!.key === SEO_DESCRIPTION_METAFIELD_KEY)
    check('B8 the report shows the operator what was left alone', r.existing.title === MERCHANT_TITLE)
  }
  {
    const { deps: d, spy } = deps({ title: MERCHANT_TITLE, description: 'Their own description' })
    const r = await backfillShopifyArticleSeo(db() as never, article(), { apply: true }, d)
    check('B9 an article whose listing is entirely the merchant\'s is not written to at all', spy.updates.length === 0)
    check('B10 and is reported as nothing to write, not as a failure',
      r.skip === 'nothing_to_write' && r.title === 'not_needed')
  }

  // ── C: it is idempotent and it never invents ────────────────────────────
  {
    const { deps: d, spy } = deps()
    const admin = db()
    await backfillShopifyArticleSeo(admin as never, article(), { apply: true }, d)
    // Second run: the store now has OUR values, which are "already there" too.
    const { deps: d2, spy: spy2 } = deps({ title: OUR_TITLE, description: OUR_DESC })
    const again = await backfillShopifyArticleSeo(admin as never, article(), { apply: true }, d2)
    check('C1 a second run writes nothing', spy2.updates.length === 0 && spy.updates.length === 1)
    check('C2 and says so', again.skip === 'nothing_to_write')
  }
  {
    const { deps: d } = deps({}, { missing: true })
    const r = await backfillShopifyArticleSeo(db() as never, article(), { apply: true }, d)
    check('C3 an article deleted from the store is skipped, never recreated', r.skip === 'remote_missing')
  }
  {
    const { deps: d } = deps({}, { userError: true })
    const admin = db()
    const r = await backfillShopifyArticleSeo(admin as never, article(), { apply: true }, d)
    check('C4 a rejected update is a failure and records nothing', r.skip === 'update_failed'
      && (admin.tables.generated_articles as any[])[0]!.seo_verified_at === null)
    check('C5 and the detail is our own code, not the store\'s sentence', r.detail === 'INVALID')
  }
  {
    const { deps: d } = deps({}, { throws: true })
    const r = await backfillShopifyArticleSeo(db() as never, article(), { apply: true }, d)
    check('C6 a thrown network error is a failure, not an exception', r.skip === 'update_failed')
  }
  {
    const d = deps()
    const r = await backfillShopifyArticleSeo(db() as never, article(), { apply: true }, {
      ...d.deps, loadConnection: (async () => ({ error: 'x', status: 404, reason: 'no_shopify_connection' })) as never,
    })
    check('C7 a project whose store is gone is skipped', r.skip === 'no_connection' && r.detail === 'no_shopify_connection')
  }

  // ── D: who is a candidate ───────────────────────────────────────────────
  {
    const admin = db([
      { id: 'a', project_id: PROJECT, title: 't', meta_title: 'm', meta_description: 'd', shopify_article_id: REMOTE, seo_status: null, seo_verified_at: null, created_at: '2026-10-01T00:00:00Z' },
      { id: 'b', project_id: PROJECT, title: 't', meta_title: 'm', meta_description: 'd', shopify_article_id: null, seo_status: null, seo_verified_at: null, created_at: '2026-10-02T00:00:00Z' },
      { id: 'c', project_id: PROJECT, title: 't', meta_title: 'm', meta_description: 'd', shopify_article_id: 'gid://shopify/Article/9', seo_status: 'verified', seo_verified_at: '2026-11-01T00:00:00Z', created_at: '2026-10-03T00:00:00Z' },
    ])
    const candidates = await loadShopifySeoCandidates(admin as never)
    check('D1 only articles that are actually on a Shopify blog', !candidates.some((c) => c.id === 'b'))
    check('D2 and not one whose listing is already verified', !candidates.some((c) => c.id === 'c'))
    check('D3 so this one article is the candidate', candidates.length === 1 && candidates[0]!.id === 'a')
    check('D4 the project name comes along, for the operator\'s report', candidates[0]!.projectName === 'Shop')
  }
  {
    const admin = db([{ id: 'a', project_id: PROJECT, title: 'How to brew', meta_title: null, meta_description: 'd', shopify_article_id: REMOTE, seo_status: null, seo_verified_at: null, created_at: '2026-10-01T00:00:00Z' }])
    const c = (await loadShopifySeoCandidates(admin as never))[0]!
    check('D5 with no meta_title the article title is used, as the publisher does', c.metaTitle === 'How to brew')
  }

  // ── E: the page, and the operator's route ──────────────────────────────
  {
    const { deps: d } = deps()
    const page = await runShopifySeoBackfillPage(db() as never, { apply: false, limit: 25 }, d)
    check('E1 a page reports every article it scanned', page.scanned === 1 && page.reports.length === 1)
    check('E2 a short page is the end of the walk', page.nextOffset === null)
  }
  {
    const gate = async () => ({ ok: true as const, userId: 'u' })
    const run = (async (opts: any) => ({ reports: [], scanned: 0, nextOffset: null, budgetSpent: false, _opts: opts }))
    let seen: any = null
    const res = await handleShopifySeoBackfill(
      new Request('https://x', { method: 'POST', body: JSON.stringify({ projectId: PROJECT, apply: 'true', limit: 500 }) }),
      { gate, run: (async (o: any) => { seen = o; return run(o) }) as never },
    )
    const body = await res.json()
    check('E3 the string "true" is still a DRY RUN — only the boolean writes', body.mode === 'dry_run' && seen.apply === false)
    check('E4 and the limit is capped', seen.limit === SHOPIFY_BACKFILL_MAX_LIMIT)
  }
  {
    const denied = new Response('no', { status: 403 })
    const res = await handleShopifySeoBackfill(
      new Request('https://x', { method: 'POST', body: JSON.stringify({ projectId: PROJECT, apply: true }) }),
      { gate: async () => ({ ok: false as const, response: denied }), run: (async () => { throw new Error('must not run') }) as never },
    )
    check('E5 a non-administrator never reaches the backfill', res.status === 403)
  }
  {
    const res = await handleShopifySeoBackfill(
      new Request('https://x', { method: 'POST', body: JSON.stringify({ projectId: 'not-a-uuid', apply: true }) }),
      { gate: async () => ({ ok: true as const, userId: 'u' }), run: (async () => { throw new Error('must not run') }) as never },
    )
    check('E6 and neither does a body without a real project', res.status === 400)
  }

  // ── F: the passenger on the cron ───────────────────────────────────────
  {
    let limitSeen = 0
    const outside = await runIsolatedShopifySeoBackfill(
      async () => { throw new Error('must not run outside production') },
      { env: { VERCEL_ENV: 'preview' }, maxDurationMs: 300_000 },
    )
    check('F1 a preview deployment never writes to a merchant\'s store', outside.status === 'not_production')
    const ran = await runIsolatedShopifySeoBackfill(
      async (limit) => { limitSeen = limit; return { scanned: 2, reports: [
        { id: 'a', project: 'Shop', shopifyArticleId: REMOTE, skip: null, existing: { title: null, description: null }, title: 'written', description: 'written', writes: {} },
        { id: 'b', project: 'Shop', shopifyArticleId: REMOTE, skip: 'nothing_to_write', existing: { title: MERCHANT_TITLE, description: 'x' }, title: 'not_needed', description: 'not_needed', writes: {} },
      ] } },
      { env: { VERCEL_ENV: 'production' }, maxDurationMs: 300_000 },
    )
    check('F2 in production it runs a small page', ran.status === 'ran' && limitSeen === SHOPIFY_SEO_BACKFILL_PAGE)
    check('F3 counting what it wrote and what it left alone',
      ran.status === 'ran' && ran.written === 1 && ran.keptMerchantValue === 1 && ran.skipped === 0)
    const noTime = await runIsolatedShopifySeoBackfill(
      async () => { throw new Error('must not start without time') },
      { env: { VERCEL_ENV: 'production' }, startedAtMs: Date.now() - 299_000, maxDurationMs: 300_000 },
    )
    check('F4 with no time left it starts nothing', noTime.status === 'no_time')
    const broke = await runIsolatedShopifySeoBackfill(
      async () => { throw new Error('boom') },
      { env: { VERCEL_ENV: 'production' }, maxDurationMs: 300_000 },
    )
    check('F5 and it NEVER throws, so it cannot fail the cron above it', broke.status === 'error')
  }

  // ── MUTATION CONTROLS ──────────────────────────────────────────────────
  {
    const { deps: d, spy } = deps({ title: MERCHANT_TITLE })
    // A backfill that re-published the article instead would send the body too.
    await backfillShopifyArticleSeo(db() as never, article(), { apply: true }, d)
    check('MUTATION CONTROL: a re-publish would have sent a body; this update\'s only key is metafields',
      !('body' in spy.updates[0]!.input) && !('title' in spy.updates[0]!.input))
  }
  {
    const { deps: d, spy } = deps({ title: MERCHANT_TITLE })
    await backfillShopifyArticleSeo(db() as never, article({ metaTitle: '' }), { apply: true }, d)
    const mf = (spy.updates[0]?.input.metafields ?? []) as Record<string, string>[]
    check('MUTATION CONTROL: with nothing of ours to offer, an empty value is never written as a listing',
      !mf.some((m) => m.key === SEO_TITLE_METAFIELD_KEY && !m.value))
  }
  check('MUTATION CONTROL: a page size of 10 is a bound, not the whole backlog — 22 articles take three passes',
    SHOPIFY_SEO_BACKFILL_PAGE < 22)

  console.log(`${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

void main()
export {}

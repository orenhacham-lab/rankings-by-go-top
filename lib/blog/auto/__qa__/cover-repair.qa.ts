/**
 * THE BACKFILL THAT CLEANS UP COVERS NOBODY LOOKED AT, and the three things it
 * must never do.
 *
 * 20 November 2026: Oren said the images he had reported — a mirrored laptop, a
 * figure with two right hands — are still on the blog. The review shipped on 17
 * November protects new covers only. This pass goes back over the published
 * ones.
 *
 * It must never: record an article as clean when the review did not run; leave
 * an article without a cover; or order a second replacement for the same
 * article, which at full price and once an hour is a bill with no end.
 */
import { readFileSync } from 'fs'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { repairBlogCovers, storagePathOf } from '../cover-repair'
import { runIsolatedBlogCoverRepair } from '../cover-repair-isolated'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}

const URL_OF = (slug: string) => `https://x.supabase.co/storage/v1/object/public/article-images/auto/${slug}-1.jpg`
const article = (slug: string, locale = 'nl') => ({
  id: `id-${slug}`, locale, slug, title: `About ${slug}`,
  featured_image_url: URL_OF(slug), is_published: true, published_at: '2026-11-17T04:00:00.000Z',
})
const bytes = async () => Buffer.from('image')
/** A reviewer that answers from a slug → answer map. */
const reviewerFor = (answers: Record<string, string>, seen: string[] = []) => ({
  ask: async (b: Buffer) => { const key = b.toString(); seen.push(key); return answers[key] ?? '{}' },
})

async function main() {
  console.log('1) the path, and what is not this pass\'s business')
  {
    check('a stored auto cover gives its path',
      storagePathOf(URL_OF('a')) === 'auto/a-1.jpg', storagePathOf(URL_OF('a')))
    check('a query string is dropped',
      storagePathOf(`${URL_OF('a')}?v=2`) === 'auto/a-1.jpg')
    check('an image uploaded by hand is not touched',
      storagePathOf('https://x.supabase.co/storage/v1/object/public/article-images/uploads/b.jpg') === null)
    check('and neither is an image from somewhere else',
      storagePathOf('https://cdn.example.com/auto/c.jpg') === null)
  }

  console.log('2) a review that could not run records NOTHING')
  {
    const admin = new FakeAdmin({ articles: [article('a')], blog_cover_reviews: [] })
    const r = await repairBlogCovers(admin as unknown as Admin, {
      deps: { review: { ask: async () => { throw new Error('no key in this environment') } }, fetchImage: bytes },
    })
    check('it is counted as undecided, not clean', r.reviewed === 1 && r.undecided === 1 && r.clean === 0, r)
    check('and nothing is written, so a later pass looks again',
      (admin.tables.blog_cover_reviews ?? []).length === 0, admin.tables.blog_cover_reviews)
    // An unparsable answer is the same case.
    const admin2 = new FakeAdmin({ articles: [article('a')], blog_cover_reviews: [] })
    const r2 = await repairBlogCovers(admin2 as unknown as Admin, {
      deps: { review: { ask: async () => 'I cannot see the image.' }, fetchImage: bytes },
    })
    check('an answer with no opinion is undecided too', r2.undecided === 1 && (admin2.tables.blog_cover_reviews ?? []).length === 0, r2)
  }

  console.log('3) a clean cover is recorded and never asked about again')
  {
    const admin = new FakeAdmin({ articles: [article('a')], blog_cover_reviews: [] })
    const deps = { review: reviewerFor({ image: '{"duplicated_subject":false,"impossible_device":false,"garbled_text":false}' }), fetchImage: bytes }
    const r = await repairBlogCovers(admin as unknown as Admin, { deps })
    check('it is clean and recorded', r.clean === 1 && (admin.tables.blog_cover_reviews ?? []).length === 1, r)
    const row = (admin.tables.blog_cover_reviews ?? [])[0] as Record<string, unknown>
    check('the row holds the URL that was reviewed', row.image_url === URL_OF('a'), row)
    check('with no defects and no replacement',
      Array.isArray(row.defects) && (row.defects as unknown[]).length === 0 && row.replaced_url === null, row)
    const again = await repairBlogCovers(admin as unknown as Admin, { deps })
    check('a second pass does not look at it again', again.reviewed === 0, again)
  }

  console.log('4) a faulty cover is replaced, and the article is never left bare')
  {
    const made: string[] = []
    const admin = new FakeAdmin({ articles: [article('mirror')], blog_cover_reviews: [] })
    const r = await repairBlogCovers(admin as unknown as Admin, {
      deps: {
        review: reviewerFor({ image: '{"impossible_device":true}' }),
        fetchImage: bytes,
        makeCover: async (_a, input) => { made.push(input.slug); return { ok: true, url: `${URL_OF(input.slug)}-new` } },
      },
    })
    check('the fault is found and one image is ordered', r.faulty === 1 && r.replaced === 1 && made.length === 1, [r, made])
    const row = (admin.tables.articles ?? [])[0] as Record<string, unknown>
    check('the article now points at the new image', row.featured_image_url === `${URL_OF('mirror')}-new`, row.featured_image_url)
    const seen = (admin.tables.blog_cover_reviews ?? [])[0] as Record<string, unknown>
    check('the row names the fault and the replacement',
      (seen.defects as string[]).join(',') === 'impossible_device' && seen.replaced_url === `${URL_OF('mirror')}-new`, seen)

    // A generation that fails must change NOTHING.
    const kept = new FakeAdmin({ articles: [article('keep')], blog_cover_reviews: [] })
    const r2 = await repairBlogCovers(kept as unknown as Admin, {
      deps: {
        review: reviewerFor({ image: '{"duplicated_subject":true}' }),
        fetchImage: bytes,
        makeCover: async () => ({ ok: false, reason: 'image_generation_failed' }),
      },
    })
    const row2 = (kept.tables.articles ?? [])[0] as Record<string, unknown>
    check('a failed replacement leaves the published cover in place',
      row2.featured_image_url === URL_OF('keep'), row2.featured_image_url)
    check('nothing is recorded, so it is tried again', (kept.tables.blog_cover_reviews ?? []).length === 0)
    check('and the failure is named', r2.failures.join(',').includes('replacement_failed'), r2.failures)
  }

  console.log('5) never a second replacement for the same article')
  {
    const ordered: string[] = []
    const admin = new FakeAdmin({
      articles: [{ ...article('again'), featured_image_url: `${URL_OF('again')}-new` }],
      blog_cover_reviews: [{
        article_id: 'id-again', image_url: URL_OF('again'),
        defects: ['garbled_text'], replaced_url: `${URL_OF('again')}-new`, checked_at: '2026-11-20T00:00:00.000Z',
      }],
    })
    const r = await repairBlogCovers(admin as unknown as Admin, {
      deps: {
        review: reviewerFor({ image: '{"garbled_text":true}' }),
        fetchImage: bytes,
        makeCover: async (_a, input) => { ordered.push(input.slug); return { ok: true, url: 'never' } },
      },
    })
    check('the replacement IS reviewed', r.reviewed === 1 && r.faulty === 1, r)
    check('but no second image is ordered', ordered.length === 0 && r.replaced === 0, ordered)
    const row = (admin.tables.blog_cover_reviews ?? [])[0] as Record<string, unknown>
    check('and the verdict is recorded, so the pass moves on',
      (row.defects as string[]).join(',') === 'garbled_text' && row.image_url === `${URL_OF('again')}-new`, row)
  }

  console.log('6) the pass is bounded, and rides the cron without risk')
  {
    const many = Array.from({ length: 9 }, (_, i) => article(`m${i}`))
    const admin = new FakeAdmin({ articles: many, blog_cover_reviews: [] })
    const deps = { review: reviewerFor({ image: '{"garbled_text":false}' }), fetchImage: bytes }
    const r = await repairBlogCovers(admin as unknown as Admin, { limit: 4, deps })
    check('it looks at no more than its limit', r.reviewed === 4, r)

    const faulty = Array.from({ length: 5 }, (_, i) => article(`f${i}`))
    const adminF = new FakeAdmin({ articles: faulty, blog_cover_reviews: [] })
    const orders: string[] = []
    const rf = await repairBlogCovers(adminF as unknown as Admin, {
      replaceLimit: 2,
      deps: {
        review: reviewerFor({ image: '{"impossible_device":true}' }),
        fetchImage: bytes,
        makeCover: async (_a, input) => { orders.push(input.slug); return { ok: true, url: `${URL_OF(input.slug)}-new` } },
      },
    })
    check('and replaces no more than its replace limit', rf.replaced === 2 && orders.length === 2, orders)
    check('the ones it did not replace are not recorded as seen',
      (adminF.tables.blog_cover_reviews ?? []).length === 2, adminF.tables.blog_cover_reviews)

    const past = await repairBlogCovers(new FakeAdmin({ articles: many, blog_cover_reviews: [] }) as unknown as Admin,
      { deadlineAt: Date.now() - 1, deps })
    check('a deadline already passed does no work', past.reviewed === 0, past)

    // The passenger itself.
    const outside = await runIsolatedBlogCoverRepair(async () => { throw new Error('must not run') }, { env: { VERCEL_ENV: 'preview' } })
    check('it does not run outside Production', outside.status === 'not_production', outside)
    const noTime = await runIsolatedBlogCoverRepair(async () => { throw new Error('must not run') },
      { env: { VERCEL_ENV: 'production' }, startedAtMs: Date.now() - 299_000, maxDurationMs: 300_000 })
    check('nor with seconds left in the run', noTime.status === 'no_time', noTime)
    const threw = await runIsolatedBlogCoverRepair(async () => { throw new Error('boom') },
      { env: { VERCEL_ENV: 'production' }, startedAtMs: Date.now(), maxDurationMs: 300_000 })
    check('and a failure inside it never reaches the cron', threw.status === 'error', threw)
  }

  console.log('7) the cron calls it, last and isolated')
  {
    const route = readFileSync('app/api/content/automation/cron/route.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    check('the route awaits the passenger', /await runIsolatedBlogCoverRepair\(/.test(route))
    check('and imports it from its own file',
      /import \{ runIsolatedBlogCoverRepair \} from '@\/lib\/blog\/auto\/cover-repair-isolated'/.test(route))
  }

  // MUTATION CONTROLS, run by hand:
  //  - recording a `skipped` verdict as clean fails both rows of section 2;
  //  - updating the article before checking `made.ok` fails "a failed
  //    replacement leaves the published cover in place";
  //  - dropping the `replacedOnce` guard fails "no second image is ordered",
  //    which is the one that would otherwise bill an image an hour for ever.
  //
  // WHAT THIS DOES NOT PROVE: that the model's eye is good. Whether it sees the
  // mirrored laptop on google-positie-checker is not decidable here — this
  // container has no GEMINI_API_KEY — which is why every replacement is logged
  // with its slug and its defects.

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}

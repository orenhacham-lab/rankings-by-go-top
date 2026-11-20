/**
 * THE COVERS THAT WERE PUBLISHED BEFORE ANYONE LOOKED AT THEM.
 *
 * The review (lib/content/image-quality.ts) shipped on 17 November 2026 and runs
 * when a cover is MADE, so it protects what is published from that day on and
 * nothing before it. On 20 November Oren said the plain thing: the images he had
 * reported — a laptop whose screen and keyboard both face the camera, a figure
 * with two right hands — are still on the blog, in several languages. A guard on
 * new work does not clean up old work.
 *
 * So this pass walks the articles already published, looks at each cover with
 * the same reviewer, and replaces the faulty ones with a new image made by
 * `createBlogCover` — which reviews what it makes, asks once more when it is
 * wrong, and keeps the cleaner of the two.
 *
 * THREE RULES IT KEEPS.
 *
 *   1. A REVIEW THAT DID NOT RUN RECORDS NOTHING. `reviewGeneratedImage` answers
 *      `ok` with a `skipped` reason whenever it cannot see the image — no key, a
 *      timeout, an unparsable answer. Recording that as "clean" would mark the
 *      whole blog reviewed without a single image having been looked at, and
 *      nothing would ever come back to it. Those articles are simply left for a
 *      later pass.
 *   2. AN ARTICLE IS NEVER LEFT WITHOUT A COVER. The article keeps its current
 *      image until a new one exists and is cleaner; a failed generation, a failed
 *      upload or a replacement with MORE faults changes nothing. The blog's own
 *      publish rule refuses an article with no cover, and this pass must never be
 *      the reason one appears.
 *   3. ONLY THE BLOG'S OWN AUTOMATIC COVERS. The filter is the `auto/` prefix in
 *      the stored URL, which is where `createBlogCover` puts its files. An image
 *      a person uploaded by hand is not this pass's business.
 *
 * It is a backfill: when every published cover has a row it does one small query
 * per pass and returns. It never throws (lib/blog/auto/cover-repair-isolated.ts).
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { reviewGeneratedImage, type ImageDefect, type ReviewDeps } from '@/lib/content/image-quality'
import { createBlogCover, BLOG_IMAGE_BUCKET } from '@/lib/blog/auto/cover'
import { isBlogAutoLocale, type BlogAutoLocale } from '@/lib/blog/auto/rotation'

type Admin = ReturnType<typeof createAdminClient>

/** How many covers one pass may look at, and how many it may replace. */
export const REVIEW_PER_PASS = 12
export const REPLACE_PER_PASS = 2

export interface CoverRepairResult {
  reviewed: number
  clean: number
  faulty: number
  replaced: number
  /** Looked at but not recorded, because the review could not run. */
  undecided: number
  failures: string[]
}

export interface CoverRepairDeps {
  review?: ReviewDeps
  /** The replacement image, injectable so the decision logic is testable. */
  makeCover?: typeof createBlogCover
  /** The bytes of a stored cover, by its public URL. */
  fetchImage?: (admin: Admin, url: string) => Promise<Buffer | null>
}

interface ArticleRow {
  id: string
  locale: string
  slug: string
  title: string
  featured_image_url: string
}

const empty = (): CoverRepairResult =>
  ({ reviewed: 0, clean: 0, faulty: 0, replaced: 0, undecided: 0, failures: [] })

/**
 * The stored path inside the blog's bucket, from the public URL the article
 * carries. Anything that is not one of this bucket's `auto/` files gives null,
 * which keeps a hand-uploaded or external image out of the pass.
 */
export function storagePathOf(url: string): string | null {
  const marker = `/${BLOG_IMAGE_BUCKET}/`
  const at = url.indexOf(marker)
  if (at < 0) return null
  const path = url.slice(at + marker.length).split('?')[0]
  return path.startsWith('auto/') ? decodeURIComponent(path) : null
}

async function downloadCover(admin: Admin, url: string): Promise<Buffer | null> {
  const path = storagePathOf(url)
  if (!path) return null
  const { data, error } = await admin.storage.from(BLOG_IMAGE_BUCKET).download(path)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

/**
 * Review the next few published covers, and replace the faulty ones.
 *
 * `deadlineAt` stops the pass between articles, so a slow model call cannot run
 * the cron's budget down: it is checked before each article, never in the middle
 * of one, because an article half-replaced is an article whose new image was
 * paid for and thrown away.
 */
export async function repairBlogCovers(
  admin: Admin,
  opts: { deadlineAt?: number; limit?: number; replaceLimit?: number; deps?: CoverRepairDeps } = {},
): Promise<CoverRepairResult> {
  const out = empty()
  const limit = opts.limit ?? REVIEW_PER_PASS
  const replaceLimit = opts.replaceLimit ?? REPLACE_PER_PASS
  const deps = opts.deps ?? {}
  const fetchImage = deps.fetchImage ?? downloadCover
  const makeCover = deps.makeCover ?? createBlogCover

  const { data: done } = await admin.from('blog_cover_reviews').select('article_id, image_url, replaced_url')
  const reviewedUrl = new Map<string, string>()
  // AT MOST ONE REPLACEMENT PER ARTICLE, EVER. The row of a cover that was
  // replaced is re-reviewed on a later pass — the replacement is a generated
  // image like any other, and `createBlogCover` does publish one it still faults
  // rather than leave an article bare — but it is never replaced a second time.
  // Without that rule a cover the model keeps disliking would be re-ordered on
  // every pass, for ever, at full price.
  const replacedOnce = new Set<string>()
  for (const row of (done ?? []) as { article_id: string; image_url: string; replaced_url: string | null }[]) {
    reviewedUrl.set(row.article_id, row.image_url)
    if (row.replaced_url) replacedOnce.add(row.article_id)
  }

  const { data: articles, error } = await admin
    .from('articles')
    .select('id, locale, slug, title, featured_image_url')
    .eq('is_published', true)
    .like('featured_image_url', '%/auto/%')
    .order('published_at', { ascending: false })
  if (error) return { ...out, failures: ['articles_query_failed'] }

  // Newest first: the covers a reader is most likely to land on are also the
  // ones Oren reported, and a backfill that starts at the oldest article would
  // reach them last.
  const todo = ((articles ?? []) as ArticleRow[])
    .filter((a) => a.featured_image_url && reviewedUrl.get(a.id) !== a.featured_image_url)

  for (const article of todo) {
    if (out.reviewed >= limit) break
    if (opts.deadlineAt && Date.now() >= opts.deadlineAt) break

    const bytes = await fetchImage(admin, article.featured_image_url)
    if (!bytes) { out.failures.push(`${article.slug}: image_unreadable`); continue }

    const verdict = await reviewGeneratedImage(bytes, 'image/jpeg', deps.review)
    out.reviewed++
    // RULE 1: no opinion is not a verdict. Leave it for a later pass.
    if (verdict.skipped) { out.undecided++; continue }
    if (verdict.ok) {
      out.clean++
      await record(admin, article, [], null)
      continue
    }

    out.faulty++
    console.warn('[blog-cover-repair] a published cover is faulty', {
      slug: article.slug, locale: article.locale, defects: verdict.defects,
    })
    if (replacedOnce.has(article.id)) {
      // Already given its one new image, and the new one is faulted too. Record
      // the verdict so the pass moves on; a second regeneration is Oren's call.
      console.warn('[blog-cover-repair] the replacement is faulted too, leaving it', {
        slug: article.slug, defects: verdict.defects,
      })
      await record(admin, article, verdict.defects, article.featured_image_url)
      continue
    }
    if (out.replaced >= replaceLimit || !isBlogAutoLocale(article.locale)) {
      // Seen and named in the log, but not replaced in this pass — and NOT
      // recorded, so the next pass picks it up again.
      continue
    }
    const replaced = await replaceCover(admin, article, article.locale, verdict.defects, makeCover, deps)
    if (replaced) {
      out.replaced++
      await record(admin, article, verdict.defects, replaced)
    } else {
      out.failures.push(`${article.slug}: replacement_failed`)
    }
  }
  return out
}

/**
 * Make a new cover and point the article at it. RULE 2: the article's current
 * image stays until the new one is stored, so every failure here is a no-op.
 */
async function replaceCover(
  admin: Admin,
  article: ArticleRow,
  locale: BlogAutoLocale,
  defects: ImageDefect[],
  makeCover: typeof createBlogCover,
  deps: CoverRepairDeps,
): Promise<string | null> {
  const made = await makeCover(admin, {
    slug: article.slug,
    title: article.title,
    topic: article.title,
    imagePrompt: null,
    locale,
  }, { review: deps.review })
  if (!made.ok) {
    console.warn('[blog-cover-repair] no replacement image', { slug: article.slug, reason: made.reason })
    return null
  }
  const { error } = await admin
    .from('articles')
    .update({ featured_image_url: made.url })
    .eq('id', article.id)
  if (error) {
    console.error('[blog-cover-repair] the new image was not attached', { slug: article.slug })
    return null
  }
  console.log('[blog-cover-repair] cover replaced', {
    slug: article.slug, locale, defects, url: made.url,
  })
  return made.url
}

async function record(admin: Admin, article: ArticleRow, defects: ImageDefect[], replacedUrl: string | null): Promise<void> {
  await admin.from('blog_cover_reviews').upsert([{
    article_id: article.id,
    // The URL that was REVIEWED, never the replacement: a new cover is a
    // generated image like any other and gets looked at on a later pass.
    image_url: article.featured_image_url,
    defects,
    replaced_url: replacedUrl,
    checked_at: new Date().toISOString(),
  }], { onConflict: 'article_id' })
}

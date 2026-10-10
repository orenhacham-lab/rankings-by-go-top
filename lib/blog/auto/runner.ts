/**
 * ONE ARTICLE A DAY ON gotopseo.com.
 *
 * The run, in order:
 *   1. free rows whose previous run died mid-generation;
 *   2. top the queue up with researched keywords when it is running low;
 *   3. take the highest-volume planned row of TODAY'S language, write it, make
 *      its cover, and publish it.
 *
 * At most one article per run, and nothing is published twice: the plan row is
 * claimed atomically and the slug is checked against the blog before the insert.
 *
 * Three gates stand between the model and the blog, and any one of them means
 * no article today:
 *   * the generator's own SEO/GEO audit, which only returns an article with no
 *     blockers (lib/content/gemini-article.ts);
 *   * the structural quality gate shared with the customer engine
 *     (lib/content/automation/quality-gate.ts);
 *   * the truth limits (lib/blog/auto/truth-limits.ts).
 * A day without an article costs nothing. A sentence we cannot stand behind,
 * under Oren's name and with his photograph, costs the blog.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { generateValidatedArticle } from '@/lib/content/gemini-article'
import { runQualityGate } from '@/lib/content/automation/quality-gate'
import { localeForDay, type BlogAutoLocale } from '@/lib/blog/auto/rotation'
import { buildBlogBrief } from '@/lib/blog/auto/brief'
import { checkTruthLimits } from '@/lib/blog/auto/truth-limits'
import { researchKeywords, selectKeywords } from '@/lib/blog/auto/keyword-plan'
import { createBlogCover } from '@/lib/blog/auto/cover'
import {
  addPlanRows, claimNextPlanRow, countPlanned, publishPlanArticle, readInternalTargets,
  readTakenKeywords, recoverStaleLocks, releasePlanRow, MAX_ATTEMPTS,
} from '@/lib/blog/auto/store'
import { withArticleWidgets } from '@/lib/blog/auto/widgets'
import type { ArticleBrief, ValidatedArticle, ValidatedArticleError } from '@/lib/content/gemini-article'
import type { CoverResult } from '@/lib/blog/auto/cover'

type Admin = ReturnType<typeof createAdminClient>

/**
 * The two calls that cost money and leave the process. Injected so the whole
 * run — every gate, every status transition, the widgets, the publish — is
 * exercisable in a QA suite without Gemini.
 */
export interface BlogAutoDeps {
  generate: (brief: ArticleBrief) => Promise<ValidatedArticle | ValidatedArticleError>
  cover: typeof createBlogCover
}

export const REAL_BLOG_AUTO_DEPS: BlogAutoDeps = {
  generate: generateValidatedArticle,
  cover: createBlogCover,
}

/** Below this many planned rows for a language, research runs for it. */
export const TOPUP_FLOOR = 4
/** How many rows one research run may add.  */
export const TOPUP_BATCH = 8

export interface BlogAutoSummary {
  locale: BlogAutoLocale
  staleRecovered: number
  topUpAdded: number
  topUpError: string | null
  planned: number
  published: { slug: string; title: string } | null
  skipped: string | null
  failure: string | null
  durationMs: number
  dryRun: boolean
}

/** Research + queue top-up for one language, when it is running low. */
async function topUp(admin: Admin, locale: BlogAutoLocale, summary: BlogAutoSummary): Promise<void> {
  if (summary.planned >= TOPUP_FLOOR) return
  const { ideas, error } = await researchKeywords(locale)
  summary.topUpError = error
  if (!ideas.length) return
  const taken = await readTakenKeywords(admin, locale)
  const chosen = selectKeywords({ locale, ideas, taken, limit: TOPUP_BATCH })
  summary.topUpAdded = await addPlanRows(admin, locale, chosen)
  summary.planned = await countPlanned(admin, locale)
}

export async function runBlogAutoPublish(
  admin: Admin,
  opts: { now?: number; dryRun?: boolean; locale?: BlogAutoLocale } = {},
  deps: BlogAutoDeps = REAL_BLOG_AUTO_DEPS,
): Promise<BlogAutoSummary> {
  const started = Date.now()
  const now = opts.now ?? started
  const locale = opts.locale ?? localeForDay(now)
  const summary: BlogAutoSummary = {
    locale, staleRecovered: 0, topUpAdded: 0, topUpError: null, planned: 0,
    published: null, skipped: null, failure: null, durationMs: 0, dryRun: !!opts.dryRun,
  }

  summary.staleRecovered = await recoverStaleLocks(admin)
  summary.planned = await countPlanned(admin, locale)
  await topUp(admin, locale, summary)

  if (opts.dryRun) {
    summary.skipped = 'dry_run'
    summary.durationMs = Date.now() - started
    return summary
  }

  const row = await claimNextPlanRow(admin, locale)
  if (!row) {
    summary.skipped = summary.planned > 0 ? 'claim_lost' : 'queue_empty'
    summary.durationMs = Date.now() - started
    return summary
  }

  const fail = async (reason: string): Promise<BlogAutoSummary> => {
    await releasePlanRow(admin, row.id, reason, row.attempts ?? MAX_ATTEMPTS)
    summary.failure = reason
    summary.durationMs = Date.now() - started
    return summary
  }

  const internalTargets = await readInternalTargets(admin, locale)
  const brief = buildBlogBrief({
    locale,
    topic: row.topic,
    primaryKeyword: row.primary_keyword,
    secondaryKeywords: row.secondary_keywords ?? [],
    internalTargets,
  })

  const generated = await deps.generate(brief)
  if ('error' in generated) return fail(`generate:${generated.reason || generated.error}`)

  const gate = runQualityGate({
    title: generated.article.title,
    content_html: generated.safeHtml,
    slug: generated.slug,
  })
  if (!gate.ok) return fail(`quality:${gate.failures.join(',')}`)

  const truth = checkTruthLimits({
    title: generated.article.title,
    metaDescription: generated.article.metaDescription,
    html: generated.safeHtml,
  })
  if (!truth.ok) return fail(`truth:${truth.failures.join(',')}`)

  const cover: CoverResult = await deps.cover(admin, {
    slug: generated.slug,
    title: generated.article.title,
    topic: row.topic,
    imagePrompt: generated.article.imagePrompt || null,
    locale,
  })
  if (!cover.ok) return fail(`cover:${cover.reason}`)

  const published = await publishPlanArticle(admin, row.id, {
    locale,
    title: generated.article.title,
    slug: generated.slug,
    excerpt: generated.article.excerpt,
    metaTitle: generated.article.metaTitle,
    metaDescription: generated.article.metaDescription,
    // The plan cards and the trial band are appended here, not asked of the
    // model: a widget the article forgot is a page that ends on prose with no
    // way to act on it.
    html: withArticleWidgets(generated.safeHtml),
    featuredImageUrl: cover.url,
    featuredImageAlt: generated.article.title,
  })
  if (!published.ok) return fail(`publish:${published.reason}`)

  summary.published = { slug: published.slug, title: generated.article.title }
  summary.durationMs = Date.now() - started
  return summary
}

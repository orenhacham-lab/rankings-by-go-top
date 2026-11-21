/**
 * THE WEEKLY READING OF OUR OWN BLOG, AS A PASSENGER ON THE HOURLY CRON.
 *
 * `lib/blog/auto/outcomes.ts` and `lib/blog/auto/cannibal.ts` are pure, which
 * made them testable and left them unreachable: nothing in production ever
 * called either one. This is the call. Once a week it reads the Search Console
 * rows we already sync for our own property, prints the outcome table and the
 * cannibalisation table, and stops.
 *
 * IT ONLY READS. No article is edited, no plan row is touched, no redirect is
 * created, nothing is published. Every verdict in both tables is an
 * instruction for a person, and acting on one is a separate change with its
 * own reasoning. A passenger that quietly rewrote 221 published articles on a
 * rule it inferred from one week of data is exactly the thing not to build.
 *
 * THE DATA IS ALREADY HERE. gotopseo.com is itself one of the projects with a
 * Search Console connection (measured 21 Nov 2026: 5,061 stored rows, synced
 * 7 and 15 Nov, a 90-day and a 28-day window each time), so this needs no API
 * call and no credential — it reads the newest succeeded sync run of the
 * project whose `site_url` is our own site. The project is found by that URL
 * rather than by a hard-coded id, so a reconnection does not silently turn
 * this into a report about nothing.
 *
 * WEEKLY, ON AN HOURLY CRON. The gate is the UTC hour and weekday, which the
 * 15-minute caller crosses about four times in the chosen hour — four
 * identical read-only logs a week rather than 672. The GSC cron runs at 05:00
 * UTC, so the report reads at 06:00 on Sunday, after it.
 *
 * Production only, because Preview shares the Production database. Isolated:
 * its own budget, its own try/catch, and it never throws.
 */
import { outcomeSummary, outcomeTable, rowsBySlug, type ArticleOutcomeInput, type OutcomeRow } from '@/lib/blog/auto/outcomes'
import { cannibalSummary, cannibalTable } from '@/lib/blog/auto/cannibal'
import { isBlogAutoLocale, type BlogAutoLocale } from '@/lib/blog/auto/rotation'
import { readOwnSearchRows } from '@/lib/blog/auto/own-search'
import { PLAN_TABLE } from '@/lib/blog/auto/store'

/** UTC day of week the report runs on. 0 is Sunday. */
export const REVIEW_DAY = 0
/** UTC hour it runs at — after the 05:00 GSC sync. */
export const REVIEW_HOUR = 6
/** What is left for the pass after the work above it, at most 30 seconds. */
export const REVIEW_BUDGET_MS = 30_000
/** How many rows of each table reach the log. The tables are sorted, so these are the worst. */
export const REVIEW_TABLE_ROWS = 12

export interface BlogWeeklyReview {
  /** The sync run the reading came from, so a stale report says it is stale. */
  syncedAt: string | null
  windowStart: string | null
  windowEnd: string | null
  rows: number
  articles: number
  outcomes: ReturnType<typeof outcomeSummary>
  /** The most actionable articles, worst first, as one line each. */
  top: string[]
  cannibal: ReturnType<typeof cannibalSummary>
  /** The worst splits, worst first, as one line each. */
  cannibalTop: string[]
}

export type IsolatedWeeklyReviewOutcome =
  | ({ status: 'ran' } & BlogWeeklyReview)
  | { status: 'not_production' | 'not_due' | 'no_time' | 'no_data' | 'error' }

export interface WeeklyReviewData {
  syncedAt: string | null
  windowStart: string | null
  windowEnd: string | null
  rows: OutcomeRow[]
  /** One entry per published article of ours: its locale, planned keyword and date. */
  articles: { slug: string; locale: BlogAutoLocale; plannedKeyword: string | null; publishedAt: string | null }[]
}

/** Pure: the report a reading produces. */
export function buildWeeklyReview(data: WeeklyReviewData, now: number = Date.now()): BlogWeeklyReview {
  const bySlug = rowsBySlug(data.rows)
  const inputs: ArticleOutcomeInput[] = data.articles.map((a) => ({
    locale: a.locale,
    slug: a.slug,
    plannedKeyword: a.plannedKeyword,
    publishedAt: a.publishedAt,
    rows: bySlug.get(a.slug) ?? [],
  }))
  const outcomes = outcomeTable(inputs, now)
  const clusters = cannibalTable(data.rows)
  return {
    syncedAt: data.syncedAt,
    windowStart: data.windowStart,
    windowEnd: data.windowEnd,
    rows: data.rows.length,
    articles: data.articles.length,
    outcomes: outcomeSummary(outcomes),
    top: outcomes
      .filter((o) => o.verdict !== 'waiting' && o.verdict !== 'holding')
      .slice(0, REVIEW_TABLE_ROWS)
      .map((o) => `${o.locale} ${o.slug}: ${o.verdict} — ${o.reason}`),
    cannibal: cannibalSummary(clusters),
    cannibalTop: clusters.slice(0, REVIEW_TABLE_ROWS).map((c) => `${c.split} split — ${c.reason}`),
  }
}

/** True when this pass is the weekly one. */
export function reviewDue(now: Date): boolean {
  return now.getUTCDay() === REVIEW_DAY && now.getUTCHours() === REVIEW_HOUR
}

/**
 * Read the newest succeeded sync of our own property, and the articles to
 * judge against it. The rows come from `lib/blog/auto/own-search.ts`, which
 * the keyword queue reads too.
 */
async function readOwnProperty(): Promise<WeeklyReviewData | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const reading = await readOwnSearchRows(admin)
  if (!reading) return null

  const [{ data: articles }, { data: plan }] = await Promise.all([
    admin.from('articles').select('slug, locale, published_at'),
    admin.from(PLAN_TABLE).select('article_slug, primary_keyword').not('article_slug', 'is', null),
  ])
  const keywordOf = new Map<string, string>()
  for (const p of (plan ?? []) as { article_slug: string | null; primary_keyword: string | null }[]) {
    if (p.article_slug && p.primary_keyword) keywordOf.set(p.article_slug, p.primary_keyword)
  }

  return {
    ...reading,
    articles: ((articles ?? []) as { slug: string | null; locale: string | null; published_at: string | null }[])
      .filter((a): a is { slug: string; locale: string; published_at: string | null } => !!a.slug && isBlogAutoLocale(a.locale))
      .map((a) => ({
        slug: a.slug,
        locale: a.locale as BlogAutoLocale,
        plannedKeyword: keywordOf.get(a.slug) ?? null,
        publishedAt: a.published_at,
      })),
  }
}

export async function runIsolatedBlogWeeklyReview(
  read: () => Promise<WeeklyReviewData | null> = readOwnProperty,
  opts: { env?: Record<string, string | undefined>; now?: Date; startedAtMs?: number; maxDurationMs?: number } = {},
): Promise<IsolatedWeeklyReviewOutcome> {
  const env = opts.env ?? process.env
  if (env.VERCEL_ENV !== 'production') return { status: 'not_production' }
  const clock = opts.now ?? new Date()
  if (!reviewDue(clock)) return { status: 'not_due' }

  const now = Date.now()
  const endOfRun = (opts.startedAtMs ?? now) + (opts.maxDurationMs ?? 0)
  if (Math.min(REVIEW_BUDGET_MS, endOfRun - now) < 5_000) return { status: 'no_time' }

  try {
    const data = await read()
    if (!data || !data.rows.length) return { status: 'no_data' }
    const review = buildWeeklyReview(data, clock.getTime())
    console.log('[blog-weekly-review] reading', {
      syncedAt: review.syncedAt, window: `${review.windowStart}..${review.windowEnd}`,
      rows: review.rows, articles: review.articles, outcomes: review.outcomes, cannibal: review.cannibal,
    })
    for (const line of review.top) console.log('[blog-weekly-review] article', line)
    for (const line of review.cannibalTop) console.log('[blog-weekly-review] cannibal', line)
    return { status: 'ran', ...review }
  } catch (e) {
    console.error('[blog-weekly-review] failed', { message: e instanceof Error ? e.message : String(e) })
    return { status: 'error' }
  }
}

/**
 * What one week of a project amounts to. Pure: the rows come in, one summary comes out, so
 * every rule runs under test and nothing here reads a database or a provider.
 *
 * A SECTION THAT COULD NOT BE READ IS ABSENT, NOT ZERO. Each input may be null, which means
 * "we could not read this", and a null section is left out of the email rather than
 * reported as nothing having happened.
 *
 * AN EMPTY WEEK IS NOT SENT. `worthSending` is false when the week has nothing a reader
 * would act on or enjoy: no article published, nothing waiting for them, no ranking check
 * and no change in Search Console. lib/reports/weekly/run.ts sends nothing then, because a
 * weekly email that says "nothing happened" teaches people to ignore it.
 */
export interface WeeklyArticle { title: string; url: string | null; at: string }

export interface WeeklyInputs {
  /** Articles published inside the window, or null when the read failed. */
  published: WeeklyArticle[] | null
  /** Articles written and waiting for the owner's OK right now, or null when unreadable. */
  waiting: number | null
  /** The next article already scheduled, or null when there is none / unreadable. */
  nextScheduled: { title: string | null; at: string } | null
  /** Ranking moves measured inside the window; null when no check ran or it was unreadable. */
  rank: { checked: number; improved: number; dropped: number } | null
  /** Search Console clicks over the latest 28-day window, and the same a week earlier. */
  gsc: { clicks: number; previousClicks: number | null } | null
}

export interface WeeklySummary {
  worthSending: boolean
  published: WeeklyArticle[]
  publishedCount: number
  waiting: number | null
  nextScheduled: { title: string | null; at: string } | null
  rank: { checked: number; improved: number; dropped: number } | null
  gsc: { clicks: number; change: number | null } | null
}

/** How many titles the email lists before "(and k more)". */
export const TITLES_SHOWN = 3

export function aggregateWeek(input: WeeklyInputs): WeeklySummary {
  const published = input.published ?? []
  const waiting = typeof input.waiting === 'number' && input.waiting > 0 ? input.waiting : null
  const rank = input.rank && input.rank.checked > 0 ? input.rank : null
  const gsc = input.gsc
    ? { clicks: input.gsc.clicks, change: typeof input.gsc.previousClicks === 'number' ? input.gsc.clicks - input.gsc.previousClicks : null }
    : null
  const worthSending = published.length > 0 || waiting !== null || rank !== null || (gsc !== null && gsc.change !== null && gsc.change !== 0)
  return {
    worthSending,
    published: published.slice(0, TITLES_SHOWN),
    publishedCount: published.length,
    waiting,
    nextScheduled: input.nextScheduled,
    rank,
    gsc,
  }
}

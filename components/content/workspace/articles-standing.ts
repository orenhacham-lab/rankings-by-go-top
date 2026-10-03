/**
 * Where the project's articles stand, for the articles screen's hero: the same
 * counts the stat tiles showed (the overview's own counts), plus two figures read
 * from the rows the table already has: how many went live in the last 30 days and
 * how many went live in each of the last weeks (the pace line). Nothing here reads
 * anything of its own.
 */
import type { ArticleRow, Counts } from './types'

export const PACE_WEEKS = 8
const DAY = 24 * 60 * 60 * 1000

export interface ArticleStanding extends Counts {
  /** Went live in the 30 days before `now`. */
  publishedLast30: number
  /** The latest publication, or null when nothing is live yet. */
  lastPublishedAt: string | null
  /** Articles that went live in each of the last PACE_WEEKS weeks, oldest week first. */
  weekly: number[]
}

export function articleStanding(counts: Counts, articles: readonly ArticleRow[], now: number = Date.now()): ArticleStanding {
  const weekly = new Array<number>(PACE_WEEKS).fill(0)
  let publishedLast30 = 0
  let last: number | null = null
  for (const a of articles) {
    if (!a.published_at) continue
    const at = Date.parse(a.published_at)
    if (!Number.isFinite(at) || at > now) continue
    if (last === null || at > last) last = at
    const age = now - at
    if (age <= 30 * DAY) publishedLast30++
    const week = Math.floor(age / (7 * DAY))
    if (week < PACE_WEEKS) weekly[PACE_WEEKS - 1 - week]++
  }
  return {
    ...counts,
    publishedLast30,
    lastPublishedAt: last === null ? null : new Date(last).toISOString(),
    weekly,
  }
}

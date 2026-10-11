/**
 * The activity feed (widget 10) and the setup checklist (widget 3), as data.
 *
 * Pure. The feed merges what the dashboard route reported (articles written and
 * published, topics added, rank checks, AI checks) with the seeding scan's steps,
 * newest first, each with the time it happened. The copy for each line lives in
 * the dictionary; this module decides only WHICH lines and in what order.
 */
import { formatDate } from '@/lib/format/date'
import type { PublicLocale } from '@/lib/i18n/locales'
import type { ActivityEvent } from './overview'
import type { SeedFeedLine } from './seed'

export type FeedItem =
  | { source: 'event'; event: ActivityEvent; at: string }
  | { source: 'seed'; line: SeedFeedLine; at: string | null }

export const FEED_SIZE = 10

/**
 * Newest first. A running seed step leads the list whatever its start time, so
 * "what is happening now" is always the first line while stage B works.
 */
export function mergeFeed(events: readonly ActivityEvent[], seedLines: readonly SeedFeedLine[], size = FEED_SIZE): FeedItem[] {
  const items: FeedItem[] = [
    ...events.map((event) => ({ source: 'event' as const, event, at: event.at })),
    ...seedLines.map((line) => ({ source: 'seed' as const, line, at: line.at })),
  ]
  const time = (i: FeedItem) => (i.at ? Date.parse(i.at) : 0)
  const running = (i: FeedItem) => (i.source === 'seed' && i.line.status === 'running' ? 1 : 0)
  return items.sort((a, b) => running(b) - running(a) || time(b) - time(a)).slice(0, size)
}

/**
 * "3 minutes ago", in the merchant's language, from two instants. Future times
 * (a clock a little ahead) read as "now", never as "in 2 minutes".
 *
 * It takes the PublicLocale — the language of the WORDS — not the bilingual
 * `language`, because this string IS words. Passing the bilingual value put an
 * English "3 days ago" on a Spanish dashboard, which is what it did until
 * 2026-10-11.
 */
export function relativeTime(at: string, now: Date, locale: PublicLocale): string {
  // The one date formatter (lib/format/date.ts), with the future clamped to now.
  const ms = Date.parse(at)
  return formatDate(Number.isFinite(ms) ? Math.min(ms, now.getTime()) : null, locale, 'relative', now)
}

// ── Setup completion ────────────────────────────────────────────────────────

export type SetupTaskKey = 'business' | 'platform' | 'gsc' | 'keywords'
export interface SetupTask { key: SetupTaskKey; done: boolean }

/**
 * The four setup tasks. Search Console is left out, not marked undone, when its
 * state is not known (switched off on the server, still loading, or unreadable):
 * telling a connected merchant to connect would be false. Null when there is
 * nothing to show: every task done, or the facts could not be read.
 */
export function setupTasks(input: {
  business: boolean | null
  platform: boolean | null
  gsc: boolean | null
  keywords: boolean | null
}): { tasks: SetupTask[]; done: number; percent: number } | null {
  const order: SetupTaskKey[] = ['business', 'platform', 'gsc', 'keywords']
  const tasks = order
    .filter((key) => input[key] !== null)
    .map((key) => ({ key, done: input[key] === true }))
  if (tasks.length === 0) return null
  const done = tasks.filter((t) => t.done).length
  if (done === tasks.length) return null
  return { tasks, done, percent: Math.round((done / tasks.length) * 100) }
}

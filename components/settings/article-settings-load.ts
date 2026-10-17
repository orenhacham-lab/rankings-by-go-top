/**
 * How the settings page reads the article-design settings, and when it calls
 * that read "failed" (the owner's wave-9 report: "לא הצלחנו לטעון את הגדרות
 * העיצוב" showed now and then although nothing was wrong).
 *
 * WHY IT SHOWED. The read is a server action, and Next.js runs a page's server
 * actions ONE AT A TIME (its router action queue). The read waited behind the
 * other actions of the page (the project settings read, a save, or the site
 * read of colours and profiles, which can take 20 s), while an 8 s clock that
 * started when it was queued ran out and turned it into "failed". The answer
 * that came a moment later was thrown away, so the notice stayed.
 *
 * NOW. Waiting in the queue is not a failure: the clock is long enough for the
 * queue (ARTICLE_SETTINGS_GIVE_UP_MS), and a read that says "unavailable", or
 * gives no answer, is tried once more on its own before the page says anything.
 * "Failed" is left for a read that failed twice; the retry button stays for it.
 */
import { withDeadline } from '@/lib/active-project/useProjectRow'

/** A read still on its way after this long is given up on (the queue can hold a 20 s site read). */
export const ARTICLE_SETTINGS_GIVE_UP_MS = 45_000
/** The pause before the one quiet retry. */
export const ARTICLE_SETTINGS_RETRY_MS = 1_500

type Answer<T> = { ok: true; data: T } | { ok: false; code: string }

/** A failure worth one more try: no answer at all, or the server's "unavailable". */
export const worthRetry = (res: Answer<unknown> | null): boolean => !res || (!res.ok && res.code === 'unavailable')

export async function readArticleSettings<T>(
  read: () => PromiseLike<Answer<T>>,
  opts: { giveUpMs?: number; retryMs?: number; stale?: () => boolean; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Answer<T> | null> {
  const giveUp = opts.giveUpMs ?? ARTICLE_SETTINGS_GIVE_UP_MS
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const first = await withDeadline(read(), giveUp)
  if (!worthRetry(first) || opts.stale?.()) return first
  await sleep(opts.retryMs ?? ARTICLE_SETTINGS_RETRY_MS)
  if (opts.stale?.()) return first
  return withDeadline(read(), giveUp)
}

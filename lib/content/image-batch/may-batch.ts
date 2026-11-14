/**
 * WHEN A BODY IMAGE MAY BE ORDERED INSTEAD OF CALLED FOR.
 *
 * A batch image is cheap because it is allowed to be late. The one thing that
 * cannot be late is PUBLISHING: the figures are composed from the rows that are
 * 'ready' at the moment the article goes out (lib/content/article-style/
 * publish.ts, lib/content/wordpress-publish.ts), and a post already on the
 * merchant's site is never revisited — so an image that arrives after its
 * article was published is an image that never appears.
 *
 * Hence this rule, and it is the whole safety of the lane:
 *
 *   - A pool that is DUE never batches. The runner generates and publishes a due
 *     pool in the SAME run (runner.ts, steps D and E), so there is no wait at
 *     all between ordering an image and needing it.
 *   - Otherwise the pool's own next publish time must be at least
 *     IMAGE_BATCH_MIN_SLACK_MS away. With the queue keeping one article ready
 *     ahead, a pool generates right after it published, so the slack is normally
 *     a whole publishing interval — a day or more.
 *   - An unknown next publish time never batches. "I don't know when this goes
 *     out" is not a basis for choosing a slower image.
 *
 * Twelve hours is deliberately far more than the turnaround we measured (a probe
 * on 14 November 2026 came back in minutes) and half of Google's own 24-hour
 * target, which is a target and not a promise. A job that overruns even this is
 * written off by the collect pass and its rows are marked 'failed' with the
 * editor's regenerate button — the same place a failed live call leaves them.
 */

/** The publishing slack a pool must have before its body images may be ordered. */
export const IMAGE_BATCH_MIN_SLACK_MS = 12 * 60 * 60 * 1000

export function inlineImagesMayBatchForPool(
  args: { due: boolean; nextPublishAt: string | null | undefined; nowMs: number },
  minSlackMs: number = IMAGE_BATCH_MIN_SLACK_MS,
): boolean {
  if (args.due) return false
  if (!args.nextPublishAt) return false
  const at = Date.parse(args.nextPublishAt)
  if (!Number.isFinite(at)) return false
  return at - args.nowMs >= minSlackMs
}

/**
 * The reads after a scan (./wordpress-scan.ts, ./shopify-scan.ts): every page the scan read, so that no
 * row keeps a "fix it for me" button only because its page was never checked (a cap of 12 reads left
 * the rest of a 25-page scan with buttons that could only answer "nothing to change"). A few at a
 * time, so a small site's server is not flooded, and inside one time budget: what has not answered by
 * then stays as the scan found it. The scan reads at most 25 pages (lib/site-health/scan.ts MAX_PAGES);
 * broken-link rows add the pages they were found on, which the scan read too.
 */
export const MAX_READS = 30
export const READ_CONCURRENCY = 6
export const TIME_MS = 14_000
/** Media Library lookups (./media-alt.ts), beside the page reads and inside the same time budget. */
export const MAX_MEDIA_LOOKUPS = 40
export const MEDIA_CONCURRENCY = 3

/**
 * Runs `read` on each item, READ_CONCURRENCY at a time (at most MAX_READS items); stops starting new
 * ones after TIME_MS. `opts` sets other limits for another kind of read (the Media Library lookups).
 */
export async function readAll<T>(
  items: readonly T[],
  read: (item: T, deadline: number) => Promise<void>,
  opts: { max?: number; concurrency?: number } = {},
): Promise<void> {
  const deadline = Date.now() + TIME_MS
  const queue = items.slice(0, opts.max ?? MAX_READS)
  let timer: ReturnType<typeof setTimeout> | undefined
  const outOfTime = new Promise<void>((resolve) => { timer = setTimeout(resolve, TIME_MS) })
  const worker = async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      if (Date.now() > deadline) return
      try { await read(next, deadline) } catch { /* unreadable: left as the scan found it */ }
    }
  }
  await Promise.race([Promise.all(Array.from({ length: opts.concurrency ?? READ_CONCURRENCY }, worker)), outOfTime])
  clearTimeout(timer)
}

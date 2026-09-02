/**
 * "Only the newest attempt may write" — the supersede guard for a lookup that
 * can be restarted before its previous run finishes.
 *
 * THE RACE THIS EXISTS FOR. TopicPlanDrawer's link-plan preview had no request
 * identity at all. Opening topic A, then switching to topic B while A's preview
 * was still in flight, let A's response land in B's drawer: A's `dry`,
 * `cacheState` and default selection were written into B's state. Since the
 * queue decision reads `cacheState`, a stale answer from another topic could
 * decide whether B queues with or without internal links. The saved-plan lookup
 * beside it was already guarded this way inline; the preview was not.
 *
 * Deliberately tiny and framework-free: one monotonic sequence number plus one
 * AbortController. It holds no React state, so it lives in a ref and can be
 * exercised directly in tests with deferred promises — which is the only way to
 * prove "the superseded attempt wrote nothing" rather than assert it about the
 * shape of some code.
 */
export class LatestRequest {
  private seq = 0
  private controller: AbortController | null = null

  /**
   * Begin a new attempt. Aborts and supersedes whatever was in flight, so the
   * caller must treat the returned token as the ONLY licence to write.
   */
  start(): { token: number; signal: AbortSignal } {
    this.seq += 1
    this.controller?.abort()
    this.controller = new AbortController()
    return { token: this.seq, signal: this.controller.signal }
  }

  /**
   * True only while `token` is still the newest attempt. Every state write —
   * success, handled failure, error text, and the loading-flag cleanup — must
   * be behind this, not just the happy path: a superseded attempt clearing the
   * newer one's "loading" flag is the same bug wearing a different hat.
   */
  isCurrent(token: number): boolean {
    return this.seq === token
  }

  /**
   * Supersede everything in flight WITHOUT starting a new attempt — for a close
   * or unmount. Bumps the sequence too, so a response that was already past its
   * abort check still fails `isCurrent`.
   */
  cancel(): void {
    this.seq += 1
    this.controller?.abort()
    this.controller = null
  }
}

/** An abort, as opposed to a genuine failure. Aborts are supersedes, not errors. */
export function isAbortError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError'
}

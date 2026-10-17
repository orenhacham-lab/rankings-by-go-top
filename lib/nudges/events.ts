/**
 * The health screen tells the nudge readers (the dashboard card and the sidebar's count pills) that
 * its fix queue changed, so they read again at once instead of waiting for the next screen change or
 * focus. A plain browser event: no data, nothing to trust.
 */
export const WAITING_REFRESH_EVENT = 'gotop:waiting-refresh'

/** Announce a change of the fix queue (browser only; harmless anywhere else). */
export function announceWaitingChanged(): void {
  try { if (typeof window !== 'undefined') window.dispatchEvent(new Event(WAITING_REFRESH_EVENT)) } catch { /* nothing waits for it */ }
}

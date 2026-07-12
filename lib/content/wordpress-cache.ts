/**
 * Phase 4E — tiny in-memory TTL cache for short-lived WordPress reads (taxonomy
 * lists + SEO-plugin detection). Per server instance, best-effort; never a
 * correctness dependency (a miss just re-fetches). Keeps repeated editor loads
 * from hammering the WP REST API without adding storage.
 */

type Entry<T> = { value: T; expires: number }
const store = new Map<string, Entry<unknown>>()

/** Return the cached value for `key`, or compute + cache it for `ttlMs`. */
export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.get(key)
  if (hit && hit.expires > now) return hit.value as T
  const value = await compute()
  store.set(key, { value, expires: now + ttlMs })
  return value
}

/** Drop a cached key (e.g. after a taxonomy-changing action). */
export function invalidate(key: string): void {
  store.delete(key)
}

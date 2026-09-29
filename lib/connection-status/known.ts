/**
 * "Not connected" is an ANSWER, never a default.
 *
 * The owner saw it on the live app (2026-09-28): a screen opens, and for a second
 * it says Search Console is not connected, although it is, because the status
 * had not arrived yet. The cause was always the same: a component kept the
 * connection in a `useState(false)` / `useState('none')` / `useState(null)` and
 * drew that initial value as "disconnected" until the request answered, or drew
 * a failed request the same way.
 *
 * Every status a screen reads is one of three things, and this module is the
 * one place that says which:
 *   - loading: no answer yet. Drawn as a skeleton in the final layout, never as
 *     "not connected", an empty state or a zero;
 *   - error:   the read failed (a network error, a 4xx/5xx, a body that is not
 *     the route's answer). Drawn as "could not load" with a retry, or left out,
 *     never as "not connected": a failed read must not tell a connected
 *     merchant to connect;
 *   - ready:   the route answered, and only then may its answer be "nothing is
 *     connected".
 *
 * Pure: no React, no I/O (the shared read is ./useKnownRead).
 */

export type Known<T> =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; value: T }

export const LOADING: Known<never> = { state: 'loading' }
export const ERROR: Known<never> = { state: 'error' }
export function ready<T>(value: T): Known<T> {
  return { state: 'ready', value }
}

/** A GET's outcome as the shared read hands it over: status 0 is a network failure. */
export interface ReadResponse { status: number; body: unknown }

/** The value when known, else the fallback (for code that only needs "is it there yet"). */
export function valueOr<T, F>(known: Known<T>, fallback: F): T | F {
  return known.state === 'ready' ? known.value : fallback
}

/** Every one of them answered: their values, in order. Loading wins over error, so a
 *  screen waits for the slowest read before it decides anything. */
export function allKnown<T extends readonly Known<unknown>[]>(
  ...reads: T
): Known<{ [K in keyof T]: T[K] extends Known<infer V> ? V : never }> {
  if (reads.some((r) => r.state === 'loading')) return LOADING
  if (reads.some((r) => r.state === 'error')) return ERROR
  return ready(reads.map((r) => (r as { value: unknown }).value) as never)
}

type ConnectionBody = { connection?: unknown }

/**
 * A connection route's answer (GET /api/wordpress/connection, /api/shopify/connection,
 * /api/site-platforms/connection): `{ connection: <row> | null, … }` on 2xx.
 *
 * `connection: null` in a 2xx answer is the ONLY way to learn that nothing is
 * connected. A 4xx/5xx, a network failure, or a body without the `connection` key
 * (an HTML error page, `{ error }`) is an error: it says nothing about the connection.
 */
export function connectionAnswer<T>(response: ReadResponse | null): Known<{ connection: T | null; body: Record<string, unknown> }> {
  if (!response) return LOADING
  const body = response.body
  if (response.status < 200 || response.status >= 300) return ERROR
  if (!body || typeof body !== 'object' || !('connection' in (body as ConnectionBody))) return ERROR
  const b = body as Record<string, unknown>
  return ready({ connection: (b.connection ?? null) as T | null, body: b })
}

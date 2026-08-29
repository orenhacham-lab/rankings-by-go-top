/**
 * Shared timestamp parsing/normalization for PayPal- and Postgres/PostgREST-
 * sourced billing-period boundaries.
 *
 * Corrective pass — ISO 8601 timestamps that represent the SAME instant can
 * differ in surface form: PayPal commonly returns "2036-01-01T00:00:00Z",
 * while Postgres/PostgREST commonly returns the identical instant as
 * "2036-01-01T00:00:00+00:00" — and fractional-second precision can differ
 * too. These must NEVER be compared as plain strings (`===`, `<`, `>`) — a
 * lexicographic compare can misclassify two representations of the exact
 * same instant as "different," which previously let a duplicate renewal
 * delivery be misclassified as a genuinely newer one, silently corrupting a
 * subscription's billing-period boundary. Every comparison in this codebase
 * must go through `parseInstantMs` first; every VALUE persisted back to the
 * database must go through `normalizeInstant` first, so every timestamp this
 * app ever writes is in one canonical shape going forward.
 */

/**
 * Parses an ISO-8601-ish timestamp string to epoch milliseconds. Returns
 * `null` for a missing/empty/unparseable input — NEVER throws, NEVER
 * silently coerces a bad value to `0`/`NaN`-as-a-number that a caller might
 * accidentally treat as valid. Callers MUST check for `null` and fail closed
 * rather than guess.
 */
export function parseInstantMs(raw: string | null | undefined): number | null {
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Parses `raw`, then re-serializes to the canonical UTC ISO-8601 form via
 * `new Date(ms).toISOString()` (always `YYYY-MM-DDTHH:mm:ss.sssZ`, 3
 * fractional-second digits). Returns `null` for a missing/unparseable input
 * — this NEVER invents a date; a `null` result must always be treated as
 * "no usable value," not silently defaulted.
 */
export function normalizeInstant(raw: string | null | undefined): string | null {
  const ms = parseInstantMs(raw)
  return ms === null ? null : new Date(ms).toISOString()
}

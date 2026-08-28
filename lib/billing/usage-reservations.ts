/**
 * Phase 3 — typed server-side wrappers around the usage_reservations RPCs
 * (supabase/migrations/20260829000000_add_usage_reservations_and_billing_periods.sql).
 * These RPCs are EXECUTE-revoked from PUBLIC/anon/authenticated and granted
 * only to service_role — callable only via the admin (service-role) client,
 * never from a user-session client. `p_limit` is always resolved by the
 * caller (from lib/plans/catalog.ts / getUserEntitlement) BEFORE calling —
 * these wrappers never invent or trust a client-supplied limit themselves.
 *
 * 3rd review correction — every reservation now carries an explicit
 * `reservationToken` (a uuid, NOT a timestamp) that MUST be threaded back
 * into finalizeUsageReservation / finalizeArticleGeneration /
 * releaseUsageReservation. This closes a real gap: reserve_usage REUSES the
 * same row (via UPDATE, not a new INSERT) when an idempotency key's prior
 * 'reserved' row has expired (>30 min, abandoned/crashed job) — without this
 * token, a caller that is itself abnormally slow (still holding the OLD
 * reservationId after its own reservation was reused by a recovering
 * worker's fresh reserve_usage call) could finalize/release against what is
 * now a DIFFERENT logical reservation. Every finalize/release RPC now
 * requires reservation_token to still equal the exact token the caller was
 * granted — a stale caller gets 'not_reserved' instead of silently acting on
 * someone else's in-flight reservation. The token is never parsed or
 * transformed here — passed through byte-for-byte, always compared for exact
 * equality only, on the SQL side.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export type UsageType = 'google_check' | 'ai_check' | 'article'

export type ReserveOutcome =
  | { outcome: 'reserved'; reservationId: string; reservationToken: string }
  | { outcome: 'already_reserved'; reservationId: string; reservationToken: string }
  | { outcome: 'already_consumed'; reservationId: string; articleId: string | null }
  | { outcome: 'quota_exceeded' }
  | { outcome: 'project_not_owned' }
  | { outcome: 'error'; message: string }

export async function reserveUsage(admin: Admin, args: {
  userId: string
  projectId: string | null
  usageType: UsageType
  amount: number
  periodStart: Date
  periodEnd: Date
  limit: number
  idempotencyKey: string
}): Promise<ReserveOutcome> {
  const { data, error } = await admin.rpc('reserve_usage', {
    p_user_id: args.userId,
    p_project_id: args.projectId,
    p_usage_type: args.usageType,
    p_amount: args.amount,
    p_period_start: args.periodStart.toISOString(),
    p_period_end: args.periodEnd.toISOString(),
    p_limit: args.limit,
    p_idempotency_key: args.idempotencyKey,
  })
  if (error) return { outcome: 'error', message: error.message }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { outcome: 'error', message: 'reserve_usage returned no row' }
  switch (row.outcome) {
    case 'reserved': return { outcome: 'reserved', reservationId: row.reservation_id, reservationToken: row.reservation_token }
    case 'already_reserved': return { outcome: 'already_reserved', reservationId: row.reservation_id, reservationToken: row.reservation_token }
    case 'already_consumed': return { outcome: 'already_consumed', reservationId: row.reservation_id, articleId: row.article_id ?? null }
    case 'quota_exceeded': return { outcome: 'quota_exceeded' }
    case 'project_not_owned': return { outcome: 'project_not_owned' }
    default: return { outcome: 'error', message: `unrecognized outcome: ${row.outcome}` }
  }
}

export type FinalizeOutcome = { outcome: 'finalized' | 'released' | 'not_reserved' } | { outcome: 'error'; message: string }

/** Google/AI checks — consume exactly what was actually dispatched to the
 *  provider; the rest is released automatically. p_consumed=0 releases the
 *  whole reservation (no provider call was ever made). `reservationToken`
 *  MUST be the exact value returned by the `reserveUsage` call that granted
 *  this `reservationId` — see file header. */
export async function finalizeUsageReservation(admin: Admin, args: {
  reservationId: string
  userId: string
  reservationToken: string
  consumed: number
  relatedRef: string | null
  reason?: string | null
}): Promise<FinalizeOutcome> {
  const { data, error } = await admin.rpc('finalize_usage_reservation', {
    p_reservation_id: args.reservationId,
    p_user_id: args.userId,
    p_consumed: args.consumed,
    p_related_ref: args.relatedRef,
    p_reason: args.reason ?? null,
    p_reservation_token: args.reservationToken,
  })
  if (error) return { outcome: 'error', message: error.message }
  const row = Array.isArray(data) ? data[0] : data
  const outcome = row?.outcome
  if (outcome === 'finalized' || outcome === 'released' || outcome === 'not_reserved') return { outcome }
  return { outcome: 'error', message: `unrecognized outcome: ${outcome}` }
}

export async function releaseUsageReservation(admin: Admin, args: {
  reservationId: string
  userId: string
  reservationToken: string
  reason: string
}): Promise<FinalizeOutcome> {
  const { data, error } = await admin.rpc('release_usage_reservation', {
    p_reservation_id: args.reservationId,
    p_user_id: args.userId,
    p_reason: args.reason,
    p_reservation_token: args.reservationToken,
  })
  if (error) return { outcome: 'error', message: error.message }
  const row = Array.isArray(data) ? data[0] : data
  const outcome = row?.outcome
  if (outcome === 'released' || outcome === 'not_reserved') return { outcome }
  return { outcome: 'error', message: `unrecognized outcome: ${outcome}` }
}

export interface ArticleFinalizePayload {
  project_id: string
  topic_id: string | null
  title: string
  meta_title: string | null
  meta_description: string | null
  excerpt: string | null
  content_html: string | null
  content_markdown: string | null
  // Passed straight through to the RPC's jsonb parameter — opaque here on
  // purpose (the real shape is GeneratedArticleFaq[] from gemini-article.ts,
  // which this module has no reason to depend on).
  faq_json: unknown
  image_prompt: string | null
  wp_connection_id: string | null
  slug: string
}

export type FinalizeArticleOutcome =
  | { outcome: 'consumed'; articleId: string }
  | { outcome: 'slug_conflict' }
  | { outcome: 'not_reserved' }
  | { outcome: 'error'; message: string }

/** ATOMIC: persists the generated_articles row AND consumes the reservation
 *  in one transaction — see the RPC definition for why this is what actually
 *  closes the "article exists without a consumed credit" gap. On
 *  'slug_conflict', the reservation is untouched (still 'reserved') — retry
 *  with a new slug candidate. `reservationToken` MUST be the exact value
 *  returned by the `reserveUsage` call that granted this `reservationId`. */
export async function finalizeArticleGeneration(admin: Admin, args: {
  reservationId: string
  userId: string
  reservationToken: string
  article: ArticleFinalizePayload
}): Promise<FinalizeArticleOutcome> {
  const { data, error } = await admin.rpc('finalize_article_generation', {
    p_reservation_id: args.reservationId,
    p_user_id: args.userId,
    p_article: args.article,
    p_reservation_token: args.reservationToken,
  })
  if (error) return { outcome: 'error', message: error.message }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { outcome: 'error', message: 'finalize_article_generation returned no row' }
  if (row.outcome === 'consumed') return { outcome: 'consumed', articleId: row.article_id }
  if (row.outcome === 'slug_conflict') return { outcome: 'slug_conflict' }
  if (row.outcome === 'not_reserved') return { outcome: 'not_reserved' }
  return { outcome: 'error', message: `unrecognized outcome: ${row.outcome}` }
}

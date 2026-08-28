/**
 * Corrective pass — the DB-side write-ordering logic for PayPal activation,
 * split out from the route so it's testable against a fake admin client.
 *
 * The route calls this ONLY after PayPal verification has already succeeded
 * (lib/paypal/client.ts::verifyPayPalActivation) — this function never
 * re-verifies anything, it only decides how to persist an already-confirmed
 * paid plan without ever leaving the user with NEITHER their prior valid
 * entitlement NOR the new one.
 *
 * Database-integrity hardening pass: the single-current-entitlement
 * invariant (at most one trial/active row per user) is now enforced by a
 * unique partial index (supabase/migrations/20260822_make_trial_ends_at_nullable.sql)
 * rather than by an application-layer "best-effort cleanup" step run AFTER
 * the primary write — that step could itself fail (its own error was only
 * logged as a warning, never surfaced) and leave two rows both looking like
 * "the" current entitlement, with nothing forcing a fix. This function no
 * longer performs that cleanup at all:
 *   - It reads ALL trial/active rows for the user (not `order+limit(1)`,
 *     which would silently narrow an already-broken multi-row state down to
 *     "whichever is newest" and proceed as if nothing were wrong).
 *   - More than one such row is treated as a hard failure — the invariant
 *     was violated before this code ever ran, so nothing is written and
 *     no row is arbitrarily chosen.
 *   - The paypal_subscription_id uniqueness invariant is enforced the same
 *     way: no application-side pre-check, just a normal write whose error
 *     (a unique-violation, once the migration is applied) is checked like
 *     any other and reported as a failure — never silently retried against
 *     a different row, never swallowed.
 */

// `any` deliberately — same convention as lib/paypal/webhook-processing.ts /
// lib/subscription.ts (real Supabase admin client in the route, FakeAdmin in QA).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export interface PaidSubscriptionFields {
  plan_code: string
  status: 'active'
  paypal_subscription_id: string
  current_period_end: string
  /** Phase 3 — authoritative period start from PayPal's own verified
   *  response (lib/paypal/client.ts::verifyPayPalActivation); null when
   *  PayPal doesn't report start_time for this subscription (the usage-period
   *  resolver falls back to current_period_end - 1 month in that case). */
  current_period_start: string | null
}

export type ActivationTransitionOutcome =
  | { kind: 'transitioned_existing'; rowId: string }
  | { kind: 'inserted_new'; rowId: string }
  | { kind: 'lookup_failed'; message: string }
  | { kind: 'write_failed'; message: string }
  /** The single-current-entitlement invariant was already violated BEFORE
   *  this ran (more than one trial/active row for this user). Never picked
   *  arbitrarily — nothing is written. This should be unreachable once the
   *  unique partial index is applied; reachable only pre-migration, or if
   *  the index were ever dropped. */
  | { kind: 'multiple_current_entitlement_rows'; count: number }

/**
 * Transitions a user's trial/active row to the given verified paid plan, or
 * inserts a fresh row if none exists. Never a two-step "cancel prior, then
 * insert new" — if a prior trial/active row exists, it is updated IN PLACE
 * in a single atomic write, so a failure leaves it completely unchanged
 * (not cancelled-with-nothing-to-replace-it). If no prior row exists, an
 * insert has nothing to lose on failure either way.
 */
export async function transitionSubscriptionToActivePlan(
  admin: Admin,
  userId: string,
  paid: PaidSubscriptionFields,
): Promise<ActivationTransitionOutcome> {
  // Read ALL current-entitlement rows — no order+limit(1). Silently picking
  // "the newest" when there's more than one is exactly the arbitrary
  // selection this pass was told not to do.
  const { data: existingRows, error: findError } = await admin
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['trial', 'active'])

  if (findError) return { kind: 'lookup_failed', message: findError.message }

  const rows = (existingRows ?? []) as { id: string }[]
  if (rows.length > 1) {
    return { kind: 'multiple_current_entitlement_rows', count: rows.length }
  }

  if (rows.length === 1) {
    const existing = rows[0]
    // Single atomic UPDATE of the SAME row — the prior entitlement is
    // replaced only if this write succeeds; on failure the row (and the
    // user's prior valid entitlement) is left exactly as it was. Any
    // unique-violation (e.g. this paypal_subscription_id already belongs to
    // a different row) surfaces here as a normal write error — checked, not
    // swallowed, not silently retried against a different row.
    const { error } = await admin.from('subscriptions').update(paid).eq('id', existing.id)
    if (error) return { kind: 'write_failed', message: error.message }
    return { kind: 'transitioned_existing', rowId: existing.id }
  }

  // No prior trial/active row — nothing to lose on a failed insert. The
  // one-current-entitlement-per-user index has nothing to conflict with
  // here (this insert is itself the only trial/active row for this user);
  // the paypal_subscription_id index is still live as a normal write-error
  // backstop against reusing another user's subscription id.
  const { data: inserted, error } = await admin.from('subscriptions').insert({ user_id: userId, ...paid }).select('id').single()
  if (error || !inserted) return { kind: 'write_failed', message: error?.message ?? 'no row returned' }
  return { kind: 'inserted_new', rowId: inserted.id }
}

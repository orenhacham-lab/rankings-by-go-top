-- Phase 1 (PayPal/Shopify billing hardening) — subscriptions.trial_ends_at
-- must be nullable.
--
-- Defect #4: trial_ends_at is currently NOT NULL, but a paid/active
-- subscription (manually granted, or created on PayPal activation) has no
-- trial to end. The application code has never provided a value for it on
-- that path, which is exactly why app/api/paypal/activate/route.ts's insert
-- has been failing.
--
-- Semantics after this migration (enforced in application code, not by a
-- CHECK constraint, to avoid coupling this migration to app-layer plan
-- validation): trial_ends_at is required/checked ONLY when status = 'trial'.
-- A paid active row should leave it NULL rather than carry a fake value.
--
-- This migration does NOT touch existing rows — no UPDATE, no backfill.
-- It only relaxes the constraint so future inserts may omit the column.
--
-- NOT APPLIED to production by this change. Authoritative — apply via the
-- normal Supabase migration path when ready.
--
-- Wrapped in one explicit transaction: the whole file (both preflight
-- validation blocks and both index creations) either applies atomically or
-- not at all — a RAISE EXCEPTION in either preflight block rolls back
-- everything before it in this file too, never leaving the nullability
-- change applied while a constraint silently failed to follow.

BEGIN;

ALTER TABLE public.subscriptions
  ALTER COLUMN trial_ends_at DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- Database-integrity hardening pass — two invariants the application layer
-- was previously trusted to maintain on its own (via a "best-effort cleanup"
-- step that could fail silently after the primary write succeeded, leaving
-- ambiguous state). Enforced here at the database level instead; the
-- corresponding application code now relies on these constraints rather
-- than re-implementing the invariant itself.
--
-- Verified against production before writing this migration: 22 subscription
-- rows, 22 distinct users, zero non-null paypal_subscription_id values — no
-- current conflict is expected. Still written defensively: each preflight
-- block RAISEs a clear, actionable exception (not Postgres's generic
-- "could not create unique index" message) if the assumption doesn't hold at
-- apply time, and neither block deletes, merges, or modifies any row —
-- resolving a real conflict, if one is ever found, is a manual decision, not
-- something this migration makes for you.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) A non-null paypal_subscription_id must belong to exactly one row.
--    Without this, two different local rows could both claim the same
--    PayPal subscription (e.g. a race, or a bug), and PayPal webhook events
--    for that subscription id would have no well-defined row to update.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT paypal_subscription_id
    FROM public.subscriptions
    WHERE paypal_subscription_id IS NOT NULL
    GROUP BY paypal_subscription_id
    HAVING count(*) > 1
  ) dupes;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % paypal_subscription_id value(s) are claimed by more than one subscriptions row. This migration does NOT delete, merge, or modify any row — resolve the duplicate(s) manually, then re-run.', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_paypal_subscription_id_unique
  ON public.subscriptions (paypal_subscription_id)
  WHERE paypal_subscription_id IS NOT NULL;

-- 2) A user may have at most one CURRENT entitlement row — status IN
--    ('trial', 'active'). ('cancelled' is deliberately excluded: a cancelled
--    row legitimately coexists with the active row that superseded it, and
--    entitlement resolution already picks the most-recent row by created_at
--    among trial/active/cancelled — see lib/subscription.ts.) Without this,
--    which row is "the" trial/active row is ambiguous — exactly the
--    ambiguity the prior best-effort application-layer cleanup was papering
--    over rather than preventing.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT user_id
    FROM public.subscriptions
    WHERE status IN ('trial', 'active')
    GROUP BY user_id
    HAVING count(*) > 1
  ) dupes;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % user(s) have more than one trial/active subscriptions row. This migration does NOT delete, merge, or modify any row — resolve the duplicate(s) manually, then re-run.', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_current_entitlement_per_user
  ON public.subscriptions (user_id)
  WHERE status IN ('trial', 'active');

COMMIT;

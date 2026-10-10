-- Creem subscriptions need somewhere to live.
--
-- ADDITIVE ONLY. One nullable column, one partial unique index, one CHECK.
-- Nothing is deleted, merged or modified; every existing row keeps exactly
-- the values it has, and the new column is NULL for all of them. Applying
-- this changes no behaviour on its own: no code reads or writes the column
-- until the Creem routes are turned on, and they are behind CREEM_ENABLED,
-- which is off.
--
-- NOTE FOR WHOEVER APPLIES IT: this project's Vercel preview shares the
-- production Supabase database, so there is no such thing as applying this
-- "to preview" — it is production either way.
--
-- The three pieces, and what each one prevents:
--
--  1. subscriptions.creem_subscription_id — where a Creem subscription id is
--     recorded, mirroring paypal_subscription_id. A separate column rather
--     than reusing the PayPal one, because a row must say WHICH provider
--     holds the subscription; two providers' ids in one column would make
--     "who do we ask about this subscription" unanswerable.
--
--  2. A partial unique index on it, the same shape
--     subscriptions_paypal_subscription_id_unique already has
--     (20260822_make_trial_ends_at_nullable.sql). Without it, two local rows
--     could both claim the same Creem subscription and a webhook for that id
--     would have no well-defined row to update.
--
--  3. A CHECK that one row never carries BOTH a PayPal and a Creem
--     subscription id. That state would mean an account is being charged
--     twice for the same entitlement, by two providers, and it is far better
--     for the write that would create it to fail loudly here than for it to
--     be discovered on a customer's statement.
--
-- Written defensively like its predecessor: the preflight RAISEs a clear,
-- actionable message instead of Postgres's generic index error, and resolves
-- nothing by itself.

-- Preflight: the CHECK below is only addable if no existing row already
-- violates it. Every row has creem_subscription_id NULL at this point, so
-- this cannot fail on a first apply; it is here so a re-run after a partial
-- apply says something useful.
DO $$
DECLARE
  both_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = 'creem_subscription_id'
  ) THEN
    EXECUTE $q$
      SELECT count(*) FROM public.subscriptions
      WHERE paypal_subscription_id IS NOT NULL AND creem_subscription_id IS NOT NULL
    $q$ INTO both_count;
    IF both_count > 0 THEN
      RAISE EXCEPTION 'Migration aborted: % subscription row(s) carry BOTH a PayPal and a Creem subscription id, which means an account billed twice for one entitlement. This migration does NOT modify any row — resolve it manually, then re-run.', both_count;
    END IF;
  END IF;
END $$;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS creem_subscription_id text;

COMMENT ON COLUMN public.subscriptions.creem_subscription_id IS
  'Creem subscription id (sub_...) for accounts billed through Creem. NULL for PayPal- and Shopify-billed rows. Mutually exclusive with paypal_subscription_id, enforced by subscriptions_one_provider_per_row.';

-- Preflight for the unique index, mirroring the PayPal one.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT creem_subscription_id
    FROM public.subscriptions
    WHERE creem_subscription_id IS NOT NULL
    GROUP BY creem_subscription_id
    HAVING count(*) > 1
  ) dupes;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % creem_subscription_id value(s) are claimed by more than one subscriptions row. This migration does NOT delete, merge, or modify any row — resolve the duplicate(s) manually, then re-run.', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_creem_subscription_id_unique
  ON public.subscriptions (creem_subscription_id)
  WHERE creem_subscription_id IS NOT NULL;

-- One row, at most one payment provider.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_one_provider_per_row'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_one_provider_per_row
      CHECK (paypal_subscription_id IS NULL OR creem_subscription_id IS NULL);
  END IF;
END $$;

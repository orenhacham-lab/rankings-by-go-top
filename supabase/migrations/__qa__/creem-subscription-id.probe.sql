-- ============================================================================
-- EXECUTED PROBE — 20261010150000_creem_subscription_id.sql
--
-- Applies, in a DISPOSABLE PostgreSQL cluster, a stand-in for the
-- `subscriptions` table as production holds it (including the PayPal unique
-- index an earlier migration added), then the migration under test TWICE: a
-- re-run must not error, because a migration that cannot be applied twice
-- cannot be applied safely.
--
--   'before'     the premise. Without the column there is nowhere to record a
--                Creem subscription, and nothing stops one row claiming two
--                providers.
--   'after'      the column exists, every pre-existing row reads NULL, and an
--                insert that never mentions the column still works. Existing
--                PayPal rows keep their ids exactly.
--   'unique'     two rows cannot claim the same Creem subscription, while any
--                number of rows may have NULL.
--   'exclusive'  one row may hold a PayPal id, or a Creem id, or neither —
--                never both. That state would be an account charged twice for
--                one entitlement, by two providers.
--   'idempotent' the whole file applied a second time changes nothing and
--                adds no second constraint or index.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/creem-subscription-id.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- The shape production holds before this migration. Only the columns this
-- probe touches are reproduced.
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_code text NOT NULL,
  status text NOT NULL,
  paypal_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX subscriptions_paypal_subscription_id_unique
  ON public.subscriptions (paypal_subscription_id)
  WHERE paypal_subscription_id IS NOT NULL;

INSERT INTO public.subscriptions (user_id, plan_code, status, paypal_subscription_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'regular', 'active', 'I-PAYPALSUB001'),
  ('22222222-2222-2222-2222-222222222222', 'trial', 'trial', NULL);

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

/* Does this INSERT succeed? Any error means no. */
CREATE FUNCTION accepts(sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sql;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END; $$;

CREATE FUNCTION has_column(c text) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = c
  );
$$;

-- ── before ─────────────────────────────────────────────────────────────────
SELECT chk('before', 'there is nowhere to record a Creem subscription', NOT has_column('creem_subscription_id'));

-- ── the migration ──────────────────────────────────────────────────────────
\i supabase/migrations/20261010150000_creem_subscription_id.sql

-- ── after ──────────────────────────────────────────────────────────────────
SELECT chk('after', 'the column exists', has_column('creem_subscription_id'));
SELECT chk('after', 'every pre-existing row reads NULL',
  (SELECT count(*) FROM public.subscriptions WHERE creem_subscription_id IS NOT NULL) = 0);
SELECT chk('after', 'the existing PayPal id is untouched',
  (SELECT paypal_subscription_id FROM public.subscriptions
    WHERE user_id = '11111111-1111-1111-1111-111111111111') = 'I-PAYPALSUB001');
SELECT chk('after', 'an insert that never mentions the column still works',
  accepts($$INSERT INTO public.subscriptions (user_id, plan_code, status)
            VALUES ('33333333-3333-3333-3333-333333333333', 'trial', 'trial')$$));
SELECT chk('after', 'a Creem-only row is accepted',
  accepts($$INSERT INTO public.subscriptions (user_id, plan_code, status, creem_subscription_id)
            VALUES ('44444444-4444-4444-4444-444444444444', 'advanced', 'active', 'sub_CREEM001')$$));

-- ── unique ─────────────────────────────────────────────────────────────────
SELECT chk('unique', 'a second row cannot claim the same Creem subscription',
  NOT accepts($$INSERT INTO public.subscriptions (user_id, plan_code, status, creem_subscription_id)
                VALUES ('55555555-5555-5555-5555-555555555555', 'regular', 'active', 'sub_CREEM001')$$));
SELECT chk('unique', 'but any number of rows may have none',
  accepts($$INSERT INTO public.subscriptions (user_id, plan_code, status, creem_subscription_id)
            VALUES ('66666666-6666-6666-6666-666666666666', 'trial', 'trial', NULL)$$));
SELECT chk('unique', 'the PayPal index still refuses its own duplicate',
  NOT accepts($$INSERT INTO public.subscriptions (user_id, plan_code, status, paypal_subscription_id)
                VALUES ('77777777-7777-7777-7777-777777777777', 'regular', 'active', 'I-PAYPALSUB001')$$));

-- ── exclusive: never two providers on one row ──────────────────────────────
SELECT chk('exclusive', 'a row carrying BOTH providers is refused on insert',
  NOT accepts($$INSERT INTO public.subscriptions (user_id, plan_code, status, paypal_subscription_id, creem_subscription_id)
                VALUES ('88888888-8888-8888-8888-888888888888', 'premium', 'active', 'I-PAYPALSUB999', 'sub_CREEM999')$$));
SELECT chk('exclusive', 'and an existing PayPal row cannot be given a Creem id',
  NOT accepts($$UPDATE public.subscriptions SET creem_subscription_id = 'sub_CREEM777'
                WHERE user_id = '11111111-1111-1111-1111-111111111111'$$));
SELECT chk('exclusive', 'that failed UPDATE changed nothing',
  (SELECT creem_subscription_id FROM public.subscriptions
    WHERE user_id = '11111111-1111-1111-1111-111111111111') IS NULL);
SELECT chk('exclusive', 'a row with neither provider is still fine',
  (SELECT count(*) FROM public.subscriptions
    WHERE paypal_subscription_id IS NULL AND creem_subscription_id IS NULL) > 0);

-- ── idempotent ─────────────────────────────────────────────────────────────
\i supabase/migrations/20261010150000_creem_subscription_id.sql

SELECT chk('idempotent', 'a second run leaves the Creem row alone',
  (SELECT creem_subscription_id FROM public.subscriptions
    WHERE user_id = '44444444-4444-4444-4444-444444444444') = 'sub_CREEM001');
SELECT chk('idempotent', 'a second run still refuses two providers on one row',
  NOT accepts($$INSERT INTO public.subscriptions (user_id, plan_code, status, paypal_subscription_id, creem_subscription_id)
                VALUES ('99999999-9999-9999-9999-999999999999', 'premium', 'active', 'I-PAYPALSUB888', 'sub_CREEM888')$$));
SELECT chk('idempotent', 'one exclusivity CHECK exists, not two',
  (SELECT count(*) FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'c' AND rel.relname = 'subscriptions'
      AND con.conname = 'subscriptions_one_provider_per_row') = 1);
SELECT chk('idempotent', 'one Creem unique index exists, not two',
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'subscriptions'
      AND indexname = 'subscriptions_creem_subscription_id_unique') = 1);

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;

-- ============================================================================
-- EXECUTED PROBE — 20261003000000_subscriptions_paddle_columns.sql (w21)
--
-- Builds public.subscriptions as Production has it (the columns the app
-- reads, the PayPal and one-current-entitlement unique indexes, RLS with the
-- owner-only read policy), seeds rows, then applies the migration file itself
-- TWICE (idempotency) and checks:
--   'after'     both columns exist, are text and nullable; every seeded row is
--               byte-for-byte unchanged; a duplicate non-null
--               paddle_subscription_id is refused while many NULLs are fine;
--               the PayPal index and the one-current-entitlement index still
--               hold; RLS still shows a user only their own row.
--   'mutated'   MUTATION CONTROL: the paddle index is dropped, so the
--               duplicate insert now succeeds and the uniqueness check FAILS.
--   'restored'  the duplicate is removed, the migration applied again, and
--               uniqueness holds again.
-- NOT run against Supabase or Production; every row is fabricated here.
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_code text,
  status text NOT NULL,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  paypal_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscriptions_paypal_subscription_id_unique ON public.subscriptions (paypal_subscription_id) WHERE paypal_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX subscriptions_one_current_entitlement_per_user ON public.subscriptions (user_id) WHERE status IN ('trial', 'active');
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_select_own ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

INSERT INTO public.subscriptions (id, user_id, plan_code, status, trial_ends_at, current_period_start, current_period_end, paypal_subscription_id, created_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'trial',   'trial',  '2026-10-10', NULL, NULL, NULL, '2026-10-03'),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'premium', 'active', NULL, '2026-09-20', '2026-10-20', 'I-PAYPAL-1', '2026-09-20'),
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'regular', 'cancelled', NULL, '2026-09-01', '2026-10-01', 'I-PAYPAL-2', '2026-09-01');

CREATE TABLE snapshot AS SELECT md5(string_agg(t::text, '|' ORDER BY id)) AS h FROM public.subscriptions t;

\i supabase/migrations/20261003000000_subscriptions_paddle_columns.sql
\i supabase/migrations/20261003000000_subscriptions_paddle_columns.sql

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- Does inserting a second row with an existing paddle id get refused?
CREATE FUNCTION dup_refused() RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    INSERT INTO public.subscriptions (user_id, plan_code, status, paddle_subscription_id) VALUES ('55555555-5555-5555-5555-555555555555', 'regular', 'expired', 'sub_probe_dup');
  EXCEPTION WHEN unique_violation THEN RETURN true; END;
  RETURN false;
END $$;

CREATE FUNCTION as_user(uid text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.subscriptions;
  EXECUTE 'RESET ROLE';
  RETURN n;
END $$;

-- 'after' --------------------------------------------------------------------
SELECT chk('after', 'paddle_subscription_id is text, nullable',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'paddle_subscription_id' AND data_type = 'text' AND is_nullable = 'YES'));
SELECT chk('after', 'paddle_customer_id is text, nullable',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'paddle_customer_id' AND data_type = 'text' AND is_nullable = 'YES'));
SELECT chk('after', 'existing rows unchanged (old columns, byte for byte)',
  (SELECT md5(string_agg((id, user_id, plan_code, status, trial_ends_at, current_period_start, current_period_end, paypal_subscription_id, created_at)::text, '|' ORDER BY id)) FROM public.subscriptions)
  = (SELECT md5(string_agg((id, user_id, plan_code, status, trial_ends_at, current_period_start, current_period_end, paypal_subscription_id, created_at)::text, '|' ORDER BY id))
     FROM (SELECT * FROM (VALUES
       ('a0000000-0000-0000-0000-000000000001'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'trial', 'trial', '2026-10-10'::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::text, '2026-10-03'::timestamptz),
       ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'premium', 'active', NULL, '2026-09-20', '2026-10-20', 'I-PAYPAL-1', '2026-09-20'),
       ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'regular', 'cancelled', NULL, '2026-09-01', '2026-10-01', 'I-PAYPAL-2', '2026-09-01')
     ) v(id, user_id, plan_code, status, trial_ends_at, current_period_start, current_period_end, paypal_subscription_id, created_at)) x));
SELECT chk('after', 'existing rows have NULL paddle columns', NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE paddle_subscription_id IS NOT NULL OR paddle_customer_id IS NOT NULL));
SELECT chk('after', 'row count unchanged', (SELECT count(*) FROM public.subscriptions) = 3);

UPDATE public.subscriptions SET paddle_subscription_id = 'sub_probe_dup', paddle_customer_id = 'ctm_probe_1', status = 'active', plan_code = 'advanced'
  WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT chk('after', 'a Paddle id links to a row', (SELECT paddle_subscription_id FROM public.subscriptions WHERE id = 'a0000000-0000-0000-0000-000000000001') = 'sub_probe_dup');
SELECT chk('after', 'duplicate non-null paddle_subscription_id refused', dup_refused());
INSERT INTO public.subscriptions (user_id, plan_code, status) VALUES ('66666666-6666-6666-6666-666666666666', 'trial', 'trial'), ('77777777-7777-7777-7777-777777777777', 'trial', 'trial');
SELECT chk('after', 'many NULL paddle ids allowed', (SELECT count(*) FROM public.subscriptions WHERE paddle_subscription_id IS NULL) >= 4);
SELECT chk('after', 'paddle index is partial (WHERE NOT NULL) and unique',
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'subscriptions_paddle_subscription_id_unique' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%paddle_subscription_id IS NOT NULL%'));
SELECT chk('after', 'PayPal unique index still present', EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'subscriptions_paypal_subscription_id_unique'));
SELECT chk('after', 'one-current-entitlement index still present', EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'subscriptions_one_current_entitlement_per_user'));
SELECT chk('after', 'RLS unchanged: a user sees only their own row', as_user('22222222-2222-2222-2222-222222222222') = 1);
SELECT chk('after', 'RLS unchanged: a stranger sees nothing', as_user('99999999-9999-9999-9999-999999999999') = 0);
SELECT chk('after', 'no policy added or changed', (SELECT count(*) FROM pg_policies WHERE tablename = 'subscriptions') = 1);

-- 'mutated' (mutation control) -------------------------------------------------
DROP INDEX IF EXISTS public.subscriptions_paddle_subscription_id_unique;
CREATE TABLE mutated_dup AS SELECT dup_refused() AS refused;
INSERT INTO results SELECT 'mutated', 'MUTATION CONTROL: without the index the duplicate is NOT refused (uniqueness check would fail)', NOT refused FROM mutated_dup;

-- 'restored' -------------------------------------------------------------------
DELETE FROM public.subscriptions WHERE user_id = '55555555-5555-5555-5555-555555555555';
\i supabase/migrations/20261003000000_subscriptions_paddle_columns.sql
SELECT chk('restored', 'migration re-applied: duplicate refused again', dup_refused());

SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

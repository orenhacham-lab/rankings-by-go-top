-- ============================================================================
-- EXECUTED PROBE — 20261009180000_affiliate_program.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster carrying Supabase's roles and the default
-- grants every NEW table in public would otherwise get. Then:
--
--   'after'     no browser role reaches any of the five tables — not anon, not
--               another user, not the ADMIN, and above all not the partner
--               whose own rows they are. That last one is the point: the live
--               agreement promises a partner counts and amounts and never a
--               referred customer's identity, and a SELECT policy on
--               affiliate_referrals would hand them referred_user_id.
--               The server reads and writes; nothing but the server does.
--   'mutated'   MUTATION CONTROL. Supabase's default grants are put back, an
--               "own rows" SELECT policy of the kind that looks reasonable is
--               added to every table, and both guard triggers are dropped:
--               every isolation and immutability check must now report the
--               hole. A check that cannot fail tests nothing.
--   'restored'  the migration file is applied again over the broken state.
--               Note it does NOT drop the policies the mutation added — so
--               each restored check that passes proves the GRANT revocation
--               alone is what keeps a partner out, policy or no policy.
--
-- Then the constraints that carry the program's rules: a pending applicant has
-- no code (so no link can leak before a person approved them), an approved
-- partner must have one, a code is URL-safe, an account is referred ONCE, one
-- payment earns ONE commission, a commission's figures and a reversal are
-- final, an issued code is never re-pointed, the hold cannot end before it
-- starts, and the click counter concurrency function counts.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/affiliate-program.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'user');
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- Fixture: partner P (has an account), another user A, admin M, referred customer C.
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin'),
  ('44444444-4444-4444-4444-444444444444', 'user');

\i supabase/migrations/20261009180000_affiliate_program.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261009180000_affiliate_program.sql

SET ROLE service_role;
INSERT INTO public.affiliates (id, code, user_id, status, name, email, website, applied_at, applied_ip, decided_at, decided_by) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'danaseo', '11111111-1111-1111-1111-111111111111', 'approved',
   'Dana Partner', 'dana@example.com', 'https://dana.example', '2026-10-01T09:00:00Z', '203.0.113.9', '2026-10-02T09:00:00Z',
   '33333333-3333-3333-3333-333333333333');
-- A second partner, still pending: no code, so no link exists for them yet.
INSERT INTO public.affiliates (id, status, name, email, applied_at, applied_ip) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'pending', 'Noam Applicant', 'noam@example.com', '2026-10-03T09:00:00Z', '198.51.100.7');
INSERT INTO public.affiliate_referrals (id, affiliate_id, referred_user_id, code, status, billing_source, first_paid_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   '44444444-4444-4444-4444-444444444444', 'danaseo', 'paying', 'paypal', '2026-10-05T09:00:00Z');
INSERT INTO public.affiliate_commissions
  (id, affiliate_id, referral_id, source, external_payment_id, payment_amount, currency, rate, amount, earned_at, releases_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'paypal', 'SALE-1', 249.00, 'ILS', 30, 74.70, '2026-10-05T09:00:00Z', '2026-11-04T09:00:00Z');
INSERT INTO public.affiliate_payouts (id, affiliate_id, amount, currency, status, created_by) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 74.70, 'ILS', 'draft',
   '33333333-3333-3333-3333-333333333333');
SELECT public.affiliate_count_click('a0000000-0000-0000-0000-000000000001', '2026-10-05');
RESET ROLE;

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

CREATE FUNCTION try_as(role_name text, uid text, sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', coalesce(uid, ''), true);
    EXECUTE format('SET LOCAL ROLE %I', role_name);
    EXECUTE sql INTO r;
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback:' || coalesce(r, 'null');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM LIKE 'rollback:%' THEN RETURN 'ok:' || substr(SQLERRM, 10); END IF;
    RETURN 'denied:' || SQLSTATE;
  END;
END; $$;
GRANT EXECUTE ON FUNCTION try_as(text, text, text) TO PUBLIC;
GRANT ALL ON results TO PUBLIC;

CREATE FUNCTION run_checks(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  P text := '11111111-1111-1111-1111-111111111111';
  A text := '22222222-2222-2222-2222-222222222222';
  M text := '33333333-3333-3333-3333-333333333333';
  broken boolean := (ph = 'mutated');
  r text;
BEGIN
  -- REGRESSION, every phase: the server reads what it wrote.
  r := try_as('service_role', NULL, $q$ SELECT code || ':' || status FROM public.affiliates WHERE id = 'a0000000-0000-0000-0000-000000000001' $q$);
  PERFORM chk(ph, 'the server reads a partner -> ' || r, r = 'ok:danaseo:approved');
  r := try_as('service_role', NULL, $q$ SELECT amount::text FROM public.affiliate_commissions WHERE id = 'c0000000-0000-0000-0000-000000000001' $q$);
  PERFORM chk(ph, 'the server reads a commission -> ' || r, r = 'ok:74.70');
  r := try_as('service_role', NULL, $q$ SELECT clicks::text FROM public.affiliate_click_days WHERE affiliate_id = 'a0000000-0000-0000-0000-000000000001' $q$);
  PERFORM chk(ph, 'the server reads the click counter -> ' || r, r = 'ok:1');

  -- THE PROMISE: the partner's own session reaches nothing, above all not the
  -- identity of the customer they referred.
  r := try_as('authenticated', P, $q$ SELECT referred_user_id::text FROM public.affiliate_referrals WHERE affiliate_id = 'a0000000-0000-0000-0000-000000000001' $q$);
  PERFORM chk(ph, 'the partner reads who they referred -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', P, $q$ SELECT count(*)::text FROM public.affiliates WHERE user_id = '11111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'the partner reads their own partner row -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', P, $q$ SELECT count(*)::text FROM public.affiliate_commissions $q$);
  PERFORM chk(ph, 'the partner reads commissions -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', P, $q$ SELECT count(*)::text FROM public.affiliate_payouts $q$);
  PERFORM chk(ph, 'the partner reads payouts -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', P, $q$ SELECT count(*)::text FROM public.affiliate_click_days $q$);
  PERFORM chk(ph, 'the partner reads clicks -> ' || r, (r LIKE 'denied:%') <> broken);

  -- Nobody else either, the admin's browser session included (the admin screens
  -- are server-rendered and read with the service role, like every other one).
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.affiliates $q$);
  PERFORM chk(ph, 'another user reads partners -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM public.affiliate_referrals $q$);
  PERFORM chk(ph, 'the admin browser session reads referrals -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.affiliates $q$);
  PERFORM chk(ph, 'anon reads partners -> ' || r, (r LIKE 'denied:%') <> broken);

  -- No browser role writes: an application arrives through the route, which
  -- rate-limits it and records the address; a commission is never self-served.
  r := try_as('anon', NULL, $q$ WITH i AS (INSERT INTO public.affiliates (name, email) VALUES ('Walk In', 'walk@example.com') RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk(ph, 'anon applies directly into the table -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', P, $q$ WITH u AS (UPDATE public.affiliates SET base_rate = 35 WHERE user_id = '11111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'the partner raises their own rate (30 -> 35) -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', P, $q$ WITH u AS (UPDATE public.affiliate_commissions SET status = 'approved' WHERE id = 'c0000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'the partner approves their own commission -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', P, $q$ WITH i AS (INSERT INTO public.affiliate_referrals (affiliate_id, referred_user_id, code)
      VALUES ('a0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'danaseo') RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk(ph, 'the partner credits themselves an account -> ' || r, (r LIKE 'denied:%') <> broken);

  -- IMMUTABILITY (the guard triggers): figures and evidence do not move.
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.affiliate_commissions SET amount = 999 WHERE id = 'c0000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'the server rewrites a commission amount -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.affiliate_commissions SET affiliate_id = 'a0000000-0000-0000-0000-000000000002' WHERE id = 'c0000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'the server re-points a commission at another partner -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.affiliates SET code = 'someoneelse' WHERE id = 'a0000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'the server re-points an issued code -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.affiliates SET applied_ip = '10.0.0.1' WHERE id = 'a0000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'the server rewrites where an application came from -> ' || r, (r = 'denied:42501') <> broken);

  -- What the server IS allowed to do: decide, release, pay.
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.affiliate_commissions SET status = 'approved', approved_at = now() WHERE id = 'c0000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'the server approves a commission -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.affiliates SET status = 'suspended' WHERE id = 'a0000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'the server suspends a partner (its code keeps resolving) -> ' || r, r = 'ok:1');
END; $$;

SELECT run_checks('after');

-- ── MUTATION CONTROL ────────────────────────────────────────────────────────
-- Put Supabase's default grants back, add the "own rows" policy that looks
-- reasonable and would break the agreement, and drop both guard triggers.
GRANT ALL ON public.affiliates, public.affiliate_click_days, public.affiliate_referrals,
  public.affiliate_commissions, public.affiliate_payouts TO anon, authenticated, service_role;
CREATE POLICY affiliates_own ON public.affiliates FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY referrals_own ON public.affiliate_referrals FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY commissions_own ON public.affiliate_commissions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY payouts_own ON public.affiliate_payouts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY clicks_own ON public.affiliate_click_days FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP TRIGGER affiliate_commissions_guard ON public.affiliate_commissions;
DROP TRIGGER affiliates_guard ON public.affiliates;
SELECT run_checks('mutated');

-- ── RESTORED ────────────────────────────────────────────────────────────────
-- The migration again, over the broken state. The permissive policies above are
-- deliberately LEFT IN PLACE: every check that passes now proves the revoked
-- grants alone keep a partner out.
\i supabase/migrations/20261009180000_affiliate_program.sql
SELECT run_checks('restored');

-- ── The program's rules, as constraints ─────────────────────────────────────
DO $$
DECLARE r text;
BEGIN
  -- A link may not exist before a person approved the application.
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.affiliates (code, status, name, email)
    VALUES ('tooearly', 'pending', 'Too Early', 'early@example.com') RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('constraints', 'a pending applicant with a code is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.affiliates (status, name, email, decided_at)
    VALUES ('approved', 'No Code', 'nocode@example.com', now()) RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('constraints', 'an approved partner without a code is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.affiliates (code, status, name, email, decided_at)
    VALUES ('Dana SEO!', 'approved', 'Bad Code', 'bad@example.com', now()) RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('constraints', 'a code that a link could not carry is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.affiliates (code, status, name, email, decided_at)
    VALUES ('danaseo', 'approved', 'Code Twin', 'twin@example.com', now()) RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('constraints', 'two partners with the same code are rejected -> ' || r, r = 'denied:23505');
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.affiliates (status, name, email, decided_at)
    VALUES ('pending', 'Decided Pending', 'dp@example.com', now()) RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('constraints', 'a pending application that is already decided is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.affiliates (status, name, email, decided_at, base_rate, top_rate)
    VALUES ('approved', 'Upside Down', 'ud@example.com', now(), 40, 30) RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('constraints', 'a top rate below the base rate is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.affiliates (user_id, status, code, name, email, decided_at)
    VALUES ('11111111-1111-1111-1111-111111111111', 'approved', 'secondcode', 'Twice', 'twice@example.com', now()) RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('constraints', 'one account cannot be two partners -> ' || r, r = 'denied:23505');

  -- An account is referred once, for ever.
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.affiliate_referrals (affiliate_id, referred_user_id, code)
    VALUES ('a0000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'danaseo') RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('constraints', 'a second partner claiming an already-referred account is rejected -> ' || r, r = 'denied:23505');

  -- One payment, one commission — the webhook retry case.
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.affiliate_commissions
    (affiliate_id, referral_id, source, external_payment_id, payment_amount, currency, rate, amount, releases_at)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'paypal', 'SALE-1', 249, 'ILS', 30, 74.70, now()) RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('constraints', 'the same payment earning a second commission is rejected -> ' || r, r = 'denied:23505');
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.affiliate_commissions
    (affiliate_id, referral_id, source, external_payment_id, payment_amount, currency, rate, amount, earned_at, releases_at)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'paypal', 'SALE-2', 249, 'ILS', 30, 74.70, now(), now() - interval '1 day') RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('constraints', 'a hold that ends before the payment is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.affiliate_commissions
    (affiliate_id, referral_id, source, external_payment_id, payment_amount, currency, rate, amount, releases_at)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'paypal', 'SALE-3', 100, 'EUR', 30, 30, now()) RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('constraints', 'a currency the program does not pay in is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.affiliate_commissions
    (affiliate_id, referral_id, source, external_payment_id, payment_amount, currency, rate, amount, releases_at, status, paid_at)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'paypal', 'SALE-4', 249, 'ILS', 30, 74.70, now(), 'paid', now()) RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('constraints', 'a commission marked paid with no payout behind it is rejected -> ' || r, r = 'denied:23514');
END $$;

-- A reversal is final.
UPDATE public.affiliate_commissions SET status = 'reversed', reversed_at = now(), reversed_reason = 'refund'
  WHERE id = 'c0000000-0000-0000-0000-000000000001';
DO $$
DECLARE r text;
BEGIN
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.affiliate_commissions SET status = 'approved', reversed_at = NULL
    WHERE id = 'c0000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('constraints', 'a reversed commission being revived is rejected -> ' || r, r = 'denied:42501');
END $$;

-- The click counter: concurrent increments on one day accumulate, and a day is
-- one row per partner.
SELECT public.affiliate_count_click('a0000000-0000-0000-0000-000000000001', '2026-10-05');
SELECT public.affiliate_count_click('a0000000-0000-0000-0000-000000000001', '2026-10-06');
SELECT chk('clicks', 'repeated clicks on one day add up in one row',
  (SELECT clicks FROM public.affiliate_click_days WHERE affiliate_id = 'a0000000-0000-0000-0000-000000000001' AND day = '2026-10-05') = 2);
SELECT chk('clicks', 'a second day is its own row',
  (SELECT count(*) FROM public.affiliate_click_days WHERE affiliate_id = 'a0000000-0000-0000-0000-000000000001') = 2);
SELECT chk('clicks', 'the counter holds no visitor data at all',
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'affiliate_click_days'
     AND column_name NOT IN ('affiliate_id', 'day', 'clicks', 'updated_at')) = 0);

-- Deleting a partner takes their whole tail with them (the one way these rows go).
DELETE FROM public.affiliates WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT chk('cascade', 'the referrals of a deleted partner go with them',
  (SELECT count(*) FROM public.affiliate_referrals) = 0);
SELECT chk('cascade', 'the commissions of a deleted partner go with them',
  (SELECT count(*) FROM public.affiliate_commissions) = 0);
SELECT chk('cascade', 'the payouts of a deleted partner go with them',
  (SELECT count(*) FROM public.affiliate_payouts) = 0);
SELECT chk('cascade', 'the clicks of a deleted partner go with them',
  (SELECT count(*) FROM public.affiliate_click_days) = 0);
SELECT chk('cascade', 'the other partner stays',
  (SELECT count(*) FROM public.affiliates WHERE id = 'a0000000-0000-0000-0000-000000000002') = 1);

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints','clicks','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

-- ============================================================================
-- EXECUTED PROBE — 20261024120000_affiliate_creem_source.sql
--
-- Applies, in a DISPOSABLE PostgreSQL cluster, the migration that created the
-- affiliate programme, then the widening under test TWICE (a re-run must not
-- error).
--
--   'before'   the premise. With only the original migration applied, a
--              commission on a Creem payment is REFUSED by the database, and
--              so is a referral billed through Creem. A probe that cannot
--              show the refusal is not evidence that the widening fixed
--              anything.
--   'after'    'creem' is accepted on both columns, and 'paypal', 'shopify'
--              and 'manual' still are — the partners already on the books
--              must keep earning.
--   'closed'   the lists are still lists: 'marketplace', 'CREEM', '' and
--              'stripe' are refused. The widening must not have degraded into
--              dropping the constraints, which is how a column of free text
--              would pass every check above.
--   'named'    each constraint carries the name the migration addresses, and
--              there is exactly one CHECK over each of the two columns.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/affiliate-creem-source.probe.sql
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

INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin'),
  ('44444444-4444-4444-4444-444444444444', 'user'),
  ('55555555-5555-5555-5555-555555555555', 'user');

\i supabase/migrations/20261009190000_affiliate_program.sql

SET ROLE service_role;
INSERT INTO public.affiliates (id, code, user_id, status, name, email, applied_at, applied_ip, decided_at, decided_by) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'danaseo', '11111111-1111-1111-1111-111111111111', 'approved',
   'Dana Partner', 'dana@example.com', '2026-10-01T09:00:00Z', '203.0.113.9', '2026-10-02T09:00:00Z',
   '33333333-3333-3333-3333-333333333333');
INSERT INTO public.affiliate_referrals (id, affiliate_id, referred_user_id, code, status, billing_source, first_paid_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   '44444444-4444-4444-4444-444444444444', 'danaseo', 'paying', 'paypal', '2026-10-05T09:00:00Z');
RESET ROLE;

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- Can a commission on a payment from this provider be written? Always rolled
-- back, so one answer never affects the next. The external payment id is made
-- unique per call because (source, external_payment_id) is unique by design.
CREATE FUNCTION commission_accepts(src text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.affiliate_commissions
      (affiliate_id, referral_id, source, external_payment_id, payment_amount, currency, rate, amount, earned_at, releases_at)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
              src, 'PAY-' || src, 79.00, 'USD', 30, 23.70, '2026-10-24T09:00:00Z', '2026-11-23T09:00:00Z');
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION
    WHEN raise_exception THEN RETURN true;
    WHEN check_violation THEN RETURN false;
  END;
END; $$;

-- And can a referral say it is billed through this provider?
CREATE FUNCTION referral_accepts(src text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.affiliate_referrals (affiliate_id, referred_user_id, code, status, billing_source)
      VALUES ('a0000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
              'danaseo', 'paying', src);
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION
    WHEN raise_exception THEN RETURN true;
    WHEN check_violation THEN RETURN false;
  END;
END; $$;

-- ── before: the premise ────────────────────────────────────────────────────
SELECT chk('before', 'a commission on a Creem payment is refused', NOT commission_accepts('creem'));
SELECT chk('before', 'a referral billed through Creem is refused', NOT referral_accepts('creem'));
SELECT chk('before', 'the providers already on the books are accepted',
  commission_accepts('paypal') AND commission_accepts('shopify') AND commission_accepts('manual')
  AND referral_accepts('paypal') AND referral_accepts('shopify'));

\i supabase/migrations/20261024120000_affiliate_creem_source.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261024120000_affiliate_creem_source.sql

-- ── after ──────────────────────────────────────────────────────────────────
SELECT chk('after', 'a commission on a Creem payment is accepted', commission_accepts('creem'));
SELECT chk('after', 'a referral billed through Creem is accepted', referral_accepts('creem'));
SELECT chk('after', 'PayPal still earns', commission_accepts('paypal') AND referral_accepts('paypal'));
SELECT chk('after', 'a Shopify referral still writes', commission_accepts('shopify') AND referral_accepts('shopify'));
SELECT chk('after', 'an operator correction still writes', commission_accepts('manual'));
SELECT chk('after', 'billing_source may still be unknown', referral_accepts(NULL));

-- ── closed: still a list, not free text ────────────────────────────────────
SELECT chk('closed', 'a provider we have not wired is refused',
  NOT commission_accepts('stripe') AND NOT referral_accepts('stripe'));
SELECT chk('closed', 'the marketplace layer is not silently a commission source',
  NOT commission_accepts('marketplace'));
SELECT chk('closed', 'the wrong case is refused',
  NOT commission_accepts('CREEM') AND NOT referral_accepts('Creem'));
SELECT chk('closed', 'the empty string is refused',
  NOT commission_accepts('') AND NOT referral_accepts(''));
SELECT chk('closed', 'a referral may not be billed by "manual"', NOT referral_accepts('manual'));

-- ── named ──────────────────────────────────────────────────────────────────
SELECT chk('named', 'affiliate_commissions_source exists',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_commissions_source'));
SELECT chk('named', 'affiliate_referrals_billing_source exists',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_referrals_billing_source'));
SELECT chk('named', 'exactly one CHECK governs the commission source',
  (SELECT count(*) FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'c' AND rel.relname = 'affiliate_commissions'
      AND pg_get_constraintdef(con.oid) LIKE '%source%'
      AND pg_get_constraintdef(con.oid) NOT LIKE '%billing_source%') = 1);
SELECT chk('named', 'exactly one CHECK governs billing_source',
  (SELECT count(*) FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'c' AND rel.relname = 'affiliate_referrals'
      AND pg_get_constraintdef(con.oid) LIKE '%billing_source%') = 1);
-- The rest of the table's rules are untouched: the figures and a reversal are
-- still final (the guard trigger), and the currency list is still closed.
SELECT chk('named', 'the immutability guard is still on the commissions table',
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'affiliate_commissions_guard' AND NOT tgisinternal));
SELECT chk('named', 'the currency list is still closed',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_commissions_currency'));

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;

-- ============================================================================
-- EXECUTED PROBE — 20261113000000_marketplace_test_orders.sql
--
-- Applies, in a DISPOSABLE PostgreSQL cluster, a stand-in for
-- `marketplace_orders` as Production holds it, then the migration under test
-- TWICE: a migration that cannot be applied twice cannot be applied safely.
--
--   'before'     the premise. There is nowhere to say that a receipt came
--                from a platform's own review purchase, which is why the
--                parser had to drop those deliveries instead.
--   'after'      the column exists, every row already on file reads false
--                (they are all live sales), an insert that never mentions the
--                column still works and still reads false, and a row CAN be
--                marked true.
--   'findable'   the whole point of the flag: `where is_test` finds exactly
--                the review purchases and nothing else, which is what makes
--                granting on one removable afterwards.
--   'idempotent' the file applied a second time changes nothing, adds no
--                second column and does not reset a row already marked.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/marketplace-test-orders.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- The shape Production holds before this migration. Only the columns this
-- probe touches are reproduced.
CREATE TABLE public.marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_order_id text NOT NULL,
  external_product_id text,
  plan_code text NOT NULL,
  buyer_email text NOT NULL,
  claim_token text NOT NULL,
  status text NOT NULL DEFAULT 'paid',
  amount_minor integer,
  currency text,
  current_period_end timestamptz,
  claimed_by uuid,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.marketplace_orders (provider, external_order_id, plan_code, buyer_email, claim_token)
VALUES
  ('jvzoo', 'JV-1', 'premium', 'buyer@example.test', 'tok-1'),
  ('digistore24', 'DS-1', 'regular', 'buyer2@example.test', 'tok-2');

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

/* Does this statement succeed? Any error means no. */
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
    WHERE table_schema = 'public' AND table_name = 'marketplace_orders' AND column_name = c
  );
$$;

-- ── before ─────────────────────────────────────────────────────────────────
SELECT chk('before', 'there is nowhere to mark a platform test order', NOT has_column('is_test'));

-- ── the migration ──────────────────────────────────────────────────────────
\i supabase/migrations/20261113000000_marketplace_test_orders.sql

-- ── after ──────────────────────────────────────────────────────────────────
SELECT chk('after', 'the column exists', has_column('is_test'));
SELECT chk('after', 'it is NOT NULL, so no row is ever ambiguous',
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marketplace_orders'
      AND column_name = 'is_test') = 'NO');
SELECT chk('after', 'every pre-existing row reads false, which is what they are',
  (SELECT count(*) FROM public.marketplace_orders WHERE is_test) = 0
  AND (SELECT count(*) FROM public.marketplace_orders) = 2);
SELECT chk('after', 'an insert that never mentions the column still works',
  accepts($$INSERT INTO public.marketplace_orders (provider, external_order_id, plan_code, buyer_email, claim_token)
            VALUES ('digistore24', 'DS-2', 'advanced', 'buyer3@example.test', 'tok-3')$$));
SELECT chk('after', 'and that row reads false',
  (SELECT is_test FROM public.marketplace_orders WHERE external_order_id = 'DS-2') = false);
SELECT chk('after', 'a review purchase can be recorded as one',
  accepts($$INSERT INTO public.marketplace_orders (provider, external_order_id, plan_code, buyer_email, claim_token, is_test)
            VALUES ('digistore24', 'DS-REVIEW', 'regular', 'reviewer@example.test', 'tok-4', true)$$));

-- ── findable ───────────────────────────────────────────────────────────────
SELECT chk('findable', 'the flag finds exactly the review purchase',
  (SELECT array_agg(external_order_id ORDER BY external_order_id)
     FROM public.marketplace_orders WHERE is_test) = ARRAY['DS-REVIEW']);
SELECT chk('findable', 'and leaves every live receipt alone',
  (SELECT count(*) FROM public.marketplace_orders WHERE NOT is_test) = 3);

-- ── idempotent ─────────────────────────────────────────────────────────────
\i supabase/migrations/20261113000000_marketplace_test_orders.sql

SELECT chk('idempotent', 'a second run leaves the marked row marked',
  (SELECT is_test FROM public.marketplace_orders WHERE external_order_id = 'DS-REVIEW') = true);
SELECT chk('idempotent', 'a second run leaves the live rows unmarked',
  (SELECT count(*) FROM public.marketplace_orders WHERE is_test) = 1);
SELECT chk('idempotent', 'one is_test column exists, not two',
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marketplace_orders'
      AND column_name = 'is_test') = 1);

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;

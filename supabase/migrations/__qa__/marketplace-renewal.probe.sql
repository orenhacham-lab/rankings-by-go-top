-- ============================================================================
-- EXECUTED PROBE — 20261109120000_marketplace_renewal.sql
--
-- Applies the real migration file (via \i, twice, for idempotency) over its
-- predecessor in a disposable PostgreSQL cluster carrying Supabase's roles
-- and the default grants a new function in public would otherwise receive.
-- Then:
--
--   'grants'     no browser role may execute the transition, service_role may,
--                it is SECURITY DEFINER, and its search_path is empty — the
--                three properties that make a definer function safe here.
--   'answers'    every state the receipt can be in, and the exact word the
--                function answers: an order nobody recorded, a payload with
--                no period end, a period end that is not later (equal and
--                earlier both), an unclaimed receipt, a claimed one with its
--                entitlement, a claimed one without, and a withdrawn order.
--   'writes'     what moved and what did not: the receipt's period, the
--                entitlement's period and status, and that the plan, the
--                owner and the money are untouched.
--   'mutated'    MUTATION CONTROL. The function is replaced with the naive
--                version — no status refusal and no not-later comparison —
--                and the checks that protect a paying customer must now FAIL.
--   'restored'   the real migration is applied again over the naive function,
--                and they pass again.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/marketplace-renewal.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase's defaults, so revoking is a real test and not a tautology.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.billing_governance (
  user_id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  signup_origin         text NOT NULL DEFAULT 'unknown'
                          CHECK (signup_origin IN ('website', 'shopify_app_store', 'unknown')),
  billing_authority     text NOT NULL DEFAULT 'website'
                          CHECK (billing_authority IN ('website', 'shopify')),
  authority_reason      text,
  authority_changed_at  timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, status text NOT NULL,
  plan_code text, paypal_subscription_id text, creem_subscription_id text, trial_ends_at timestamptz,
  current_period_end timestamptz, current_period_start timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_one_provider_per_row
    CHECK (paypal_subscription_id IS NULL OR creem_subscription_id IS NULL)
);

CREATE TEMP TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

CREATE FUNCTION try_as(role_name text, sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', role_name);
    EXECUTE sql INTO r;
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback:' || coalesce(r, 'null');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM LIKE 'rollback:%' THEN RETURN substr(SQLERRM, 10); END IF;
    RETURN 'denied:' || SQLSTATE;
  END;
END; $$;

\i supabase/migrations/20261016160000_marketplace_orders.sql
\i supabase/migrations/20261109120000_marketplace_renewal.sql
\i supabase/migrations/20261109120000_marketplace_renewal.sql

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com');

-- Three receipts: unclaimed, claimed with an entitlement, claimed without one.
-- `claimed` and an owner are one fact, enforced by
-- marketplace_orders_claim_coherent, so the two claimed rows carry theirs in
-- the same statement rather than in a later UPDATE.
INSERT INTO public.marketplace_orders
  (id, provider, external_order_id, plan_code, buyer_email, claim_token, status, amount_minor, currency, current_period_end, claimed_by, claimed_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'digistore24', 'UNCLAIMED', 'advanced', 'buyer@example.com', repeat('a', 43), 'paid', 17900, 'USD', '2026-11-15T00:00:00Z', NULL, NULL),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'digistore24', 'CLAIMED',   'advanced', 'buyer@example.com', repeat('b', 43), 'claimed', 17900, 'USD', '2026-11-15T00:00:00Z', '11111111-1111-1111-1111-111111111111', now()),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'digistore24', 'ORPHANED',  'advanced', 'buyer@example.com', repeat('c', 43), 'claimed', 17900, 'USD', '2026-11-15T00:00:00Z', '11111111-1111-1111-1111-111111111111', now()),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'digistore24', 'REFUNDED',  'advanced', 'buyer@example.com', repeat('d', 43), 'refunded', 17900, 'USD', '2026-11-15T00:00:00Z', NULL, NULL),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'digistore24', 'CANCELLED', 'advanced', 'buyer@example.com', repeat('e', 43), 'cancelled', 17900, 'USD', '2026-11-15T00:00:00Z', NULL, NULL);

-- The entitlement the CLAIMED receipt paid for, with a period that has
-- already lapsed: exactly the state a renewal has to recover.
INSERT INTO public.subscriptions (user_id, status, plan_code, marketplace_order_id, current_period_end)
VALUES ('11111111-1111-1111-1111-111111111111', 'expired', 'advanced', 'aaaaaaaa-0000-0000-0000-000000000002', '2026-11-15T00:00:00Z');

-- ── grants ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM chk('grants', '1a: anon cannot execute the transition',
    try_as('anon', $q$ SELECT public.renew_marketplace_order('digistore24', 'UNCLAIMED', '2026-12-15T00:00:00Z'::timestamptz) $q$) LIKE 'denied:%');
  PERFORM chk('grants', '1b: nor can an authenticated browser session',
    try_as('authenticated', $q$ SELECT public.renew_marketplace_order('digistore24', 'UNCLAIMED', '2026-12-15T00:00:00Z'::timestamptz) $q$) LIKE 'denied:%');
  PERFORM chk('grants', '1c: the server can',
    try_as('service_role', $q$ SELECT public.renew_marketplace_order('digistore24', 'UNCLAIMED', '2026-12-15T00:00:00Z'::timestamptz) $q$) = 'renewed');
  PERFORM chk('grants', '1d: it is SECURITY DEFINER',
    (SELECT prosecdef FROM pg_proc WHERE proname = 'renew_marketplace_order'));
  PERFORM chk('grants', '1e: with an empty search_path',
    (SELECT pg_catalog.array_to_string(proconfig, ',') IN ('search_path=', 'search_path=""')
       FROM pg_proc WHERE proname = 'renew_marketplace_order'));
END $$;

-- ── answers ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM chk('answers', '2a: an order nobody recorded is reported, not invented',
    public.renew_marketplace_order('digistore24', 'NO-SUCH-ORDER', '2026-12-15T00:00:00Z') = 'order_unknown');
  PERFORM chk('answers', '2b: so is an empty provider or order id',
    public.renew_marketplace_order('', 'UNCLAIMED', '2026-12-15T00:00:00Z') = 'order_unknown'
    AND public.renew_marketplace_order('digistore24', '', '2026-12-15T00:00:00Z') = 'order_unknown');
  PERFORM chk('answers', '2c: a payload with no period end writes nothing',
    public.renew_marketplace_order('digistore24', 'UNCLAIMED', NULL) = 'period_end_unknown');
  PERFORM chk('answers', '2d: the same period end is not news',
    public.renew_marketplace_order('digistore24', 'UNCLAIMED', '2026-11-15T00:00:00Z') = 'already_current');
  PERFORM chk('answers', '2e: an earlier one is refused, so access is never shortened',
    public.renew_marketplace_order('digistore24', 'UNCLAIMED', '2026-10-01T00:00:00Z') = 'already_current');
  PERFORM chk('answers', '2f: a withdrawn order is NOT extended',
    public.renew_marketplace_order('digistore24', 'REFUNDED', '2026-12-15T00:00:00Z') = 'not_renewable'
    AND public.renew_marketplace_order('digistore24', 'CANCELLED', '2026-12-15T00:00:00Z') = 'not_renewable');
  PERFORM chk('answers', '2g: an unclaimed receipt renews on its own',
    public.renew_marketplace_order('digistore24', 'UNCLAIMED', '2026-12-15T00:00:00Z') = 'renewed');
  PERFORM chk('answers', '2h: a claimed one renews with its entitlement',
    public.renew_marketplace_order('digistore24', 'CLAIMED', '2026-12-15T00:00:00Z') = 'renewed');
  PERFORM chk('answers', '2i: a claimed receipt with no entitlement goes to a person',
    public.renew_marketplace_order('digistore24', 'ORPHANED', '2026-12-15T00:00:00Z') = 'entitlement_missing');
END $$;

-- ── writes ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM chk('writes', '3a: the receipt now runs to the renewed period',
    (SELECT current_period_end FROM public.marketplace_orders WHERE external_order_id = 'CLAIMED') = '2026-12-15T00:00:00Z');
  PERFORM chk('writes', '3b: and so does the entitlement it paid for',
    (SELECT current_period_end FROM public.subscriptions WHERE marketplace_order_id = 'aaaaaaaa-0000-0000-0000-000000000002') = '2026-12-15T00:00:00Z');
  PERFORM chk('writes', '3c: an entitlement whose period had lapsed is active again',
    (SELECT status FROM public.subscriptions WHERE marketplace_order_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 'active');
  PERFORM chk('writes', '3d: the plan is untouched, because an upgrade is another event',
    (SELECT plan_code FROM public.subscriptions WHERE marketplace_order_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 'advanced');
  PERFORM chk('writes', '3e: the owner and the money are untouched',
    (SELECT claimed_by FROM public.marketplace_orders WHERE external_order_id = 'CLAIMED') = '11111111-1111-1111-1111-111111111111'
    AND (SELECT amount_minor FROM public.marketplace_orders WHERE external_order_id = 'CLAIMED') = 17900);
  PERFORM chk('writes', '3f: a refused renewal left the withdrawn order where it was',
    (SELECT current_period_end FROM public.marketplace_orders WHERE external_order_id = 'REFUNDED') = '2026-11-15T00:00:00Z');
  PERFORM chk('writes', '3g: the orphaned receipt was not extended either',
    (SELECT current_period_end FROM public.marketplace_orders WHERE external_order_id = 'ORPHANED') = '2026-11-15T00:00:00Z');
END $$;

-- ── mutated: the naive function, which is the bug this migration prevents ───
CREATE OR REPLACE FUNCTION public.renew_marketplace_order(
  p_provider text, p_external_order_id text, p_period_end timestamptz
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.marketplace_orders
     SET current_period_end = p_period_end
   WHERE provider = p_provider AND external_order_id = p_external_order_id;
  RETURN 'renewed';
END; $$;

DO $$
BEGIN
  PERFORM chk('mutated', '4a: the naive version extends a REFUNDED order',
    public.renew_marketplace_order('digistore24', 'REFUNDED', '2027-01-15T00:00:00Z') = 'not_renewable');
  PERFORM chk('mutated', '4b: and it shortens paid access on an out-of-order delivery',
    public.renew_marketplace_order('digistore24', 'UNCLAIMED', '2026-10-01T00:00:00Z') = 'already_current');
  PERFORM chk('mutated', '4c: and it leaves the entitlement behind',
    public.renew_marketplace_order('digistore24', 'ORPHANED', '2027-01-15T00:00:00Z') = 'entitlement_missing');
END $$;

-- ── restored ────────────────────────────────────────────────────────────────
\i supabase/migrations/20261109120000_marketplace_renewal.sql

DO $$
BEGIN
  PERFORM chk('restored', '5a: a withdrawn order is refused again',
    public.renew_marketplace_order('digistore24', 'REFUNDED', '2027-02-15T00:00:00Z') = 'not_renewable');
  PERFORM chk('restored', '5b: an earlier period end is refused again',
    public.renew_marketplace_order('digistore24', 'UNCLAIMED', '2026-09-01T00:00:00Z') = 'already_current');
  PERFORM chk('restored', '5c: a claimed receipt with no entitlement is reported again',
    public.renew_marketplace_order('digistore24', 'ORPHANED', '2027-02-15T00:00:00Z') = 'entitlement_missing');
END $$;

\set QUIET off
SELECT phase, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result FROM results ORDER BY phase, name;
SELECT count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed,
       -- The mutation phase must fail every one of its checks.
       count(*) FILTER (WHERE phase = 'mutated' AND ok) AS mutation_control_broken
  FROM results;

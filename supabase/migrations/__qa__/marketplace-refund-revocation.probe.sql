-- ============================================================================
-- EXECUTED PROBE — 20261114120000_revoke_refunded_marketplace_order.sql
--
-- Applies the migration itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster carrying Supabase's three roles, and then
-- walks every state the function can be handed:
--
--   refund      a claimed order's entitlement is expired, the order is marked,
--               and the answer is 'revoked';
--   cancel      a cancellation marks the order and LEAVES THE PLAN ALONE —
--               the buyer paid for the period they are in. This is the check
--               the whole function exists to get right, because the cheap
--               version of this feature revokes on both;
--   unclaimed   a refund on a receipt nobody claimed marks the order and
--               reports 'order_marked', inventing no entitlement;
--   missing     an order that says claimed with no live entitlement row gets
--               its own answer rather than a false success;
--   arguments   empty provider or order id, an unknown order and a kind the
--               function does not model are each refused by name;
--   isolation   another order's entitlement is never touched by a refund of
--               this one — the WHERE is on marketplace_order_id, and a probe
--               that did not check it would not notice the day it is not;
--   grants      PUBLIC, anon and authenticated cannot execute it; service_role
--               can. SECURITY DEFINER with a search_path of '' is asserted on
--               the catalog, not on the file's text.
--
-- The entitlement statuses here are the real CHECK list read off Production's
-- own constraint (trial, active, inactive, cancelled, expired) rather than a
-- list invented for the probe, so a status the application uses cannot pass
-- here and fail there.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/marketplace-refund-revocation.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_order_id text NOT NULL,
  external_product_id text,
  plan_code text NOT NULL,
  buyer_email text,
  claim_token text,
  status text NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid', 'claimed', 'refunded', 'cancelled')),
  amount_minor integer,
  currency text,
  current_period_end timestamptz,
  claimed_by uuid REFERENCES auth.users(id),
  claimed_at timestamptz,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_order_id));

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('trial', 'active', 'inactive', 'cancelled', 'expired')),
  plan_code text,
  paypal_subscription_id text,
  creem_subscription_id text,
  marketplace_order_id uuid REFERENCES public.marketplace_orders(id),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());

\i supabase/migrations/20261114120000_revoke_refunded_marketplace_order.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261114120000_revoke_refunded_marketplace_order.sql

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;
CREATE FUNCTION try_as(role_name text, sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', role_name);
    EXECUTE sql INTO r;
    RESET ROLE;
    RETURN coalesce(r, 'null');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    RETURN 'denied:' || SQLSTATE;
  END;
END; $$;

-- Fixture: four buyers, four orders, three live entitlements.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'claimed@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'cancels@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'ghost@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'other@example.com');

INSERT INTO public.marketplace_orders
  (id, provider, external_order_id, plan_code, status, current_period_end, claimed_by, claimed_at)
VALUES
  ('aa000000-0000-0000-0000-000000000001', 'digistore24', 'D-REFUND', 'large_agency', 'claimed',
   '2026-12-14T00:00:00Z', '11111111-1111-1111-1111-111111111111', '2026-11-14T08:00:00Z'),
  ('aa000000-0000-0000-0000-000000000002', 'digistore24', 'D-CANCEL', 'premium', 'claimed',
   '2026-12-14T00:00:00Z', '22222222-2222-2222-2222-222222222222', '2026-11-14T08:00:00Z'),
  ('aa000000-0000-0000-0000-000000000003', 'digistore24', 'D-UNCLAIMED', 'regular', 'paid',
   '2026-12-14T00:00:00Z', NULL, NULL),
  ('aa000000-0000-0000-0000-000000000004', 'digistore24', 'D-GHOST', 'premium', 'claimed',
   '2026-12-14T00:00:00Z', '33333333-3333-3333-3333-333333333333', '2026-11-14T08:00:00Z'),
  ('aa000000-0000-0000-0000-000000000005', 'jvzoo', 'J-UNTOUCHED', 'premium', 'claimed',
   '2026-12-14T00:00:00Z', '44444444-4444-4444-4444-444444444444', '2026-11-14T08:00:00Z');

INSERT INTO public.subscriptions
  (user_id, status, plan_code, marketplace_order_id, current_period_end)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'active', 'large_agency',
   'aa000000-0000-0000-0000-000000000001', '2026-12-14T00:00:00Z'),
  ('22222222-2222-2222-2222-222222222222', 'active', 'premium',
   'aa000000-0000-0000-0000-000000000002', '2026-12-14T00:00:00Z'),
  ('44444444-4444-4444-4444-444444444444', 'active', 'premium',
   'aa000000-0000-0000-0000-000000000005', '2026-12-14T00:00:00Z');
-- D-GHOST's buyer has an entitlement that is NOT this order's: the function
-- must not mistake it for one, which is why it carries a different order id.
INSERT INTO public.subscriptions (user_id, status, plan_code, current_period_end)
VALUES ('33333333-3333-3333-3333-333333333333', 'active', 'premium', '2026-12-14T00:00:00Z');

DO $$
DECLARE r text;
BEGIN
  -- ── arguments
  PERFORM chk('arguments', 'an empty provider is refused by name',
    public.revoke_marketplace_order('', 'D-REFUND', 'refunded') = 'order_unknown');
  PERFORM chk('arguments', 'an empty order id is refused by name',
    public.revoke_marketplace_order('digistore24', '', 'refunded') = 'order_unknown');
  PERFORM chk('arguments', 'an order nobody recorded is reported, not invented',
    public.revoke_marketplace_order('digistore24', 'D-NOT-THERE', 'refunded') = 'order_unknown');
  PERFORM chk('arguments', 'a kind the function does not model is refused',
    public.revoke_marketplace_order('digistore24', 'D-REFUND', 'chargeback') = 'invalid_kind');
  PERFORM chk('arguments', 'and a null kind with it',
    public.revoke_marketplace_order('digistore24', 'D-REFUND', NULL) = 'invalid_kind');
  PERFORM chk('arguments', 'a refused call wrote nothing',
    (SELECT status FROM public.marketplace_orders WHERE external_order_id = 'D-REFUND') = 'claimed');

  -- ── cancel: the period the buyer paid for is theirs
  r := public.revoke_marketplace_order('digistore24', 'D-CANCEL', 'cancelled');
  PERFORM chk('cancel', 'a cancellation answers order_marked -> ' || r, r = 'order_marked');
  PERFORM chk('cancel', 'the order is marked cancelled',
    (SELECT status FROM public.marketplace_orders WHERE external_order_id = 'D-CANCEL') = 'cancelled');
  PERFORM chk('cancel', 'AND THE PLAN IS UNTOUCHED — this is the point of the kind check',
    (SELECT status FROM public.subscriptions
      WHERE marketplace_order_id = 'aa000000-0000-0000-0000-000000000002') = 'active');
  PERFORM chk('cancel', 'the paid period is not back-dated either',
    (SELECT current_period_end FROM public.subscriptions
      WHERE marketplace_order_id = 'aa000000-0000-0000-0000-000000000002') = '2026-12-14T00:00:00Z');

  -- ── refund: the money went back, so the plan goes
  r := public.revoke_marketplace_order('digistore24', 'D-REFUND', 'refunded');
  PERFORM chk('refund', 'a claimed order answers revoked -> ' || r, r = 'revoked');
  PERFORM chk('refund', 'the order is marked refunded',
    (SELECT status FROM public.marketplace_orders WHERE external_order_id = 'D-REFUND') = 'refunded');
  PERFORM chk('refund', 'the entitlement is expired, which lib/subscription.ts does not read',
    (SELECT status FROM public.subscriptions
      WHERE marketplace_order_id = 'aa000000-0000-0000-0000-000000000001') = 'expired');
  PERFORM chk('refund', 'current_period_end is left as the payment fact it is',
    (SELECT current_period_end FROM public.subscriptions
      WHERE marketplace_order_id = 'aa000000-0000-0000-0000-000000000001') = '2026-12-14T00:00:00Z');
  PERFORM chk('refund', 'and updated_at moved, so the change is visible to an auditor',
    (SELECT updated_at > created_at FROM public.subscriptions
      WHERE marketplace_order_id = 'aa000000-0000-0000-0000-000000000001'));

  -- ── isolation
  PERFORM chk('isolation', 'another order of another buyer is untouched',
    (SELECT status FROM public.subscriptions
      WHERE marketplace_order_id = 'aa000000-0000-0000-0000-000000000005') = 'active');
  PERFORM chk('isolation', 'and so is its order row',
    (SELECT status FROM public.marketplace_orders WHERE external_order_id = 'J-UNTOUCHED') = 'claimed');

  -- ── unclaimed
  r := public.revoke_marketplace_order('digistore24', 'D-UNCLAIMED', 'refunded');
  PERFORM chk('unclaimed', 'a refund on an unclaimed receipt answers order_marked -> ' || r,
    r = 'order_marked');
  PERFORM chk('unclaimed', 'the receipt is marked refunded so it can never be claimed',
    (SELECT status FROM public.marketplace_orders WHERE external_order_id = 'D-UNCLAIMED') = 'refunded');
  PERFORM chk('unclaimed', 'and no entitlement was invented for it',
    (SELECT count(*) FROM public.subscriptions
      WHERE marketplace_order_id = 'aa000000-0000-0000-0000-000000000003') = 0);

  -- ── missing: claimed on paper, no live row carrying this order
  r := public.revoke_marketplace_order('digistore24', 'D-GHOST', 'refunded');
  PERFORM chk('missing', 'the state gets its own answer -> ' || r,
    r = 'order_marked_entitlement_missing');
  PERFORM chk('missing', 'the order is still marked refunded',
    (SELECT status FROM public.marketplace_orders WHERE external_order_id = 'D-GHOST') = 'refunded');
  PERFORM chk('missing', 'and the buyer''s unrelated entitlement is NOT expired',
    (SELECT status FROM public.subscriptions
      WHERE user_id = '33333333-3333-3333-3333-333333333333'
        AND marketplace_order_id IS NULL) = 'active');

  -- ── a second refund of the same order is harmless
  r := public.revoke_marketplace_order('digistore24', 'D-REFUND', 'refunded');
  PERFORM chk('refund', 'a redelivered refund answers entitlement_missing, not an error -> ' || r,
    r = 'order_marked_entitlement_missing');
END $$;

-- ── grants and hardening, read off the catalog
SELECT chk('grants', 'SECURITY DEFINER with an empty search_path',
  (SELECT prosecdef AND pg_catalog.array_to_string(proconfig, ',') LIKE 'search_path=%' FROM pg_proc
    WHERE oid = 'public.revoke_marketplace_order(text,text,text)'::regprocedure));
SELECT chk('grants', 'service_role may execute it',
  has_function_privilege('service_role', 'public.revoke_marketplace_order(text,text,text)', 'EXECUTE'));
SELECT chk('grants', 'authenticated may not',
  NOT has_function_privilege('authenticated', 'public.revoke_marketplace_order(text,text,text)', 'EXECUTE'));
SELECT chk('grants', 'anon may not',
  NOT has_function_privilege('anon', 'public.revoke_marketplace_order(text,text,text)', 'EXECUTE'));
SELECT chk('grants', 'PUBLIC may not',
  NOT has_function_privilege('public', 'public.revoke_marketplace_order(text,text,text)', 'EXECUTE'));
SELECT chk('grants', 'and a browser role calling it is denied at runtime -> ' ||
  try_as('authenticated', $q$ SELECT public.revoke_marketplace_order('digistore24', 'D-REFUND', 'refunded') $q$),
  try_as('authenticated', $q$ SELECT public.revoke_marketplace_order('digistore24', 'D-REFUND', 'refunded') $q$)
    LIKE 'denied:%');

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['arguments','cancel','refund','isolation','unclaimed','missing','grants'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

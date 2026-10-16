-- ============================================================================
-- EXECUTED PROBE — 20261016160000_marketplace_orders.sql
--
-- Applies the real migration file (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster that carries Supabase's roles and the default
-- grants a NEW table in public would otherwise receive. Then:
--
--   'after'        no browser role reaches marketplace_orders — not anon, not
--                  an authenticated user, not the buyer whose own receipt it
--                  is. An order says what somebody paid, when, and on which
--                  platform; the server reads it and nothing else does. Also
--                  that service_role was granted read/insert/update and NOT
--                  delete, because nothing in the application deletes an
--                  order.
--   'mutated'      MUTATION CONTROL. Supabase's default grants are put back,
--                  an "own rows" SELECT policy of the sort that looks
--                  reasonable is added, and the guard trigger is dropped.
--                  Every isolation and immutability check must now FAIL. A
--                  check that cannot fail tests nothing.
--   'restored'     the migration is applied again over the broken state. It
--                  does NOT drop the policy the mutation added, so each
--                  restored check that passes proves the revoked grant alone
--                  is what keeps a browser out, policy or no policy.
--   'constraints'  the rules the layer depends on: one purchase on one
--                  platform is one row, a claim is coherent, a claim is
--                  final, a claimed order cannot go back to paid, identity
--                  columns are immutable, an unregistered-looking provider
--                  slug and a non-lowercase email are refused.
--   'governance'   billing_governance now accepts 'marketplace' for the
--                  authority and the origin, and still refuses a value
--                  neither this migration nor its predecessor named.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/marketplace-orders.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase's defaults: every new table in public is granted to all three
-- roles. The migration has to take that away again, and this is what makes
-- the 'after' phase a real test rather than a tautology.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- The predecessor table this migration widens, created exactly as
-- 20260901000000_billing_governance.sql creates it: inline, UNNAMED checks,
-- so the DROP CONSTRAINT IF EXISTS of the auto-generated name is exercised
-- for real rather than against a name we chose here.
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

-- The subscriptions table as it stands after the Creem migration: the two
-- provider columns and the CHECK that keeps them mutually exclusive. The new
-- migration has to widen that CHECK without losing it.
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

-- Runs `sql` as `role_name` (optionally as user `uid`) and ALWAYS rolls back,
-- returning either the scalar result or 'denied:<sqlstate>'.
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
    IF SQLERRM LIKE 'rollback:%' THEN RETURN substr(SQLERRM, 10); END IF;
    RETURN 'denied:' || SQLSTATE;
  END;
END; $$;

-- Did this statement fail? Used for the constraint phase, where the
-- expectation is a refusal.
CREATE FUNCTION refused(sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN RETURN true;
  END;
  RETURN false;
END; $$;

\i supabase/migrations/20261016160000_marketplace_orders.sql
\i supabase/migrations/20261016160000_marketplace_orders.sql

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.com');

INSERT INTO public.marketplace_orders
  (provider, external_order_id, external_product_id, plan_code, buyer_email, claim_token, amount_minor, currency)
VALUES
  ('digistore24', 'ORD-1', 'PROD-A', 'advanced', 'buyer@example.com', repeat('a', 43), 17900, 'USD');

-- ── after: the grants the migration leaves behind ───────────────────────────
DO $$
DECLARE sel text; ins text;
BEGIN
  PERFORM chk('after', '1a: RLS is enabled',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.marketplace_orders'::regclass));
  PERFORM chk('after', '1b: and carries no policy at all',
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'marketplace_orders') = 0);

  sel := try_as('anon', NULL, 'SELECT count(*)::text FROM public.marketplace_orders');
  PERFORM chk('after', '2a: anon cannot read an order', sel LIKE 'denied:%');
  sel := try_as('authenticated', '11111111-1111-1111-1111-111111111111',
                'SELECT count(*)::text FROM public.marketplace_orders');
  PERFORM chk('after', '2b: the BUYER cannot read their own receipt either', sel LIKE 'denied:%');
  ins := try_as('authenticated', '22222222-2222-2222-2222-222222222222',
                'INSERT INTO public.marketplace_orders (provider, external_order_id, plan_code, buyer_email, claim_token) '
                'VALUES (''digistore24'', ''FORGED'', ''large_agency'', ''other@example.com'', ' || quote_literal(repeat('b', 43)) || ') RETURNING id::text');
  PERFORM chk('after', '2c: and cannot forge one', ins LIKE 'denied:%');

  PERFORM chk('after', '3a: service_role may read',
    has_table_privilege('service_role', 'public.marketplace_orders', 'SELECT'));
  PERFORM chk('after', '3b: service_role may insert',
    has_table_privilege('service_role', 'public.marketplace_orders', 'INSERT'));
  PERFORM chk('after', '3c: service_role may update',
    has_table_privilege('service_role', 'public.marketplace_orders', 'UPDATE'));
  PERFORM chk('after', '3d: and may NOT delete',
    NOT has_table_privilege('service_role', 'public.marketplace_orders', 'DELETE'));
  PERFORM chk('after', '3e: the guard trigger exists',
    (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.marketplace_orders'::regclass
       AND tgname = 'trg_marketplace_orders_guard') = 1);
END $$;

-- ── mutated: break it on purpose; every check above must now fail ───────────
GRANT ALL ON TABLE public.marketplace_orders TO anon, authenticated, service_role;
CREATE POLICY own_rows ON public.marketplace_orders FOR SELECT TO authenticated
  USING (claimed_by = auth.uid() OR buyer_email = 'buyer@example.com');
DROP TRIGGER trg_marketplace_orders_guard ON public.marketplace_orders;

DO $$
DECLARE sel text; upd boolean;
BEGIN
  sel := try_as('anon', NULL, 'SELECT count(*)::text FROM public.marketplace_orders');
  PERFORM chk('mutated', '4a: anon now reads (control)', sel NOT LIKE 'denied:%');
  sel := try_as('authenticated', '11111111-1111-1111-1111-111111111111',
                'SELECT count(*)::text FROM public.marketplace_orders');
  PERFORM chk('mutated', '4b: the buyer now reads (control)', sel NOT LIKE 'denied:%');
  PERFORM chk('mutated', '4c: service_role now deletes (control)',
    has_table_privilege('service_role', 'public.marketplace_orders', 'DELETE'));

  UPDATE public.marketplace_orders
     SET status = 'claimed', claimed_by = '11111111-1111-1111-1111-111111111111', claimed_at = now()
   WHERE provider = 'digistore24';
  upd := refused(
    'UPDATE public.marketplace_orders SET claimed_by = ''22222222-2222-2222-2222-222222222222'' '
    'WHERE provider = ''digistore24''');
  PERFORM chk('mutated', '4d: without the trigger an order can be moved to another owner (control)', NOT upd);
END $$;

-- Put the order back to an unclaimed state so 'restored' starts clean.
UPDATE public.marketplace_orders
   SET status = 'paid', claimed_by = NULL, claimed_at = NULL
 WHERE provider = 'digistore24';

-- ── restored: the migration repairs it, policy and all ──────────────────────
\i supabase/migrations/20261016160000_marketplace_orders.sql

DO $$
DECLARE sel text;
BEGIN
  PERFORM chk('restored', '5a: the "own rows" policy is still there',
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
       AND tablename = 'marketplace_orders' AND policyname = 'own_rows') = 1);
  sel := try_as('authenticated', '11111111-1111-1111-1111-111111111111',
                'SELECT count(*)::text FROM public.marketplace_orders');
  PERFORM chk('restored', '5b: and the buyer STILL cannot read — the grant is what matters', sel LIKE 'denied:%');
  sel := try_as('anon', NULL, 'SELECT count(*)::text FROM public.marketplace_orders');
  PERFORM chk('restored', '5c: anon is shut out again', sel LIKE 'denied:%');
  PERFORM chk('restored', '5d: service_role cannot delete again',
    NOT has_table_privilege('service_role', 'public.marketplace_orders', 'DELETE'));
  PERFORM chk('restored', '5e: the guard trigger is back',
    (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.marketplace_orders'::regclass
       AND tgname = 'trg_marketplace_orders_guard') = 1);
END $$;

-- ── constraints: the rules the application leans on ─────────────────────────
DO $$
BEGIN
  PERFORM chk('constraints', '6a: the same purchase cannot be recorded twice',
    refused('INSERT INTO public.marketplace_orders (provider, external_order_id, plan_code, buyer_email, claim_token) '
            'VALUES (''digistore24'', ''ORD-1'', ''regular'', ''buyer@example.com'', ' || quote_literal(repeat('c', 43)) || ')'));
  PERFORM chk('constraints', '6b: the same order id on ANOTHER platform is a different purchase',
    NOT refused('INSERT INTO public.marketplace_orders (provider, external_order_id, plan_code, buyer_email, claim_token) '
            'VALUES (''clickbank'', ''ORD-1'', ''regular'', ''buyer@example.com'', ' || quote_literal(repeat('d', 43)) || ')'));
  PERFORM chk('constraints', '6c: a provider slug with spaces or capitals is refused',
    refused('INSERT INTO public.marketplace_orders (provider, external_order_id, plan_code, buyer_email, claim_token) '
            'VALUES (''Not A Slug'', ''ORD-9'', ''regular'', ''buyer@example.com'', ' || quote_literal(repeat('e', 43)) || ')'));
  PERFORM chk('constraints', '6d: an unknown plan is refused',
    refused('INSERT INTO public.marketplace_orders (provider, external_order_id, plan_code, buyer_email, claim_token) '
            'VALUES (''digistore24'', ''ORD-10'', ''enterprise'', ''buyer@example.com'', ' || quote_literal(repeat('f', 43)) || ')'));
  PERFORM chk('constraints', '6e: an email that was not lower-cased is refused',
    refused('INSERT INTO public.marketplace_orders (provider, external_order_id, plan_code, buyer_email, claim_token) '
            'VALUES (''digistore24'', ''ORD-11'', ''regular'', ''Buyer@Example.com'', ' || quote_literal(repeat('g', 43)) || ')'));
  PERFORM chk('constraints', '6f: a short claim token is refused',
    refused('INSERT INTO public.marketplace_orders (provider, external_order_id, plan_code, buyer_email, claim_token) '
            'VALUES (''digistore24'', ''ORD-12'', ''regular'', ''buyer@example.com'', ''tooshort'')'));
  PERFORM chk('constraints', '6g: two orders cannot share a claim token',
    refused('INSERT INTO public.marketplace_orders (provider, external_order_id, plan_code, buyer_email, claim_token) '
            'VALUES (''digistore24'', ''ORD-13'', ''regular'', ''buyer@example.com'', ' || quote_literal(repeat('a', 43)) || ')'));

  -- 'claimed' and an owner are one fact.
  PERFORM chk('constraints', '7a: claimed without an owner is refused',
    refused('UPDATE public.marketplace_orders SET status = ''claimed'' WHERE provider = ''digistore24'''));
  PERFORM chk('constraints', '7b: an owner without the claimed status is refused',
    refused('UPDATE public.marketplace_orders SET claimed_by = ''11111111-1111-1111-1111-111111111111'', '
            'claimed_at = now() WHERE provider = ''digistore24'''));
  PERFORM chk('constraints', '7c: a coherent claim is accepted',
    NOT refused('UPDATE public.marketplace_orders SET status = ''claimed'', '
            'claimed_by = ''11111111-1111-1111-1111-111111111111'', claimed_at = now() '
            'WHERE provider = ''digistore24'''));

  -- …and then it is final.
  PERFORM chk('constraints', '8a: the owner cannot be changed',
    refused('UPDATE public.marketplace_orders SET claimed_by = ''22222222-2222-2222-2222-222222222222'' '
            'WHERE provider = ''digistore24'''));
  PERFORM chk('constraints', '8b: the claim time cannot be rewritten',
    refused('UPDATE public.marketplace_orders SET claimed_at = now() + interval ''1 day'' '
            'WHERE provider = ''digistore24'''));
  PERFORM chk('constraints', '8c: a claimed order cannot return to paid',
    refused('UPDATE public.marketplace_orders SET status = ''paid'', claimed_by = NULL, claimed_at = NULL '
            'WHERE provider = ''digistore24'''));
  PERFORM chk('constraints', '8d: the claim token is immutable',
    refused('UPDATE public.marketplace_orders SET claim_token = ' || quote_literal(repeat('z', 43)) ||
            ' WHERE provider = ''digistore24'''));
  PERFORM chk('constraints', '8e: the provider is immutable',
    refused('UPDATE public.marketplace_orders SET provider = ''clickbank'' WHERE provider = ''digistore24'''));
  PERFORM chk('constraints', '8f: a refund IS recordable after the claim',
    NOT refused('UPDATE public.marketplace_orders SET status = ''refunded'' WHERE provider = ''digistore24'''));
  PERFORM chk('constraints', '8g: and the refunded order KEEPS its owner, who still has the entitlement',
    (SELECT claimed_by FROM public.marketplace_orders WHERE provider = 'digistore24')
      = '11111111-1111-1111-1111-111111111111');
  PERFORM chk('constraints', '8h: an unclaimed order cannot be refunded into an owner',
    refused('UPDATE public.marketplace_orders SET status = ''refunded'', '
            'claimed_by = ''22222222-2222-2222-2222-222222222222'' WHERE provider = ''clickbank'''));
END $$;

-- ── governance: one more authority, and still a closed world ────────────────
DO $$
BEGIN
  INSERT INTO public.billing_governance (user_id, signup_origin, billing_authority)
    VALUES ('11111111-1111-1111-1111-111111111111', 'marketplace', 'marketplace');
  PERFORM chk('governance', '9a: a marketplace-billed account can be recorded',
    (SELECT billing_authority FROM public.billing_governance
      WHERE user_id = '11111111-1111-1111-1111-111111111111') = 'marketplace');
  PERFORM chk('governance', '9b: website and shopify still fit',
    NOT refused('INSERT INTO public.billing_governance (user_id, signup_origin, billing_authority) '
            'VALUES (''22222222-2222-2222-2222-222222222222'', ''shopify_app_store'', ''shopify'')'));
  PERFORM chk('governance', '9c: an authority nobody named is still refused',
    refused('UPDATE public.billing_governance SET billing_authority = ''jvzoo'' '
            'WHERE user_id = ''11111111-1111-1111-1111-111111111111'''));
  PERFORM chk('governance', '9d: so is an invented origin',
    refused('UPDATE public.billing_governance SET signup_origin = ''affiliate'' '
            'WHERE user_id = ''11111111-1111-1111-1111-111111111111'''));
END $$;

-- ── subscriptions: a third provider, still mutually exclusive ──────────────
DO $$
DECLARE oid_order uuid; oid_order2 uuid;
BEGIN
  SELECT id INTO oid_order FROM public.marketplace_orders WHERE provider = 'digistore24';
  SELECT id INTO oid_order2 FROM public.marketplace_orders WHERE provider = 'clickbank';
  PERFORM chk('subscriptions', '10a: a marketplace-billed row is accepted',
    NOT refused('INSERT INTO public.subscriptions (user_id, status, plan_code, marketplace_order_id) '
            'VALUES (''11111111-1111-1111-1111-111111111111'', ''active'', ''advanced'', ' || quote_literal(oid_order) || ')'));
  PERFORM chk('subscriptions', '10b: one order pays for ONE entitlement',
    refused('INSERT INTO public.subscriptions (user_id, status, plan_code, marketplace_order_id) '
            'VALUES (''22222222-2222-2222-2222-222222222222'', ''active'', ''advanced'', ' || quote_literal(oid_order) || ')'));
  PERFORM chk('subscriptions', '10c: a row carrying a marketplace order AND a PayPal id is refused',
    refused('INSERT INTO public.subscriptions (user_id, status, plan_code, marketplace_order_id, paypal_subscription_id) '
            'VALUES (''22222222-2222-2222-2222-222222222222'', ''active'', ''advanced'', ' || quote_literal(oid_order2) || ', ''I-PAYPAL'')'));
  PERFORM chk('subscriptions', '10d: a marketplace order AND a Creem id is refused too',
    refused('INSERT INTO public.subscriptions (user_id, status, plan_code, marketplace_order_id, creem_subscription_id) '
            'VALUES (''22222222-2222-2222-2222-222222222222'', ''active'', ''advanced'', ' || quote_literal(oid_order2) || ', ''sub_CREEM'')'));
  PERFORM chk('subscriptions', '10e: and the OLD pair is still refused — widening did not lose the constraint',
    refused('INSERT INTO public.subscriptions (user_id, status, plan_code, paypal_subscription_id, creem_subscription_id) '
            'VALUES (''22222222-2222-2222-2222-222222222222'', ''active'', ''advanced'', ''I-PAYPAL2'', ''sub_CREEM2'')'));
  PERFORM chk('subscriptions', '10f: a PayPal-only row is still perfectly fine',
    NOT refused('INSERT INTO public.subscriptions (user_id, status, plan_code, paypal_subscription_id) '
            'VALUES (''22222222-2222-2222-2222-222222222222'', ''active'', ''regular'', ''I-PAYPAL3'')'));
END $$;

-- ── claim: the atomic transition ────────────────────────────────────────────
-- A fresh order and two fresh accounts, so this phase does not depend on what
-- the constraint phase left behind.
INSERT INTO auth.users (id, email) VALUES
  ('33333333-3333-3333-3333-333333333333', 'claimer@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'trialer@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'noperiod@example.com');
INSERT INTO public.marketplace_orders
  (provider, external_order_id, plan_code, buyer_email, claim_token, current_period_end)
VALUES
  ('digistore24', 'CLAIM-1', 'premium', 'claimer@example.com', repeat('h', 43), now() + interval '30 days'),
  ('digistore24', 'CLAIM-2', 'regular', 'trialer@example.com', repeat('i', 43), now() + interval '30 days'),
  ('digistore24', 'CLAIM-3', 'regular', 'noperiod@example.com', repeat('j', 43), NULL);
-- The trial this account is already on, which the claim must convert in place.
INSERT INTO public.subscriptions (user_id, status, plan_code, trial_ends_at)
  VALUES ('44444444-4444-4444-4444-444444444444', 'trial', 'regular', now() + interval '3 days');

DO $$
DECLARE r text; n integer;
BEGIN
  PERFORM chk('claim', '11a: an unknown token claims nothing',
    public.claim_marketplace_order('33333333-3333-3333-3333-333333333333', 'no-such-token') = 'order_unavailable');
  PERFORM chk('claim', '11b: a NULL account claims nothing',
    public.claim_marketplace_order(NULL, repeat('h', 43)) = 'order_unavailable');
  PERFORM chk('claim', '11c: an order with no period end is refused rather than guessed',
    public.claim_marketplace_order('55555555-5555-5555-5555-555555555555', repeat('j', 43)) = 'period_end_unknown');
  SELECT count(*) INTO n FROM public.subscriptions WHERE user_id = '55555555-5555-5555-5555-555555555555';
  PERFORM chk('claim', '11d: and that refusal wrote nothing at all', n = 0);

  r := public.claim_marketplace_order('33333333-3333-3333-3333-333333333333', repeat('h', 43));
  PERFORM chk('claim', '12a: a clean claim succeeds', r = 'claimed');
  PERFORM chk('claim', '12b: the entitlement is active on the order''s plan',
    (SELECT plan_code || '/' || status FROM public.subscriptions
      WHERE user_id = '33333333-3333-3333-3333-333333333333') = 'premium/active');
  PERFORM chk('claim', '12c: and it points at the order that paid for it',
    (SELECT marketplace_order_id FROM public.subscriptions
      WHERE user_id = '33333333-3333-3333-3333-333333333333')
    = (SELECT id FROM public.marketplace_orders WHERE external_order_id = 'CLAIM-1'));
  PERFORM chk('claim', '12d: the period end is the platform''s, not a computed one',
    (SELECT s.current_period_end FROM public.subscriptions s
      WHERE s.user_id = '33333333-3333-3333-3333-333333333333')
    = (SELECT o.current_period_end FROM public.marketplace_orders o WHERE o.external_order_id = 'CLAIM-1'));
  PERFORM chk('claim', '12e: the marketplace now bills the account',
    (SELECT billing_authority || '/' || authority_reason FROM public.billing_governance
      WHERE user_id = '33333333-3333-3333-3333-333333333333') = 'marketplace/marketplace_order_claimed');
  PERFORM chk('claim', '12f: the receipt is spent',
    (SELECT status FROM public.marketplace_orders WHERE external_order_id = 'CLAIM-1') = 'claimed');

  PERFORM chk('claim', '13a: reloading the claim link is a no-op, not a second grant',
    public.claim_marketplace_order('33333333-3333-3333-3333-333333333333', repeat('h', 43))
      = 'already_claimed_by_this_account');
  SELECT count(*) INTO n FROM public.subscriptions WHERE user_id = '33333333-3333-3333-3333-333333333333';
  PERFORM chk('claim', '13b: and there is still exactly one entitlement row', n = 1);
  PERFORM chk('claim', '13c: somebody ELSE cannot spend the same receipt',
    public.claim_marketplace_order('22222222-2222-2222-2222-222222222222', repeat('h', 43)) = 'order_unavailable');
  SELECT count(*) INTO n FROM public.subscriptions WHERE user_id = '22222222-2222-2222-2222-222222222222'
    AND marketplace_order_id IS NOT NULL;
  PERFORM chk('claim', '13d: and got nothing for trying', n = 0);

  r := public.claim_marketplace_order('44444444-4444-4444-4444-444444444444', repeat('i', 43));
  PERFORM chk('claim', '14a: a trial converts in place', r = 'claimed');
  SELECT count(*) INTO n FROM public.subscriptions WHERE user_id = '44444444-4444-4444-4444-444444444444';
  PERFORM chk('claim', '14b: one row, not a cancelled trial plus a new row', n = 1);
  PERFORM chk('claim', '14c: the trial end is cleared and the status is active',
    (SELECT status || '/' || coalesce(trial_ends_at::text, 'null') FROM public.subscriptions
      WHERE user_id = '44444444-4444-4444-4444-444444444444') = 'active/null');

  -- Provenance: an account that began on the website keeps that provenance.
  INSERT INTO auth.users (id, email) VALUES ('66666666-6666-6666-6666-666666666666', 'web@example.com');
  INSERT INTO public.billing_governance (user_id, signup_origin, billing_authority)
    VALUES ('66666666-6666-6666-6666-666666666666', 'website', 'website');
  INSERT INTO public.marketplace_orders
    (provider, external_order_id, plan_code, buyer_email, claim_token, current_period_end)
  VALUES ('digistore24', 'CLAIM-4', 'regular', 'web@example.com', repeat('k', 43), now() + interval '30 days');
  r := public.claim_marketplace_order('66666666-6666-6666-6666-666666666666', repeat('k', 43));
  PERFORM chk('claim', '15a: a website account can claim an order', r = 'claimed');
  PERFORM chk('claim', '15b: the authority moved',
    (SELECT billing_authority FROM public.billing_governance
      WHERE user_id = '66666666-6666-6666-6666-666666666666') = 'marketplace');
  PERFORM chk('claim', '15c: and the ORIGIN did not — provenance is never rewritten',
    (SELECT signup_origin FROM public.billing_governance
      WHERE user_id = '66666666-6666-6666-6666-666666666666') = 'website');

  PERFORM chk('claim', '16a: the function is SECURITY DEFINER with an empty search_path',
    (SELECT p.prosecdef AND pg_catalog.array_to_string(p.proconfig, ',') LIKE 'search_path=%'
       FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public' AND p.proname = 'claim_marketplace_order'));
  PERFORM chk('claim', '16b: only the server may execute it',
    has_function_privilege('service_role', 'public.claim_marketplace_order(uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.claim_marketplace_order(uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.claim_marketplace_order(uuid,text)', 'EXECUTE'));
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints','governance','subscriptions','claim'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

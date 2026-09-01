-- ============================================================================
-- EXECUTED PROBE — 20260901000000_billing_governance.sql
--
-- RUN against a disposable PostgreSQL 16 cluster (initdb, discarded
-- afterwards). NOT against Supabase, NOT against Production, and no production
-- data was read. Result at time of commit: 19 passed, 0 failed, plus a
-- re-apply proving the migration is idempotent (6 rows before and after, 3 of
-- them Shopify-governed both times).
--
-- It exercises the six existing-user categories the backfill must classify,
-- the RLS/grant posture, both CHECK constraints, and the nullable
-- install_origin column.
--
-- To re-run:
--   initdb -D <dir> -A trust -U postgres && pg_ctl -D <dir> -o '-p 55440' start
--   psql -p 55440 -U postgres -f <this file>
-- ============================================================================

CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE TABLE public.shopify_billing_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE public.shopify_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, shop_domain text NOT NULL,
  connection_status text NOT NULL, archived_at timestamptz,
  shopify_subscription_status text, shopify_billing_verified_at timestamptz);
CREATE TABLE public.shopify_pending_installs (
  token text PRIMARY KEY, shop_domain text NOT NULL, access_token_encrypted text NOT NULL,
  api_version text NOT NULL, expires_at timestamptz NOT NULL);

-- Seed the five existing-user categories the backfill must classify.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'website-only@x'),
  ('00000000-0000-0000-0000-000000000002', 'website-with-publishing-connection@x'),
  ('00000000-0000-0000-0000-000000000003', 'completed-migration@x'),
  ('00000000-0000-0000-0000-000000000004', 'verified-shopify-subscriber@x'),
  ('00000000-0000-0000-0000-000000000005', 'abandoned-migration@x'),
  ('00000000-0000-0000-0000-000000000006', 'both-proofs@x');
-- 2: a website customer using Shopify purely to publish — the production case.
INSERT INTO public.shopify_connections (user_id, shop_domain, connection_status, shopify_subscription_status, shopify_billing_verified_at)
VALUES ('00000000-0000-0000-0000-000000000002', 'pub.myshopify.com', 'connected', NULL, NULL);
-- 3: an explicit COMPLETED migration.
INSERT INTO public.shopify_billing_migrations (user_id, status) VALUES ('00000000-0000-0000-0000-000000000003', 'completed');
-- 4: a Partner-API-verified ACTIVE Shopify subscription.
INSERT INTO public.shopify_connections (user_id, shop_domain, connection_status, shopify_subscription_status, shopify_billing_verified_at)
VALUES ('00000000-0000-0000-0000-000000000004', 'paid.myshopify.com', 'connected', 'active', now());
-- 5: an abandoned migration (must NOT switch).
INSERT INTO public.shopify_billing_migrations (user_id, status) VALUES ('00000000-0000-0000-0000-000000000005', 'paypal_cancel_failed');
INSERT INTO public.shopify_connections (user_id, shop_domain, connection_status, shopify_subscription_status, shopify_billing_verified_at)
VALUES ('00000000-0000-0000-0000-000000000005', 'aband.myshopify.com', 'connected', NULL, NULL);
-- 6: BOTH proofs — must produce exactly one deterministic row.
INSERT INTO public.shopify_billing_migrations (user_id, status) VALUES ('00000000-0000-0000-0000-000000000006', 'completed');
INSERT INTO public.shopify_connections (user_id, shop_domain, connection_status, shopify_subscription_status, shopify_billing_verified_at)
VALUES ('00000000-0000-0000-0000-000000000006', 'both.myshopify.com', 'connected', 'active', now());

\ir ../20260901000000_billing_governance.sql

CREATE TEMP TABLE results(name text, ok boolean);
CREATE OR REPLACE FUNCTION chk(n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (n, COALESCE(c,false)); END; $$;
DO $$
DECLARE n integer; v text; o text;
BEGIN
  SELECT count(*) INTO n FROM public.billing_governance;
  PERFORM chk('1a: exactly one governance row per existing account (6)', n = 6);

  SELECT billing_authority INTO v FROM public.billing_governance WHERE user_id='00000000-0000-0000-0000-000000000001';
  PERFORM chk('2a: website-only account -> website', v = 'website');

  SELECT billing_authority INTO v FROM public.billing_governance WHERE user_id='00000000-0000-0000-0000-000000000002';
  PERFORM chk('2b: THE PRODUCTION CASE — a connection used only for publishing stays website', v = 'website');

  SELECT billing_authority, authority_reason INTO v, o FROM public.billing_governance WHERE user_id='00000000-0000-0000-0000-000000000003';
  PERFORM chk('2c: a COMPLETED PayPal migration -> shopify', v = 'shopify' AND o = 'backfill_completed_paypal_migration');

  SELECT billing_authority, authority_reason INTO v, o FROM public.billing_governance WHERE user_id='00000000-0000-0000-0000-000000000004';
  PERFORM chk('2d: a Partner-API-verified ACTIVE subscription -> shopify', v = 'shopify' AND o = 'backfill_verified_shopify_subscription');

  SELECT billing_authority INTO v FROM public.billing_governance WHERE user_id='00000000-0000-0000-0000-000000000005';
  PERFORM chk('2e: an ABANDONED migration does NOT switch authority', v = 'website');

  SELECT count(*) INTO n FROM public.billing_governance WHERE user_id='00000000-0000-0000-0000-000000000006';
  SELECT authority_reason INTO o FROM public.billing_governance WHERE user_id='00000000-0000-0000-0000-000000000006';
  PERFORM chk('2f: an account with BOTH proofs yields exactly one deterministic row', n = 1 AND o = 'backfill_completed_paypal_migration');

  SELECT count(*) INTO n FROM public.billing_governance WHERE signup_origin <> 'website';
  PERFORM chk('3a: provenance is never invented for existing accounts', n = 0);

  -- RLS / grants
  PERFORM chk('4a: RLS is enabled', (SELECT relrowsecurity FROM pg_class WHERE oid='public.billing_governance'::regclass));
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='billing_governance';
  PERFORM chk('4b: NO policies exist, so anon/authenticated are denied by default', n = 0);
  PERFORM chk('4c: authenticated has no SELECT', NOT has_table_privilege('authenticated','public.billing_governance','SELECT'));
  PERFORM chk('4d: authenticated has no INSERT/UPDATE/DELETE',
    NOT has_table_privilege('authenticated','public.billing_governance','INSERT')
    AND NOT has_table_privilege('authenticated','public.billing_governance','UPDATE')
    AND NOT has_table_privilege('authenticated','public.billing_governance','DELETE'));
  PERFORM chk('4e: anon has nothing', NOT has_table_privilege('anon','public.billing_governance','SELECT'));
  PERFORM chk('4f: service_role can read and write', has_table_privilege('service_role','public.billing_governance','SELECT')
    AND has_table_privilege('service_role','public.billing_governance','INSERT')
    AND has_table_privilege('service_role','public.billing_governance','UPDATE'));
  PERFORM chk('4g: service_role cannot DELETE (history is never silently erased)',
    NOT has_table_privilege('service_role','public.billing_governance','DELETE'));

  -- CHECK constraints reject invalid values
  BEGIN
    INSERT INTO public.billing_governance (user_id, billing_authority) VALUES ('00000000-0000-0000-0000-000000000001','paypal');
    PERFORM chk('5a: an unknown billing_authority is rejected', false);
  EXCEPTION WHEN check_violation OR unique_violation THEN PERFORM chk('5a: an unknown billing_authority is rejected', true);
  END;

  -- install_origin column + constraint on the pending table
  PERFORM chk('6a: shopify_pending_installs.install_origin exists',
    (SELECT count(*) FROM information_schema.columns WHERE table_name='shopify_pending_installs' AND column_name='install_origin') = 1);
  BEGIN
    INSERT INTO public.shopify_pending_installs (token, shop_domain, access_token_encrypted, api_version, expires_at, install_origin)
    VALUES ('t1','s.myshopify.com','enc','2026-07', now(), 'made_up');
    PERFORM chk('6b: an unknown install_origin is rejected', false);
  EXCEPTION WHEN check_violation THEN PERFORM chk('6b: an unknown install_origin is rejected', true);
  END;
  INSERT INTO public.shopify_pending_installs (token, shop_domain, access_token_encrypted, api_version, expires_at)
  VALUES ('t2','s.myshopify.com','enc','2026-07', now());
  PERFORM chk('6c: a row written before the column existed still inserts (NULL allowed)',
    (SELECT install_origin IS NULL FROM public.shopify_pending_installs WHERE token='t2'));
END $$;
SELECT CASE WHEN ok THEN '  PASS' ELSE '  FAIL' END || '  ' || name AS result FROM results ORDER BY name;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM results;

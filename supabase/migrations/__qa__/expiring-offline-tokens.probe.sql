-- ============================================================================
-- EXECUTED PROBE — 20260901010000_shopify_expiring_offline_tokens.sql
--
-- RUN against a disposable PostgreSQL 16 cluster (initdb, discarded
-- afterwards). NOT against Supabase, NOT against Production, and no production
-- data was read. Result at time of commit: 14 passed, 0 failed.
--
-- Section 4 exercises the OPTIMISTIC CONCURRENCY rule the resolver relies on:
-- a rotation write conditioned on the exact ciphertext the caller loaded wins,
-- and the same write from a caller holding a stale value matches ZERO rows, so
-- a retired pair can never overwrite a newer one. No lock and no RPC are
-- involved.
--
-- To re-run:
--   initdb -D <dir> -A trust -U postgres && pg_ctl -D <dir> -o '-p 55442' start
--   psql -p 55442 -U postgres -f <this file>
-- ============================================================================

CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.shopify_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, project_id uuid NOT NULL,
  shop_domain text NOT NULL CHECK (shop_domain LIKE '%.myshopify.com'), shop_gid text, storefront_domain text,
  access_token_encrypted text NOT NULL, api_version text NOT NULL, granted_scopes text[] NOT NULL DEFAULT '{}',
  connection_status text NOT NULL DEFAULT 'untested', last_error text, last_tested_at timestamptz,
  archived_at timestamptz, archived_reason text, shopify_plan_handle text, shopify_subscription_status text,
  shopify_billing_verified_at timestamptz, shopify_current_period_end timestamptz, shopify_current_period_start timestamptz,
  shopify_trial_ends_at timestamptz, shopify_cancel_at_end_of_cycle boolean DEFAULT false, shopify_billing_last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX c_shop_live ON public.shopify_connections (shop_domain) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX c_proj_live ON public.shopify_connections (project_id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX c_gid_live ON public.shopify_connections (shop_gid) WHERE archived_at IS NULL AND shop_gid IS NOT NULL;
CREATE TABLE public.shopify_pending_installs (
  token text PRIMARY KEY, shop_domain text NOT NULL, shop_gid text, access_token_encrypted text NOT NULL,
  api_version text NOT NULL, granted_scopes text[] NOT NULL DEFAULT '{}', storefront_domain text,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE OR REPLACE FUNCTION public.claim_shopify_shop_ownership(
  p_user_id uuid, p_project_id uuid, p_shop_domain text, p_shop_gid text, p_access_token_encrypted text,
  p_api_version text, p_granted_scopes text[], p_storefront_domain text, p_connection_status text, p_last_error text
) RETURNS TABLE(outcome text, connection_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN RETURN QUERY SELECT 'old_version', NULL::uuid; END; $$;

\ir ../20260901010000_shopify_expiring_offline_tokens.sql

CREATE TEMP TABLE results(name text, ok boolean);
CREATE OR REPLACE FUNCTION chk(n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (n, COALESCE(c,false)); END; $$;
DO $$
DECLARE u uuid := gen_random_uuid(); p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid();
        r record; cid uuid; n integer;
        aexp timestamptz := now() + interval '1 day'; rexp timestamptz := now() + interval '30 days';
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='claim_shopify_shop_ownership';
  PERFORM chk('1a: exactly one claim function (the 10-arg version was dropped)', n = 1);
  SELECT pronargs INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='claim_shopify_shop_ownership';
  PERFORM chk('1b: it takes 13 parameters', n = 13);

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name='shopify_connections'
     AND column_name IN ('refresh_token_encrypted','access_token_expires_at','refresh_token_expires_at');
  PERFORM chk('2a: shopify_connections carries the whole grant', n = 3);
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name='shopify_pending_installs'
     AND column_name IN ('refresh_token_encrypted','access_token_expires_at','refresh_token_expires_at');
  PERFORM chk('2b: shopify_pending_installs carries it across the handoff', n = 3);

  SELECT * INTO r FROM public.claim_shopify_shop_ownership(
    u, p1, 'grant.myshopify.com', 'gid://shopify/Shop/1', 'ENC-access', '2026-07',
    ARRAY['read_products'], NULL, 'connected', NULL, 'ENC-refresh', aexp, rexp);
  PERFORM chk('3a: a fresh claim succeeds', r.outcome = 'claimed');
  cid := r.connection_id;
  PERFORM chk('3b: all four values landed in ONE statement',
    (SELECT access_token_encrypted='ENC-access' AND refresh_token_encrypted='ENC-refresh'
        AND access_token_expires_at=aexp AND refresh_token_expires_at=rexp
     FROM public.shopify_connections WHERE id=cid));

  SELECT * INTO r FROM public.claim_shopify_shop_ownership(
    u, p1, 'grant.myshopify.com', 'gid://shopify/Shop/1', 'ENC-access-2', '2026-07',
    ARRAY['read_products'], NULL, 'connected', NULL, 'ENC-refresh-2', aexp, rexp);
  PERFORM chk('3c: reactivation replaces the WHOLE grant', r.outcome='reactivated' AND
    (SELECT access_token_encrypted='ENC-access-2' AND refresh_token_encrypted='ENC-refresh-2' FROM public.shopify_connections WHERE id=cid));

  -- Optimistic concurrency, exactly as the resolver performs it.
  UPDATE public.shopify_connections SET access_token_encrypted='ENC-current' WHERE id=cid;
  UPDATE public.shopify_connections SET access_token_encrypted='ENC-winner', refresh_token_encrypted='ENC-winner-r'
   WHERE id=cid AND access_token_encrypted='ENC-current';
  PERFORM chk('4a: a write conditioned on the loaded ciphertext succeeds',
    (SELECT access_token_encrypted='ENC-winner' FROM public.shopify_connections WHERE id=cid));
  UPDATE public.shopify_connections SET access_token_encrypted='ENC-loser', refresh_token_encrypted='ENC-loser-r'
   WHERE id=cid AND access_token_encrypted='ENC-current';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM chk('4b: the STALE-conditioned write matches zero rows', n = 0);
  PERFORM chk('4c: so the winner''s pair survives intact',
    (SELECT access_token_encrypted='ENC-winner' AND refresh_token_encrypted='ENC-winner-r' FROM public.shopify_connections WHERE id=cid));

  -- Ownership protections unchanged.
  SELECT * INTO r FROM public.claim_shopify_shop_ownership(
    gen_random_uuid(), p2, 'grant.myshopify.com', NULL, 'X', '2026-07', ARRAY['read_products'], NULL, 'connected', NULL, 'Y', aexp, rexp);
  PERFORM chk('5a: another project still cannot take a CONNECTED shop', r.outcome='shop_already_connected');
  UPDATE public.shopify_connections SET connection_status='failed', last_error='app_uninstalled', granted_scopes='{}' WHERE id=cid;
  SELECT * INTO r FROM public.claim_shopify_shop_ownership(
    gen_random_uuid(), p2, 'grant.myshopify.com', NULL, 'X', '2026-07', ARRAY['read_products'], NULL, 'connected', NULL, 'Y', aexp, rexp);
  PERFORM chk('5b: an app_uninstalled tombstone is still supersedable', r.outcome='claimed');
  PERFORM chk('5c: and the superseded row is archived, not deleted',
    (SELECT count(*) FROM public.shopify_connections WHERE archived_at IS NOT NULL) = 1);

  PERFORM chk('6a: EXECUTE is service_role only',
    has_function_privilege('service_role','public.claim_shopify_shop_ownership(uuid,uuid,text,text,text,text,text[],text,text,text,text,timestamptz,timestamptz)','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.claim_shopify_shop_ownership(uuid,uuid,text,text,text,text,text[],text,text,text,text,timestamptz,timestamptz)','EXECUTE'));
END $$;
SELECT CASE WHEN ok THEN '  PASS' ELSE '  FAIL' END || '  ' || name AS result FROM results ORDER BY name;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM results;

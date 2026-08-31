-- ============================================================================
-- EXECUTED PROBE — 20260831000000_shopify_expiring_offline_tokens.sql
--
-- This file was RUN against a disposable PostgreSQL 16 cluster (initdb, throw
-- away afterwards), not against Supabase and not against production. It applies
-- a minimal stand-in schema, then the real migration, then asserts the lease
-- and rotation rules on the real functions. Result at time of commit:
-- 36 passed, 0 failed — plus a separate true-concurrency run in which 8
-- simultaneous psql sessions called begin_shopify_token_refresh on one
-- near-expiry connection and exactly ONE received 'granted' (7 'locked').
--
-- It found a real defect that no amount of source review had: the
-- RETURNS TABLE(...) output names of begin_shopify_token_refresh shadow the
-- shopify_connections columns of the same name, so the unqualified SELECT
-- inside the body failed at RUNTIME with "column reference ... is ambiguous".
-- The migration now alias-qualifies every column.
--
-- To re-run:
--   initdb -D <dir> -A trust -U postgres && pg_ctl -D <dir> -o '-p 55432' start
--   psql -p 55432 -U postgres -f <this file>
-- ============================================================================

-- Minimal stand-in for the columns the migration touches.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.shopify_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  shop_domain text NOT NULL CHECK (shop_domain LIKE '%.myshopify.com'),
  shop_gid text,
  storefront_domain text,
  access_token_encrypted text NOT NULL,
  api_version text NOT NULL,
  granted_scopes text[] NOT NULL DEFAULT '{}',
  connection_status text NOT NULL DEFAULT 'untested',
  last_error text,
  last_tested_at timestamptz,
  archived_at timestamptz,
  archived_reason text,
  shopify_plan_handle text,
  shopify_subscription_status text,
  shopify_billing_verified_at timestamptz,
  shopify_current_period_end timestamptz,
  shopify_current_period_start timestamptz,
  shopify_trial_ends_at timestamptz,
  shopify_cancel_at_end_of_cycle boolean DEFAULT false,
  shopify_billing_last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX shopify_connections_shop_domain_live ON public.shopify_connections (shop_domain) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX shopify_connections_project_live ON public.shopify_connections (project_id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX shopify_connections_shop_gid_live ON public.shopify_connections (shop_gid) WHERE archived_at IS NULL AND shop_gid IS NOT NULL;
CREATE TABLE public.shopify_pending_installs (
  token text PRIMARY KEY, shop_domain text NOT NULL, shop_gid text,
  access_token_encrypted text NOT NULL, api_version text NOT NULL,
  granted_scopes text[] NOT NULL DEFAULT '{}', storefront_domain text,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, consumed_at timestamptz
);
-- The prior migration's function, so the DROP in the new one is exercised.
CREATE OR REPLACE FUNCTION public.claim_shopify_shop_ownership(
  p_user_id uuid, p_project_id uuid, p_shop_domain text, p_shop_gid text,
  p_access_token_encrypted text, p_api_version text, p_granted_scopes text[],
  p_storefront_domain text, p_connection_status text, p_last_error text
) RETURNS TABLE(outcome text, connection_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN RETURN QUERY SELECT 'old_version', NULL::uuid; END; $$;

\ir ../20260831000000_shopify_expiring_offline_tokens.sql

CREATE TEMP TABLE results(name text, ok boolean);
CREATE OR REPLACE FUNCTION chk(n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (n, COALESCE(c,false)); END; $$;

DO $$
DECLARE
  u uuid := gen_random_uuid(); p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid();
  cid uuid; lease uuid; lease2 uuid; r record; n integer;
  aexp timestamptz := now() + interval '1 day';
  rexp timestamptz := now() + interval '30 days';
BEGIN
  -- 1) exactly one claim function, 13 args
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='claim_shopify_shop_ownership';
  PERFORM chk('1a: exactly one claim_shopify_shop_ownership (old 10-arg dropped)', n = 1);
  SELECT pronargs INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='claim_shopify_shop_ownership';
  PERFORM chk('1b: it takes 13 parameters', n = 13);

  -- 2) claim writes the WHOLE grant
  SELECT * INTO r FROM public.claim_shopify_shop_ownership(
    u, p1, 'grant-test.myshopify.com', 'gid://shopify/Shop/1', 'ENC-access', '2026-07',
    ARRAY['read_products'], NULL, 'connected', NULL, 'ENC-refresh', aexp, rexp);
  PERFORM chk('2a: a fresh claim succeeds', r.outcome = 'claimed');
  cid := r.connection_id;
  PERFORM chk('2b: access token, refresh token and BOTH expiries landed together',
    (SELECT access_token_encrypted='ENC-access' AND refresh_token_encrypted='ENC-refresh'
        AND access_token_expires_at=aexp AND refresh_token_expires_at=rexp
     FROM public.shopify_connections WHERE id=cid));

  -- 3) a still-valid access token is REUSED, not rotated
  SELECT * INTO r FROM public.begin_shopify_token_refresh(cid, 60, 300);
  PERFORM chk('3a: a safely-valid access token reports fresh', r.outcome = 'fresh');
  PERFORM chk('3b: and hands back ciphertext only', r.access_token_encrypted = 'ENC-access');
  PERFORM chk('3c: no lease was taken', r.lease_token IS NULL
    AND (SELECT token_refresh_lease_token IS NULL FROM public.shopify_connections WHERE id=cid));

  -- 4) near-expiry -> lease granted; a concurrent caller is locked out
  UPDATE public.shopify_connections SET access_token_expires_at = now() + interval '10 seconds' WHERE id=cid;
  SELECT * INTO r FROM public.begin_shopify_token_refresh(cid, 60, 300);
  PERFORM chk('4a: a near-expiry token grants the lease', r.outcome = 'granted' AND r.lease_token IS NOT NULL);
  PERFORM chk('4b: the lease holder receives the refresh CIPHERTEXT', r.refresh_token_encrypted = 'ENC-refresh');
  lease := r.lease_token;
  SELECT * INTO r FROM public.begin_shopify_token_refresh(cid, 60, 300);
  PERFORM chk('4c: a concurrent caller is locked out, not given a second lease', r.outcome = 'locked' AND r.lease_token IS NULL);
  PERFORM chk('4d: and is never handed the refresh material', r.refresh_token_encrypted IS NULL);

  -- 5) THE anti-clobber rule
  SELECT * INTO r FROM public.complete_shopify_token_refresh(
    cid, gen_random_uuid(), 'RETIRED-access', 'RETIRED-refresh', now()+interval '1 day', rexp);
  PERFORM chk('5a: a rotation with the WRONG lease is refused', r.outcome = 'lease_lost');
  PERFORM chk('5b: and the stored pair is untouched',
    (SELECT access_token_encrypted='ENC-access' AND refresh_token_encrypted='ENC-refresh'
     FROM public.shopify_connections WHERE id=cid));
  SELECT * INTO r FROM public.complete_shopify_token_refresh(cid, lease, 'NEW-access', NULL, now()+interval '1 day', rexp);
  PERFORM chk('5c: a PARTIAL rotation is refused outright', r.outcome = 'invalid_rotation');
  PERFORM chk('5d: still untouched after the partial attempt',
    (SELECT access_token_encrypted='ENC-access' FROM public.shopify_connections WHERE id=cid));

  -- 6) the lease holder rotates, atomically
  SELECT * INTO r FROM public.complete_shopify_token_refresh(
    cid, lease, 'NEW-access', 'NEW-refresh', now()+interval '2 days', now()+interval '60 days');
  PERFORM chk('6a: the lease holder rotates successfully', r.outcome = 'rotated');
  PERFORM chk('6b: BOTH halves and BOTH expiries moved in one statement',
    (SELECT access_token_encrypted='NEW-access' AND refresh_token_encrypted='NEW-refresh'
        AND access_token_expires_at > now()+interval '1 day'
        AND refresh_token_expires_at > now()+interval '59 days'
     FROM public.shopify_connections WHERE id=cid));
  PERFORM chk('6c: the lease is released', (SELECT token_refresh_lease_token IS NULL FROM public.shopify_connections WHERE id=cid));
  PERFORM chk('6d: a retired rotation can no longer land afterwards',
    (SELECT outcome FROM public.complete_shopify_token_refresh(cid, lease, 'RETIRED-access', 'RETIRED-refresh', aexp, rexp)) = 'lease_lost');
  PERFORM chk('6e: which leaves the WINNING pair in place',
    (SELECT access_token_encrypted='NEW-access' AND refresh_token_encrypted='NEW-refresh'
     FROM public.shopify_connections WHERE id=cid));

  -- 7) crash recovery: an EXPIRED lease is reclaimable
  UPDATE public.shopify_connections
     SET access_token_expires_at = now() - interval '1 minute',
         token_refresh_lease_token = gen_random_uuid(),
         token_refresh_lease_until = now() - interval '1 minute'   -- crashed holder
   WHERE id=cid;
  SELECT * INTO r FROM public.begin_shopify_token_refresh(cid, 60, 300);
  PERFORM chk('7a: an abandoned lease is reclaimed, not honoured forever', r.outcome = 'granted');
  lease2 := r.lease_token;
  PERFORM chk('7b: the reclaimed lease is a NEW token', lease2 IS DISTINCT FROM lease);

  -- 8) terminal failure -> the reconnect state
  SELECT * INTO r FROM public.fail_shopify_token_refresh(cid, lease2, true, 'refresh_token_invalid');
  PERFORM chk('8a: a terminal refresh failure is recorded', r.outcome = 'terminal');
  PERFORM chk('8b: as failed / refresh_token_invalid, with the lease released',
    (SELECT connection_status='failed' AND last_error='refresh_token_invalid' AND token_refresh_lease_token IS NULL
     FROM public.shopify_connections WHERE id=cid));

  -- 9) a TRANSIENT failure changes no credential state
  UPDATE public.shopify_connections SET connection_status='connected', last_error=NULL WHERE id=cid;
  SELECT * INTO r FROM public.begin_shopify_token_refresh(cid, 60, 300);
  SELECT * INTO r FROM public.fail_shopify_token_refresh(cid, (SELECT token_refresh_lease_token FROM public.shopify_connections WHERE id=cid), false, 'refresh_token_invalid');
  PERFORM chk('9a: a transient failure only releases the lease', r.outcome = 'released');
  PERFORM chk('9b: leaving status and last_error untouched',
    (SELECT connection_status='connected' AND last_error IS NULL AND token_refresh_lease_token IS NULL
     FROM public.shopify_connections WHERE id=cid));

  -- 10) the uninstall tombstone is never overwritten
  UPDATE public.shopify_connections SET connection_status='failed', last_error='app_uninstalled' WHERE id=cid;
  SELECT * INTO r FROM public.fail_shopify_token_refresh(cid, NULL, true, 'refresh_token_invalid');
  PERFORM chk('10a: a terminal failure on a tombstone leaves the marker intact',
    (SELECT last_error='app_uninstalled' FROM public.shopify_connections WHERE id=cid));

  -- 11) no refresh material -> reported, never invented
  UPDATE public.shopify_connections
     SET refresh_token_encrypted=NULL, access_token_expires_at=now()-interval '1 minute',
         connection_status='connected', last_error=NULL WHERE id=cid;
  SELECT * INTO r FROM public.begin_shopify_token_refresh(cid, 60, 300);
  PERFORM chk('11a: a row with no refresh material reports no_refresh_material', r.outcome = 'no_refresh_material');
  PERFORM chk('11b: and no lease is taken for it', (SELECT token_refresh_lease_token IS NULL FROM public.shopify_connections WHERE id=cid));

  -- 12) reactivation carries a NEW grant and voids an in-flight lease
  UPDATE public.shopify_connections SET refresh_token_encrypted='ENC-refresh', access_token_expires_at=now()-interval '1 minute' WHERE id=cid;
  SELECT * INTO r FROM public.begin_shopify_token_refresh(cid, 60, 300);
  lease2 := r.lease_token;
  SELECT * INTO r FROM public.claim_shopify_shop_ownership(
    u, p1, 'grant-test.myshopify.com', 'gid://shopify/Shop/1', 'REINSTALL-access', '2026-07',
    ARRAY['read_products'], NULL, 'connected', NULL, 'REINSTALL-refresh', aexp, rexp);
  PERFORM chk('12a: the same project reactivates in place', r.outcome = 'reactivated');
  PERFORM chk('12b: with the whole NEW grant', (SELECT access_token_encrypted='REINSTALL-access' AND refresh_token_encrypted='REINSTALL-refresh' FROM public.shopify_connections WHERE id=cid));
  PERFORM chk('12c: and the in-flight lease voided',
    (SELECT token_refresh_lease_token IS NULL FROM public.shopify_connections WHERE id=cid));
  PERFORM chk('12d: so the rotation started before it can no longer land',
    (SELECT outcome FROM public.complete_shopify_token_refresh(cid, lease2, 'STALE-access', 'STALE-refresh', aexp, rexp)) = 'lease_lost');

  -- 13) ownership protections unchanged
  SELECT * INTO r FROM public.claim_shopify_shop_ownership(
    gen_random_uuid(), p2, 'grant-test.myshopify.com', NULL, 'OTHER-access', '2026-07',
    ARRAY['read_products'], NULL, 'connected', NULL, 'OTHER-refresh', aexp, rexp);
  PERFORM chk('13a: another project still cannot take a CONNECTED shop', r.outcome = 'shop_already_connected');
  UPDATE public.shopify_connections SET connection_status='failed', last_error='app_uninstalled', granted_scopes='{}' WHERE id=cid;
  SELECT * INTO r FROM public.claim_shopify_shop_ownership(
    gen_random_uuid(), p2, 'grant-test.myshopify.com', NULL, 'OTHER-access', '2026-07',
    ARRAY['read_products'], NULL, 'connected', NULL, 'OTHER-refresh', aexp, rexp);
  PERFORM chk('13b: but an app_uninstalled tombstone is still supersedable', r.outcome = 'claimed');
  PERFORM chk('13c: the archived row keeps its own (now dead) material for audit',
    (SELECT count(*) FROM public.shopify_connections WHERE archived_at IS NOT NULL) = 1);
END $$;

SELECT CASE WHEN ok THEN '  PASS' ELSE '  FAIL' END || '  ' || name AS result FROM results ORDER BY name;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM results;

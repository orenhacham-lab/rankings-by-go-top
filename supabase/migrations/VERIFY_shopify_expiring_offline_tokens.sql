-- ============================================================================
-- MANUAL VERIFICATION — 20260831000000_shopify_expiring_offline_tokens.sql
--
-- Read-only inspection (sections 1–5) plus a behavioural rehearsal (section 6)
-- that runs inside a transaction and is ROLLED BACK, so nothing it does
-- survives. Run in the Supabase SQL Editor AFTER applying the migration.
--
-- Nothing here prints, decrypts or compares a token. Ciphertext columns are
-- only ever tested for NULL/NOT NULL, and the rehearsal uses obvious dummy
-- strings, never a real credential.
-- ============================================================================

-- ── 1) Columns exist, with the right types ─────────────────────────────────
-- Expect 5 rows for shopify_connections and 3 for shopify_pending_installs.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'shopify_connections' AND column_name IN (
      'refresh_token_encrypted', 'access_token_expires_at', 'refresh_token_expires_at',
      'token_refresh_lease_token', 'token_refresh_lease_until'))
    OR
    (table_name = 'shopify_pending_installs' AND column_name IN (
      'refresh_token_encrypted', 'access_token_expires_at', 'refresh_token_expires_at'))
  )
ORDER BY table_name, column_name;

-- ── 2) The claim RPC exists ONCE, with 13 parameters ───────────────────────
-- A second row here means the 10-argument version survived and a named-argument
-- call could become ambiguous. Expect exactly one row, pronargs = 13.
SELECT p.oid::regprocedure AS signature, p.pronargs, p.prosecdef AS security_definer,
       p.proconfig AS settings
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'claim_shopify_shop_ownership';

-- ── 3) The refresh-lease functions exist and are hardened ──────────────────
-- Expect three rows, each security_definer = true and settings = {search_path=}.
SELECT p.oid::regprocedure AS signature, p.prosecdef AS security_definer, p.proconfig AS settings
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('begin_shopify_token_refresh', 'complete_shopify_token_refresh', 'fail_shopify_token_refresh')
ORDER BY p.proname;

-- ── 4) EXECUTE is service_role only ────────────────────────────────────────
-- Expect service_role for each function and NOTHING for anon/authenticated/PUBLIC.
SELECT p.proname,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('claim_shopify_shop_ownership', 'begin_shopify_token_refresh',
                    'complete_shopify_token_refresh', 'fail_shopify_token_refresh')
ORDER BY p.proname;

-- ── 5) Live-state census (no secrets printed) ──────────────────────────────
-- How many live connections already carry an expiring grant, how many are
-- legacy, and whether any lease is stuck. A stuck lease is one whose deadline
-- has passed: it is reclaimable by design and should be 0 at rest.
SELECT
  count(*)                                                              AS live_connections,
  count(*) FILTER (WHERE refresh_token_encrypted IS NOT NULL)           AS with_refresh_material,
  count(*) FILTER (WHERE access_token_expires_at IS NOT NULL)           AS with_access_expiry,
  count(*) FILTER (WHERE refresh_token_encrypted IS NULL
                     AND access_token_expires_at IS NULL)               AS legacy_non_expiring,
  count(*) FILTER (WHERE access_token_expires_at < now())               AS access_token_expired,
  count(*) FILTER (WHERE token_refresh_lease_until IS NOT NULL
                     AND token_refresh_lease_until < now())             AS stale_leases,
  count(*) FILTER (WHERE last_error = 'refresh_token_invalid')          AS awaiting_reconnect_refresh,
  count(*) FILTER (WHERE last_error = 'app_uninstalled')                AS uninstall_tombstones
FROM public.shopify_connections
WHERE archived_at IS NULL;

-- ── 6) Behavioural rehearsal — ROLLED BACK, changes nothing ────────────────
-- Proves the lease rules on the real functions using a throwaway row.
BEGIN;

-- A disposable project/user is not needed: shopify_connections.user_id and
-- project_id are only referenced, so insert against an existing project to keep
-- the FKs satisfied, then roll back. Pick any live project id.
WITH victim AS (SELECT id, user_id FROM public.projects LIMIT 1)
INSERT INTO public.shopify_connections (
  user_id, project_id, shop_domain, api_version, access_token_encrypted,
  refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at,
  connection_status, granted_scopes
)
SELECT v.user_id, v.id, 'verify-rehearsal.myshopify.com', '2026-07',
       'DUMMY-NOT-A-TOKEN-access', 'DUMMY-NOT-A-TOKEN-refresh',
       now() - interval '1 minute',        -- already expired -> must refresh
       now() + interval '30 days',
       'connected', ARRAY['read_products']
FROM victim v;

-- 6a) First caller is GRANTED the lease and receives the refresh CIPHERTEXT.
SELECT 'expect granted' AS check, outcome, (lease_token IS NOT NULL) AS has_lease
FROM public.begin_shopify_token_refresh(
  (SELECT id FROM public.shopify_connections WHERE shop_domain = 'verify-rehearsal.myshopify.com'), 60, 300);

-- 6b) A CONCURRENT caller is refused while that lease is live.
SELECT 'expect locked' AS check, outcome
FROM public.begin_shopify_token_refresh(
  (SELECT id FROM public.shopify_connections WHERE shop_domain = 'verify-rehearsal.myshopify.com'), 60, 300);

-- 6c) A rotation carrying a WRONG lease token is refused — this is the rule
--     that stops a slow invocation storing a retired pair.
SELECT 'expect lease_lost' AS check, outcome
FROM public.complete_shopify_token_refresh(
  (SELECT id FROM public.shopify_connections WHERE shop_domain = 'verify-rehearsal.myshopify.com'),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'DUMMY-rotated-access', 'DUMMY-rotated-refresh', now() + interval '1 day', now() + interval '30 days');

-- 6d) The pair is unchanged after that refusal (still the original dummies).
SELECT 'expect true' AS check,
       access_token_encrypted = 'DUMMY-NOT-A-TOKEN-access'
   AND refresh_token_encrypted = 'DUMMY-NOT-A-TOKEN-refresh' AS pair_untouched
FROM public.shopify_connections WHERE shop_domain = 'verify-rehearsal.myshopify.com';

-- 6e) A TERMINAL failure produces the reconnect state (and clears the lease).
SELECT 'expect terminal' AS check, outcome
FROM public.fail_shopify_token_refresh(
  (SELECT id FROM public.shopify_connections WHERE shop_domain = 'verify-rehearsal.myshopify.com'),
  (SELECT token_refresh_lease_token FROM public.shopify_connections WHERE shop_domain = 'verify-rehearsal.myshopify.com'),
  true, 'refresh_token_invalid');

SELECT 'expect failed/refresh_token_invalid/no lease' AS check,
       connection_status, last_error, token_refresh_lease_token
FROM public.shopify_connections WHERE shop_domain = 'verify-rehearsal.myshopify.com';

-- 6f) The uninstall tombstone is NEVER overwritten by a terminal failure.
UPDATE public.shopify_connections
   SET connection_status = 'failed', last_error = 'app_uninstalled'
 WHERE shop_domain = 'verify-rehearsal.myshopify.com';
SELECT 'expect released-or-terminal, marker intact' AS check, outcome
FROM public.fail_shopify_token_refresh(
  (SELECT id FROM public.shopify_connections WHERE shop_domain = 'verify-rehearsal.myshopify.com'),
  NULL, true, 'refresh_token_invalid');
SELECT 'expect app_uninstalled' AS check, last_error
FROM public.shopify_connections WHERE shop_domain = 'verify-rehearsal.myshopify.com';

ROLLBACK;   -- nothing above is kept

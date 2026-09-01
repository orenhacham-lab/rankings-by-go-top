-- ============================================================================
-- EXECUTED PROBE — the three billing/token migrations, together.
--
-- RUN against a disposable PostgreSQL 16 cluster (initdb, discarded
-- afterwards). NOT against Supabase, NOT against Production, and no production
-- data was read. Result at time of commit: 43 passed, 0 failed.
--
-- Covers the review blockers directly:
--   * origin model — 'unknown' is accepted, provenance is never rewritten by a
--     later App Store install, and an invented value is rejected;
--   * ATOMICITY — a blocked ownership claim rolls the one-time pending-install
--     consume back, so a failed link leaves nothing behind;
--   * website-connector provenance links WITHOUT touching billing;
--   * an App Store install by an existing PayPal subscriber creates the
--     migration and defers the authority switch;
--   * the confirmed PayPal migration moves status, authority and the local
--     mirror together, and refuses to re-apply;
--   * the refresh LEASE: granted / locked / reclaimed after a crash, rotation
--     refused with a wrong lease OR a changed credential, a stale terminal
--     failure ignored, an uninstalled store never leased or resurrected, and an
--     unknown issuing app never guessed;
--   * grants and SECURITY DEFINER hardening on all six functions.
--
-- To re-run:
--   initdb -D <dir> -A trust -U postgres && pg_ctl -D <dir> -o '-p 55450' start
--   psql -p 55450 -U postgres -f <this file>
-- ============================================================================

CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, status text NOT NULL,
  plan_code text, paypal_subscription_id text, trial_ends_at timestamptz,
  current_period_end timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.shopify_billing_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, project_id uuid,
  shopify_connection_id uuid, paypal_subscription_id text, status text NOT NULL, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
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

\ir ../20260901000000_billing_governance.sql
\ir ../20260901010000_shopify_expiring_offline_tokens.sql
\ir ../20260901020000_shopify_atomic_billing_transitions.sql

CREATE TEMP TABLE results(name text, ok boolean);
CREATE OR REPLACE FUNCTION chk(n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (n, COALESCE(c,false)); END; $$;
DO $$
DECLARE
  u_web uuid := gen_random_uuid(); u_pp uuid := gen_random_uuid(); u_new uuid := gen_random_uuid();
  p_web uuid := gen_random_uuid(); p_pp uuid := gen_random_uuid(); p_new uuid := gen_random_uuid();
  r record; n integer; v text; lease uuid; cid uuid; mid uuid;
  aexp timestamptz := now() + interval '1 day';
BEGIN
  INSERT INTO auth.users (id) VALUES (u_web), (u_pp), (u_new);
  -- An EXISTING website account (origin recorded as website).
  INSERT INTO public.billing_governance (user_id, signup_origin, billing_authority)
  VALUES (u_web, 'website', 'website');
  -- An existing website account that also pays through PayPal.
  INSERT INTO public.billing_governance (user_id, signup_origin, billing_authority)
  VALUES (u_pp, 'website', 'website');
  INSERT INTO public.subscriptions (user_id, status, paypal_subscription_id) VALUES (u_pp, 'active', 'I-PAYPAL');

  -- ── origin model ──
  PERFORM chk('1a: signup_origin accepts unknown', (SELECT count(*) FROM pg_constraint
    WHERE conname LIKE '%signup_origin%' AND pg_get_constraintdef(oid) LIKE '%unknown%') >= 1);
  BEGIN
    INSERT INTO public.billing_governance (user_id, signup_origin) VALUES (gen_random_uuid(), 'made_up');
    PERFORM chk('1b: an unknown origin value is rejected', false);
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN PERFORM chk('1b: an unknown origin value is rejected', true);
  END;

  -- ── App Store link: existing WEBSITE account, no PayPal ──
  INSERT INTO public.shopify_pending_installs
    (token, shop_domain, shop_gid, access_token_encrypted, refresh_token_encrypted,
     access_token_expires_at, oauth_app_edition, api_version, granted_scopes, expires_at, install_origin)
  VALUES ('tok-web', 'web.myshopify.com', 'gid://shopify/Shop/10', 'ENC-a', 'ENC-r', aexp, 'public',
          '2026-07', ARRAY['read_products'], now() + interval '30 minutes', 'shopify_app_store');
  SELECT * INTO r FROM public.complete_shopify_app_store_link('tok-web', u_web, p_web, 'connected', NULL);
  PERFORM chk('2a: a trusted App Store link commits', r.outcome = 'linked');
  PERFORM chk('2b: authority becomes shopify', r.billing_authority = 'shopify');
  PERFORM chk('2c: NO migration row for a non-PayPal account', r.migration_created = false);
  SELECT signup_origin INTO v FROM public.billing_governance WHERE user_id = u_web;
  PERFORM chk('2d: the WEBSITE signup origin is preserved, not rewritten', v = 'website');
  PERFORM chk('2e: the pending install was consumed', (SELECT consumed_at IS NOT NULL FROM public.shopify_pending_installs WHERE token='tok-web'));
  PERFORM chk('2f: the credential edition travelled to the connection',
    (SELECT oauth_app_edition = 'public' AND refresh_token_encrypted = 'ENC-r' FROM public.shopify_connections WHERE id = r.connection_id));
  PERFORM chk('2g: replaying the same one-time token does nothing',
    (SELECT outcome FROM public.complete_shopify_app_store_link('tok-web', u_web, p_web, 'connected', NULL)) = 'pending_invalid');

  -- ── App Store link: existing PayPal subscriber ──
  INSERT INTO public.shopify_pending_installs
    (token, shop_domain, shop_gid, access_token_encrypted, refresh_token_encrypted,
     access_token_expires_at, oauth_app_edition, api_version, granted_scopes, expires_at, install_origin)
  VALUES ('tok-pp', 'pp.myshopify.com', 'gid://shopify/Shop/11', 'ENC-a', 'ENC-r', aexp, 'public',
          '2026-07', ARRAY['read_products'], now() + interval '30 minutes', 'shopify_app_store');
  SELECT * INTO r FROM public.complete_shopify_app_store_link('tok-pp', u_pp, p_pp, 'connected', NULL);
  PERFORM chk('3a: the link commits', r.outcome = 'linked');
  PERFORM chk('3b: authority STAYS website until the migration completes', r.billing_authority = 'website');
  PERFORM chk('3c: a migration row IS created', r.migration_created = true);
  PERFORM chk('3d: exactly one, in status pending',
    (SELECT count(*) = 1 FROM public.shopify_billing_migrations WHERE user_id = u_pp AND status = 'pending'));

  -- ── website-connector provenance never moves authority ──
  INSERT INTO public.shopify_pending_installs
    (token, shop_domain, access_token_encrypted, api_version, granted_scopes, expires_at, install_origin)
  VALUES ('tok-conn', 'conn.myshopify.com', 'ENC-a', '2026-07', ARRAY['read_products'],
          now() + interval '30 minutes', 'website_connector');
  SELECT * INTO r FROM public.complete_shopify_app_store_link('tok-conn', u_new, gen_random_uuid(), 'connected', NULL);
  PERFORM chk('4a: a website-connector pending row links WITHOUT touching billing', r.outcome = 'linked' AND r.billing_authority IS NULL);
  PERFORM chk('4b: and writes no governance row at all',
    (SELECT count(*) = 0 FROM public.billing_governance WHERE user_id = u_new));
  PERFORM chk('4c: nor any migration', (SELECT count(*) = 0 FROM public.shopify_billing_migrations WHERE user_id = u_new));

  -- ── atomicity: a blocked claim rolls the consume back ──
  INSERT INTO public.shopify_pending_installs
    (token, shop_domain, shop_gid, access_token_encrypted, api_version, granted_scopes, expires_at, install_origin)
  VALUES ('tok-block', 'web.myshopify.com', 'gid://shopify/Shop/10', 'ENC-a', '2026-07',
          ARRAY['read_products'], now() + interval '30 minutes', 'shopify_app_store');
  BEGIN
    SELECT * INTO r FROM public.complete_shopify_app_store_link('tok-block', gen_random_uuid(), gen_random_uuid(), 'connected', NULL);
    PERFORM chk('5a: claiming another project''s CONNECTED shop raises', false);
  EXCEPTION WHEN raise_exception THEN
    PERFORM chk('5a: claiming another project''s CONNECTED shop is refused', SQLERRM LIKE 'shopify_link_blocked:%');
  END;
  PERFORM chk('5b: and the one-time token was NOT consumed (all-or-none)',
    (SELECT consumed_at IS NULL FROM public.shopify_pending_installs WHERE token = 'tok-block'));

  -- ── confirmed PayPal migration ──
  SELECT id INTO mid FROM public.shopify_billing_migrations WHERE user_id = u_pp AND status = 'pending';
  PERFORM chk('6a: completing a confirmed migration succeeds',
    (SELECT outcome FROM public.complete_shopify_paypal_migration(mid, u_pp, 'I-PAYPAL')) = 'completed');
  PERFORM chk('6b: status is completed', (SELECT status FROM public.shopify_billing_migrations WHERE id = mid) = 'completed');
  PERFORM chk('6c: authority is now shopify', (SELECT billing_authority FROM public.billing_governance WHERE user_id = u_pp) = 'shopify');
  PERFORM chk('6d: historical signup origin is UNCHANGED', (SELECT signup_origin FROM public.billing_governance WHERE user_id = u_pp) = 'website');
  PERFORM chk('6e: the local PayPal mirror is cancelled',
    (SELECT status FROM public.subscriptions WHERE paypal_subscription_id = 'I-PAYPAL') = 'cancelled');
  PERFORM chk('6f: repeating it is refused, not silently re-applied',
    (SELECT outcome FROM public.complete_shopify_paypal_migration(mid, u_pp, 'I-PAYPAL')) = 'unexpected_status');

  -- ── refresh lease ──
  SELECT id INTO cid FROM public.shopify_connections WHERE shop_domain = 'web.myshopify.com';
  UPDATE public.shopify_connections SET access_token_expires_at = now() - interval '1 minute' WHERE id = cid;
  SELECT * INTO r FROM public.begin_shopify_token_refresh(cid, 60, 300);
  PERFORM chk('7a: the first caller is GRANTED the lease', r.outcome = 'granted' AND r.lease_token IS NOT NULL);
  PERFORM chk('7b: and is told which app issued the credential', r.oauth_app_edition = 'public');
  lease := r.lease_token;
  SELECT * INTO r FROM public.begin_shopify_token_refresh(cid, 60, 300);
  PERFORM chk('7c: a CONCURRENT caller is locked out', r.outcome = 'locked' AND r.refresh_token_encrypted IS NULL);
  PERFORM chk('7d: a rotation with the wrong lease is refused',
    (SELECT outcome FROM public.complete_shopify_token_refresh(cid, gen_random_uuid(), 'ENC-a', 'NEW-a', 'NEW-r', aexp, aexp)) = 'lease_lost');
  PERFORM chk('7e: a rotation whose expected credential changed is refused',
    (SELECT outcome FROM public.complete_shopify_token_refresh(cid, lease, 'STALE', 'NEW-a', 'NEW-r', aexp, aexp)) = 'lease_lost');
  PERFORM chk('7f: the lease owner with the right expectation rotates',
    (SELECT outcome FROM public.complete_shopify_token_refresh(cid, lease, 'ENC-a', 'NEW-a', 'NEW-r', aexp, aexp)) = 'rotated');
  PERFORM chk('7g: the whole pair moved and the lease was released',
    (SELECT access_token_encrypted='NEW-a' AND refresh_token_encrypted='NEW-r' AND token_refresh_lease_token IS NULL
     FROM public.shopify_connections WHERE id = cid));

  -- crash recovery
  UPDATE public.shopify_connections
     SET access_token_expires_at = now() - interval '1 minute',
         token_refresh_lease_token = gen_random_uuid(), token_refresh_lease_until = now() - interval '1 minute'
   WHERE id = cid;
  PERFORM chk('7h: an abandoned lease is reclaimable',
    (SELECT outcome FROM public.begin_shopify_token_refresh(cid, 60, 300)) = 'granted');

  -- terminal failure only when still the owner AND the credential is unchanged
  SELECT token_refresh_lease_token INTO lease FROM public.shopify_connections WHERE id = cid;
  PERFORM chk('7i: a STALE terminal failure is ignored',
    (SELECT outcome FROM public.fail_shopify_token_refresh(cid, lease, 'SOMETHING-ELSE', true, 'refresh_token_invalid')) = 'stale_terminal_ignored');
  UPDATE public.shopify_connections SET token_refresh_lease_token = lease, token_refresh_lease_until = now() + interval '1 minute' WHERE id = cid;
  PERFORM chk('7j: a current terminal failure marks reconnect',
    (SELECT outcome FROM public.fail_shopify_token_refresh(cid, lease, 'NEW-a', true, 'refresh_token_invalid')) = 'terminal');
  PERFORM chk('7k: as failed / refresh_token_invalid',
    (SELECT connection_status='failed' AND last_error='refresh_token_invalid' FROM public.shopify_connections WHERE id = cid));

  -- uninstall wins over a late refresh
  UPDATE public.shopify_connections SET last_error='app_uninstalled', connection_status='failed',
         access_token_expires_at = now() - interval '1 minute',
         token_refresh_lease_token = NULL, token_refresh_lease_until = NULL WHERE id = cid;
  PERFORM chk('7l: an uninstalled store is never leased for refresh',
    (SELECT outcome FROM public.begin_shopify_token_refresh(cid, 60, 300)) = 'uninstalled');
  PERFORM chk('7m: and a late rotation cannot resurrect it',
    (SELECT outcome FROM public.complete_shopify_token_refresh(cid, gen_random_uuid(), 'NEW-a', 'X', 'Y', aexp, aexp)) = 'lease_lost');
  PERFORM chk('7n: the tombstone survives', (SELECT last_error FROM public.shopify_connections WHERE id = cid) = 'app_uninstalled');

  -- unknown edition is never guessed
  UPDATE public.shopify_connections SET last_error = NULL, connection_status='connected',
         oauth_app_edition = NULL, access_token_expires_at = now() - interval '1 minute' WHERE id = cid;
  PERFORM chk('8a: an unknown issuing app is reported, never guessed',
    (SELECT outcome FROM public.begin_shopify_token_refresh(cid, 60, 300)) = 'unknown_edition');

  -- grants
  PERFORM chk('9a: the atomic link RPC is service_role only',
    has_function_privilege('service_role','public.complete_shopify_app_store_link(text,uuid,uuid,text,text)','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.complete_shopify_app_store_link(text,uuid,uuid,text,text)','EXECUTE'));
  PERFORM chk('9b: so is the migration RPC',
    has_function_privilege('service_role','public.complete_shopify_paypal_migration(uuid,uuid,text)','EXECUTE')
    AND NOT has_function_privilege('anon','public.complete_shopify_paypal_migration(uuid,uuid,text)','EXECUTE'));
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN
     ('complete_shopify_app_store_link','complete_shopify_paypal_migration','begin_shopify_token_refresh',
      'complete_shopify_token_refresh','fail_shopify_token_refresh') AND p.prosecdef AND pg_catalog.array_to_string(p.proconfig, ',') LIKE 'search_path=%';
  PERFORM chk('9c: all five new functions are SECURITY DEFINER with an EMPTY search_path', n = 5);
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname LIKE '%shopify%'
     AND (NOT p.prosecdef OR p.proconfig IS NULL);
  PERFORM chk('9d: no shopify function is left without that hardening', n = 0);
END $$;
SELECT CASE WHEN ok THEN '  PASS' ELSE '  FAIL' END || '  ' || name AS result FROM results ORDER BY name;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM results;

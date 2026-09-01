-- ============================================================================
-- Shopify EXPIRING offline access tokens — storage for the rotating pair.
--
-- PROBLEM (production, Shopify's own 403 body):
--
--   "Non-expiring access tokens are no longer accepted for the Admin API"
--
-- POST /api/shopify/embedded-install exchanged the session token successfully
-- (HTTP 200) but received a NON-EXPIRING offline access token, and the first
-- Admin API query with it was refused. An expiring grant is a PAIR — a
-- short-lived access token plus a refresh token used to rotate it — so both
-- halves and their expiries must survive everywhere the credential lives:
-- the short-lived handoff table AND the connected-shop table.
--
-- CONCURRENCY. Optimistic concurrency on the write alone is NOT enough, and
-- Shopify's own guidance is explicit: refresh one store at a time, because two
-- workers refreshing the same store concurrently can leave one holding a token
-- the other has already replaced. Resolving the race only at write time still
-- means two live refresh requests, and Shopify may invalidate the first pair
-- when it issues the second.
--
-- So rotation is SERIALIZED BEFORE the external call, with a per-connection
-- lease: begin_shopify_token_refresh grants it, complete_/fail_ release it, and
-- the lease is time-bounded so a crashed worker cannot wedge a shop. The
-- optimistic condition on the stored ciphertext is KEPT as well — belt and
-- braces — so even a lease holder cannot overwrite a pair that changed
-- underneath it.
--
-- CREDENTIAL PROVENANCE. A token can only be refreshed with the credentials of
-- the app that ISSUED it. This repository has two: the public "Go Top SEO" app
-- and a legacy custom app. oauth_app_edition records which one, so a refresh
-- never signs with the wrong pair — and a row whose edition is unknown is never
-- guessed at.
--
-- SECRECY. Both token columns hold AES-256-GCM ciphertext produced by
-- lib/security/credentials-crypto.ts. Nothing here decrypts, compares or
-- returns plaintext. encryptCredential uses a RANDOM IV, so ciphertext is
-- non-deterministic and is never compared across separate encryptions — the
-- optimistic-concurrency check compares a STORED value with the same stored
-- value the caller read, which is exact.
--
-- NOT APPLIED BY THIS TASK. Created and reviewed only.
-- ============================================================================

BEGIN;

-- ── 1) Connected shops: the rotating pair ───────────────────────────────────
ALTER TABLE public.shopify_connections
  -- WHICH Shopify app issued the credential in this row. Refresh must use that
  -- app's client id + secret; signing with the other app's pair simply fails.
  -- NULL = unknown (a row written before this column existed) and is never
  -- guessed: the resolver asks such a connection to reauthorize rather than
  -- picking an app for it.
  ADD COLUMN IF NOT EXISTS oauth_app_edition text
    CHECK (oauth_app_edition IN ('public', 'legacy') OR oauth_app_edition IS NULL),
  -- Refresh LEASE. lease_token identifies the single invocation currently
  -- allowed to call Shopify for this connection; lease_until bounds it so a
  -- crashed or timed-out serverless request cannot wedge the connection.
  ADD COLUMN IF NOT EXISTS token_refresh_lease_token uuid,
  ADD COLUMN IF NOT EXISTS token_refresh_lease_until timestamptz,
  -- AES-256-GCM ciphertext of the refresh token. NULL = no refresh material:
  -- a connection created before expiring grants, or one deliberately cleared
  -- on app/uninstalled.
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
  -- Absolute expiry of the ACCESS token. NULL = unknown (legacy row), which
  -- the resolver treats as "use as-is and let the Admin API judge it".
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz,
  -- Absolute expiry of the REFRESH token, when Shopify reports one. NULL is
  -- normal: Shopify may omit refresh_token_expires_in.
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz;

-- Lets an operator find connections approaching expiry without a table scan.
CREATE INDEX IF NOT EXISTS idx_shopify_connections_access_expiry
  ON public.shopify_connections (access_token_expires_at)
  WHERE archived_at IS NULL;

-- ── 2) Pending installs: the same pair, across the handoff ──────────────────
--
-- shopify_pending_installs bridges "Shopify granted us a credential" and "the
-- merchant chose a project". If only the access token crossed that bridge, the
-- resulting connection would have nothing to rotate with and would die at the
-- access token's first expiry with no way back.
ALTER TABLE public.shopify_pending_installs
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz,
  -- Carried across the handoff with the pair it belongs to, so the live
  -- connection knows which app can refresh it.
  ADD COLUMN IF NOT EXISTS oauth_app_edition text
    CHECK (oauth_app_edition IN ('public', 'legacy') OR oauth_app_edition IS NULL);

-- ── 3) Carry the whole grant through the ownership claim ────────────────────
--
-- claim_shopify_shop_ownership is the single transition point into
-- shopify_connections (20260830000000). It must write all four values in the
-- SAME statement as the access token, so a live row can never hold an access
-- token from one grant beside a refresh token from another.
--
-- DROPPED and recreated, not CREATE OR REPLACE'd: added parameters produce a
-- DIFFERENT signature, so a replace would leave the 10-argument version in
-- place beside the 13-argument one and a named-argument call could become
-- ambiguous. Both statements are in this one migration, so the application's
-- only ownership entry point is never missing.
DROP FUNCTION IF EXISTS public.claim_shopify_shop_ownership(uuid, uuid, text, text, text, text, text[], text, text, text);

CREATE OR REPLACE FUNCTION public.claim_shopify_shop_ownership(
  p_user_id uuid,
  p_project_id uuid,
  p_shop_domain text,
  p_shop_gid text,
  p_access_token_encrypted text,
  p_api_version text,
  p_granted_scopes text[],
  p_storefront_domain text,
  p_connection_status text,
  p_last_error text,
  p_refresh_token_encrypted text DEFAULT NULL,
  p_access_token_expires_at timestamptz DEFAULT NULL,
  p_refresh_token_expires_at timestamptz DEFAULT NULL,
  p_oauth_app_edition text DEFAULT NULL
) RETURNS TABLE(outcome text, connection_id uuid)
-- SECURITY DEFINER hardening: an EMPTY search_path so no caller-controlled
-- schema can shadow anything this body resolves.
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_existing record;
  v_conflict record;
  v_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_domain, 0));

  SELECT id, project_id, user_id, connection_status, last_error,
         granted_scopes, shopify_subscription_status
    INTO v_existing
    FROM public.shopify_connections
   WHERE shop_domain = p_shop_domain AND archived_at IS NULL
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing.project_id = p_project_id THEN
      UPDATE public.shopify_connections
         SET user_id = p_user_id,
             shop_gid = COALESCE(p_shop_gid, shop_gid),
             storefront_domain = p_storefront_domain,
             access_token_encrypted = p_access_token_encrypted,
             refresh_token_encrypted = p_refresh_token_encrypted,
             access_token_expires_at = p_access_token_expires_at,
             refresh_token_expires_at = p_refresh_token_expires_at,
             oauth_app_edition = p_oauth_app_edition,
             -- A brand-new grant invalidates any lease held against the old
             -- one, so a rotation still in flight cannot land on top of it.
             token_refresh_lease_token = NULL,
             token_refresh_lease_until = NULL,
             api_version = p_api_version,
             granted_scopes = p_granted_scopes,
             connection_status = p_connection_status,
             last_error = p_last_error,
             last_tested_at = v_now,
             updated_at = v_now
       WHERE id = v_existing.id
       RETURNING id INTO v_id;
      RETURN QUERY SELECT 'reactivated', v_id;
      RETURN;
    END IF;

    -- A different project holds this shop. Eligible for supersession ONLY if
    -- it is the exact uninstall tombstone applyAppUninstalled writes.
    IF NOT (
      v_existing.connection_status = 'failed'
      AND v_existing.last_error = 'app_uninstalled'
      AND COALESCE(pg_catalog.array_length(v_existing.granted_scopes, 1), 0) = 0
      AND v_existing.shopify_subscription_status IS DISTINCT FROM 'active'
    ) THEN
      IF v_existing.connection_status = 'connected' THEN
        RETURN QUERY SELECT 'shop_already_connected', NULL::uuid;
      ELSE
        RETURN QUERY SELECT 'blocked_not_eligible', NULL::uuid;
      END IF;
      RETURN;
    END IF;

    UPDATE public.shopify_connections
       SET archived_at = v_now,
           archived_reason = 'superseded_after_uninstall',
           shopify_plan_handle = NULL,
           shopify_subscription_status = NULL,
           shopify_billing_verified_at = NULL,
           shopify_current_period_end = NULL,
           shopify_current_period_start = NULL,
           shopify_trial_ends_at = NULL,
           shopify_cancel_at_end_of_cycle = false,
           shopify_billing_last_error = NULL,
           updated_at = v_now
     WHERE id = v_existing.id;
  END IF;

  IF p_shop_gid IS NOT NULL THEN
    SELECT id, project_id, connection_status INTO v_conflict
      FROM public.shopify_connections
     WHERE shop_gid = p_shop_gid
       AND archived_at IS NULL
       AND project_id <> p_project_id
     FOR UPDATE;
    IF FOUND THEN
      IF v_conflict.connection_status = 'connected' THEN
        RETURN QUERY SELECT 'shop_already_connected', NULL::uuid;
      ELSE
        RETURN QUERY SELECT 'blocked_not_eligible', NULL::uuid;
      END IF;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.shopify_connections (
    user_id, project_id, shop_domain, shop_gid, storefront_domain,
    access_token_encrypted, refresh_token_encrypted,
    access_token_expires_at, refresh_token_expires_at, oauth_app_edition,
    api_version, granted_scopes,
    connection_status, last_error, last_tested_at, updated_at
  ) VALUES (
    p_user_id, p_project_id, p_shop_domain, p_shop_gid, p_storefront_domain,
    p_access_token_encrypted, p_refresh_token_encrypted,
    p_access_token_expires_at, p_refresh_token_expires_at, p_oauth_app_edition,
    p_api_version, p_granted_scopes,
    p_connection_status, p_last_error, v_now, v_now
  )
  ON CONFLICT (project_id) WHERE archived_at IS NULL DO UPDATE
    SET shop_domain = EXCLUDED.shop_domain,
        shop_gid = EXCLUDED.shop_gid,
        storefront_domain = EXCLUDED.storefront_domain,
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
        access_token_expires_at = EXCLUDED.access_token_expires_at,
        refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
        oauth_app_edition = EXCLUDED.oauth_app_edition,
        token_refresh_lease_token = NULL,
        token_refresh_lease_until = NULL,
        api_version = EXCLUDED.api_version,
        granted_scopes = EXCLUDED.granted_scopes,
        connection_status = EXCLUDED.connection_status,
        last_error = EXCLUDED.last_error,
        last_tested_at = EXCLUDED.last_tested_at,
        updated_at = EXCLUDED.updated_at
  RETURNING id INTO v_id;

  RETURN QUERY SELECT 'claimed', v_id;

EXCEPTION WHEN unique_violation THEN
  RETURN QUERY SELECT 'shop_already_connected', NULL::uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_shopify_shop_ownership(uuid, uuid, text, text, text, text, text[], text, text, text, text, timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_shopify_shop_ownership(uuid, uuid, text, text, text, text, text[], text, text, text, text, timestamptz, timestamptz, text) TO service_role;

-- ── 4) Refresh SERIALIZATION — one refresh per connection at a time ─────────
--
-- Shopify's guidance is to refresh a store's token one at a time. These three
-- functions make that true across concurrent serverless invocations.
--
-- begin_ decides and leases:
--   'fresh'               the stored access token is valid for at least
--                         p_min_valid_seconds — usually because another
--                         invocation just rotated it. Use what is stored NOW.
--   'granted'            this caller holds the lease and alone may call
--                         Shopify. It receives the refresh CIPHERTEXT and the
--                         issuing app edition.
--   'locked'             another invocation holds an unexpired lease. Wait and
--                         re-read; never refresh in parallel.
--   'no_refresh_material' nothing to rotate with.
--   'unknown_edition'    the issuing app is not recorded, so no credentials can
--                         be chosen. Never guessed — the caller reauthorizes.
--   'uninstalled'        the app was uninstalled; a late refresh must not
--                         resurrect it.
--   'not_found'          no live row.
--
-- Everything returned is ciphertext, a timestamp, or a fixed label. The lease
-- token is a random uuid, not a secret.
CREATE OR REPLACE FUNCTION public.begin_shopify_token_refresh(
  p_connection_id uuid,
  p_lease_seconds integer DEFAULT 60,
  p_min_valid_seconds integer DEFAULT 300
) RETURNS TABLE(
  outcome text,
  lease_token uuid,
  access_token_encrypted text,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz,
  oauth_app_edition text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_row record;
  v_lease uuid;
BEGIN
  -- Serialize every concurrent refresh for THIS connection. Transaction-scoped,
  -- so it is released on commit or rollback and a crash cannot wedge the row.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_connection_id::text, 1));

  -- Every column is ALIAS-QUALIFIED: this function's RETURNS TABLE list declares
  -- OUT parameters with the same names, and an unqualified reference is
  -- ambiguous between the two — PostgreSQL rejects it at RUNTIME, not at
  -- creation time.
  SELECT c.id, c.access_token_encrypted AS ate, c.refresh_token_encrypted AS rte,
         c.access_token_expires_at AS aexp, c.oauth_app_edition AS edition,
         c.last_error AS last_err,
         c.token_refresh_lease_token AS lease, c.token_refresh_lease_until AS lease_until
    INTO v_row
    FROM public.shopify_connections c
   WHERE c.id = p_connection_id AND c.archived_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', NULL::uuid, NULL::text, NULL::text, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  -- An uninstalled store is never refreshed: only a fresh install restores it.
  IF v_row.last_err = 'app_uninstalled' THEN
    RETURN QUERY SELECT 'uninstalled', NULL::uuid, v_row.ate, NULL::text, v_row.aexp, v_row.edition;
    RETURN;
  END IF;

  -- Re-check AFTER the lock: a concurrent invocation may already have rotated,
  -- in which case there is nothing to do and the caller uses what is stored now.
  IF v_row.aexp IS NOT NULL AND v_row.aexp > v_now + pg_catalog.make_interval(secs => p_min_valid_seconds) THEN
    RETURN QUERY SELECT 'fresh', NULL::uuid, v_row.ate, NULL::text, v_row.aexp, v_row.edition;
    RETURN;
  END IF;

  IF v_row.rte IS NULL OR v_row.rte = '' THEN
    RETURN QUERY SELECT 'no_refresh_material', NULL::uuid, v_row.ate, NULL::text, v_row.aexp, v_row.edition;
    RETURN;
  END IF;

  -- The issuing app must be known before any credential can be chosen.
  IF v_row.edition IS NULL THEN
    RETURN QUERY SELECT 'unknown_edition', NULL::uuid, v_row.ate, NULL::text, v_row.aexp, NULL::text;
    RETURN;
  END IF;

  -- A lease that has not expired belongs to another live invocation. One whose
  -- deadline has passed is abandoned (crash, timeout) and is reclaimed — that is
  -- the crash recovery, and it needs no external sweeper.
  IF v_row.lease IS NOT NULL AND v_row.lease_until IS NOT NULL AND v_row.lease_until > v_now THEN
    RETURN QUERY SELECT 'locked', NULL::uuid, v_row.ate, NULL::text, v_row.aexp, v_row.edition;
    RETURN;
  END IF;

  v_lease := pg_catalog.gen_random_uuid();
  UPDATE public.shopify_connections
     SET token_refresh_lease_token = v_lease,
         token_refresh_lease_until = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
         updated_at = v_now
   WHERE id = p_connection_id;

  RETURN QUERY SELECT 'granted', v_lease, v_row.ate, v_row.rte, v_row.aexp, v_row.edition;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_shopify_token_refresh(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_shopify_token_refresh(uuid, integer, integer) TO service_role;

-- complete_ stores the rotated pair, atomically.
--
-- TWO conditions, both required: the row must still carry THIS caller's lease,
-- AND the stored access token must still be the one the caller was given. A
-- caller whose lease expired (and was reclaimed and used by someone else) is
-- refused with 'lease_lost' and its now-retired pair is discarded. An
-- uninstalled row is refused outright, so a late refresh cannot resurrect it.
CREATE OR REPLACE FUNCTION public.complete_shopify_token_refresh(
  p_connection_id uuid,
  p_lease_token uuid,
  p_expected_access_token_encrypted text,
  p_access_token_encrypted text,
  p_refresh_token_encrypted text,
  p_access_token_expires_at timestamptz,
  p_refresh_token_expires_at timestamptz
) RETURNS TABLE(outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_connection_id::text, 1));

  IF p_lease_token IS NULL
     OR p_access_token_encrypted IS NULL OR p_access_token_encrypted = ''
     OR p_refresh_token_encrypted IS NULL OR p_refresh_token_encrypted = ''
     OR p_access_token_expires_at IS NULL THEN
    -- Half a rotation is worse than none, and an empty encrypted credential is
    -- never stored.
    RETURN QUERY SELECT 'invalid_rotation';
    RETURN;
  END IF;

  UPDATE public.shopify_connections
     SET access_token_encrypted = p_access_token_encrypted,
         refresh_token_encrypted = p_refresh_token_encrypted,
         access_token_expires_at = p_access_token_expires_at,
         refresh_token_expires_at = p_refresh_token_expires_at,
         token_refresh_lease_token = NULL,
         token_refresh_lease_until = NULL,
         -- A successful rotation proves the credential works again, so a prior
         -- refresh failure is cleared. The uninstall tombstone is NEVER cleared
         -- here — only a fresh install may do that — and the WHERE clause below
         -- already excludes it.
         connection_status = 'connected',
         last_error = CASE
                        WHEN last_error IN ('invalid_token', 'refresh_token_invalid') THEN NULL
                        ELSE last_error
                      END,
         updated_at = v_now
   WHERE id = p_connection_id
     AND archived_at IS NULL
     AND last_error IS DISTINCT FROM 'app_uninstalled'
     AND token_refresh_lease_token = p_lease_token
     AND access_token_encrypted = p_expected_access_token_encrypted
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT 'lease_lost';
    RETURN;
  END IF;
  RETURN QUERY SELECT 'rotated';
END;
$$;

REVOKE ALL ON FUNCTION public.complete_shopify_token_refresh(uuid, uuid, text, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_shopify_token_refresh(uuid, uuid, text, text, text, timestamptz, timestamptz) TO service_role;

-- fail_ releases the lease, and records terminality only when it is safe to.
--
-- A TERMINAL failure (Shopify rejected the refresh token) writes the stable
-- 'refresh_token_invalid' state — but ONLY if this caller still owns the lease
-- AND the credential has not already been replaced by a newer one, and never
-- over the 'app_uninstalled' tombstone, which is what
-- claim_shopify_shop_ownership uses to supersede a shop. A TRANSIENT failure
-- changes no credential state at all. Neither ever touches billing authority.
CREATE OR REPLACE FUNCTION public.fail_shopify_token_refresh(
  p_connection_id uuid,
  p_lease_token uuid,
  p_expected_access_token_encrypted text,
  p_terminal boolean,
  p_last_error text DEFAULT 'refresh_token_invalid'
) RETURNS TABLE(outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_id uuid;
  v_rows integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_connection_id::text, 1));

  -- Release the lease. Scoped to THIS caller's lease so a reclaimed one is left
  -- with its new owner.
  UPDATE public.shopify_connections
     SET token_refresh_lease_token = NULL,
         token_refresh_lease_until = NULL,
         updated_at = v_now
   WHERE id = p_connection_id
     AND archived_at IS NULL
     AND token_refresh_lease_token = p_lease_token
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT 'lease_lost';
    RETURN;
  END IF;

  IF p_terminal IS TRUE THEN
    UPDATE public.shopify_connections
       SET connection_status = 'failed',
           last_error = p_last_error,
           updated_at = v_now
     WHERE id = p_connection_id
       AND archived_at IS NULL
       AND last_error IS DISTINCT FROM 'app_uninstalled'
       AND access_token_encrypted = p_expected_access_token_encrypted;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      -- The credential was replaced (or the store uninstalled) while this
      -- refresh was in flight: the failure is stale and must not be recorded.
      RETURN QUERY SELECT 'stale_terminal_ignored';
      RETURN;
    END IF;
    RETURN QUERY SELECT 'terminal';
    RETURN;
  END IF;

  RETURN QUERY SELECT 'released';
END;
$$;

REVOKE ALL ON FUNCTION public.fail_shopify_token_refresh(uuid, uuid, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_shopify_token_refresh(uuid, uuid, text, boolean, text) TO service_role;

COMMIT;

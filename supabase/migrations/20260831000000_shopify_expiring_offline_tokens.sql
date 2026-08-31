-- ============================================================================
-- Shopify EXPIRING offline access tokens — storage, atomic handoff, and the
-- database-backed refresh lease.
--
-- PROBLEM (production, confirmed by Shopify's own 403 body):
--
--   "[API] Non-expiring access tokens are no longer accepted for the Admin
--    API. Start using expiring offline tokens."
--
-- The token exchange succeeded (HTTP 200, tokenType offline, 38 chars) but
-- carried expiresIn: null and no refresh-token metadata, i.e. a NON-EXPIRING
-- offline token. Every Admin API call with it was refused, so a freshly
-- installed store could never be verified.
--
-- The application now sends `expiring=1` on both offline grants and REQUIRES
-- access_token + refresh_token + expires_in + refresh_token_expires_in. That
-- turns one stored secret into a rotating PAIR with two expiries, which this
-- migration makes storable, transferable and safely rotatable:
--
--   1. refresh-token + expiry columns on BOTH the short-lived handoff table
--      (shopify_pending_installs) and the live table (shopify_connections);
--   2. claim_shopify_shop_ownership carries the whole grant through the
--      handoff, so the access token, the refresh token and both expiries land
--      in the live row in ONE statement — never a half-written pair;
--   3. a per-connection refresh LEASE plus three functions that make rotation
--      safe across concurrent serverless invocations: only the lease holder
--      may store a rotated pair, so a slow request can never overwrite a newer
--      pair with the retired one it is holding.
--
-- SECRECY. Every token column stores AES-256-GCM ciphertext produced by
-- lib/security/credentials-crypto.ts. Nothing here decrypts, compares, logs or
-- returns plaintext, and no function takes a plaintext token as a parameter.
-- Because encryptCredential uses a RANDOM IV, ciphertext is non-deterministic
-- and is therefore never compared for equality anywhere in this file.
--
-- DEPENDS ON: 20260830000000_shopify_reconnect_after_uninstall.sql (archival
-- columns + the claim RPC this file replaces).
--
-- NOT APPLIED BY THIS TASK. Reviewed and committed only. Verification queries
-- live beside it in VERIFY_shopify_expiring_offline_tokens.sql.
-- ============================================================================

-- ── 1) Live connections: the rotating grant + the refresh lease ─────────────

ALTER TABLE public.shopify_connections
  -- AES-256-GCM ciphertext of the refresh token. NULL means "no refresh
  -- material": either a legacy connection created before expiring grants, or a
  -- connection whose material was deliberately cleared on app/uninstalled.
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
  -- Absolute expiry of the ACCESS token. NULL = unknown (legacy row).
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz,
  -- Absolute expiry of the REFRESH token. Once past, only a fresh install can
  -- restore the connection.
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz,
  -- Refresh LEASE. lease_token identifies the single invocation currently
  -- allowed to store a rotated pair; lease_until bounds it so a crashed or
  -- timed-out serverless request cannot wedge the connection forever.
  ADD COLUMN IF NOT EXISTS token_refresh_lease_token uuid,
  ADD COLUMN IF NOT EXISTS token_refresh_lease_until timestamptz;

-- Lets an operator find connections that need attention (expiring soon, or
-- holding a stale lease) without scanning the table.
CREATE INDEX IF NOT EXISTS idx_shopify_connections_access_expiry
  ON public.shopify_connections (access_token_expires_at)
  WHERE archived_at IS NULL;

-- ── 2) Pending installs: the same grant, in the handoff table ───────────────
--
-- shopify_pending_installs bridges "Shopify granted us a token" and "the
-- merchant picked a project". If the refresh half did not survive that bridge,
-- the very first refresh after linking would have nothing to rotate with.

ALTER TABLE public.shopify_pending_installs
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz;

-- ── 3) Ownership claim — now carries the WHOLE grant ────────────────────────
--
-- DROPPED, not CREATE OR REPLACE'd. Adding parameters produces a DIFFERENT
-- signature, so a replace would leave the 10-argument version in place beside
-- the 13-argument one and a named-argument call could become ambiguous. The
-- drop and the create are in the same migration, so there is no window in
-- which the application's only ownership entry point is missing.
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
  -- NEW — the other three halves of an expiring grant. All three are written
  -- in the SAME statement as the access token on every path below, so a live
  -- row can never hold an access token from one grant and a refresh token from
  -- another.
  p_refresh_token_encrypted text DEFAULT NULL,
  p_access_token_expires_at timestamptz DEFAULT NULL,
  p_refresh_token_expires_at timestamptz DEFAULT NULL
) RETURNS TABLE(outcome text, connection_id uuid)
-- SECURITY DEFINER hardening (PostgreSQL guidance): an EMPTY search_path so
-- no schema controlled by a caller can shadow anything this body resolves.
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
      -- ── Same project: reactivate in place, preserving history. ───────────
      UPDATE public.shopify_connections
         SET user_id = p_user_id,
             shop_gid = COALESCE(p_shop_gid, shop_gid),
             storefront_domain = p_storefront_domain,
             access_token_encrypted = p_access_token_encrypted,
             refresh_token_encrypted = p_refresh_token_encrypted,
             access_token_expires_at = p_access_token_expires_at,
             refresh_token_expires_at = p_refresh_token_expires_at,
             -- A brand-new grant invalidates any lease held against the old
             -- one: a rotation still in flight must NOT be allowed to land on
             -- top of it (complete_shopify_token_refresh checks the token).
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

    -- ── A different project holds this shop. ─────────────────────────────
    -- Eligible for supersession ONLY if it is the exact uninstall tombstone
    -- applyAppUninstalled writes. Every other state fails closed.
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

  -- ── Create a CLEAN row for the new owner. ─────────────────────────────
  INSERT INTO public.shopify_connections (
    user_id, project_id, shop_domain, shop_gid, storefront_domain,
    access_token_encrypted, refresh_token_encrypted,
    access_token_expires_at, refresh_token_expires_at,
    api_version, granted_scopes,
    connection_status, last_error, last_tested_at, updated_at
  ) VALUES (
    p_user_id, p_project_id, p_shop_domain, p_shop_gid, p_storefront_domain,
    p_access_token_encrypted, p_refresh_token_encrypted,
    p_access_token_expires_at, p_refresh_token_expires_at,
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

REVOKE ALL ON FUNCTION public.claim_shopify_shop_ownership(uuid, uuid, text, text, text, text, text[], text, text, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_shopify_shop_ownership(uuid, uuid, text, text, text, text, text[], text, text, text, text, timestamptz, timestamptz) TO service_role;

-- ── 4) begin_shopify_token_refresh — decide, and lease ──────────────────────
--
-- Called before every Admin API request whose access token is at or near
-- expiry. Under a per-connection advisory lock and a row lock it re-reads the
-- CURRENT state and returns exactly one of:
--
--   'fresh'              the stored access token is still valid for at least
--                        p_min_valid_seconds — usually because a concurrent
--                        request rotated it while this one was waiting. Use it.
--   'granted'            this invocation now holds the lease. It receives the
--                        current encrypted refresh token and MUST finish with
--                        complete_/fail_shopify_token_refresh.
--   'locked'             another invocation holds an unexpired lease. Wait and
--                        re-read; never rotate in parallel.
--   'no_refresh_material' nothing to rotate with (legacy row, or cleared on
--                        uninstall). The caller decides what that means.
--   'not_found'          no live row.
--
-- Returns CIPHERTEXT only. The lease token is a random uuid, not a secret.
CREATE OR REPLACE FUNCTION public.begin_shopify_token_refresh(
  p_connection_id uuid,
  p_lease_seconds integer DEFAULT 60,
  p_min_valid_seconds integer DEFAULT 120
) RETURNS TABLE(
  outcome text,
  lease_token uuid,
  access_token_encrypted text,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_row record;
  v_lease uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_connection_id::text, 1));

  -- Every column is ALIAS-QUALIFIED (c.*). This function's RETURNS TABLE list
  -- declares OUT parameters with the same names as these columns, and an
  -- unqualified reference is ambiguous between the two — PostgreSQL rejects it
  -- at runtime, not at creation time.
  SELECT c.id, c.access_token_encrypted AS ate, c.refresh_token_encrypted AS rte,
         c.access_token_expires_at AS aexp, c.refresh_token_expires_at AS rexp,
         c.token_refresh_lease_token AS lease, c.token_refresh_lease_until AS lease_until
    INTO v_row
    FROM public.shopify_connections c
   WHERE c.id = p_connection_id AND c.archived_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', NULL::uuid, NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  -- Re-check AFTER taking the lock: a concurrent invocation may already have
  -- rotated, in which case there is nothing to do and the caller must use what
  -- is stored now rather than rotating a second time.
  IF v_row.aexp IS NOT NULL AND v_row.aexp > v_now + pg_catalog.make_interval(secs => p_min_valid_seconds) THEN
    RETURN QUERY SELECT 'fresh', NULL::uuid, v_row.ate, v_row.rte, v_row.aexp, v_row.rexp;
    RETURN;
  END IF;

  IF v_row.rte IS NULL OR v_row.rte = '' THEN
    RETURN QUERY SELECT 'no_refresh_material', NULL::uuid, v_row.ate, NULL::text, v_row.aexp, v_row.rexp;
    RETURN;
  END IF;

  -- A lease that has not expired belongs to another live invocation. A lease
  -- whose deadline has passed is abandoned (crash, timeout) and is reclaimed —
  -- that is the crash recovery, and it needs no external sweeper.
  IF v_row.lease IS NOT NULL AND v_row.lease_until IS NOT NULL AND v_row.lease_until > v_now THEN
    RETURN QUERY SELECT 'locked', NULL::uuid, v_row.ate, NULL::text, v_row.aexp, v_row.rexp;
    RETURN;
  END IF;

  v_lease := pg_catalog.gen_random_uuid();
  UPDATE public.shopify_connections
     SET token_refresh_lease_token = v_lease,
         token_refresh_lease_until = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
         updated_at = v_now
   WHERE id = p_connection_id;

  RETURN QUERY SELECT 'granted', v_lease, v_row.ate, v_row.rte, v_row.aexp, v_row.rexp;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_shopify_token_refresh(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_shopify_token_refresh(uuid, integer, integer) TO service_role;

-- ── 5) complete_shopify_token_refresh — store the rotated pair, atomically ──
--
-- THE anti-clobber rule: the write happens ONLY if the row still carries the
-- lease this caller was granted. A slow invocation whose lease expired (and
-- was therefore reclaimed and used by someone else) is refused with
-- 'lease_lost' and its now-retired pair is discarded — it can never overwrite
-- the newer pair. Both tokens and both expiries move in ONE statement, so a
-- reader can never see a mismatched pair.
CREATE OR REPLACE FUNCTION public.complete_shopify_token_refresh(
  p_connection_id uuid,
  p_lease_token uuid,
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
     OR p_access_token_expires_at IS NULL OR p_refresh_token_expires_at IS NULL THEN
    -- A partial grant is never stored: half a rotation is worse than none.
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
         -- refresh failure is cleared. The uninstall tombstone is NEVER
         -- cleared here — only a fresh install may do that.
         connection_status = CASE WHEN last_error = 'app_uninstalled' THEN connection_status ELSE 'connected' END,
         last_error = CASE
                        WHEN last_error = 'app_uninstalled' THEN last_error
                        WHEN last_error IN ('invalid_token', 'refresh_token_invalid') THEN NULL
                        ELSE last_error
                      END,
         updated_at = v_now
   WHERE id = p_connection_id
     AND archived_at IS NULL
     AND token_refresh_lease_token = p_lease_token
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT 'lease_lost';
    RETURN;
  END IF;
  RETURN QUERY SELECT 'rotated';
END;
$$;

REVOKE ALL ON FUNCTION public.complete_shopify_token_refresh(uuid, uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_shopify_token_refresh(uuid, uuid, text, text, timestamptz, timestamptz) TO service_role;

-- ── 6) fail_shopify_token_refresh — release, and record terminality ─────────
--
-- Always releases this caller's lease (and only this caller's). When the
-- failure is TERMINAL — Shopify rejected the refresh token itself — it also
-- writes the stable machine state lib/shopify/connection-health.ts classifies
-- as "reconnect": connection_status 'failed' + last_error
-- 'refresh_token_invalid'.
--
-- The uninstall tombstone is explicitly protected: 'app_uninstalled' is never
-- overwritten, because that marker is what claim_shopify_shop_ownership uses to
-- supersede a shop held by another project, and both states already route the
-- merchant to the same reconnect. A TRANSIENT failure (5xx, unreachable)
-- changes no credential state at all — it must not manufacture a reconnect.
CREATE OR REPLACE FUNCTION public.fail_shopify_token_refresh(
  p_connection_id uuid,
  p_lease_token uuid,
  p_terminal boolean,
  p_last_error text DEFAULT 'refresh_token_invalid'
) RETURNS TABLE(outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_connection_id::text, 1));

  UPDATE public.shopify_connections
     SET token_refresh_lease_token = NULL,
         token_refresh_lease_until = NULL,
         connection_status = CASE
                               WHEN p_terminal IS TRUE AND last_error IS DISTINCT FROM 'app_uninstalled'
                                 THEN 'failed'
                               ELSE connection_status
                             END,
         last_error = CASE
                        WHEN p_terminal IS TRUE AND last_error IS DISTINCT FROM 'app_uninstalled'
                          THEN p_last_error
                        ELSE last_error
                      END,
         updated_at = v_now
   WHERE id = p_connection_id
     AND archived_at IS NULL
     AND (token_refresh_lease_token = p_lease_token OR p_lease_token IS NULL)
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT 'lease_lost';
    RETURN;
  END IF;
  RETURN QUERY SELECT CASE WHEN p_terminal IS TRUE THEN 'terminal' ELSE 'released' END;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_shopify_token_refresh(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_shopify_token_refresh(uuid, uuid, boolean, text) TO service_role;

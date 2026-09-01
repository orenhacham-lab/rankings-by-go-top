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
-- CONCURRENCY. Rotation is made safe with OPTIMISTIC CONCURRENCY in the
-- application (lib/shopify/token-resolver.ts), not with a lock or a new
-- database function: the update is conditioned on the exact
-- access_token_encrypted the caller loaded, so a request whose token has since
-- been rotated by someone else matches zero rows, discards its now-retired
-- pair and reloads the winner. That needs no schema support beyond the columns
-- below, so this migration adds no RPC.
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
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz;

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
  p_refresh_token_expires_at timestamptz DEFAULT NULL
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

COMMIT;

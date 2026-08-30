-- ============================================================================
-- Shopify reconnect after uninstall — archival columns + atomic ownership RPC.
--
-- PROBLEM (production): after `app/uninstalled`, lib/shopify/shop-cleanup.ts's
-- applyAppUninstalled keeps the connection row as a TOMBSTONE — token replaced
-- by the encrypted revocation sentinel, connection_status = 'failed',
-- last_error = 'app_uninstalled', granted_scopes = '{}'. The one-owner-per-shop
-- guards in app/api/shopify/oauth/callback/route.ts and
-- lib/shopify/connection-ownership.ts match on shop_domain with NO
-- connection_status filter, so that tombstone blocked the shop forever:
-- reinstalling and reconnecting from any project returned
-- ?shopify=error&reason=shop_already_connected permanently.
--
-- WHY A MIGRATION IS NEEDED.
--   * shop_domain is `text NOT NULL` with CHECK (shop_domain LIKE
--     '%.myshopify.com'), so the claim cannot be released by nulling it, and
--     inventing a placeholder domain is explicitly forbidden.
--   * shopify_connections_shop_domain_unique is an UNCONDITIONAL unique index,
--     so a superseded row keeps blocking a new owner even once the application
--     guard is narrowed.
--   * Hard-deleting the tombstone is not an option: shopify_blogs.connection_id
--     and shopify_billing_intents.connection_id are ON DELETE CASCADE and
--     shopify_billing_migrations.shopify_connection_id is ON DELETE SET NULL —
--     deleting would destroy the original account's history.
--
-- DESIGN: add `archived_at` (NULL = live) and make every uniqueness rule
-- PARTIAL on `archived_at IS NULL`. An archived row keeps its real
-- shop_domain/shop_gid for audit — no fake domain, no deletion, all foreign
-- keys intact — while no longer participating in the live-ownership
-- constraint.
--
-- The whole transition happens inside ONE SECURITY DEFINER function so it is a
-- single transaction with row locks: concurrent reconnects cannot duplicate a
-- claim, steal an active owner, or leave a half-applied state.
--
-- NOT APPLIED BY THIS TASK. Reviewed and committed only.
-- ============================================================================

-- ── 1) Archival columns ─────────────────────────────────────────────────────

ALTER TABLE public.shopify_connections
  -- NULL = live/current. Non-null = superseded after a DIFFERENT project
  -- proved fresh ownership of the same shop. Retained for audit.
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  -- Stable, non-sensitive code describing why the row was archived.
  ADD COLUMN IF NOT EXISTS archived_reason text
    CHECK (archived_reason IN ('superseded_after_uninstall') OR archived_reason IS NULL);

-- ── 2) Uniqueness applies to LIVE rows only ─────────────────────────────────
-- Dropping and recreating as partial indexes. An archived row keeps its
-- shop_domain, shop_gid and project_id values but no longer competes for them.

DROP INDEX IF EXISTS public.shopify_connections_shop_domain_unique;
CREATE UNIQUE INDEX IF NOT EXISTS shopify_connections_shop_domain_unique
  ON public.shopify_connections (shop_domain)
  WHERE archived_at IS NULL;

DROP INDEX IF EXISTS public.shopify_connections_shop_gid_unique;
CREATE UNIQUE INDEX IF NOT EXISTS shopify_connections_shop_gid_unique
  ON public.shopify_connections (shop_gid)
  WHERE shop_gid IS NOT NULL AND archived_at IS NULL;

-- project_id uniqueness must also become live-only: a project whose Shopify
-- connection was archived must still be able to connect a different store.
ALTER TABLE public.shopify_connections
  DROP CONSTRAINT IF EXISTS shopify_connections_project_unique;
CREATE UNIQUE INDEX IF NOT EXISTS shopify_connections_project_unique
  ON public.shopify_connections (project_id)
  WHERE archived_at IS NULL;

-- Archived rows are read rarely and only for audit; index them separately so
-- the live-path queries above stay on the partial indexes.
CREATE INDEX IF NOT EXISTS idx_shopify_connections_archived
  ON public.shopify_connections (shop_domain, archived_at)
  WHERE archived_at IS NOT NULL;

-- ── 3) The atomic ownership transition ──────────────────────────────────────
--
-- Called ONLY after the caller has independently obtained fresh cryptographic
-- proof of shop ownership (verified OAuth callback, or verified App Bridge
-- session token + successful offline token exchange). This function does NOT
-- and CANNOT verify that proof — it is the transactional half. The caller is
-- responsible for never invoking it otherwise; see
-- lib/shopify/connection-ownership.ts.
--
-- Outcomes:
--   'reactivated'          — the caller's OWN uninstall tombstone was restored
--                            in place (same project), history preserved.
--   'claimed'              — a clean row was created for the caller's project.
--                            Any eligible tombstone owned by a DIFFERENT
--                            project was archived in the same transaction.
--   'shop_already_connected' — a LIVE connection owned by another project
--                            holds this shop (or shop_gid). Nothing changed.
--   'blocked_not_eligible' — a live row exists for another project that is not
--                            an app_uninstalled tombstone (generic 'failed',
--                            'untested', or otherwise unrecognised). Fails
--                            closed; nothing changed.
--
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
  p_last_error text
) RETURNS TABLE(outcome text, connection_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now timestamptz := now();
  v_existing record;
  v_conflict record;
  v_id uuid;
BEGIN
  -- Serialize every concurrent reconnect attempt for THIS shop. The advisory
  -- lock is transaction-scoped, so it is released on commit or rollback and a
  -- crashed session cannot wedge the shop.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_shop_domain, 0));

  -- Re-read INSIDE the lock: any decision made by the caller before this point
  -- is advisory only.
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
    --
    -- Deliberately NOT comparing the encrypted revocation sentinel:
    -- encryptCredential uses a random IV (lib/security/credentials-crypto.ts),
    -- so its ciphertext differs on every call and an equality test would never
    -- match — it would silently block every legitimate reconnect. These four
    -- non-secret columns are exactly what applyAppUninstalled writes, and
    -- last_error = 'app_uninstalled' has a single writer in the whole codebase
    -- (lib/shopify/shop-cleanup.ts), so they identify the tombstone precisely.
    IF NOT (
      v_existing.connection_status = 'failed'
      AND v_existing.last_error = 'app_uninstalled'
      AND COALESCE(array_length(v_existing.granted_scopes, 1), 0) = 0
      AND v_existing.shopify_subscription_status IS DISTINCT FROM 'active'
    ) THEN
      IF v_existing.connection_status = 'connected' THEN
        RETURN QUERY SELECT 'shop_already_connected', NULL::uuid;
      ELSE
        RETURN QUERY SELECT 'blocked_not_eligible', NULL::uuid;
      END IF;
      RETURN;
    END IF;

    -- Archive it. The row keeps its real shop_domain/shop_gid, its project,
    -- its user, its FK children and the revoked-token sentinel; it only stops
    -- competing for the live-ownership indexes. Billing/subscription cache
    -- fields are cleared so no stale entitlement can be read from it.
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

  -- A live row for the same shop_gid owned by someone else blocks too — a
  -- store can be renamed, so the GID is the stronger identity.
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
  -- Nothing is copied from the archived row: no billing plan, no subscription
  -- id, no entitlement, no publishing history, no admin status. Every billing
  -- cache column is left at its default.
  INSERT INTO public.shopify_connections (
    user_id, project_id, shop_domain, shop_gid, storefront_domain,
    access_token_encrypted, api_version, granted_scopes,
    connection_status, last_error, last_tested_at, updated_at
  ) VALUES (
    p_user_id, p_project_id, p_shop_domain, p_shop_gid, p_storefront_domain,
    p_access_token_encrypted, p_api_version, p_granted_scopes,
    p_connection_status, p_last_error, v_now, v_now
  )
  ON CONFLICT (project_id) WHERE archived_at IS NULL DO UPDATE
    SET shop_domain = EXCLUDED.shop_domain,
        shop_gid = EXCLUDED.shop_gid,
        storefront_domain = EXCLUDED.storefront_domain,
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        api_version = EXCLUDED.api_version,
        granted_scopes = EXCLUDED.granted_scopes,
        connection_status = EXCLUDED.connection_status,
        last_error = EXCLUDED.last_error,
        last_tested_at = EXCLUDED.last_tested_at,
        updated_at = EXCLUDED.updated_at
  RETURNING id INTO v_id;

  RETURN QUERY SELECT 'claimed', v_id;

EXCEPTION WHEN unique_violation THEN
  -- Any residual race loses cleanly and rolls the WHOLE function back rather
  -- than leaving an archived row with no replacement.
  RETURN QUERY SELECT 'shop_already_connected', NULL::uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_shopify_shop_ownership(uuid, uuid, text, text, text, text, text[], text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_shopify_shop_ownership(uuid, uuid, text, text, text, text, text[], text, text, text) TO service_role;

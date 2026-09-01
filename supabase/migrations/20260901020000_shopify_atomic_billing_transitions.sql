-- ============================================================================
-- Atomic billing transitions.
--
-- PROBLEM. Completing a trusted Shopify App Store link used to be a SEQUENCE of
-- independent statements issued from the route: claim the connection, then
-- write billing governance, then create a PayPal migration if needed, then
-- consume the one-time pending install. Each could fail on its own, and the
-- route ignored the results. That can leave a direct App Store installation
-- connected as a website-billed account — an App Store billing bypass — or a
-- consumed pending install with no governance, or a route reporting success
-- for state it never saved.
--
-- The same applies to finishing a PayPal→Shopify migration: PayPal is
-- cancelled by an external call, and the migration status, the billing
-- authority and the local subscription mirror then had to land as three
-- separate writes. A failure between them leaves a customer whose PayPal
-- subscription is cancelled while the app still bills them as a website
-- account.
--
-- FIX. Two narrow, service-role-only functions, each doing ALL of its writes in
-- ONE transaction: everything commits, or nothing does.
--
-- NO EXTERNAL CALLS HAPPEN IN HERE. Shopify and PayPal are contacted by the
-- application, which then asks these functions to persist the already-verified
-- result atomically. PostgreSQL never makes an HTTP request.
--
-- WHY A SEPARATE MIGRATION rather than editing the two beside it: this file
-- calls claim_shopify_shop_ownership, whose final signature is created by
-- 20260901010000. Defining these functions afterwards keeps the dependency
-- order obvious and each file's subject coherent.
--
-- NOT APPLIED BY THIS TASK. Created and reviewed only.
-- ============================================================================

BEGIN;

-- ── 1) Complete a trusted Shopify App Store link ────────────────────────────
--
-- Called ONLY by app/api/shopify/link/complete, after it has verified: the
-- authenticated user, that the project belongs to that user, and that the
-- pending install exists, is unexpired and unconsumed. The install provenance
-- is read from the pending row itself — stamped server-side by the route that
-- created it — and NEVER from the request.
--
-- Outcomes: 'linked' (everything committed), 'pending_invalid' (the one-time
-- row was missing, expired or already consumed), or whichever blocking outcome
-- claim_shopify_shop_ownership returned ('shop_already_connected',
-- 'blocked_not_eligible'), in which case NOTHING is written.
CREATE OR REPLACE FUNCTION public.complete_shopify_app_store_link(
  p_pending_token text,
  p_user_id uuid,
  p_project_id uuid,
  p_connection_status text,
  p_last_error text
) RETURNS TABLE(outcome text, connection_id uuid, billing_authority text, migration_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_pending record;
  v_claim record;
  v_paypal_subscription_id text;
  v_existing_governance record;
  v_origin text;
  v_authority text;
  v_reason text;
  v_migration_created boolean := false;
  v_existing_migration uuid;
  v_rows integer;
BEGIN
  -- Consume the one-time token FIRST, conditionally. This is the concurrency
  -- gate: two simultaneous completions race here, and only one can win. If it
  -- matches nothing the row is missing, expired or already consumed, and
  -- nothing else in this function runs.
  UPDATE public.shopify_pending_installs p
     SET consumed_at = v_now
   WHERE p.token = p_pending_token
     AND p.consumed_at IS NULL
     AND p.expires_at > v_now
  RETURNING p.shop_domain, p.shop_gid, p.access_token_encrypted, p.refresh_token_encrypted,
            p.access_token_expires_at, p.refresh_token_expires_at, p.oauth_app_edition,
            p.api_version, p.granted_scopes, p.storefront_domain, p.install_origin
    INTO v_pending;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'pending_invalid', NULL::uuid, NULL::text, false;
    RETURN;
  END IF;

  -- Ownership claim, unchanged semantics — it still refuses to take a shop that
  -- another project holds. A refusal ROLLS BACK the consume above, because both
  -- happen in this one transaction.
  SELECT c.outcome, c.connection_id INTO v_claim
    FROM public.claim_shopify_shop_ownership(
      p_user_id, p_project_id, v_pending.shop_domain, v_pending.shop_gid,
      v_pending.access_token_encrypted, v_pending.api_version, v_pending.granted_scopes,
      v_pending.storefront_domain, p_connection_status, p_last_error,
      v_pending.refresh_token_encrypted, v_pending.access_token_expires_at,
      v_pending.refresh_token_expires_at, v_pending.oauth_app_edition
    ) c;

  IF v_claim.outcome NOT IN ('claimed', 'reactivated') OR v_claim.connection_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'raise_exception',
      MESSAGE = 'shopify_link_blocked:' || COALESCE(v_claim.outcome, 'save_failed');
  END IF;

  -- Billing authority moves ONLY for a verified direct App Store install. A
  -- website-initiated connection reaches this account by a different path and
  -- never gets here.
  IF v_pending.install_origin IS DISTINCT FROM 'shopify_app_store' THEN
    RETURN QUERY SELECT 'linked', v_claim.connection_id, NULL::text, false;
    RETURN;
  END IF;

  -- Does this account already pay through PayPal? An ACTIVE subscription row
  -- carrying a paypal_subscription_id is the same test
  -- initiateMigrationIfPayPalSubscriber uses; a trial row has none.
  SELECT s.paypal_subscription_id INTO v_paypal_subscription_id
    FROM public.subscriptions s
   WHERE s.user_id = p_user_id
     AND s.status = 'active'
     AND s.paypal_subscription_id IS NOT NULL
   ORDER BY s.created_at DESC
   LIMIT 1;

  SELECT g.signup_origin, g.billing_authority INTO v_existing_governance
    FROM public.billing_governance g
   WHERE g.user_id = p_user_id
   FOR UPDATE;

  -- PROVENANCE IS NEVER REWRITTEN. An account that already exists keeps the
  -- signup_origin it has — an existing website account that later installs from
  -- the App Store is still a website-origin account; the install is recorded by
  -- billing_authority + authority_reason, which is a different fact. When there
  -- is no row at all the server cannot PROVE this account was created by this
  -- install (the merchant may have signed into a long-standing account), so it
  -- records 'unknown' rather than guessing.
  v_origin := COALESCE(v_existing_governance.signup_origin, 'unknown');

  IF v_paypal_subscription_id IS NOT NULL THEN
    -- DEFERRED: an existing PayPal subscriber is not switched by installing.
    -- They go through the explicit migration workflow, and authority moves only
    -- when that migration is confirmed complete.
    v_authority := COALESCE(v_existing_governance.billing_authority, 'website');
    v_reason := 'shopify_app_store_install_deferred_paypal_migration';

    SELECT m.id INTO v_existing_migration
      FROM public.shopify_billing_migrations m
     WHERE m.user_id = p_user_id
       AND m.status IN ('pending', 'shopify_confirmed', 'paypal_cancel_failed')
     LIMIT 1;

    IF v_existing_migration IS NULL THEN
      INSERT INTO public.shopify_billing_migrations
        (user_id, project_id, shopify_connection_id, paypal_subscription_id, status)
      VALUES (p_user_id, p_project_id, v_claim.connection_id, v_paypal_subscription_id, 'pending');
      v_migration_created := true;
    ELSE
      UPDATE public.shopify_billing_migrations m
         SET project_id = p_project_id,
             shopify_connection_id = v_claim.connection_id,
             updated_at = v_now
       WHERE m.id = v_existing_migration;
    END IF;
  ELSE
    v_authority := 'shopify';
    v_reason := 'shopify_app_store_install';
  END IF;

  INSERT INTO public.billing_governance
    (user_id, signup_origin, billing_authority, authority_reason, authority_changed_at, updated_at)
  VALUES (p_user_id, v_origin, v_authority, v_reason,
          CASE WHEN v_authority IS DISTINCT FROM COALESCE(v_existing_governance.billing_authority, 'website')
               THEN v_now ELSE NULL END,
          v_now)
  ON CONFLICT (user_id) DO UPDATE
    SET billing_authority = EXCLUDED.billing_authority,
        authority_reason = EXCLUDED.authority_reason,
        authority_changed_at = COALESCE(EXCLUDED.authority_changed_at, public.billing_governance.authority_changed_at),
        updated_at = EXCLUDED.updated_at;
        -- signup_origin deliberately NOT updated: provenance is immutable.

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'raise_exception', MESSAGE = 'shopify_link_governance_not_persisted';
  END IF;

  RETURN QUERY SELECT 'linked', v_claim.connection_id, v_authority, v_migration_created;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_shopify_app_store_link(text, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_shopify_app_store_link(text, uuid, uuid, text, text) TO service_role;

-- ── 2) Complete a confirmed PayPal→Shopify migration ────────────────────────
--
-- Called ONLY after the application has verified the Shopify subscription is
-- active AND the PayPal cancellation call actually succeeded. Persists all
-- three consequences together: migration status, billing authority, and the
-- local PayPal mirror. Either all land or none do, so PayPal can never be
-- cancelled while the app still bills the account as a website customer.
--
-- The status transition is conditional on the expected prior state, so a
-- concurrent transition cannot be clobbered; a mismatch returns
-- 'unexpected_status' and writes nothing.
-- The PayPal subscription id is deliberately NOT a parameter. It is read from
-- the LOCKED migration row, and the mirror update is scoped by that row's
-- user_id as well, so no caller can aim a cancellation at another user's
-- subscription by passing an arbitrary id.
CREATE OR REPLACE FUNCTION public.complete_shopify_paypal_migration(
  p_migration_id uuid,
  p_user_id uuid
) RETURNS TABLE(outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_id uuid;
  v_rows integer;
  v_origin text;
  v_paypal_subscription_id text;
BEGIN
  -- Lock the row and take the subscription id FROM IT. The id and the user must
  -- belong to the same migration row, so a mismatched (migration, user) pair
  -- matches nothing and writes nothing at all.
  UPDATE public.shopify_billing_migrations m
     SET status = 'completed', last_error = NULL, updated_at = v_now
   WHERE m.id = p_migration_id
     AND m.user_id = p_user_id
     AND m.status IN ('pending', 'shopify_confirmed', 'paypal_cancel_failed')
   RETURNING m.id, m.paypal_subscription_id INTO v_id, v_paypal_subscription_id;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT 'unexpected_status';
    RETURN;
  END IF;

  -- Historical provenance is preserved; only authority moves.
  SELECT g.signup_origin INTO v_origin FROM public.billing_governance g WHERE g.user_id = p_user_id FOR UPDATE;

  INSERT INTO public.billing_governance
    (user_id, signup_origin, billing_authority, authority_reason, authority_changed_at, updated_at)
  VALUES (p_user_id, COALESCE(v_origin, 'unknown'), 'shopify', 'paypal_migration_completed', v_now, v_now)
  ON CONFLICT (user_id) DO UPDATE
    SET billing_authority = 'shopify',
        authority_reason = 'paypal_migration_completed',
        authority_changed_at = v_now,
        updated_at = v_now;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'raise_exception', MESSAGE = 'migration_governance_not_persisted';
  END IF;

  -- Local mirror of the cancellation. PayPal's own webhook applies the same
  -- update idempotently; doing it here keeps the two consistent immediately.
  -- DOUBLE-SCOPED: the subscription id came from the locked migration row, and
  -- the update is additionally restricted to that row's own user, so it can
  -- never touch another account's subscription.
  IF v_paypal_subscription_id IS NOT NULL THEN
    UPDATE public.subscriptions s
       SET status = 'cancelled', updated_at = v_now
     WHERE s.paypal_subscription_id = v_paypal_subscription_id
       AND s.user_id = p_user_id
       AND s.status <> 'cancelled';
  END IF;

  RETURN QUERY SELECT 'completed';
END;
$$;

REVOKE ALL ON FUNCTION public.complete_shopify_paypal_migration(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_shopify_paypal_migration(uuid, uuid) TO service_role;

COMMIT;

-- ============================================================================
-- Phase 2 — Shopify App Pricing support.
--
-- Design decision (normalized where it matters, embedded where it doesn't):
--   - Billing STATE that is intrinsically 1:1 with a shop connection (plan
--     handle, cached subscription status, last verification time, trial/
--     period dates) is added as columns on shopify_connections — the same
--     pattern already used for default_blog_id (20260727). A join here would
--     buy nothing: every Shopify entitlement check already loads this exact
--     row (loadShopifyConnection).
--   - The PayPal→Shopify migration is a genuinely distinct, transient,
--     audit-worthy PROCESS with its own state machine (pending →
--     shopify_confirmed → completed, or → paypal_cancel_failed needing
--     retry) — NOT a static attribute of the connection. It gets its own
--     table (shopify_billing_migrations) so retries are idempotent, history
--     is auditable, and shopify_connections isn't overloaded with transient
--     workflow state. This does NOT create a second source of entitlement
--     truth: shopify_connections answers "what is this shop's billing state
--     right now" (cache of the Shopify-authoritative answer); this new table
--     answers "is a PayPal→Shopify migration in progress for this user."
--     Neither is ever the SOURCE of truth for an active-publish decision —
--     the Partner API's live activeSubscription response is (lib/shopify/
--     billing-guard.ts revalidates on every publish; these columns are
--     cache/audit only, per the explicit Phase 2 requirement).
--
-- Cross-account hardening: shop_domain currently has NO uniqueness — the
-- SAME shop can be (and per a prior investigation, plausibly is) connected
-- to more than one Rankings account/project simultaneously. Phase 2 requires
-- "one canonical Shopify store owner/connection." Both new unique indexes
-- below (shop_domain, shop_gid) are preceded by a preflight check that
-- RAISEs a clear exception if a conflict already exists — this migration
-- NEVER deletes, merges, or reassigns ownership of a duplicate; resolving a
-- real conflict is a manual, human decision made with visibility into which
-- account genuinely owns the store.
--
-- Wrapped in one explicit transaction, same pattern as the Phase 1 migration.
-- NOT APPLIED by this change — authoritative for a later, deliberate apply.
-- ============================================================================

BEGIN;

-- ── 1) shopify_connections — Shopify App Pricing billing state (cache/audit) ──

ALTER TABLE public.shopify_connections
  -- Canonical Shopify Shop GID (e.g. gid://shopify/Shop/123), captured
  -- server-side via Admin GraphQL at OAuth completion — never accepted from
  -- the browser. NULL on connections created before this migration; those
  -- must re-verify once (captured at next OAuth/reconnect) before Shopify
  -- publishing can be granted — the guard fails closed on a null shop_gid.
  ADD COLUMN IF NOT EXISTS shop_gid text,

  -- Cache of the last Partner API activeSubscription verification. NEVER the
  -- source of truth for a publish decision — see lib/shopify/billing-guard.ts.
  ADD COLUMN IF NOT EXISTS shopify_plan_handle text,
  ADD COLUMN IF NOT EXISTS shopify_subscription_status text
    CHECK (shopify_subscription_status IN ('active', 'none', 'unknown') OR shopify_subscription_status IS NULL),
  ADD COLUMN IF NOT EXISTS shopify_trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS shopify_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS shopify_billing_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS shopify_billing_last_error text;

-- Preflight: shop_domain must not already be claimed by more than one row.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT shop_domain FROM public.shopify_connections
    GROUP BY shop_domain HAVING count(*) > 1
  ) dupes;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % shop_domain value(s) are claimed by more than one shopify_connections row. This migration does NOT delete, merge, or reassign ownership of any row — resolve the duplicate(s) manually (decide which account genuinely owns each store), then re-run.', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS shopify_connections_shop_domain_unique
  ON public.shopify_connections (shop_domain);

-- Preflight: shop_gid must not already be claimed by more than one row.
-- (Trivially satisfied on first apply — the column is new and all-NULL — but
-- checked defensively for consistency and in case of a partial prior apply.)
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT shop_gid FROM public.shopify_connections
    WHERE shop_gid IS NOT NULL
    GROUP BY shop_gid HAVING count(*) > 1
  ) dupes;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % shop_gid value(s) are claimed by more than one shopify_connections row. This migration does NOT delete, merge, or reassign ownership of any row — resolve the duplicate(s) manually, then re-run.', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS shopify_connections_shop_gid_unique
  ON public.shopify_connections (shop_gid)
  WHERE shop_gid IS NOT NULL;

-- ── 2) shopify_billing_migrations — PayPal → Shopify migration state machine ──

CREATE TABLE IF NOT EXISTS public.shopify_billing_migrations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL,
  project_id              uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  shopify_connection_id   uuid REFERENCES public.shopify_connections(id) ON DELETE SET NULL,

  -- Audit only — the PayPal subscription this migration is moving the user
  -- away from. Never used to re-derive current PayPal state (lib/subscription.ts
  -- / the subscriptions table remains authoritative for that).
  paypal_subscription_id  text,

  -- pending            → migration started; Shopify not yet confirmed active.
  --                       Shopify connector stays locked; PayPal untouched.
  -- shopify_confirmed  → Partner API confirmed an active plan; PayPal renewal
  --                       has NOT been stopped yet (this state exists so a
  --                       crash between "Shopify confirmed" and "PayPal
  --                       cancelled" is recoverable/retryable, never silently
  --                       lost).
  -- completed          → Shopify confirmed AND PayPal successfully cancelled.
  --                       Terminal — Shopify publishing may proceed (subject
  --                       to the normal, independent live billing-guard check).
  -- paypal_cancel_failed → Shopify confirmed, but the PayPal cancel call
  --                       itself failed. NOT hidden: surfaced for retry/manual
  --                       attention. Shopify publishing stays locked until
  --                       this resolves to 'completed' — never publish while
  --                       a customer might still be double-billed.
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'shopify_confirmed', 'completed', 'paypal_cancel_failed')),

  shopify_plan_handle     text,
  paypal_cancel_attempts  integer NOT NULL DEFAULT 0,
  last_error              text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Preflight: at most one ACTIVE (non-completed) migration per user — the
-- invariant the application relies on for idempotent retry (see
-- lib/shopify/paypal-migration.ts). Trivially satisfied on a new table;
-- checked for consistency with the Phase 1 pattern.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT user_id FROM public.shopify_billing_migrations
    WHERE status IN ('pending', 'shopify_confirmed', 'paypal_cancel_failed')
    GROUP BY user_id HAVING count(*) > 1
  ) dupes;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % user(s) have more than one active (non-completed) shopify_billing_migrations row. This migration does NOT delete, merge, or modify any row — resolve the duplicate(s) manually, then re-run.', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS shopify_billing_migrations_one_active_per_user
  ON public.shopify_billing_migrations (user_id)
  WHERE status IN ('pending', 'shopify_confirmed', 'paypal_cancel_failed');

CREATE INDEX IF NOT EXISTS idx_shopify_billing_migrations_project
  ON public.shopify_billing_migrations (project_id);

ALTER TABLE public.shopify_billing_migrations ENABLE ROW LEVEL SECURITY;

-- Owner-scoped (defense-in-depth; server routes use the service role after an
-- explicit ownership + session-user check, same pattern as shopify_oauth_states).
CREATE POLICY shopify_billing_migrations_select ON public.shopify_billing_migrations
  FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY shopify_billing_migrations_insert ON public.shopify_billing_migrations
  FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));
CREATE POLICY shopify_billing_migrations_update ON public.shopify_billing_migrations
  FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

COMMIT;

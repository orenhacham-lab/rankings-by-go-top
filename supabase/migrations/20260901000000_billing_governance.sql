-- ============================================================================
-- Billing governance — a durable, server-controlled record of WHO bills an
-- account, replacing the inference "this account has a Shopify connection,
-- therefore Shopify bills it".
--
-- PROBLEM (production). lib/shopify/entitlement-resolver.ts decided billing
-- authority by looking for a live `shopify_connections` row with
-- connection_status='connected'. But a connection row is an INTEGRATION
-- record: a website customer who connects Shopify purely as a publishing
-- destination gets one too. Those users were therefore switched to Shopify
-- billing by the act of connecting a store, and — having no Shopify App
-- Pricing subscription — dropped to the zero-entitlement
-- 'shopify_billing_required' state. The product is website-first: almost all
-- customers register on the website and pay there.
--
-- DESIGN. One row per account, written ONLY by trusted server-side flows:
--
--   signup_origin      how the ACCOUNT came into existence.
--                        'website'           registered on the website
--                        'shopify_app_store' created by a verified direct
--                                            Shopify App Store install
--   billing_authority  who bills it RIGHT NOW.
--                        'website'  website trial / PayPal
--                        'shopify'  Shopify App Pricing
--
-- signup_origin is provenance and does not change once set. billing_authority
-- may change, but only through an explicit trusted transition (a verified
-- direct App Store install being linked, or a COMPLETED PayPal→Shopify
-- migration) — never because a connection was created, disconnected, revoked,
-- refreshed or failed. authority_reason records which trusted transition did
-- it, as a stable non-sensitive code.
--
-- WHY A DEDICATED TABLE, not a column on public.profiles. This value decides
-- who pays, so an authenticated browser must not be able to change it. The
-- repository contains no CREATE POLICY for public.profiles, so this migration
-- cannot demonstrate that a user is unable to update their own profile row —
-- and a security-sensitive field must not rest on an unverified assumption. A
-- separate table with RLS enabled and NO policies is provable from this file
-- alone: PostgREST evaluates policies for anon/authenticated, finds none, and
-- denies every read and write. It is the same pattern the repository already
-- uses for shopify_pending_installs and shopify_preauth_states.
--
-- NOT APPLIED BY THIS TASK. Created and reviewed only.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.billing_governance (
  user_id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  signup_origin         text NOT NULL DEFAULT 'website'
                          CHECK (signup_origin IN ('website', 'shopify_app_store')),
  billing_authority     text NOT NULL DEFAULT 'website'
                          CHECK (billing_authority IN ('website', 'shopify')),
  -- Stable, non-sensitive code naming the trusted transition that last set
  -- billing_authority. Never a token, a shop domain secret, or an error body.
  authority_reason      text,
  authority_changed_at  timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_governance IS
  'Server-controlled billing authority per account. Written only by trusted server-side flows via the service role; never by a browser.';

-- Operational lookup: "which accounts are Shopify-governed".
CREATE INDEX IF NOT EXISTS idx_billing_governance_authority
  ON public.billing_governance (billing_authority);

-- ── Permissions ─────────────────────────────────────────────────────────────
--
-- RLS ON with NO policies = anon and authenticated can neither read nor write,
-- whatever table grants exist. The explicit REVOKE removes the grants as well,
-- so both layers deny independently.
ALTER TABLE public.billing_governance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_governance FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.billing_governance TO service_role;
-- Deliberately no DELETE: an account's billing history is never silently
-- erased; the row goes only with the auth.users row it references.

-- ── Backfill ────────────────────────────────────────────────────────────────
--
-- The business is website-first, so the safe default for EVERY existing
-- account is website authority. A Shopify connection is NOT treated as proof
-- of Shopify billing — treating it as proof is the bug this migration exists
-- to end, and doing it here would move paying website customers onto a billing
-- provider that has never charged them.
--
-- Two categories of existing authoritative proof do move an account to
-- Shopify, because in both cases Shopify is already the party billing it:
--
--   1. a COMPLETED PayPal→Shopify migration (shopify_billing_migrations
--      status='completed' — the repository's own explicit success condition;
--      see lib/shopify/paypal-migration.ts, which never records 'completed'
--      without confirming both the Shopify side and the PayPal cancellation);
--
--   2. a live connection carrying a Partner-API-CONFIRMED active subscription
--      (shopify_subscription_status='active' AND shopify_billing_verified_at
--      IS NOT NULL). That column is written only by recordShopifyBillingCache
--      after a successful Shopify Partner API check, so it is an authoritative
--      Shopify billing record, not an inference from the connection existing.
--
-- KNOWN AMBIGUOUS CATEGORY, deliberately NOT guessed: an account that
-- installed directly from the Shopify App Store but has not yet chosen a plan
-- has no surviving authoritative marker — shopify_pending_installs rows are
-- single-use and short-lived, and nothing durable recorded the install
-- provenance before this migration. Such an account is backfilled to
-- 'website'. That is the fail-safe direction: it leaves the account on website
-- billing rather than fabricating a Shopify obligation, and the next verified
-- App Store install or completed migration moves it to 'shopify' through the
-- normal trusted transition. It is reported rather than heuristically guessed.
INSERT INTO public.billing_governance (user_id, signup_origin, billing_authority, authority_reason, authority_changed_at)
SELECT
  u.id,
  -- Provenance is unknown for pre-existing accounts and is never invented.
  'website',
  CASE WHEN proof.user_id IS NOT NULL THEN 'shopify' ELSE 'website' END,
  CASE WHEN proof.user_id IS NOT NULL THEN proof.reason ELSE 'backfill_website_default' END,
  CASE WHEN proof.user_id IS NOT NULL THEN pg_catalog.now() ELSE NULL END
FROM auth.users u
LEFT JOIN (
  -- Grouped so an account holding BOTH proofs yields exactly one row with one
  -- deterministic reason, rather than two rows whose winner would depend on
  -- execution order.
  SELECT p.user_id, pg_catalog.min(p.reason) AS reason
    FROM (
      SELECT m.user_id, 'backfill_completed_paypal_migration'::text AS reason
        FROM public.shopify_billing_migrations m
       WHERE m.status = 'completed'
      UNION ALL
      SELECT c.user_id, 'backfill_verified_shopify_subscription'::text AS reason
        FROM public.shopify_connections c
       WHERE c.archived_at IS NULL
         AND c.connection_status = 'connected'
         AND c.shopify_subscription_status = 'active'
         AND c.shopify_billing_verified_at IS NOT NULL
    ) p
   GROUP BY p.user_id
) AS proof ON proof.user_id = u.id
ON CONFLICT (user_id) DO NOTHING;

-- ── Trusted install provenance on the pending-install handoff ───────────────
--
-- billing_governance answers "who bills this account". This column is how the
-- answer is allowed to CHANGE: it records which verified server-side flow
-- produced a pending install, so that app/api/shopify/link/complete can tell a
-- direct Shopify App Store install from a website-initiated connection at the
-- moment the store is linked to an account.
--
-- It is stamped by the route, from the flow it is in — never from a request
-- body, query parameter or header — so a browser cannot claim App Store
-- provenance in order to change who bills it. Nullable, and a NULL reads as
-- the SAFE value ('website_connector'), so a row written before this column
-- existed can never move an account onto Shopify billing.
ALTER TABLE public.shopify_pending_installs
  ADD COLUMN IF NOT EXISTS install_origin text
    CHECK (install_origin IN ('shopify_app_store', 'website_connector') OR install_origin IS NULL);

COMMIT;

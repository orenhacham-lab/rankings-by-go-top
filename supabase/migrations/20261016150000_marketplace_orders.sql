-- ============================================================================
-- Orders bought on an EXTERNAL MARKETPLACE where the platform is the seller
-- of record (JVZoo, ClickBank, Digistore24 and their like).
--
-- WHY A TABLE AND NOT A DIRECT ENTITLEMENT WRITE. On these platforms the
-- buyer pays the PLATFORM, on the platform's page, before we have ever seen
-- them: there is no account yet, and the webhook that tells us about the
-- payment is the first time that person exists to us. Creem's webhook can
-- write an entitlement because its checkout was started from inside a
-- signed-in session (`request_id` is the account id); a marketplace webhook
-- has nothing to attach to.
--
-- The two ways out of that are not equal:
--   * create an auth user from the webhook and mail it a password — an
--     externally triggered account-creation path, which is a standing abuse
--     surface and puts credentials in an email;
--   * record the paid order here and let the BUYER claim it when they sign
--     up through the front door we already have.
-- This migration is the second one. Nothing here grants anything on its own:
-- a row is a receipt waiting for its owner, and the entitlement is still
-- written by lib/billing/entitlement-write.ts at claim time, under the same
-- single-current-entitlement invariant as every other provider.
--
-- `provider` IS A PATTERN, NOT A CLOSED LIST. Everywhere else this schema
-- prefers a CHECK listing the permitted values, and for good reason. Here the
-- whole point of the layer is that a second or third marketplace is a small
-- adapter plus configuration, not a migration run against Production, so the
-- column accepts any short lower-case slug and the closed world lives in
-- lib/marketplace/config.ts, where an unregistered provider is refused before
-- a row is ever written. A slug nobody configured can therefore never arrive.
--
-- WHAT IS DELIBERATELY NOT STORED. No raw provider payload and no IP. A
-- receipt needs the ids, the plan, the money and the buyer's email; keeping
-- the whole event body would mean keeping whatever else a platform decided to
-- put in it, in a table nobody has promised anything about.
--
-- NO DELETE GRANT. service_role may read, insert and update; nothing in the
-- application deletes an order. Retention for an order that is never claimed
-- is deliberately NOT decided here: the 12-month deletions this project
-- publishes are published promises, and adding one to a document is the legal
-- thread's call, not a migration's.
--
-- Also widens `billing_governance` by one value. A claimed marketplace
-- account is billed by the marketplace: it must not be offered PayPal or
-- Creem, or it would be charged twice for one entitlement.
--
-- Probe: bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/marketplace-orders.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The marketplace's own slug, as registered in lib/marketplace/config.ts.
  provider             text NOT NULL
                         CONSTRAINT marketplace_orders_provider_slug
                         CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  -- The platform's identifier for this purchase. Unique per provider, which
  -- is what makes a redelivered webhook a no-op instead of a second grant.
  external_order_id    text NOT NULL
                         CONSTRAINT marketplace_orders_external_order_id_len
                         CHECK (char_length(external_order_id) BETWEEN 1 AND 200),
  -- The platform's product identifier, kept for support and reconciliation.
  -- The plan is NOT derived from it at read time: it is resolved once, from
  -- our own configuration, and stored below.
  external_product_id  text
                         CONSTRAINT marketplace_orders_external_product_id_len
                         CHECK (external_product_id IS NULL OR char_length(external_product_id) BETWEEN 1 AND 200),
  plan_code            text NOT NULL
                         CONSTRAINT marketplace_orders_plan_code
                         CHECK (plan_code IN ('regular', 'advanced', 'premium', 'large_agency')),
  -- Lower-cased by the application before the insert. The buyer's address on
  -- the platform; it is how support finds an order whose claim link was lost.
  buyer_email          text NOT NULL
                         CONSTRAINT marketplace_orders_buyer_email
                         CHECK (buyer_email = lower(buyer_email) AND position('@' in buyer_email) > 1),
  -- The capability that claims this order, generated server-side. It travels
  -- in the return URL the platform sends the buyer to. Unguessable, single
  -- purpose, and it stops being usable the moment the order is claimed.
  claim_token          text NOT NULL UNIQUE
                         CONSTRAINT marketplace_orders_claim_token_len
                         CHECK (char_length(claim_token) BETWEEN 32 AND 128),
  status               text NOT NULL DEFAULT 'paid'
                         CONSTRAINT marketplace_orders_status
                         CHECK (status IN ('paid', 'claimed', 'refunded', 'cancelled')),
  -- Money as the platform reported it. Minor units and an ISO code, never a
  -- float, and never recomputed from our own price list: what the buyer paid
  -- is the platform's fact, not ours.
  amount_minor         integer
                         CONSTRAINT marketplace_orders_amount_minor
                         CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency             text
                         CONSTRAINT marketplace_orders_currency
                         CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  -- The absolute period end the platform reported, when it reports one. Never
  -- computed locally: `+1 month from whatever was stored` is the bug the
  -- PayPal path already had and fixed.
  current_period_end   timestamptz,
  claimed_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- One purchase on one platform is one row. This is the idempotency, and it
  -- is the database's job rather than a pre-read in the webhook: two
  -- deliveries racing each other both reach the insert, and exactly one wins.
  CONSTRAINT marketplace_orders_provider_order UNIQUE (provider, external_order_id),
  -- 'claimed' and an owner are one fact: neither can exist without the other,
  -- so a receipt cannot be marked spent without saying who spent it, and an
  -- owner cannot be attached without the status that stops the token working.
  -- A REFUNDED order keeps its owner, because the person who claimed it is
  -- still the person whose entitlement has to be withdrawn; what travels
  -- together there is the owner and the time, not the status.
  CONSTRAINT marketplace_orders_claim_coherent CHECK (
    (status = 'paid' AND claimed_by IS NULL AND claimed_at IS NULL)
    OR (status = 'claimed' AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL)
    OR (status IN ('refunded', 'cancelled') AND (claimed_by IS NULL) = (claimed_at IS NULL))
  )
);

COMMENT ON TABLE public.marketplace_orders IS
  'Purchases made on an external marketplace that is the seller of record. A row is a receipt awaiting the buyer; the entitlement is written when the buyer claims it at signup. Server-side service role only.';

-- Support's lookup: "this person says they bought on <platform>".
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer_email
  ON public.marketplace_orders (buyer_email);
-- The operator screen's lookup: what is paid for and still unclaimed.
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_unclaimed
  ON public.marketplace_orders (created_at DESC)
  WHERE status = 'paid';

-- ── A claim happens once ────────────────────────────────────────────────────
-- Refunds and cancellations still have to be recordable after a claim, so the
-- trigger does not freeze the row. It freezes the ONE thing a later write
-- must never do: move an order to a different owner, or quietly un-claim it
-- so the same receipt can be spent twice.
CREATE OR REPLACE FUNCTION public.marketplace_orders_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.claimed_by IS NOT NULL AND NEW.claimed_by IS DISTINCT FROM OLD.claimed_by THEN
    RAISE EXCEPTION 'marketplace_orders.claimed_by is final once set';
  END IF;
  IF OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at THEN
    RAISE EXCEPTION 'marketplace_orders.claimed_at is final once set';
  END IF;
  IF OLD.status = 'claimed' AND NEW.status = 'paid' THEN
    RAISE EXCEPTION 'a claimed marketplace order cannot return to paid';
  END IF;
  IF NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.external_order_id IS DISTINCT FROM OLD.external_order_id
     OR NEW.claim_token IS DISTINCT FROM OLD.claim_token THEN
    RAISE EXCEPTION 'marketplace_orders identity columns are immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_orders_guard ON public.marketplace_orders;
CREATE TRIGGER trg_marketplace_orders_guard
  BEFORE UPDATE ON public.marketplace_orders
  FOR EACH ROW EXECUTE FUNCTION public.marketplace_orders_guard();

-- ── Permissions: the server, and nothing else ───────────────────────────────
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
-- No policies on purpose. RLS with no policy denies every browser role, and
-- the service role bypasses RLS, so the server is the only reader. A buyer
-- has no business reading another buyer's receipt, and an order says what
-- someone paid and when.
REVOKE ALL ON TABLE public.marketplace_orders FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.marketplace_orders TO service_role;

-- ── Who bills a marketplace account ─────────────────────────────────────────
-- The constraints below were created inline and unnamed in
-- 20260901000000_billing_governance.sql, so Postgres named them itself; both
-- spellings are dropped IF EXISTS and re-added with explicit names, which
-- makes this file replayable and the next widening greppable.
ALTER TABLE public.billing_governance
  DROP CONSTRAINT IF EXISTS billing_governance_billing_authority_check,
  DROP CONSTRAINT IF EXISTS billing_governance_billing_authority;
ALTER TABLE public.billing_governance
  ADD CONSTRAINT billing_governance_billing_authority
  CHECK (billing_authority IN ('website', 'shopify', 'marketplace'));

ALTER TABLE public.billing_governance
  DROP CONSTRAINT IF EXISTS billing_governance_signup_origin_check,
  DROP CONSTRAINT IF EXISTS billing_governance_signup_origin;
ALTER TABLE public.billing_governance
  ADD CONSTRAINT billing_governance_signup_origin
  CHECK (signup_origin IN ('website', 'shopify_app_store', 'marketplace', 'unknown'));

-- ── Where a marketplace-billed subscription lives ───────────────────────────
-- Mirrors 20261010150044_creem_subscription_id.sql exactly, and for the same
-- reason: a subscription row must say WHICH provider holds it, so each
-- provider gets its own column rather than sharing one. Here the reference is
-- the order rather than a provider-side subscription id, because that is what
-- these platforms actually give us — the recurring charge lives on their
-- side under their own identifiers, and the order is the thing we were told
-- about and can reconcile against.
--
-- ADDITIVE: one nullable column, one partial unique index, and the existing
-- one-provider-per-row CHECK widened to cover it. Every existing row keeps
-- the values it has and gets NULL here, and no code reads or writes the
-- column until a marketplace provider is both registered AND switched on,
-- and none is.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS marketplace_order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.subscriptions.marketplace_order_id IS
  'The marketplace_orders row that paid for this entitlement, for accounts bought on an external marketplace. NULL for PayPal-, Creem- and Shopify-billed rows. Mutually exclusive with the other providers'' ids, enforced by subscriptions_one_provider_per_row.';

-- One order pays for one entitlement. Without this, two rows could both
-- claim the same receipt and a refund would have no well-defined row to
-- withdraw.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_marketplace_order_id_unique
  ON public.subscriptions (marketplace_order_id)
  WHERE marketplace_order_id IS NOT NULL;

-- Widen the mutual exclusion from two providers to three. Dropped and
-- re-added rather than patched, because a CHECK cannot be altered in place;
-- the preflight refuses to do it while a row would violate the new shape,
-- rather than leaving the table with no constraint at all.
DO $$
DECLARE
  offenders integer;
BEGIN
  SELECT count(*) INTO offenders FROM public.subscriptions
   WHERE (CASE WHEN paypal_subscription_id IS NOT NULL THEN 1 ELSE 0 END)
       + (CASE WHEN creem_subscription_id   IS NOT NULL THEN 1 ELSE 0 END)
       + (CASE WHEN marketplace_order_id    IS NOT NULL THEN 1 ELSE 0 END) > 1;
  IF offenders > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % subscription row(s) already carry more than one provider, which means an account billed twice for one entitlement. Nothing was modified — resolve it, then re-run.', offenders;
  END IF;
  ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_one_provider_per_row;
  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_one_provider_per_row
    CHECK ((CASE WHEN paypal_subscription_id IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN creem_subscription_id   IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN marketplace_order_id    IS NOT NULL THEN 1 ELSE 0 END) <= 1);
END $$;

-- ── The claim, as ONE atomic transition ─────────────────────────────────────
-- Every trusted billing-authority transition in this schema is a database
-- function rather than a sequence of writes from a route
-- (lib/billing/governance.ts names the other two), because a route that
-- half-finished would leave a paid buyer with an account that is marketplace-
-- governed and has no entitlement, or an entitlement nobody is billing for.
-- This is the third such transition and it follows the same rule.
--
-- WHAT IT REFUSES, and never papers over:
--   'order_unavailable'   no such claim token, or the order is not awaiting a
--                         claim — already claimed, refunded or cancelled. A
--                         receipt is spendable exactly once.
--   'period_end_unknown'  the platform did not tell us when the period ends.
--                         Nothing is written: a period end computed locally is
--                         the bug the PayPal path already had and fixed, and a
--                         guess here would renew itself for ever.
--   'multiple_current_entitlement_rows'
--                         the single-current-entitlement invariant was already
--                         violated before this ran. Nothing is chosen
--                         arbitrarily and nothing is written.
--   'already_claimed_by_this_account'
--                         idempotency: the buyer reloaded the claim link. The
--                         same order and the same account is a no-op, not an
--                         error and not a second entitlement.
--
-- `signup_origin` IS NEVER REWRITTEN. An account that began on the website
-- and later claims a marketplace order is still website-origin; only the
-- authority moves. That is the same immutability rule the Shopify transitions
-- obey.
CREATE OR REPLACE FUNCTION public.claim_marketplace_order(p_user_id uuid, p_claim_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order   public.marketplace_orders;
  v_rows    integer;
  v_row_id  uuid;
BEGIN
  IF p_user_id IS NULL OR coalesce(p_claim_token, '') = '' THEN
    RETURN 'order_unavailable';
  END IF;

  SELECT * INTO v_order FROM public.marketplace_orders
   WHERE claim_token = p_claim_token
     FOR UPDATE;

  IF NOT FOUND THEN RETURN 'order_unavailable'; END IF;

  -- The reload case, settled before the status check so it does not read as a
  -- spent receipt.
  IF v_order.status = 'claimed' AND v_order.claimed_by = p_user_id THEN
    RETURN 'already_claimed_by_this_account';
  END IF;
  IF v_order.status <> 'paid' THEN RETURN 'order_unavailable'; END IF;
  IF v_order.current_period_end IS NULL THEN RETURN 'period_end_unknown'; END IF;

  SELECT count(*) INTO v_rows FROM public.subscriptions
   WHERE user_id = p_user_id AND status IN ('trial', 'active');
  IF v_rows > 1 THEN RETURN 'multiple_current_entitlement_rows'; END IF;

  IF v_rows = 1 THEN
    -- Converted IN PLACE, exactly as the PayPal and Creem activations do: a
    -- trial becoming a paid plan is one row changing, never a cancel followed
    -- by an insert that might not happen.
    SELECT id INTO v_row_id FROM public.subscriptions
     WHERE user_id = p_user_id AND status IN ('trial', 'active');
    UPDATE public.subscriptions
       SET status = 'active',
           plan_code = v_order.plan_code,
           current_period_end = v_order.current_period_end,
           marketplace_order_id = v_order.id,
           paypal_subscription_id = NULL,
           creem_subscription_id = NULL,
           trial_ends_at = NULL,
           updated_at = now()
     WHERE id = v_row_id;
  ELSE
    INSERT INTO public.subscriptions
      (user_id, status, plan_code, current_period_end, marketplace_order_id)
    VALUES
      (p_user_id, 'active', v_order.plan_code, v_order.current_period_end, v_order.id);
  END IF;

  UPDATE public.marketplace_orders
     SET status = 'claimed', claimed_by = p_user_id, claimed_at = now()
   WHERE id = v_order.id AND status = 'paid';

  INSERT INTO public.billing_governance
    (user_id, signup_origin, billing_authority, authority_reason, authority_changed_at)
  VALUES
    (p_user_id, 'marketplace', 'marketplace', 'marketplace_order_claimed', now())
  ON CONFLICT (user_id) DO UPDATE
     SET billing_authority = 'marketplace',
         authority_reason = 'marketplace_order_claimed',
         authority_changed_at = now(),
         updated_at = now();

  RETURN 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_marketplace_order(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_order(uuid, text) TO service_role;

COMMENT ON FUNCTION public.claim_marketplace_order(uuid, text) IS
  'Atomically turns a paid marketplace order into an entitlement for the claiming account and moves billing authority to the marketplace. Server-side service role only.';

COMMIT;

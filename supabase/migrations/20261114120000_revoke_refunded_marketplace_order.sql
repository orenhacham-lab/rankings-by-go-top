-- ============================================================================
-- A REFUNDED MARKETPLACE ORDER LOSES ITS ENTITLEMENT, in one transaction.
--
-- WHY THIS EXISTS NOW. Until today a refund did exactly one thing: it set the
-- order's status (lib/marketplace/intake.ts). The subscription row the claim
-- had written was left alone, so a buyer who paid a marketplace, claimed the
-- plan and then took their money back kept the plan. That was survivable
-- while every marketplace page said that a return is the platform's affair
-- and quoted no window of our own. It stopped being survivable on
-- 2026-11-14, when the owner accepted Digistore24's demand and the
-- Digistore24 page began to promise a full refund inside 60 days, no
-- questions asked: an unconditional promise with no revocation behind it is
-- a channel that gives the product away to anyone who asks.
--
-- A REFUND IS NOT A CANCELLATION, and this function deliberately handles only
-- the first. A cancellation on these platforms means the subscription will not
-- renew; the buyer has paid for the period they are in and keeps it until
-- current_period_end, exactly as a cancelled PayPal subscription does. A
-- refund means the money went back, so there is no paid period left to honour
-- and access ends at once. Ending access on a cancellation notice would cut
-- off a buyer who paid, which is why `p_kind` is checked rather than assumed.
--
-- 'expired' IS THE STATUS, NOT 'cancelled'. lib/subscription.ts reads three
-- statuses: 'trial', 'active' and 'cancelled' — and 'cancelled' still grants
-- the plan until current_period_end, which is the opposite of what a refund
-- means. 'expired' is outside that read, so the account falls back to the
-- trial tier immediately and nothing has to be back-dated. current_period_end
-- is left as it was ON PURPOSE: it records a period the platform really did
-- bill, and rewriting it would destroy a payment fact to express an access
-- decision the status already expresses.
--
-- AND IT IS KEYED THE WAY THE PLATFORM SPEAKS. A webhook knows the provider
-- slug and the external order id; it does not know our row's uuid. Looking
-- the row up inside the function, under FOR UPDATE, is what makes the whole
-- thing atomic — the order's status and the entitlement move together or not
-- at all, which is the rule lib/billing/governance.ts sets for every trusted
-- billing transition in this schema.
--
-- WHAT IT DOES NOT DO. It does not delete anything, it does not touch
-- billing_governance (the account was and remains marketplace-governed: the
-- authority is a fact about who bills, not about whether a plan is live), and
-- it does not refund money. Only the platform can do that; this is the
-- bookkeeping that follows the platform having done it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revoke_marketplace_order(
  p_provider text,
  p_external_order_id text,
  p_kind text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.marketplace_orders;
  v_rows  integer;
BEGIN
  IF coalesce(p_provider, '') = '' OR coalesce(p_external_order_id, '') = '' THEN
    RETURN 'order_unknown';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('refunded', 'cancelled') THEN
    RETURN 'invalid_kind';
  END IF;

  SELECT * INTO v_order FROM public.marketplace_orders
   WHERE provider = p_provider
     AND external_order_id = p_external_order_id
     FOR UPDATE;

  IF NOT FOUND THEN RETURN 'order_unknown'; END IF;

  UPDATE public.marketplace_orders
     SET status = p_kind, updated_at = now()
   WHERE id = v_order.id;

  -- A cancellation stops the next charge and nothing else: the period the
  -- buyer paid for is theirs.
  IF p_kind = 'cancelled' THEN
    RETURN 'order_marked';
  END IF;

  -- Nobody ever claimed it, so there is no entitlement to end. Reported as
  -- its own answer rather than as a success, because an unclaimed refund and
  -- a revoked plan are different things for whoever reads the log.
  IF v_order.claimed_by IS NULL THEN
    RETURN 'order_marked';
  END IF;

  UPDATE public.subscriptions
     SET status = 'expired',
         updated_at = now()
   WHERE marketplace_order_id = v_order.id
     AND status IN ('trial', 'active', 'cancelled');

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- The order says claimed and no live entitlement row carries it. Not an
  -- error to raise at a webhook — the order is correctly marked either way —
  -- but it is a state a person should look at, so it has its own answer.
  IF v_rows = 0 THEN RETURN 'order_marked_entitlement_missing'; END IF;

  RETURN 'revoked';
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_marketplace_order(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_marketplace_order(text, text, text) TO service_role;

COMMENT ON FUNCTION public.revoke_marketplace_order(text, text, text) IS
  'Atomically marks a marketplace order refunded or cancelled and, for a refund only, ends the entitlement that claimed it. Server-side service role only.';

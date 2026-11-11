-- ============================================================================
-- A MARKETPLACE RENEWAL EXTENDS WHAT IT PAID FOR.
--
-- THE GAP THIS CLOSES, as 20261016160000_marketplace_orders.sql states it in
-- its own words: on these platforms a monthly renewal is another transaction
-- on the SAME order item, so it reaches `recordMarketplaceOrder` as the
-- unique-violation that makes a redelivered webhook a no-op. The receipt was
-- therefore correct for the first month and frozen afterwards: a buyer who
-- keeps paying loses access at the end of the period they first bought, with
-- nothing in the system saying why. The order key is not the bug — keying on
-- the order item is what lets a refund find the row it refunds — so the fix
-- belongs here, in a transition that knows a later period end when it sees
-- one.
--
-- WHY A DATABASE FUNCTION. A renewal moves TWO rows: the receipt and, once
-- the buyer has claimed it, the entitlement that is billed by the
-- marketplace. A route that half-finished would extend the receipt and leave
-- the customer locked out, or extend an entitlement whose receipt still says
-- the period ended last month, and support would have no way to tell which
-- happened. Every trusted billing transition in this schema is atomic in the
-- database (lib/billing/governance.ts names the others), and this is one.
--
-- WHAT IT REFUSES, and never papers over:
--   'order_unknown'        no row for this provider and order id. The renewal
--                          arrived for a purchase we were never told about,
--                          which a person has to reconcile; nothing is
--                          invented.
--   'not_renewable'        the order is refunded or cancelled. A later charge
--                          on a withdrawn order is a contradiction on the
--                          platform's side, so access is NOT restored here.
--   'period_end_unknown'   the event carried no period end. Nothing is
--                          written, for the reason the claim function gives:
--                          a locally computed period end renews itself for
--                          ever.
--   'already_current'      the period end is not later than the one on file.
--                          This is the redelivery case and the ordinary
--                          answer to a retried webhook: a no-op, not an
--                          error.
--   'entitlement_missing'  the order is claimed but no subscription row
--                          carries it. The invariant was already broken
--                          before this ran, so nothing is chosen arbitrarily.
--
-- WHAT IT DELIBERATELY DOES NOT DO. It does not change the plan, the money,
-- the owner or the billing authority, and it does not resurrect a trial: a
-- renewal says one thing only, that the paid period now runs further. It also
-- never moves a period end BACKWARDS, so an out-of-order delivery cannot
-- shorten access.
--
-- Probe: bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/marketplace-renewal.probe.sql
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.renew_marketplace_order(
  p_provider          text,
  p_external_order_id text,
  p_period_end        timestamptz
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

  SELECT * INTO v_order FROM public.marketplace_orders
   WHERE provider = p_provider AND external_order_id = p_external_order_id
     FOR UPDATE;

  IF NOT FOUND THEN RETURN 'order_unknown'; END IF;
  IF v_order.status IN ('refunded', 'cancelled') THEN RETURN 'not_renewable'; END IF;
  IF p_period_end IS NULL THEN RETURN 'period_end_unknown'; END IF;
  -- Not later is not news. Equal is the plain redelivery; earlier is an
  -- out-of-order delivery, and honouring it would shorten paid access.
  IF v_order.current_period_end IS NOT NULL AND p_period_end <= v_order.current_period_end THEN
    RETURN 'already_current';
  END IF;

  -- EVERY REFUSAL IS SETTLED BEFORE THE FIRST WRITE. A function that extended
  -- the receipt and then discovered it had no entitlement to extend would
  -- leave exactly the half-state this transition exists to prevent: a receipt
  -- paid to next month and an entitlement that lapsed last month, with
  -- nothing saying which is true.
  --
  -- A claimed receipt must have an entitlement carrying it. The column has a
  -- partial unique index, so more than one is impossible; zero is the real
  -- case, and it means the invariant was already broken before this ran.
  IF v_order.status = 'claimed' THEN
    SELECT count(*) INTO v_rows FROM public.subscriptions
     WHERE marketplace_order_id = v_order.id;
    IF v_rows = 0 THEN RETURN 'entitlement_missing'; END IF;
  END IF;

  UPDATE public.marketplace_orders
     SET current_period_end = p_period_end
   WHERE id = v_order.id;

  -- An unclaimed receipt has no entitlement to extend, and that is a complete
  -- answer: the buyer claims it later and gets the period the receipt now
  -- carries.
  IF v_order.status <> 'claimed' THEN RETURN 'renewed'; END IF;

  -- `status` is set rather than assumed: an entitlement whose period lapsed
  -- before the renewal arrived is the whole point of this function, and
  -- leaving it on whatever it had drifted to would extend a row nobody reads.
  -- The plan is NOT touched: an upgrade is a different event.
  UPDATE public.subscriptions
     SET current_period_end = p_period_end,
         status = 'active',
         trial_ends_at = NULL,
         updated_at = now()
   WHERE marketplace_order_id = v_order.id;

  RETURN 'renewed';
END;
$$;

REVOKE ALL ON FUNCTION public.renew_marketplace_order(text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_marketplace_order(text, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.renew_marketplace_order(text, text, timestamptz) IS
  'Atomically extends a marketplace order''s paid period, and the entitlement it paid for once claimed, to a period end later than the one on file. Never moves a period end backwards, never changes plan, owner or billing authority. Server-side service role only.';

COMMIT;

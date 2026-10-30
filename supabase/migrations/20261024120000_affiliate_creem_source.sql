-- Creem becomes a commission source the affiliate books accept.
--
-- WHY: the affiliate programme was built when PayPal was the only provider
-- that tells us a payment happened, so `affiliate_commissions.source` and
-- `affiliate_referrals.billing_source` were closed over 'paypal' and
-- 'shopify' (20261009190000_affiliate_program.sql). Creem is the merchant of
-- record for card payments outside Israel and is live, so a referred customer
-- paying from abroad has to earn the partner the published 30% / 40% — and
-- lib/affiliate/creem-bridge.ts writes source = 'creem'. Without this, every
-- such insert is refused by the CHECK and the partner is simply not paid.
--
-- ADDITIVE ONLY: the two constraints are replaced by the same rule with one
-- more allowed value. No row changes, nothing is dropped, and every value
-- that was legal before is still legal. Safe to run twice.

ALTER TABLE public.affiliate_commissions
  DROP CONSTRAINT IF EXISTS affiliate_commissions_source;
ALTER TABLE public.affiliate_commissions
  ADD CONSTRAINT affiliate_commissions_source
  CHECK (source IN ('paypal', 'shopify', 'creem', 'manual'));

ALTER TABLE public.affiliate_referrals
  DROP CONSTRAINT IF EXISTS affiliate_referrals_billing_source;
ALTER TABLE public.affiliate_referrals
  ADD CONSTRAINT affiliate_referrals_billing_source
  CHECK (billing_source IS NULL OR billing_source IN ('paypal', 'shopify', 'creem'));

COMMENT ON COLUMN public.affiliate_commissions.source IS
  'Which provider told us the payment happened: paypal and creem are automatic (their webhook bridges), shopify is entered by an operator because Shopify never reports a charge, manual is an operator correction.';

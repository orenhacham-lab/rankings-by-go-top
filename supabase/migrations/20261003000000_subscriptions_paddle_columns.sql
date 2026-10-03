-- ============================================================================
-- w21 — Paddle Billing (merchant of record) as a second subscription checkout.
--
-- ADDITIVE ONLY. Two nullable columns on public.subscriptions and one partial
-- unique index. No row is read, changed or deleted; no policy or grant
-- changes (the columns inherit the table's existing RLS and grants, exactly
-- like paypal_subscription_id). Safe to apply before any Paddle code runs:
-- with NEXT_PUBLIC_PADDLE_ENABLED off the app never selects these columns.
--
--   paddle_subscription_id  Paddle's subscription id (sub_...). One local row
--                           per Paddle subscription, so webhooks have exactly
--                           one row to update (same rule as PayPal's id).
--   paddle_customer_id      Paddle's customer id (ctm_...), needed to open the
--                           customer portal ("manage subscription").
--
-- NOT APPLIED ANYWHERE. Needs the owner's approval before Production.
-- Probe: bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/subscriptions-paddle-columns.probe.sql
-- ============================================================================
BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paddle_subscription_id text,
  ADD COLUMN IF NOT EXISTS paddle_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_paddle_subscription_id_unique
  ON public.subscriptions (paddle_subscription_id)
  WHERE paddle_subscription_id IS NOT NULL;

COMMIT;

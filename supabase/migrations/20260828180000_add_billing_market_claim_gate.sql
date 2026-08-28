-- ============================================================================
-- Phase 3 (2nd review correction) — atomic first-write gate for
-- POST /api/billing-market/select.
--
-- Problem: the endpoint's actual persisted value lives in Supabase Auth's
-- user_metadata.locale (shared with dashboard-language seeding — see
-- app/(dashboard)/layout.tsx and app/(auth)/signup/page.tsx — intentionally
-- NOT duplicated here, so this migration does not change what the app reads
-- as the billing market anywhere). Two genuinely concurrent requests from the
-- SAME account could previously both observe user_metadata.locale as unset
-- before either write landed, and both proceed to call
-- admin.auth.admin.updateUserById — a last-write-wins outcome. That never
-- lets an attacker inject a value (both requests still only ever carry a
-- value the legitimate, authenticated caller submitted), but it is not
-- ATOMIC, which the review explicitly required.
--
-- Fix: a separate, minimal claim column on the row every user already has
-- (public.profiles) used PURELY as a concurrency gate — never read as the
-- market value anywhere. lib/billing/billing-market-selection.ts performs a
-- CONDITIONAL UPDATE (`WHERE billing_market_claimed_at IS NULL`) immediately
-- before writing user_metadata.locale; only the request that wins this claim
-- proceeds to persist. If that persist itself then fails (a real DB/network
-- error), the SAME code releases the claim (sets it back to NULL) so a
-- retried request is not permanently locked out — see the release path in
-- lib/billing/billing-market-selection.ts and its QA file for the proof.
--
-- NOT APPLIED by this change.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_market_claimed_at timestamptz;

COMMIT;

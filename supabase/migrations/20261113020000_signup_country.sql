-- ============================================================================
-- Where the person who opened an account actually was.
--
-- Asked for by the owner 2026-11-13, after 정보통신망법 제50조 forced the
-- question. Every territorial rule we hold reads the CDN's country header from
-- a LIVE REQUEST, and the three customer-email senders run from a cron, which
-- has no request. So lib/compliance/korea-promotional-email.ts had to place a
-- reader from stored facts alone — the account's language, the project's
-- country, the project's content language — and the residual it documents is a
-- reader in Korea who registered in English and runs a site in another
-- country's name. Nothing recorded where they were, so nothing could place
-- them. This column records it, once, at sign-up.
--
--   signup_country  text, NULL: ISO 3166-1 alpha-2, UPPER CASE, exactly two
--                   letters, from the CDN header on the request that completed
--                   the sign-up (app/api/auth/callback/route.ts, the one funnel
--                   every sign-in door reaches). NULL where the CDN could not
--                   place the request, which includes every local and preview
--                   sign-up: an absence is "not known", never a country.
--
-- WHY IT IS WRITTEN ONCE AND NEVER REWRITTEN. It is provenance, like
-- billing_governance.signup_origin: it answers where the account BEGAN, which
-- is the fact a message-sending rule turns on. A customer who travels has not
-- changed where they signed up, and a column that follows them would quietly
-- turn a recorded consent lawful or unlawful without anybody deciding it.
-- The writer only ever fills a NULL (lib/compliance/signup-country.ts).
--
-- IT IS NOT A TAX OR BILLING SIGNAL. lib/billing/market.ts and
-- lib/billing/korea-sale.ts read the live request and the declared payment
-- country on purpose, and they must go on doing so: this is a network
-- geolocation taken once, which is the right strength of evidence for "may we
-- send this person an advertisement" and the wrong one for "whose VAT is this".
--
-- RLS is unchanged: the table already has SELECT for the owner only and no
-- write policy at all, so only the service role writes this.
--
-- Additive and idempotent. Rollback:
--   ALTER TABLE public.signup_attribution DROP COLUMN IF EXISTS signup_country;
-- Executed probe: supabase/migrations/__qa__/signup-country.probe.sql
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/signup-country.probe.sql
-- ============================================================================

BEGIN;

ALTER TABLE public.signup_attribution ADD COLUMN IF NOT EXISTS signup_country text;

-- Its own constraint, separate from signup_attribution_text_shape: that one
-- states the 200-character free-text shape of the attribution columns, and this
-- is a two-letter code. Keeping them apart means neither can be loosened by an
-- edit meant for the other.
ALTER TABLE public.signup_attribution DROP CONSTRAINT IF EXISTS signup_attribution_country_shape;
ALTER TABLE public.signup_attribution ADD CONSTRAINT signup_attribution_country_shape CHECK (
  signup_country IS NULL OR signup_country ~ '^[A-Z]{2}$'
);

COMMENT ON COLUMN public.signup_attribution.signup_country IS
  'ISO 3166-1 alpha-2, upper case, from the CDN header on the sign-up request. Written once, never rewritten: provenance, read by the customer-email senders to decide where a recipient is. NULL means the request could not be placed.';

COMMIT;

-- ============================================================================
-- Where a new account came from.
--
-- Today nothing in the product records it: public.profiles holds id, role and
-- the timestamps, and no utm parameter is read anywhere in the sign-up path.
-- So "which channel produced this sign-up" is unanswerable, and every growth
-- experiment is unmeasurable. Asked for by the owner 2026-10-18.
--
-- One row per account, written once by server-side service-role code at
-- sign-up (app/(auth)/signup/source-action.ts). NOTHING IS STORED ON THE
-- VISITOR'S DEVICE: the row is built from the address the visitor arrived at
-- and from document.referrer, both handed over at the moment of sign-up. That
-- is deliberate — an attribution cookie set before the banner is answered is
-- not "strictly necessary" under ePrivacy art. 5(3), which is why the referral
-- programme dropped its own cookie (lib/affiliate), and the live privacy
-- policy says in four languages that nothing is written to the device for
-- attribution. If a cookie is ever wanted, the policy, the banner and this
-- table change in one commit, never separately.
--
--   user_id        uuid, PK, FK -> auth.users ON DELETE CASCADE. A deleted
--                  account takes its attribution with it.
--   source         text, NULL: utm_source, or 'referrer' host, or NULL.
--   medium         text, NULL: utm_medium.
--   campaign       text, NULL: utm_campaign.
--   referrer_host  text, NULL: HOST ONLY of document.referrer, never the full
--                  address — a full referrer can carry someone else's query.
--   landing_path   text, NULL: path only, no query, of the page signed up from.
--   self_reported  text, NULL: the answer to "how did you hear about us",
--                  asked after sign-up with a skip. Not written by this flow.
--   created_at     timestamptz NOT NULL DEFAULT now().
--
-- Every text column is capped at 200 characters and refuses "<" and ">", the
-- same shape the app enforces (lib/attribution/source.ts).
--
-- RLS on, SELECT for the owner only, no INSERT/UPDATE/DELETE policy at all:
-- only the service role writes, exactly like public.consent_events.
--
-- Additive and idempotent. Rollback:
--   DROP TABLE IF EXISTS public.signup_attribution;
-- Executed probe: supabase/migrations/__qa__/signup-attribution.probe.sql
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/signup-attribution.probe.sql
-- NOT applied to Production yet — waits for the owner's word.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.signup_attribution (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  source        text,
  medium        text,
  campaign      text,
  referrer_host text,
  landing_path  text,
  self_reported text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signup_attribution DROP CONSTRAINT IF EXISTS signup_attribution_text_shape;
ALTER TABLE public.signup_attribution ADD CONSTRAINT signup_attribution_text_shape CHECK (
  (source        IS NULL OR (char_length(source)        BETWEEN 1 AND 200 AND source        !~ '[<>]')) AND
  (medium        IS NULL OR (char_length(medium)        BETWEEN 1 AND 200 AND medium        !~ '[<>]')) AND
  (campaign      IS NULL OR (char_length(campaign)      BETWEEN 1 AND 200 AND campaign      !~ '[<>]')) AND
  (referrer_host IS NULL OR (char_length(referrer_host) BETWEEN 1 AND 200 AND referrer_host !~ '[<>]')) AND
  (landing_path  IS NULL OR (char_length(landing_path)  BETWEEN 1 AND 200 AND landing_path  !~ '[<>]')) AND
  (self_reported IS NULL OR (char_length(self_reported) BETWEEN 1 AND 200 AND self_reported !~ '[<>]'))
);

COMMENT ON TABLE public.signup_attribution IS
  'Where one account came from: one row per account, written once by service-role code at sign-up. Nothing is stored on the visitor device; the row is built from the sign-up address and the referrer host.';

ALTER TABLE public.signup_attribution ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signup_attribution_owner_read ON public.signup_attribution;
CREATE POLICY signup_attribution_owner_read ON public.signup_attribution
  FOR SELECT USING (auth.uid() = user_id);

REVOKE ALL ON public.signup_attribution FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.signup_attribution TO authenticated;

CREATE INDEX IF NOT EXISTS signup_attribution_created_at_idx
  ON public.signup_attribution (created_at DESC);

COMMIT;

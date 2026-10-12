-- ============================================================================
-- REVIEWS ON THE BUSINESS PROFILE — the two columns the alert needs. Additive.
--
-- Reviews themselves are NEVER stored. A review is a third party's words about
-- the business, so the screen reads them live from Google on every open
-- (lib/gbp/reviews.ts) and the database keeps only two timestamps, so a daily
-- email can say "a new review arrived" without holding the review, the
-- reviewer's name or their rating.
--
--   reviews_seen_update_time  the newest review updateTime the owner was already
--                             told about. A review newer than this is "new".
--   reviews_alerted_at        when the last alert for this project went out, so
--                             one arriving review cannot send a mail per pass.
--
-- Both are NULL for every existing row, which reads as "never alerted": the
-- first pass tells the owner about the newest review and sets the mark. Nothing
-- reads these columns unless GBP_POSTS_ENABLED is 'true'.
--
-- No grant, policy or constraint on project_gbp_locations changes: the columns
-- inherit the table's RLS (the project owner reads their own row, only
-- service-role writes), from 20260929020000_gbp_local_posts.sql.
--
-- Idempotent: every statement can be re-run.
-- Rollback:
--   ALTER TABLE public.project_gbp_locations
--     DROP COLUMN IF EXISTS reviews_seen_update_time,
--     DROP COLUMN IF EXISTS reviews_alerted_at;
-- Executed probe: supabase/migrations/__qa__/gbp-review-alerts.probe.sql
-- ============================================================================

BEGIN;

ALTER TABLE public.project_gbp_locations
  ADD COLUMN IF NOT EXISTS reviews_seen_update_time timestamptz,
  ADD COLUMN IF NOT EXISTS reviews_alerted_at       timestamptz;

COMMENT ON COLUMN public.project_gbp_locations.reviews_seen_update_time IS
  'Newest review updateTime the project owner was already told about. No review content is stored.';
COMMENT ON COLUMN public.project_gbp_locations.reviews_alerted_at IS
  'When the last "new review" alert for this project was sent.';

COMMIT;

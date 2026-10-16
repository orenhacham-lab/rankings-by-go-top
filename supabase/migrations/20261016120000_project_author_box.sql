-- ============================================================================
-- The author box on the articles the system publishes to the customer's site.
--
-- Three new columns on public.project_article_styles (20260928001000), the
-- article settings row the owner already reads and writes under RLS. No new
-- table, no policy change: the row's existing owner-only policies cover them.
--
--   author_box                   boolean, default false: the owner's switch in
--                                the writing settings. Off = articles exactly
--                                as today.
--   theme_author_box             boolean, NULL: whether the site's theme already
--                                shows an author box (true), shows none
--                                (false), or could not be read (NULL). Written
--                                by publishing (service role, named by project
--                                AND owner), read the same way.
--   theme_author_box_checked_at  timestamptz, NULL: when that was last tested.
--
-- Written by the owner from the settings card (lib/content/writing-guidance/data.ts);
-- read and cached at publish time (lib/content/author-box/store.ts). The app
-- treats a missing column or NULL as OFF, so nothing changes before this runs.
--
-- Additive and idempotent. Rollback:
--   ALTER TABLE public.project_article_styles
--     DROP COLUMN IF EXISTS author_box,
--     DROP COLUMN IF EXISTS theme_author_box,
--     DROP COLUMN IF EXISTS theme_author_box_checked_at;
-- Executed probe: supabase/migrations/__qa__/project-author-box.probe.sql
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-author-box.probe.sql
-- Applied to Production on 2026-10-16 with the owner's approval.
-- ============================================================================

BEGIN;

ALTER TABLE public.project_article_styles
  ADD COLUMN IF NOT EXISTS author_box boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS theme_author_box boolean,
  ADD COLUMN IF NOT EXISTS theme_author_box_checked_at timestamptz;

-- Re-stated, so running this again restores them (a no-op on the column just added).
ALTER TABLE public.project_article_styles
  ALTER COLUMN author_box SET DEFAULT false,
  ALTER COLUMN author_box SET NOT NULL;

COMMENT ON COLUMN public.project_article_styles.author_box IS
  'Add an author box to published articles, only when the site''s theme has none. Default false (the pre-existing behaviour).';
COMMENT ON COLUMN public.project_article_styles.theme_author_box IS
  'Cached theme test: true the theme shows an author box, false it shows none, NULL unknown. See theme_author_box_checked_at.';
COMMENT ON COLUMN public.project_article_styles.theme_author_box_checked_at IS
  'When theme_author_box was last tested (re-tested after 14 days, 1 day when unknown).';

COMMIT;

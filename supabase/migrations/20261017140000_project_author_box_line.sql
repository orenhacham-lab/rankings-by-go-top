-- ============================================================================
-- The owner's own sentence about the author, for the author box.
--
-- One new column on public.project_article_styles (20260928001000), next to the
-- owner's name, link and image (20261016180000) and the photo (20261017120000).
-- No new table, no policy change: the row's existing owner-only policies cover
-- it.
--
--   author_box_line  text, NULL: the line the owner wants under the author's
--                    name. NULL = today's behaviour, the first sentence of the
--                    business description (project_profiles.description).
--                    <= 300 characters, no "<" or ">" (the app cleans it the
--                    way it cleans the name and the picked line: cleanCtaText).
--
-- Asked for by the owner 2026-10-17: "אופציה לרשום משהו בעצמך על הכותב במידה
-- ולא אהבו מה שכתבנו בדיפולט".
--
-- Written by the owner from the settings card (lib/content/writing-guidance/data.ts);
-- read at publish time (lib/content/author-box/store.ts readAuthorBoxOverrides).
-- The app reads it on its own, so while this is not applied the box is exactly
-- as before and the field is disabled.
--
-- Additive and idempotent. Rollback:
--   ALTER TABLE public.project_article_styles DROP COLUMN IF EXISTS author_box_line;
-- Executed probe: supabase/migrations/__qa__/project-author-box-line.probe.sql
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-author-box-line.probe.sql
-- Applied to Production on 2026-10-17 with the owner's approval.
-- ============================================================================

BEGIN;

ALTER TABLE public.project_article_styles
  ADD COLUMN IF NOT EXISTS author_box_line text;

ALTER TABLE public.project_article_styles DROP CONSTRAINT IF EXISTS project_article_styles_author_box_line;
ALTER TABLE public.project_article_styles ADD CONSTRAINT project_article_styles_author_box_line CHECK (
  author_box_line IS NULL OR (char_length(author_box_line) BETWEEN 1 AND 300 AND author_box_line !~ '[<>]')
);

COMMENT ON COLUMN public.project_article_styles.author_box_line IS
  'The line the owner wants under the author name in the author box. NULL = the first sentence of the business description.';

COMMIT;

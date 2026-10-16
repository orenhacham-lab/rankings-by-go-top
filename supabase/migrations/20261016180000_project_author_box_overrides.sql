-- ============================================================================
-- The owner's own name, link and image for the author box.
--
-- Three new columns on public.project_article_styles (20260928001000), next to
-- the author-box switch (20261016120000). No new table, no policy change: the
-- row's existing owner-only policies cover them.
--
--   author_box_name   text, NULL: the author name the owner wants shown. NULL =
--                     the name the system picks (the site's publishing user
--                     unless it looks like a login, else the business name).
--                     <= 80 characters, no "<" or ">" (the app cleans it the
--                     way it cleans the picked name: cleanCtaText).
--   author_box_url    text, NULL: where the box links. NULL = the about page,
--                     else the home page. http:// or https:// only, <= 300.
--   author_box_image  text, default 'none': the image in the box. 'none' (no
--                     image, the box as it is today) or 'site_icon' (the
--                     WordPress site icon). A later choice (an uploaded photo)
--                     is one more value in the CHECK.
--
-- Written by the owner from the settings card (lib/content/writing-guidance/data.ts);
-- read at publish time (lib/content/author-box/store.ts readAuthorBoxOverrides).
-- The app reads these on their own: while this is not applied, the box is
-- exactly as before and the card's fields are disabled.
--
-- Additive and idempotent. Rollback:
--   ALTER TABLE public.project_article_styles
--     DROP COLUMN IF EXISTS author_box_name,
--     DROP COLUMN IF EXISTS author_box_url,
--     DROP COLUMN IF EXISTS author_box_image;
-- Executed probe: supabase/migrations/__qa__/project-author-box-overrides.probe.sql
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-author-box-overrides.probe.sql
-- NOT APPLIED ANYWHERE: needs the owner's approval before Production.
-- ============================================================================

BEGIN;

ALTER TABLE public.project_article_styles
  ADD COLUMN IF NOT EXISTS author_box_name text,
  ADD COLUMN IF NOT EXISTS author_box_url text,
  ADD COLUMN IF NOT EXISTS author_box_image text NOT NULL DEFAULT 'none';

-- Re-stated, so running this again restores them.
ALTER TABLE public.project_article_styles
  ALTER COLUMN author_box_image SET DEFAULT 'none',
  ALTER COLUMN author_box_image SET NOT NULL;

ALTER TABLE public.project_article_styles DROP CONSTRAINT IF EXISTS project_article_styles_author_box_name;
ALTER TABLE public.project_article_styles ADD CONSTRAINT project_article_styles_author_box_name CHECK (
  author_box_name IS NULL OR (char_length(author_box_name) BETWEEN 1 AND 80 AND author_box_name !~ '[<>]')
);
ALTER TABLE public.project_article_styles DROP CONSTRAINT IF EXISTS project_article_styles_author_box_url;
ALTER TABLE public.project_article_styles ADD CONSTRAINT project_article_styles_author_box_url CHECK (
  author_box_url IS NULL OR (char_length(author_box_url) <= 300 AND author_box_url ~ '^https?://[^\s<>"''`\\]+$')
);
ALTER TABLE public.project_article_styles DROP CONSTRAINT IF EXISTS project_article_styles_author_box_image;
ALTER TABLE public.project_article_styles ADD CONSTRAINT project_article_styles_author_box_image CHECK (
  author_box_image IN ('none', 'site_icon')
);

COMMENT ON COLUMN public.project_article_styles.author_box_name IS
  'The author name the owner wants in the author box. NULL = the name the system picks.';
COMMENT ON COLUMN public.project_article_styles.author_box_url IS
  'Where the author box links (http or https). NULL = the about page, else the home page.';
COMMENT ON COLUMN public.project_article_styles.author_box_image IS
  'The author box image: none (default, no image) or site_icon (the WordPress site icon).';

COMMIT;

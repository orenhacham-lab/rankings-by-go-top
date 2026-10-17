-- ============================================================================
-- The owner's uploaded author photo for the author box ('upload').
--
-- public.project_article_styles (20260928001000; the image choice from
-- 20261016180000_project_author_box_overrides.sql):
--
--   author_box_image        the CHECK gains 'upload' (none, site_icon, upload).
--   author_box_photo_path   text, NULL: the stored photo, in the bucket below.
--                           Exactly `<project_id>/<random uuid>.<jpg|png|webp>`,
--                           and the first part must be THIS row's project_id.
--                           No name, no email, no slug can fit the shape.
--   author_box_photo_media  jsonb, NULL: the copy placed in the customer's
--                           WordPress media library, reused per project and site:
--                           {"site", "path", "media_id", "url"}. NULL = no copy yet.
--
-- storage.buckets 'author-photos': a dedicated PRIVATE bucket (public = false),
-- at most 2 MB a file, image/jpeg, image/png and image/webp only. No policy on
-- storage.objects names it, so no anon or signed-in user can read, list or
-- write it: only the service role does (the upload and delete in
-- lib/content/author-box/photo.ts, a short-lived signed URL for the settings
-- preview, and the copy step at publish time). Our copy is never linked from
-- an article.
--
-- No new table and no policy change on project_article_styles: the row's
-- owner-only policies cover the new columns. While this is not applied the app
-- does not offer 'upload' (the columns are missing) and the box is as before.
--
-- Additive and idempotent. Rollback (after removing every object in the bucket):
--   ALTER TABLE public.project_article_styles DROP CONSTRAINT IF EXISTS project_article_styles_author_box_photo_path,
--     DROP CONSTRAINT IF EXISTS project_article_styles_author_box_photo_media,
--     DROP COLUMN IF EXISTS author_box_photo_path, DROP COLUMN IF EXISTS author_box_photo_media;
--   UPDATE public.project_article_styles SET author_box_image = 'none' WHERE author_box_image = 'upload';
--   (then the CHECK of 20261016180000 again), and DELETE FROM storage.buckets WHERE id = 'author-photos'.
-- Executed probe: supabase/migrations/__qa__/project-author-photo.probe.sql
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-author-photo.probe.sql
-- NOT applied to Production.
-- ============================================================================

BEGIN;

ALTER TABLE public.project_article_styles
  ADD COLUMN IF NOT EXISTS author_box_photo_path text,
  ADD COLUMN IF NOT EXISTS author_box_photo_media jsonb;

ALTER TABLE public.project_article_styles DROP CONSTRAINT IF EXISTS project_article_styles_author_box_image;
ALTER TABLE public.project_article_styles ADD CONSTRAINT project_article_styles_author_box_image CHECK (
  author_box_image IN ('none', 'site_icon', 'upload')
);

ALTER TABLE public.project_article_styles DROP CONSTRAINT IF EXISTS project_article_styles_author_box_photo_path;
ALTER TABLE public.project_article_styles ADD CONSTRAINT project_article_styles_author_box_photo_path CHECK (
  author_box_photo_path IS NULL OR (
    author_box_photo_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    AND split_part(author_box_photo_path, '/', 1) = project_id::text
  )
);

ALTER TABLE public.project_article_styles DROP CONSTRAINT IF EXISTS project_article_styles_author_box_photo_media;
ALTER TABLE public.project_article_styles ADD CONSTRAINT project_article_styles_author_box_photo_media CHECK (
  author_box_photo_media IS NULL OR jsonb_typeof(author_box_photo_media) = 'object'
);

COMMENT ON COLUMN public.project_article_styles.author_box_image IS
  'The author box image: none (default), site_icon (the WordPress site icon) or upload (the owner''s photo, author_box_photo_path).';
COMMENT ON COLUMN public.project_article_styles.author_box_photo_path IS
  'The owner''s author photo in the private author-photos bucket: <project_id>/<random uuid>.<ext>. NULL = none.';
COMMENT ON COLUMN public.project_article_styles.author_box_photo_media IS
  'The photo''s copy in the customer''s WordPress media library {site, path, media_id, url}, reused per project and site.';

-- The dedicated private bucket. Re-stated on conflict, so running this again makes it private again.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('author-photos', 'author-photos', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

COMMIT;

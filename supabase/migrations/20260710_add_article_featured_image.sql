-- ============================================================================
-- Content module — featured image support for generated_articles + a public
-- storage bucket for those images. ADDITIVE ONLY: does not touch the global
-- `articles` table, `article-images` bucket, or any other module.
--
-- generated_articles already has: image_prompt, featured_image_url,
-- wp_connection_id, wp_post_id, wp_post_url, status. This adds:
--   featured_image_storage_path — object path inside the content bucket
--   featured_image_prompt        — the prompt actually used for the image
--   wp_featured_media_id         — WordPress media library id after export
-- ============================================================================

ALTER TABLE public.generated_articles
  ADD COLUMN IF NOT EXISTS featured_image_storage_path text;
ALTER TABLE public.generated_articles
  ADD COLUMN IF NOT EXISTS featured_image_prompt text;
ALTER TABLE public.generated_articles
  ADD COLUMN IF NOT EXISTS wp_featured_media_id integer;

-- Public bucket for content-module article featured images (distinct from the
-- global blog's `article-images` bucket). Uploads happen server-side with the
-- service role; public read is fine — these images become public on WordPress.
INSERT INTO storage.buckets (id, name, public)
VALUES ('content-article-images', 'content-article-images', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Phase 4D — Inline article images (editable, section-level entities).
--
-- Inline images are persisted as first-class rows (NOT baked into content_html):
-- each is attached to a semantic H2 section id and rendered as a <figure> at
-- compose/publish time. Owner/project scoped. Featured image is untouched (it
-- stays on generated_articles.featured_image_*).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.article_inline_images (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,                      -- project owner (scoping)
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  article_id        uuid NOT NULL REFERENCES public.generated_articles(id) ON DELETE CASCADE,
  section_id        text NOT NULL,                      -- target H2 anchor id in content_html
  prompt            text,
  alt_text          text,
  caption           text,
  storage_url       text,                               -- Supabase public URL (temporary)
  storage_path      text,
  wp_media_id       integer,                            -- WordPress media id (after upload)
  wp_media_url      text,                               -- final WordPress-hosted URL
  position          integer NOT NULL DEFAULT 0,         -- order (0..2)
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','generating','ready','failed','uploading','uploaded')),
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_inline_images_article
  ON public.article_inline_images (article_id, position);
CREATE INDEX IF NOT EXISTS idx_article_inline_images_owner
  ON public.article_inline_images (user_id);

-- RLS backstop (the app also scopes every access via authContentProject /
-- article ownership on the service-role client).
ALTER TABLE public.article_inline_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aii_owner_select" ON public.article_inline_images;
CREATE POLICY "aii_owner_select" ON public.article_inline_images
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "aii_owner_all" ON public.article_inline_images;
CREATE POLICY "aii_owner_all" ON public.article_inline_images
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "aii_service_all" ON public.article_inline_images;
CREATE POLICY "aii_service_all" ON public.article_inline_images
  FOR ALL TO service_role USING (true) WITH CHECK (true);

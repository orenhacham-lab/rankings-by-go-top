-- ============================================================
-- ARTICLE IMAGES STORAGE BUCKET
-- ============================================================
-- Public bucket for article featured images.
-- Uploads are performed server-side via the service role (see
-- app/api/articles/upload/route.ts), which bypasses RLS, so no
-- INSERT policy for regular users is required. Public READ is
-- enabled so the public article pages can render the images.

-- Create (or update) the bucket with size + mime restrictions
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'article-images',
  'article-images',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- Public read access to objects in the bucket
DROP POLICY IF EXISTS "article_images_public_read" ON storage.objects;
CREATE POLICY "article_images_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'article-images');

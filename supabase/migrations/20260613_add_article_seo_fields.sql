-- Add SEO and image fields to articles table
ALTER TABLE articles ADD COLUMN IF NOT EXISTS featured_image_url text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS featured_image_alt text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS meta_description text;

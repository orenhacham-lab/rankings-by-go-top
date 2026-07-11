-- Add missing columns to articles table
ALTER TABLE articles
ADD COLUMN IF NOT EXISTS meta_description text,
ADD COLUMN IF NOT EXISTS featured_image_url text,
ADD COLUMN IF NOT EXISTS featured_image_alt text;

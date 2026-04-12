-- Create articles table for blog/articles system

CREATE TABLE IF NOT EXISTS articles (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  title text not null,
  excerpt text,
  content text not null,
  author text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_published boolean not null default false
);

-- Add RLS
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Everyone can read published articles
CREATE POLICY "articles_read_published"
  ON articles FOR SELECT TO authenticated, anon
  USING (is_published = true);

-- Service role can do everything
CREATE POLICY "articles_service_role"
  ON articles FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add index for slug
CREATE INDEX idx_articles_slug ON articles(slug);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);

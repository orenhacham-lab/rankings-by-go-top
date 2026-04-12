-- Create articles table for blog/articles system
-- Articles are ONLY discoverable via /articles listing page
-- Direct URL access is technically possible but provides no discovery mechanism
-- No internal links point directly to article URLs

-- ============================================================
-- ENSURE UUID EXTENSION EXISTS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CREATE ARTICLES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text,
  content text NOT NULL,
  author text,
  published_at timestamptz,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES - SECURITY CRITICAL
-- ============================================================

-- PUBLIC READ: Only published articles are visible to authenticated users and anonymous users
-- This ensures unpublished articles are never accessible, even with direct URL
CREATE POLICY "articles_read_published"
  ON articles FOR SELECT TO authenticated, anon
  USING (is_published = true);

-- SERVICE ROLE: Full access for admin operations (create, edit, publish)
CREATE POLICY "articles_service_role_full_access"
  ON articles FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- AUTO-UPDATE TRIGGER FOR updated_at
-- ============================================================

-- Create a self-contained trigger function (if it doesn't already exist)
CREATE OR REPLACE FUNCTION update_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to articles table
CREATE TRIGGER articles_update_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_articles_updated_at();

-- ============================================================
-- INDEXES FOR QUERY PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_is_published ON articles(is_published);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);

-- ============================================================
-- ARTICLE DISCOVERY RESTRICTION NOTES
-- ============================================================

-- DESIGN: Articles are ONLY linked from /articles listing page
-- SECURITY: RLS enforces published_at check - unpublished articles return 404
-- LIMITATION: Direct URL access is technically possible if user knows the slug
--   This is standard web app behavior and cannot be prevented without:
--   - Token-based access (overkill for public content)
--   - Reverse proxy rules (infrastructure-level, not applicable here)
--
-- MITIGATION: No internal links point to /articles/[slug] except from /articles page
-- DISCOVERY: Articles are only discoverable via /articles listing page

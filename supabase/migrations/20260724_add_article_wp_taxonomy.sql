-- ============================================================================
-- Phase 4E — WordPress taxonomy selection (per-article).
--
-- Stores the article-level WordPress category/tag choices as WP TERM IDs (never
-- labels). Additive columns on the already owner/project-scoped generated_articles
-- table — no new table, no RLS change. Empty/NULL means "no selection" and
-- publishing behaves exactly as before. Terms are NOT auto-created in v1.
-- ============================================================================

ALTER TABLE public.generated_articles
  ADD COLUMN IF NOT EXISTS wp_primary_category_id integer,
  ADD COLUMN IF NOT EXISTS wp_category_ids integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS wp_tag_ids integer[] NOT NULL DEFAULT '{}';

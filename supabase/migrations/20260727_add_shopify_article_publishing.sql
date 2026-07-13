-- ============================================================================
-- Phase 4F.2 — Shopify Blog Article publishing metadata (additive, reversible).
--
-- Adds Shopify publishing fields to generated_articles, kept SEPARATE from the
-- WordPress fields (wp_post_id/…) so the two backends never collide. The row is
-- already owner/project-scoped (RLS via projects.user_id) — no new table/policy.
--
-- Selection (per article): shopify_blog_id (target Blog GID) + shopify_tags.
-- Result: shopify_article_id (GID) + url/handle/status/published_at + last error.
--
-- ADDITIVE ONLY. Existing rows are unchanged (all new columns NULL / empty).
-- Rollback: ALTER TABLE public.generated_articles DROP COLUMN shopify_blog_id, …
-- ============================================================================

-- Project/connection-level DEFAULT publishing Blog (GID). Used when an article
-- has no per-article blog (e.g. a queue item never opened in the editor). The
-- article-level shopify_blog_id always overrides this.
ALTER TABLE public.shopify_connections
  ADD COLUMN IF NOT EXISTS default_blog_id text;

ALTER TABLE public.generated_articles
  -- Per-article Shopify publishing selection.
  ADD COLUMN IF NOT EXISTS shopify_blog_id       text,
  ADD COLUMN IF NOT EXISTS shopify_tags          text[] NOT NULL DEFAULT '{}',
  -- Shopify publish result / reconciliation state.
  ADD COLUMN IF NOT EXISTS shopify_article_id    text,   -- gid://shopify/Article/…
  ADD COLUMN IF NOT EXISTS shopify_article_url   text,
  ADD COLUMN IF NOT EXISTS shopify_handle        text,
  ADD COLUMN IF NOT EXISTS shopify_status        text,   -- draft / published / remote_missing
  ADD COLUMN IF NOT EXISTS shopify_published_at  timestamptz,
  ADD COLUMN IF NOT EXISTS shopify_last_error    text,
  ADD COLUMN IF NOT EXISTS shopify_last_synced_at timestamptz;

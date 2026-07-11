-- ============================================================================
-- Content Automation — Phase 1 (additive, minimal)
--
-- Enables the automation queue (generate-ahead + scheduled auto-publish) and
-- source-tagged topic recommendations, WITHOUT new tables. Reuses the dormant
-- article_pools / article_pool_items tables (already created + RLS-protected in
-- 20260702) and article_topics.
--
-- Safe to run once; every statement is IF EXISTS / IF NOT EXISTS guarded. The
-- pool tables are currently unused (0 rows), so the article_id nullability + the
-- status CHECK change carry no data-migration risk.
--
-- Rollback notes (manual): the added columns/statuses/index are additive; to
-- revert, drop the new columns and restore the original CHECK constraints.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. article_pool_items — queue items keyed by TOPIC (article created later)
-- ----------------------------------------------------------------------------

-- Queue a topic before its article exists → article_id becomes nullable and a
-- topic_id is added. article_id is still set once the article is generated.
ALTER TABLE public.article_pool_items
  ADD COLUMN IF NOT EXISTS topic_id uuid REFERENCES public.article_topics(id) ON DELETE CASCADE;

ALTER TABLE public.article_pool_items
  ALTER COLUMN article_id DROP NOT NULL;

-- Retry/lock bookkeeping for safe, idempotent queue processing.
ALTER TABLE public.article_pool_items
  ADD COLUMN IF NOT EXISTS attempts   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS locked_at  timestamptz;

-- Widen the item lifecycle: queued → generating → generated → publishing →
-- published, with quality_check_failed / failed / skipped / paused branches.
ALTER TABLE public.article_pool_items
  DROP CONSTRAINT IF EXISTS article_pool_items_status_check;
ALTER TABLE public.article_pool_items
  ADD CONSTRAINT article_pool_items_status_check
  CHECK (status IN (
    'queued', 'scheduled', 'generating', 'generated',
    'quality_check_failed', 'publishing', 'published',
    'failed', 'skipped', 'paused'
  ));

-- One queue entry per (pool, topic) so the same topic can't be double-queued.
CREATE UNIQUE INDEX IF NOT EXISTS idx_article_pool_items_pool_topic
  ON public.article_pool_items (pool_id, topic_id)
  WHERE topic_id IS NOT NULL;

-- Cron lookup: items waiting to be generated ahead of their publish slot.
CREATE INDEX IF NOT EXISTS idx_article_pool_items_pending
  ON public.article_pool_items (pool_id, position)
  WHERE status IN ('queued', 'generating', 'quality_check_failed', 'failed');

-- Cron lookup: generated items ready to publish at their scheduled time.
CREATE INDEX IF NOT EXISTS idx_article_pool_items_ready
  ON public.article_pool_items (scheduled_at)
  WHERE status = 'generated';

-- ----------------------------------------------------------------------------
-- 2. article_topics — source-tagged recommendations + why/score
-- ----------------------------------------------------------------------------

-- Widen the source tag for the recommendation engine (future_gsc reserved).
ALTER TABLE public.article_topics
  DROP CONSTRAINT IF EXISTS article_topics_source_check;
ALTER TABLE public.article_topics
  ADD CONSTRAINT article_topics_source_check
  CHECK (source IN (
    'manual', 'ai', 'keyword', 'ai_question', 'competitor',
    'project_data', 'keyword_research_url', 'keyword_research_keyword', 'future_gsc'
  ));

-- Human-readable "why this was suggested" + a 0..1 relevance/confidence score,
-- surfaced in the ideas UI and usable for sorting/filtering.
ALTER TABLE public.article_topics
  ADD COLUMN IF NOT EXISTS suggestion_reason text,
  ADD COLUMN IF NOT EXISTS suggestion_score  numeric;

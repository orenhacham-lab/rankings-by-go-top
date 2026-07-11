-- Phase 2A: article brief fields on article_topics.
--
-- Adds the manual article-brief inputs (anchors + brief metadata) to the
-- existing article_topics table. The brief lives on the topic at this stage
-- because no generated_articles row exists yet; generation (Phase 3) will
-- copy/link anchors onto generated_articles for placement validation.
--
-- ADDITIVE ONLY. No existing column changed. No other table touched.
-- Rollback: ALTER TABLE public.article_topics
--   DROP COLUMN IF EXISTS anchors_json, DROP COLUMN IF EXISTS brief_notes,
--   DROP COLUMN IF EXISTS language, DROP COLUMN IF EXISTS tone_of_voice,
--   DROP COLUMN IF EXISTS desired_word_count, DROP COLUMN IF EXISTS cta_preference;

ALTER TABLE public.article_topics
  ADD COLUMN IF NOT EXISTS anchors_json         jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS brief_notes          text,
  ADD COLUMN IF NOT EXISTS language             text,
  ADD COLUMN IF NOT EXISTS tone_of_voice        text,
  ADD COLUMN IF NOT EXISTS desired_word_count   integer
    CHECK (desired_word_count IS NULL OR desired_word_count > 0),
  ADD COLUMN IF NOT EXISTS cta_preference       text;

COMMENT ON COLUMN public.article_topics.anchors_json IS
  'Array of anchor briefs: [{anchor_text,target_url,required,type,note}]. Consumed by future article generation.';

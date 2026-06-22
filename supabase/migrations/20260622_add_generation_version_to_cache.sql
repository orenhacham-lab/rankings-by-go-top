-- Phase 4: Add generation_version tracking to ai_question_suggestion_cache
--
-- Purpose: distinguish questions produced by the current intent-based engine
-- ('intent_v2') from legacy template-based rows (generation_version IS NULL).
-- The enriched-suggestions API uses this to avoid returning legacy weak
-- questions and to know when a row should be refreshed.
--
-- SAFETY:
--   * Column is nullable with DEFAULT NULL.
--   * Existing rows remain NULL (treated as "legacy" on read).
--   * No data is deleted or modified. User-added active/tracked prompts live in
--     a different table (ai_prompts) and are not touched by this migration.

ALTER TABLE public.ai_question_suggestion_cache
  ADD COLUMN IF NOT EXISTS generation_version text DEFAULT NULL;

COMMENT ON COLUMN public.ai_question_suggestion_cache.generation_version IS
  'Engine version that produced this suggestion (e.g. ''intent_v2''). NULL = legacy/pre-intent_v2 row, treated as legacy on read.';

-- Lookup index: supports efficient filtering by project + context + version.
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_cache_generation_version
  ON public.ai_question_suggestion_cache (project_id, context_hash, generation_version);

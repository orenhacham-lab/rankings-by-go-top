-- ============================================================================
-- Fix AI question suggestion cache persistence
-- ============================================================================
-- CONTEXT:
-- The original table (20260528) created ONLY a *partial/filtered* unique index:
--
--   CREATE UNIQUE INDEX idx_ai_suggestion_cache_unique_key
--     ON ai_question_suggestion_cache (project_id, context_hash, question_hash, source)
--     WHERE status NOT IN ('expired', 'dismissed');
--
-- Postgres CANNOT use a partial index as an ON CONFLICT inference target when
-- the upsert only specifies a column list. So the application upsert failed with
-- error 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
-- specification") and the error was swallowed -> nothing was ever persisted.
--
-- The application code has been rewritten to NOT depend on any unique constraint
-- (it does a manual existing-hash check + plain INSERT). This migration ALSO
-- adds a real UNIQUE constraint so the schema is correct and future upserts work.
--
-- This script is SAFE TO RUN MANUALLY in the Supabase SQL Editor. It is
-- idempotent and includes duplicate cleanup so the ADD CONSTRAINT cannot fail.
-- ============================================================================

-- Step 1: Drop the old filtered unique index (cannot be an ON CONFLICT target).
DROP INDEX IF EXISTS public.idx_ai_suggestion_cache_unique_key;

-- Step 2: Drop any prior attempt at a constraint with either name.
ALTER TABLE public.ai_question_suggestion_cache
  DROP CONSTRAINT IF EXISTS ai_suggestion_cache_upsert_key;
ALTER TABLE public.ai_question_suggestion_cache
  DROP CONSTRAINT IF EXISTS ai_question_suggestion_cache_unique_key;

-- Step 3: Remove duplicate rows so the UNIQUE constraint can be created.
-- Keeps the NEWEST row per (project_id, context_hash, question_hash, source).
DELETE FROM public.ai_question_suggestion_cache a
USING public.ai_question_suggestion_cache b
WHERE a.project_id   = b.project_id
  AND a.context_hash = b.context_hash
  AND a.question_hash = b.question_hash
  AND a.source       = b.source
  AND a.created_at < b.created_at;

-- In case two rows share the exact same created_at, break ties by id.
DELETE FROM public.ai_question_suggestion_cache a
USING public.ai_question_suggestion_cache b
WHERE a.project_id   = b.project_id
  AND a.context_hash = b.context_hash
  AND a.question_hash = b.question_hash
  AND a.source       = b.source
  AND a.created_at = b.created_at
  AND a.id < b.id;

-- Step 4: Create a REAL unique constraint usable as an ON CONFLICT target.
ALTER TABLE public.ai_question_suggestion_cache
  ADD CONSTRAINT ai_suggestion_cache_upsert_key
  UNIQUE (project_id, context_hash, question_hash, source);

-- Step 5: Keep the read/lookup index for efficient status-filtered queries.
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_cache_lookup
  ON public.ai_question_suggestion_cache (project_id, context_hash, status, created_at DESC);

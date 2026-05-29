-- Fix: Replace filtered UNIQUE INDEX with proper UNIQUE CONSTRAINT for upsert operations
-- The previous filtered index cannot be used as ON CONFLICT target in upsert
-- This migration creates a proper UNIQUE constraint that Supabase upsert can use

-- Drop the old filtered unique index
DROP INDEX IF EXISTS public.idx_ai_suggestion_cache_unique_key;

-- Create a proper UNIQUE constraint (not a filtered index)
-- This allows the upsert in writeSuggestionsToCache to work correctly
ALTER TABLE public.ai_question_suggestion_cache
ADD CONSTRAINT ai_suggestion_cache_upsert_key
UNIQUE (project_id, context_hash, question_hash, source);

-- Keep the lookup index for efficient reads (filters by status)
-- This index is separate from the constraint and is used for SELECT queries
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_cache_lookup
  ON public.ai_question_suggestion_cache (project_id, context_hash, status, created_at DESC);

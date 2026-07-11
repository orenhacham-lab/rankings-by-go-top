-- Create ai_question_suggestion_cache table for persistent caching of Gemini suggestions
-- This table stores suggestion cache only; does not affect scoring or scanning

CREATE TABLE IF NOT EXISTS public.ai_question_suggestion_cache (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Context for grouping/deduplication
  language              text NOT NULL,
  country               text,
  business_category     text,
  keywords_hash         text,
  context_hash          text NOT NULL,

  -- Question content
  question              text NOT NULL,
  normalized_question   text NOT NULL,
  question_hash         text NOT NULL,

  -- Metadata
  intent                text NOT NULL CHECK (intent IN ('commercial', 'pre_purchase', 'informational', 'comparison', 'recommendation', 'brand', 'local')),
  source                text NOT NULL DEFAULT 'gemini',
  model_used            text,
  metadata              jsonb DEFAULT '{}'::jsonb,

  -- Status tracking
  status                text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'accepted', 'dismissed', 'expired')),

  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_shown_at         timestamptz,
  accepted_at           timestamptz,
  dismissed_at          timestamptz,

  -- Freshness window (configurable per row)
  freshness_days        integer NOT NULL DEFAULT 30
);

-- Unique index: prevents re-suggesting same question, includes accepted to prevent duplicate generation
-- Lookup queries explicitly filter by status = 'suggested'
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_suggestion_cache_unique_key
  ON public.ai_question_suggestion_cache (project_id, context_hash, question_hash, source)
  WHERE status NOT IN ('expired', 'dismissed');

-- Lookup index: supports efficient queries by project_id + context_hash
-- Includes status and created_at for sorting/filtering in application code
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_cache_lookup
  ON public.ai_question_suggestion_cache (project_id, context_hash, status, created_at DESC);

-- Enable Row-Level Security
ALTER TABLE public.ai_question_suggestion_cache ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Users can read cache for projects they own
CREATE POLICY ai_suggestion_cache_select
  ON public.ai_question_suggestion_cache
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- INSERT policy: Users can insert cache rows for projects they own
CREATE POLICY ai_suggestion_cache_insert
  ON public.ai_question_suggestion_cache
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- UPDATE policy: Users can update cache rows for projects they own
-- (used for status transitions: suggested→accepted, suggested→dismissed, etc.)
CREATE POLICY ai_suggestion_cache_update
  ON public.ai_question_suggestion_cache
  FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- No DELETE policy: rows expire naturally via status='expired' + data retention cleanup

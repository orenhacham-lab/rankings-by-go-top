-- =============================================================================
-- AI Visibility — User-defined competitors per project (Phase 1)
-- =============================================================================
-- Stores brand competitors that the user explicitly defines per project. These
-- are the WHO of the comparison. Detection of these competitors inside scan
-- responses is a future phase (will populate ai_scan_results.competitors_mentioned).
--
-- Phase 1 scope:
--   * CRUD only — no scan-flow changes
--   * Max 3 active competitors per project (enforced in API)
--   * Soft delete via is_active=false (so historical analytics stay stable)
--
-- ADDITIVE ONLY. No ALTER on existing tables. Rollback: DROP TABLE CASCADE.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_visibility_competitors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  domain      text,
  aliases     text[] NOT NULL DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ai_visibility_competitors_name_not_empty
    CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_ai_visibility_competitors_project
  ON public.ai_visibility_competitors (project_id);

CREATE INDEX IF NOT EXISTS idx_ai_visibility_competitors_user
  ON public.ai_visibility_competitors (user_id);

CREATE INDEX IF NOT EXISTS idx_ai_visibility_competitors_project_active
  ON public.ai_visibility_competitors (project_id, is_active);

COMMENT ON TABLE public.ai_visibility_competitors IS
  'User-defined competitors per project for AI Visibility tracking. Max 3 active per project (enforced in API). Soft delete via is_active=false.';

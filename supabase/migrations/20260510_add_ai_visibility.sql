-- =============================================================================
-- AI Visibility Module — Phase 2-A: Database schema
-- =============================================================================
-- Adds four new tables for the AI Visibility module:
--   * ai_prompts        — user-defined prompts per project
--   * ai_scan_runs      — batch run tracking
--   * ai_scan_results   — per-prompt-per-engine results
--   * ai_citations      — extracted citations
--
-- Provider-agnostic: every table carries a `provider` column (default
-- 'scrapellm') so additional providers can be introduced later.
--
-- Key conceptual distinction stored in ai_scan_results:
--   * `mentioned`     = brand/domain appeared in the AI ANSWER TEXT
--   * `target_cited`  = target domain appeared in the CITATIONS/SOURCES
-- These signals are independent and tracked separately.
--
-- ADDITIVE ONLY. No ALTER on existing tables. Rollback: DROP TABLE the four
-- tables CASCADE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ai_prompts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_prompts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  prompt              text NOT NULL,
  target_domain       text,
  target_brand_name   text,
  country             text,
  language            text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_prompts_project_active
  ON public.ai_prompts (project_id, is_active);

CREATE INDEX IF NOT EXISTS idx_ai_prompts_project_created
  ON public.ai_prompts (project_id, created_at);

-- -----------------------------------------------------------------------------
-- ai_scan_runs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_scan_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id             uuid,
  provider            text NOT NULL DEFAULT 'scrapellm',
  status              text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
  triggered_by        text,
  total_prompts       integer,
  total_engines       integer,
  total_tasks         integer,
  completed_tasks     integer NOT NULL DEFAULT 0,
  failed_tasks        integer NOT NULL DEFAULT 0,
  total_credits_used  numeric(10, 4) NOT NULL DEFAULT 0,
  started_at          timestamptz,
  completed_at        timestamptz,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_scan_runs_project_created
  ON public.ai_scan_runs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_scan_runs_status
  ON public.ai_scan_runs (status);

CREATE INDEX IF NOT EXISTS idx_ai_scan_runs_provider
  ON public.ai_scan_runs (provider);

-- -----------------------------------------------------------------------------
-- ai_scan_results
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_scan_results (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  uuid NOT NULL REFERENCES public.ai_scan_runs(id) ON DELETE CASCADE,
  project_id              uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  prompt_id               uuid REFERENCES public.ai_prompts(id) ON DELETE SET NULL,
  engine                  text NOT NULL,
  provider                text NOT NULL DEFAULT 'scrapellm',
  mentioned               boolean NOT NULL DEFAULT false,
  target_cited            boolean NOT NULL DEFAULT false,
  mention_positions       jsonb,
  citation_count          integer NOT NULL DEFAULT 0,
  source_count            integer NOT NULL DEFAULT 0,
  competitors_mentioned   jsonb,
  response_text           text,
  response_summary        text,
  raw_response            jsonb,
  visibility_score        numeric(5, 2),
  credits_used            numeric(10, 4) NOT NULL DEFAULT 0,
  status                  text,
  error_message           text,
  scanned_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_scan_results_run
  ON public.ai_scan_results (run_id);

CREATE INDEX IF NOT EXISTS idx_ai_scan_results_project_engine_created
  ON public.ai_scan_results (project_id, engine, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_scan_results_prompt_engine
  ON public.ai_scan_results (prompt_id, engine);

CREATE INDEX IF NOT EXISTS idx_ai_scan_results_provider
  ON public.ai_scan_results (provider);

-- -----------------------------------------------------------------------------
-- ai_citations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_citations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id           uuid NOT NULL REFERENCES public.ai_scan_results(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  prompt_id           uuid REFERENCES public.ai_prompts(id) ON DELETE SET NULL,
  engine              text NOT NULL,
  provider            text NOT NULL DEFAULT 'scrapellm',
  url                 text NOT NULL,
  domain              text NOT NULL,
  title               text,
  snippet             text,
  citation_position   integer,
  is_target_domain    boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_citations_project_engine_created
  ON public.ai_citations (project_id, engine, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_citations_domain
  ON public.ai_citations (domain);

CREATE INDEX IF NOT EXISTS idx_ai_citations_target
  ON public.ai_citations (is_target_domain);

CREATE INDEX IF NOT EXISTS idx_ai_citations_provider
  ON public.ai_citations (provider);

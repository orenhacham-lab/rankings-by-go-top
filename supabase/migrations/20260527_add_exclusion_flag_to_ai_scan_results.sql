-- =============================================================================
-- AI Visibility — Result-level exclusion flag (Phase 2-C)
-- =============================================================================
-- Adds excluded_from_score column to ai_scan_results to allow users to exclude
-- irrelevant results from visibility metrics without deleting scan data.
--
-- Excluded results:
--   * Stay in the database (no hard delete)
--   * Stay visible in the Results tab (with muted styling and label)
--   * Are filtered out of scoring queries (visibility_score, summaries, timeline)
--   * Can be restored via toggle action
--
-- ADDITIVE ONLY. ALTER on ai_scan_results adds non-breaking column with DEFAULT.
-- Rollback: ALTER TABLE public.ai_scan_results DROP COLUMN excluded_from_score.
-- =============================================================================

ALTER TABLE public.ai_scan_results
ADD COLUMN excluded_from_score boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ai_scan_results_excluded
  ON public.ai_scan_results (project_id, excluded_from_score)
  WHERE excluded_from_score = false;

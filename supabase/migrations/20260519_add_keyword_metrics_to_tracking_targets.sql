-- =============================================================================
-- Add Google Ads keyword metrics to tracking_targets
-- =============================================================================
-- Stores avg monthly searches, competition, and bid metrics from
-- KeywordPlanIdeaService (GenerateKeywordIdeas / GenerateKeywordHistoricalMetrics).
--
-- Refresh policy: metrics_updated_at older than 30 days should be re-fetched.
--
-- ADDITIVE ONLY. All columns nullable. Existing rows unaffected.
-- Rollback:
--   ALTER TABLE public.tracking_targets
--     DROP COLUMN avg_monthly_searches,
--     DROP COLUMN competition,
--     DROP COLUMN competition_index,
--     DROP COLUMN low_top_of_page_bid,
--     DROP COLUMN high_top_of_page_bid,
--     DROP COLUMN metrics_currency,
--     DROP COLUMN metrics_updated_at;
-- =============================================================================

ALTER TABLE public.tracking_targets
  ADD COLUMN IF NOT EXISTS avg_monthly_searches integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS competition text DEFAULT NULL
    CHECK (competition IS NULL OR competition IN ('LOW', 'MEDIUM', 'HIGH')),
  ADD COLUMN IF NOT EXISTS competition_index integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS low_top_of_page_bid numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS high_top_of_page_bid numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS metrics_currency text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS metrics_updated_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.tracking_targets.avg_monthly_searches IS
  'Average monthly searches from Google Ads Keyword Planner (last 12 months).';
COMMENT ON COLUMN public.tracking_targets.competition IS
  'Competition level: LOW, MEDIUM, or HIGH.';
COMMENT ON COLUMN public.tracking_targets.competition_index IS
  'Competition index 0-100 from Google Ads API.';
COMMENT ON COLUMN public.tracking_targets.low_top_of_page_bid IS
  'Low range top-of-page bid in metrics_currency.';
COMMENT ON COLUMN public.tracking_targets.high_top_of_page_bid IS
  'High range top-of-page bid in metrics_currency.';
COMMENT ON COLUMN public.tracking_targets.metrics_currency IS
  'ISO currency code for bid values (ILS, USD, EUR, GBP).';
COMMENT ON COLUMN public.tracking_targets.metrics_updated_at IS
  'When metrics were last refreshed from Google Ads. Refresh after 30 days.';

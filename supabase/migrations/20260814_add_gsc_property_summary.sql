-- ============================================================================
-- Stage E1 correctness (FIX 8) — authoritative PROPERTY-LEVEL summary on each sync run.
--
-- The existing per-run aggregates (total_clicks/total_impressions/weighted_position_sum)
-- are SUMS of the query+page detail rows. Those detail rows omit anonymized queries and are
-- top-N only, so they under-report property totals. The four top summary cards must instead
-- come from a SEPARATE Search Analytics request with aggregationType='byProperty' and NO
-- dimensions. This migration adds nullable columns to store that authoritative summary.
--
-- Named with a `summary_` prefix to avoid colliding with the existing (detail-derived)
-- total_clicks/total_impressions bigint columns, which are left untouched.
--
-- Historical runs keep NULL summary fields (never backfilled / fabricated from detail rows);
-- the UI shows a "resync required" state for them.
--
-- Additive + idempotent for one deliberate manual execution. Rollback:
--   ALTER TABLE public.gsc_sync_runs
--     DROP COLUMN summary_total_clicks, DROP COLUMN summary_total_impressions,
--     DROP COLUMN summary_total_ctr, DROP COLUMN summary_average_position,
--     DROP COLUMN summary_aggregation_type, DROP COLUMN summary_data_state,
--     DROP COLUMN summary_response_metadata;
-- ============================================================================

ALTER TABLE public.gsc_sync_runs
  ADD COLUMN IF NOT EXISTS summary_total_clicks       double precision CHECK (summary_total_clicks >= 0),
  ADD COLUMN IF NOT EXISTS summary_total_impressions  double precision CHECK (summary_total_impressions >= 0),
  ADD COLUMN IF NOT EXISTS summary_total_ctr          double precision CHECK (summary_total_ctr >= 0 AND summary_total_ctr <= 1),
  ADD COLUMN IF NOT EXISTS summary_average_position   double precision,
  ADD COLUMN IF NOT EXISTS summary_aggregation_type   text CHECK (summary_aggregation_type IS NULL OR summary_aggregation_type = 'byProperty'),
  ADD COLUMN IF NOT EXISTS summary_data_state         text,
  ADD COLUMN IF NOT EXISTS summary_response_metadata  jsonb;

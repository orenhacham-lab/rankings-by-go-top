-- ============================================================================
-- Content Automation — weekday scheduling (additive, minimal)
--
-- Adds an optional weekday selection to automation pools. NULL / empty means the
-- previous interval-days behavior (unchanged for existing pools). When set, it is
-- an array of ISO-ish weekday numbers (0=Sunday … 6=Saturday) at publish_time in
-- the pool's timezone. Additive and nullable — existing pools keep working.
-- ============================================================================

ALTER TABLE public.article_pools
  ADD COLUMN IF NOT EXISTS publish_days integer[];

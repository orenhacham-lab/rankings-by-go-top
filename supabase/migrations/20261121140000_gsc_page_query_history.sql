-- ============================================================================
-- A COMPACT, KEPT-FOREVER (26 WEEKS) HISTORY OF WHICH QUERY RANKS WHERE ON WHICH PAGE.
--
-- WHY. gsc_query_page_metrics keeps ONE snapshot per project and window: the sync
-- deletes every older run's rows (GscSyncStore.pruneSupersededMetrics), because
-- 2.35 M unread rows filled the database on 2026-11-05. That was right, and it
-- is also why nothing can answer "did this page move after we improved it?":
-- the run totals survive (788 runs since April), the per-page detail does not.
--
-- WHAT. One row per (project, 28-day window end, query, page), and only for the
-- rows worth following: position 1 to 30 and at least 5 impressions, at most
-- 2000 per project per sync. Measured 21 Nov 2026: 33,020 of 181,197 rows
-- qualify. Only the 28-day window is archived; the 90-day one overlaps it.
--
-- NOT A FOREIGN KEY ON THE RUN. sync_run_id is kept for traceability but is a
-- plain column: this history must outlive any housekeeping done to runs.
--
-- RETENTION. The sync deletes this project's rows older than 182 days after
-- each archive, so the table cannot grow without bound.
--
-- ACCESS, exactly as scan_grid_points: written only by service-role server code,
-- read by the project owner under RLS, nothing at all for anon.
--
-- Additive: one new table, no change to an existing one. Idempotent.
-- Rollback: DROP TABLE public.gsc_page_query_history;
-- Executed probe: supabase/migrations/__qa__/gsc-page-query-history.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.gsc_page_query_history (
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- The last day of the window the run covered (gsc_sync_runs.end_date).
  window_end    date NOT NULL,
  window_days   smallint NOT NULL,
  query         text NOT NULL,
  page          text NOT NULL,
  clicks        bigint NOT NULL DEFAULT 0,
  impressions   bigint NOT NULL DEFAULT 0,
  "position"    double precision NOT NULL,
  sync_run_id   uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (project_id, window_end, window_days, query, page),
  CONSTRAINT gsc_page_query_history_window_known CHECK (window_days IN (28, 90)),
  CONSTRAINT gsc_page_query_history_nonnegative CHECK (clicks >= 0 AND impressions >= 0),
  CONSTRAINT gsc_page_query_history_position_range CHECK ("position" > 0 AND "position" <= 100)
);

COMMENT ON TABLE public.gsc_page_query_history IS
  'Compact history of query+page rows at position 1-30 with 5+ impressions, one set per sync (28-day window), kept 182 days. Lets a later stage compare a page before and after an action. Written only by service-role server code; the project owner reads it under RLS.';

ALTER TABLE public.gsc_page_query_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.gsc_page_query_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gsc_page_query_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gsc_page_query_history TO service_role;

DROP POLICY IF EXISTS gsc_page_query_history_owner_select ON public.gsc_page_query_history;
CREATE POLICY gsc_page_query_history_owner_select ON public.gsc_page_query_history
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

COMMIT;

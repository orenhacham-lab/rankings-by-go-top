-- ============================================================================
-- ONE ROW PER MEASUREMENT POINT OF A GEO-GRID SCAN.
--
-- WHAT IT IS FOR. The grid scan measures the same keyword from an n x n square
-- of points around the business (lib/scanner/grid-scan.ts) and the map screen
-- draws one coloured pin per point. The aggregate — "position 7 on average" —
-- is already a scan_results row; this table is the detail that row cannot hold,
-- because a map needs every point's own coordinates and its own position.
--
-- WHY A TABLE AND NOT JSON ON THE SCAN ROW. Radius mode already measures nine
-- points per scan and keeps none of them: it computes `radiusScanMetadata` and
-- the route drops it, so the nine provider requests we paid for leave a single
-- number behind and the customer can never be shown where they were weak. A
-- row per point is what makes "position 3 here, 14 three kilometres north" a
-- thing the product can show, compare over time, and act on.
--
-- row_index 0 IS THE NORTHERNMOST ROW and col_index 0 the westernmost, matching
-- generateGridPoints, so a screen can lay the points out in reading order
-- without recomputing any geography.
--
-- ACCESS, exactly as keyword_competitor_positions: written only by service-role
-- server code, read by the project owner under RLS, nothing at all for anon.
--
-- Additive: one new table, no change to an existing one. Idempotent.
-- Rollback: DROP TABLE public.scan_grid_points;
-- Executed probe: supabase/migrations/__qa__/scan-grid-points.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.scan_grid_points (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The project owner. Written by the server from the project row, never from a request.
  user_id             uuid NOT NULL,
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tracking_target_id  uuid NOT NULL REFERENCES public.tracking_targets(id) ON DELETE CASCADE,
  -- The aggregate row this point belongs to: deleting the check deletes its points.
  scan_result_id      uuid NOT NULL REFERENCES public.scan_results(id) ON DELETE CASCADE,
  -- 0-based, row 0 northernmost and column 0 westernmost (generateGridPoints).
  row_index           smallint NOT NULL,
  col_index           smallint NOT NULL,
  lat                 double precision NOT NULL,
  lng                 double precision NOT NULL,
  found               boolean NOT NULL,
  "position"          integer,
  checked_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- The largest grid is 9 a side, so no index can be outside 0-8.
  CONSTRAINT scan_grid_points_indices_in_grid
    CHECK (row_index BETWEEN 0 AND 8 AND col_index BETWEEN 0 AND 8),
  CONSTRAINT scan_grid_points_coordinates_on_earth
    CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180),
  CONSTRAINT scan_grid_points_position_top20
    CHECK ("position" IS NULL OR "position" BETWEEN 1 AND 20),
  -- A point that did not find the business has no position, and one that did has one.
  CONSTRAINT scan_grid_points_position_matches_found
    CHECK ((found AND "position" IS NOT NULL) OR (NOT found AND "position" IS NULL))
);

COMMENT ON TABLE public.scan_grid_points IS
  'One row per measurement point of a geo-grid scan: its coordinates and the position found there, belonging to the scan_results row that holds the aggregate. row_index 0 is the northernmost row, col_index 0 the westernmost. Written only by service-role server code; the project owner reads it under RLS.';

-- One row per point per check, and the prefix serves the scan_result cascade.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scan_grid_points_result_cell
  ON public.scan_grid_points (scan_result_id, row_index, col_index);

-- The map reads the latest grid of one keyword: WHERE tracking_target_id = $1
-- ORDER BY checked_at DESC. Its prefix also serves that cascade.
CREATE INDEX IF NOT EXISTS idx_scan_grid_points_target_checked
  ON public.scan_grid_points (tracking_target_id, checked_at DESC);

-- The project_id cascade and the owner policy below.
CREATE INDEX IF NOT EXISTS idx_scan_grid_points_project
  ON public.scan_grid_points (project_id);

ALTER TABLE public.scan_grid_points ENABLE ROW LEVEL SECURITY;

-- Browser roles: read only, and only through the owner policy. anon: nothing.
REVOKE ALL ON TABLE public.scan_grid_points FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.scan_grid_points TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scan_grid_points TO service_role;

DROP POLICY IF EXISTS scan_grid_points_owner_select ON public.scan_grid_points;
CREATE POLICY scan_grid_points_owner_select ON public.scan_grid_points
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

COMMIT;

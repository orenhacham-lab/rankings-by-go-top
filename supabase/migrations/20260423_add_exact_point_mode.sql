-- Add exact_point location mode support
-- Core fields on tracking_targets (source of truth per target)
-- Scan-time geocoding metadata is stored inside scan_results.audit_request JSON,
-- not as dedicated top-level columns.

ALTER TABLE tracking_targets
  ADD COLUMN IF NOT EXISTS exact_address_input text,
  ADD COLUMN IF NOT EXISTS exact_resolved_lat double precision,
  ADD COLUMN IF NOT EXISTS exact_resolved_lng double precision,
  ADD COLUMN IF NOT EXISTS exact_resolution_source text,
  ADD COLUMN IF NOT EXISTS exact_geocoding_provider text;

-- Update location_mode check constraint to include 'exact_point'
ALTER TABLE tracking_targets
  DROP CONSTRAINT IF EXISTS tracking_targets_location_mode_check,
  ADD CONSTRAINT tracking_targets_location_mode_check
    CHECK (location_mode IN ('project', 'custom', 'grid', 'zip', 'exact_point'));

-- Guard: when location_mode = 'exact_point' the resolved coordinates must be present
ALTER TABLE tracking_targets
  DROP CONSTRAINT IF EXISTS tracking_targets_exact_point_coords_check,
  ADD CONSTRAINT tracking_targets_exact_point_coords_check
    CHECK (
      location_mode <> 'exact_point'
      OR (exact_resolved_lat IS NOT NULL AND exact_resolved_lng IS NOT NULL
          AND exact_resolved_lat BETWEEN -90 AND 90
          AND exact_resolved_lng BETWEEN -180 AND 180)
    );

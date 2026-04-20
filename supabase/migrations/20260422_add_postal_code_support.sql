ALTER TABLE tracking_targets
  ADD COLUMN postal_code text;

-- Update location_mode check constraint to include 'zip'
ALTER TABLE tracking_targets
  DROP CONSTRAINT IF EXISTS tracking_targets_location_mode_check,
  ADD CONSTRAINT tracking_targets_location_mode_check
    CHECK (location_mode IN ('project', 'custom', 'grid', 'zip'));

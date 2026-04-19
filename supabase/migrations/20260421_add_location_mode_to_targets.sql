-- Add location control fields to tracking_targets
ALTER TABLE tracking_targets
  ADD COLUMN location_mode text NOT NULL DEFAULT 'project',
  ADD COLUMN custom_city text,
  ADD COLUMN grid_size text;

-- Constraint: only valid modes
ALTER TABLE tracking_targets
  ADD CONSTRAINT tracking_targets_location_mode_check
  CHECK (location_mode IN ('project', 'custom', 'grid'));

-- Constraint: only valid grid sizes
ALTER TABLE tracking_targets
  ADD CONSTRAINT tracking_targets_grid_size_check
  CHECK (grid_size IS NULL OR grid_size IN ('small', 'medium', 'large'));

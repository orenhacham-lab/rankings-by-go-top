-- Add radius scan mode support
ALTER TABLE tracking_targets
ADD COLUMN IF NOT EXISTS radius_center_zip TEXT NULL,
ADD COLUMN IF NOT EXISTS radius_miles NUMERIC NULL;

-- Add comments
COMMENT ON COLUMN tracking_targets.radius_center_zip IS 'Center ZIP code for radius scan mode';
COMMENT ON COLUMN tracking_targets.radius_miles IS 'Radius distance in miles for radius scan mode';

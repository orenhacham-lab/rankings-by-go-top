-- Backfill existing rows to admin user
-- This ensures existing data (created before user_id was added) is assigned to the admin account
-- New users will NOT see this legacy data (they see only their own)

-- ============================================================
-- FIND ADMIN USER AND ASSIGN LEGACY DATA
-- ============================================================

-- Get the first admin user ID
WITH admin_user AS (
  SELECT id FROM profiles
  WHERE role = 'admin'
  LIMIT 1
)
UPDATE clients
SET user_id = (SELECT id FROM admin_user)
WHERE user_id IS NULL
  AND (SELECT id FROM admin_user) IS NOT NULL;

WITH admin_user AS (
  SELECT id FROM profiles
  WHERE role = 'admin'
  LIMIT 1
)
UPDATE projects
SET user_id = (SELECT id FROM admin_user)
WHERE user_id IS NULL
  AND (SELECT id FROM admin_user) IS NOT NULL;

WITH admin_user AS (
  SELECT id FROM profiles
  WHERE role = 'admin'
  LIMIT 1
)
UPDATE tracking_targets
SET user_id = (SELECT id FROM admin_user)
WHERE user_id IS NULL
  AND (SELECT id FROM admin_user) IS NOT NULL;

WITH admin_user AS (
  SELECT id FROM profiles
  WHERE role = 'admin'
  LIMIT 1
)
UPDATE scans
SET user_id = (SELECT id FROM admin_user)
WHERE user_id IS NULL
  AND (SELECT id FROM admin_user) IS NOT NULL;

-- ============================================================
-- RESULT
-- ============================================================

-- All existing rows with NULL user_id are now assigned to the admin user
-- Admin user (profile.role = 'admin') can now see all data (including legacy data)
-- New regular users see only their own data (created after this migration)

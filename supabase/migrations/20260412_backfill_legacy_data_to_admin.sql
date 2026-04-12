-- Backfill existing rows to specific admin user
-- This ensures existing data (created before user_id was added) is assigned to the correct admin account
-- Uses explicit admin email (orenhacham@gmail.com) for deterministic assignment
-- New users will NOT see this legacy data (they see only their own)

-- ============================================================
-- FETCH ADMIN USER ID FROM SPECIFIC EMAIL
-- ============================================================

-- Get the admin user ID by email
WITH admin_user AS (
  SELECT id FROM auth.users
  WHERE email = 'orenhacham@gmail.com'
  LIMIT 1
)
UPDATE clients
SET user_id = (SELECT id FROM admin_user)
WHERE user_id IS NULL
  AND (SELECT id FROM admin_user) IS NOT NULL;

WITH admin_user AS (
  SELECT id FROM auth.users
  WHERE email = 'orenhacham@gmail.com'
  LIMIT 1
)
UPDATE projects
SET user_id = (SELECT id FROM admin_user)
WHERE user_id IS NULL
  AND (SELECT id FROM admin_user) IS NOT NULL;

WITH admin_user AS (
  SELECT id FROM auth.users
  WHERE email = 'orenhacham@gmail.com'
  LIMIT 1
)
UPDATE tracking_targets
SET user_id = (SELECT id FROM admin_user)
WHERE user_id IS NULL
  AND (SELECT id FROM admin_user) IS NOT NULL;

WITH admin_user AS (
  SELECT id FROM auth.users
  WHERE email = 'orenhacham@gmail.com'
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
--   (orenhacham@gmail.com)
-- Admin user can see all data (including legacy data)
-- New regular users see only their own data (created after this migration)
-- Assignment is deterministic based on email, not LIMIT 1 randomness

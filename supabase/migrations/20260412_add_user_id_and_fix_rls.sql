-- Migration: Add user_id columns and fix RLS for data isolation
-- Date: 2026-04-12
-- Purpose: Ensure each user can only see their own data (unless admin)

-- ============================================================
-- 1. ADD user_id COLUMNS (nullable to preserve existing data)
-- ============================================================

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete cascade;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete cascade;

ALTER TABLE tracking_targets
ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete cascade;

ALTER TABLE scans
ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id) on delete cascade;

-- ============================================================
-- 2. CREATE HELPER FUNCTION: Check if user is admin
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 3. DROP OLD RLS POLICIES (too permissive)
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can do everything on clients" ON clients;
DROP POLICY IF EXISTS "Authenticated users can do everything on projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can do everything on tracking_targets" ON tracking_targets;
DROP POLICY IF EXISTS "Authenticated users can do everything on scans" ON scans;
DROP POLICY IF EXISTS "Authenticated users can do everything on scan_results" ON scan_results;

-- ============================================================
-- 4. CREATE NEW RLS POLICIES (proper data isolation)
-- ============================================================

-- CLIENTS: users see own data OR admin sees all
CREATE POLICY "clients_isolation_policy"
  ON clients FOR ALL TO authenticated
  USING (
    is_admin(auth.uid())
    OR user_id = auth.uid()
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR user_id = auth.uid()
  );

-- Service role (API) full access
CREATE POLICY "clients_service_role"
  ON clients FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- PROJECTS: users see own data OR admin sees all
CREATE POLICY "projects_isolation_policy"
  ON projects FOR ALL TO authenticated
  USING (
    is_admin(auth.uid())
    OR user_id = auth.uid()
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR user_id = auth.uid()
  );

-- Service role (API) full access
CREATE POLICY "projects_service_role"
  ON projects FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- TRACKING_TARGETS: users see own data OR admin sees all
CREATE POLICY "tracking_targets_isolation_policy"
  ON tracking_targets FOR ALL TO authenticated
  USING (
    is_admin(auth.uid())
    OR user_id = auth.uid()
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR user_id = auth.uid()
  );

-- Service role (API) full access
CREATE POLICY "tracking_targets_service_role"
  ON tracking_targets FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- SCANS: users see own data OR admin sees all
CREATE POLICY "scans_isolation_policy"
  ON scans FOR ALL TO authenticated
  USING (
    is_admin(auth.uid())
    OR user_id = auth.uid()
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR user_id = auth.uid()
  );

-- Service role (API) full access
CREATE POLICY "scans_service_role"
  ON scans FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- SCAN_RESULTS: Access through project ownership chain
-- If user can see the scan (via scans table), they can see results
CREATE POLICY "scan_results_isolation_policy"
  ON scan_results FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scans
      WHERE scans.id = scan_results.scan_id
      AND (
        is_admin(auth.uid())
        OR scans.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scans
      WHERE scans.id = scan_results.scan_id
      AND (
        is_admin(auth.uid())
        OR scans.user_id = auth.uid()
      )
    )
  );

-- Service role (API) full access
CREATE POLICY "scan_results_service_role"
  ON scan_results FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 5. CREATE INDEXES for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_tracking_targets_user_id ON tracking_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_user_id ON scans(user_id);

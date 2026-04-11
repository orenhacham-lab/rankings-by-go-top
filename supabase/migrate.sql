-- ============================================================
-- MIGRATION: Fix subscription system
-- Run this in Supabase SQL Editor on existing databases.
-- Safe to run multiple times (uses IF EXISTS / IF NOT EXISTS).
-- ============================================================

-- ── 1. PROFILES: add role, drop is_admin + trial_ends_at ─────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text not null default 'user';

-- Migrate existing admins
UPDATE profiles SET role = 'admin' WHERE is_admin = true;

ALTER TABLE profiles
  DROP COLUMN IF EXISTS is_admin,
  DROP COLUMN IF EXISTS trial_ends_at;

-- ── 2. SUBSCRIPTIONS: add trial_ends_at, fix status constraint ────────

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Drop old status check constraint (auto-named by Postgres)
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

-- Recreate with 'trial' added
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status in ('trial', 'active', 'inactive', 'cancelled', 'expired'));

-- Change default status from 'active' to 'trial'
ALTER TABLE subscriptions
  ALTER COLUMN status SET DEFAULT 'trial';

-- ── 3. RLS: add missing INSERT + UPDATE policies ──────────────────────

-- profiles INSERT
DO $$ BEGIN
  CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- subscriptions INSERT
DO $$ BEGIN
  CREATE POLICY "Users can insert own subscription"
    ON subscriptions FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- subscriptions UPDATE
DO $$ BEGIN
  CREATE POLICY "Users can update own subscription"
    ON subscriptions FOR UPDATE TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 4. TRIGGER: replace handle_new_user() to also create trial sub ────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile with role='user'
  INSERT INTO profiles (id, role, created_at, updated_at)
  VALUES (new.id, 'user', now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- Create trial subscription (7-day free trial)
  INSERT INTO subscriptions (user_id, status, trial_ends_at, created_at, updated_at)
  VALUES (new.id, 'trial', now() + interval '7 days', now(), now());

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger already exists (on_auth_user_created) — function replacement is sufficient.
-- If trigger is missing, uncomment:
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION handle_new_user();

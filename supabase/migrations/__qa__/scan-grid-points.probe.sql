-- ============================================================================
-- EXECUTED PROBE — 20261121090000_scan_grid_points.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster carrying Supabase's roles, its default grants
-- (including the privileges every NEW table in public receives) and the
-- projects/tracking_targets isolation policies as they stand after the OWASP
-- hardening. Then:
--
--   'after'     the owner reads their own points; another user, an admin and
--               anon read none; no browser role can write; service_role can.
--   'mutated'   MUTATION CONTROL. The owner policy is replaced by a permissive
--               one and Supabase's default grants are put back: every isolation
--               check above must now report the leak. A check that cannot fail
--               tests nothing.
--   'restored'  the migration is applied again over the broken state and every
--               isolation check holds again.
--
-- Then the constraints (grid indices, coordinates on earth, a position only
-- where the business was found, one row per cell per check) and all three
-- ON DELETE CASCADEs (scan result, keyword, project).
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/scan-grid-points.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'user');
CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text);
CREATE TABLE public.tracking_targets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE, keyword text, is_active boolean DEFAULT true);
CREATE TABLE public.scan_results (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_target_id uuid REFERENCES public.tracking_targets(id) ON DELETE CASCADE,
  keyword text, found boolean, "position" integer, checked_at timestamptz);

CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select exists (select 1 from public.profiles where id = user_id and role = 'admin'); $$;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY projects_isolation_policy ON public.projects FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid()) WITH CHECK (is_admin(auth.uid()) OR user_id = auth.uid());
CREATE POLICY tracking_targets_isolation_policy ON public.tracking_targets FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid()) WITH CHECK (is_admin(auth.uid()) OR user_id = auth.uid());

-- Fixture: owner V (two keywords, one checked grid each), other user A, admin M.
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project');
INSERT INTO public.tracking_targets (id, user_id, project_id, keyword) VALUES
  ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'idraulico milano'),
  ('b1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'idraulico torino'),
  ('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'other keyword');
INSERT INTO public.scan_results (id, tracking_target_id, keyword, found, "position", checked_at) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'idraulico milano', true, 7, '2026-11-21T06:00:00Z'),
  ('c1111111-1111-1111-1111-222222222222', 'b1111111-1111-1111-1111-222222222222', 'idraulico torino', true, 4, '2026-11-21T06:00:00Z'),
  ('c2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'other keyword', false, NULL, '2026-11-21T06:00:00Z');

\i supabase/migrations/20261121090000_scan_grid_points.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261121090000_scan_grid_points.sql

-- The rows are written the way the app writes them: as service_role.
SET ROLE service_role;
INSERT INTO public.scan_grid_points
  (user_id, project_id, tracking_target_id, scan_result_id, row_index, col_index, lat, lng, found, "position", checked_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
   'c1111111-1111-1111-1111-111111111111', 0, 0, 45.4800, 9.1700, true, 3, '2026-11-21T06:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
   'c1111111-1111-1111-1111-111111111111', 1, 1, 45.4642, 9.1900, true, 11, '2026-11-21T06:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
   'c1111111-1111-1111-1111-111111111111', 2, 2, 45.4500, 9.2100, false, NULL, '2026-11-21T06:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-222222222222',
   'c1111111-1111-1111-1111-222222222222', 0, 0, 45.0703, 7.6869, true, 1, '2026-11-21T06:00:00Z'),
  ('22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222',
   'c2222222-2222-2222-2222-222222222222', 0, 0, 32.0853, 34.7818, false, NULL, '2026-11-21T06:00:00Z');
RESET ROLE;

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

CREATE FUNCTION try_as(role_name text, uid text, sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', coalesce(uid, ''), true);
    EXECUTE format('SET LOCAL ROLE %I', role_name);
    EXECUTE sql INTO r;
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback:' || coalesce(r, 'null');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM LIKE 'rollback:%' THEN RETURN 'ok:' || substr(SQLERRM, 10); END IF;
    RETURN 'denied:' || SQLSTATE;
  END;
END; $$;
GRANT EXECUTE ON FUNCTION try_as(text, text, text) TO PUBLIC;
GRANT ALL ON results TO PUBLIC;

CREATE FUNCTION run_checks(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  V text := '11111111-1111-1111-1111-111111111111';
  A text := '22222222-2222-2222-2222-222222222222';
  M text := '33333333-3333-3333-3333-333333333333';
  broken boolean := (ph = 'mutated');
  r text;
  ins_owner text := format($q$ WITH i AS (INSERT INTO public.scan_grid_points
      (user_id, project_id, tracking_target_id, scan_result_id, row_index, col_index, lat, lng, found, "position", checked_at)
      VALUES (%L, 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
              'c1111111-1111-1111-1111-111111111111', 4, 4, 45.4, 9.2, true, 1, now())
      RETURNING 1) SELECT count(*)::text FROM i $q$, V);
BEGIN
  -- REGRESSION, every phase: each owner reads their own project's points.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.scan_grid_points
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own grid points (4) -> ' || r, r = 'ok:4');
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.scan_grid_points
    WHERE project_id = 'a2222222-2222-2222-2222-222222222222' $q$);
  PERFORM chk(ph, 'other user reads their own project point (1) -> ' || r, r = 'ok:1');

  -- ISOLATION: reads.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.scan_grid_points $q$);
  PERFORM chk(ph, 'owner reads the whole table and gets only own points -> ' || r, (r = 'ok:4') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.scan_grid_points
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'other user reads owner points -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM public.scan_grid_points
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'admin (not the owner) reads owner points: owner-only by design -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.scan_grid_points $q$);
  PERFORM chk(ph, 'anon reads -> ' || r, (r = 'denied:42501') <> broken);

  -- ISOLATION: no browser role writes, not even the owner into their own project.
  r := try_as('authenticated', V, ins_owner);
  PERFORM chk(ph, 'owner inserts into own project -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', A, format($q$ WITH i AS (INSERT INTO public.scan_grid_points
      (user_id, project_id, tracking_target_id, scan_result_id, row_index, col_index, lat, lng, found, "position", checked_at)
      VALUES (%L, 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
              'c1111111-1111-1111-1111-111111111111', 5, 5, 45.4, 9.2, true, 1, now())
      RETURNING 1) SELECT count(*)::text FROM i $q$, A));
  PERFORM chk(ph, 'other user plants a point in owner project -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH u AS (UPDATE public.scan_grid_points SET "position" = 1
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' AND found RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'owner rewrites a measured position -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH d AS (DELETE FROM public.scan_grid_points
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'owner deletes grid points -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, ins_owner);
  PERFORM chk(ph, 'anon inserts -> ' || r, (r LIKE 'denied:%') <> broken);

  -- REGRESSION, every phase: the server (service_role) writes and reads.
  r := try_as('service_role', NULL, ins_owner);
  PERFORM chk(ph, 'service_role inserts -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.scan_grid_points SET found = false, "position" = NULL
      WHERE scan_result_id = 'c1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'service_role updates -> ' || r, r = 'ok:3');
  r := try_as('service_role', NULL, $q$ SELECT count(*)::text FROM public.scan_grid_points $q$);
  PERFORM chk(ph, 'service_role reads every row (5) -> ' || r, r = 'ok:5');
  r := try_as('service_role', NULL, $q$ WITH d AS (DELETE FROM public.scan_grid_points RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'service_role deletes -> ' || r, r = 'ok:5');

  PERFORM chk(ph, 'RLS is enabled on the table',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.scan_grid_points'::regclass));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: the policy made permissive, Supabase's default grants back.
DROP POLICY scan_grid_points_owner_select ON public.scan_grid_points;
CREATE POLICY scan_grid_points_owner_select ON public.scan_grid_points
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.scan_grid_points TO anon, authenticated;
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the broken state, repairs it.
\i supabase/migrations/20261121090000_scan_grid_points.sql
SELECT run_checks('restored');

-- Constraints (as service_role, the only writer).
DO $$
DECLARE r text;
  base text := $q$ INSERT INTO public.scan_grid_points
    (user_id, project_id, tracking_target_id, scan_result_id, row_index, col_index, lat, lng, found, "position", checked_at)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
            'b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
            %s, %s, %s, %s, %s, %s, '2026-11-22T06:00:00Z') RETURNING 'inserted' $q$;
BEGIN
  r := try_as('service_role', NULL, format(base, '9', '0', '45.4', '9.2', 'true', '1'));
  PERFORM chk('constraints', 'a row index of 9 (outside the largest grid) is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '0', '-1', '45.4', '9.2', 'true', '1'));
  PERFORM chk('constraints', 'a negative column index is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '3', '3', '91', '9.2', 'true', '1'));
  PERFORM chk('constraints', 'a latitude of 91 is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '3', '3', '45.4', '181', 'true', '1'));
  PERFORM chk('constraints', 'a longitude of 181 is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '3', '3', '45.4', '9.2', 'true', '21'));
  PERFORM chk('constraints', 'a position of 21 (outside the top 20) is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '3', '3', '45.4', '9.2', 'true', 'NULL'));
  PERFORM chk('constraints', 'found with no position is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '3', '3', '45.4', '9.2', 'false', '5'));
  PERFORM chk('constraints', 'not found but with a position is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '8', '8', '45.4', '9.2', 'false', 'NULL'));
  PERFORM chk('constraints', 'the far corner, business absent, is stored -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, format(base, '0', '0', '45.48', '9.17', 'true', '3'));
  PERFORM chk('constraints', 'a second row for the same cell of the same check is rejected -> ' || r, r = 'denied:23505');
  PERFORM chk('constraints', 'the one-row-per-cell index exists',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'uq_scan_grid_points_result_cell'
      AND indexdef LIKE '%(scan_result_id, row_index, col_index)%'));
  PERFORM chk('constraints', 'the latest-grid-per-keyword index exists',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'idx_scan_grid_points_target_checked'
      AND indexdef LIKE '%(tracking_target_id, checked_at DESC)%'));
END $$;

-- Cascades (destructive, so last). A blocked delete is reported, not raised.
DO $$
DECLARE err text;
BEGIN
  BEGIN
    DELETE FROM public.scan_results WHERE id = 'c1111111-1111-1111-1111-222222222222';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE;
  END;
  PERFORM chk('cascade', 'deleting a check deletes its grid points' || coalesce(' -> blocked: ' || err, ''),
    err IS NULL AND NOT EXISTS (SELECT 1 FROM public.scan_grid_points
      WHERE scan_result_id = 'c1111111-1111-1111-1111-222222222222'));
  PERFORM chk('cascade', 'deleting a check leaves the other check''s points',
    (SELECT count(*) FROM public.scan_grid_points WHERE scan_result_id = 'c1111111-1111-1111-1111-111111111111') >= 3);

  err := NULL;
  BEGIN
    DELETE FROM public.tracking_targets WHERE id = 'b1111111-1111-1111-1111-111111111111';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE;
  END;
  PERFORM chk('cascade', 'deleting a keyword deletes its grid points' || coalesce(' -> blocked: ' || err, ''),
    err IS NULL AND NOT EXISTS (SELECT 1 FROM public.scan_grid_points
      WHERE tracking_target_id = 'b1111111-1111-1111-1111-111111111111'));

  err := NULL;
  BEGIN
    DELETE FROM public.projects WHERE id = 'a2222222-2222-2222-2222-222222222222';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE;
  END;
  PERFORM chk('cascade', 'deleting a project deletes all its grid points' || coalesce(' -> blocked: ' || err, ''),
    err IS NULL AND NOT EXISTS (SELECT 1 FROM public.scan_grid_points
      WHERE project_id = 'a2222222-2222-2222-2222-222222222222'));
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

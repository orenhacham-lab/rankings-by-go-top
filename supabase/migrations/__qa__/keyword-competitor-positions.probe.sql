-- ============================================================================
-- EXECUTED PROBE — 20260927000100_keyword_competitor_positions.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster that carries Supabase's roles, its default
-- grants (including the default privileges every NEW table in public gets) and
-- the projects isolation policy as it stands after the OWASP hardening. Then:
--
--   'after'     the owner reads their own rows; another user, an admin and anon
--               read none; no browser role can write; service_role can.
--   'mutated'   MUTATION CONTROL. The owner policy is replaced by a permissive
--               one and Supabase's default grants are put back: every isolation
--               check above must now report the leak. A check that cannot fail
--               tests nothing.
--   'restored'  the migration file is applied again over the broken state and
--               every isolation check holds again.
--
-- Then the constraints (top-20 window, URL only when ranked, one row per
-- competitor per check) and both ON DELETE CASCADEs (project, keyword).
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/keyword-competitor-positions.probe.sql
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

CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select exists (select 1 from public.profiles where id = user_id and role = 'admin'); $$;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

-- Supabase's default grants: on the tables that exist, AND on every table
-- created later in public (so the migration's REVOKE is tested against them).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- RLS on projects / tracking_targets as after 20260925000000_security_owasp_hardening.sql.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY projects_isolation_policy ON public.projects FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid()) WITH CHECK (is_admin(auth.uid()) OR user_id = auth.uid());
CREATE POLICY tracking_targets_isolation_policy ON public.tracking_targets FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid()) WITH CHECK (is_admin(auth.uid()) OR user_id = auth.uid());

-- Fixture: owner V (two keywords), other user A (one keyword), admin M.
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project');
INSERT INTO public.tracking_targets (id, user_id, project_id, keyword) VALUES
  ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'running shoes'),
  ('b1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'trail shoes'),
  ('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'other keyword');

\i supabase/migrations/20260927000100_keyword_competitor_positions.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20260927000100_keyword_competitor_positions.sql

-- The rows are written the way the app writes them: as service_role.
SET ROLE service_role;
INSERT INTO public.keyword_competitor_positions
  (user_id, project_id, tracking_target_id, competitor_domain, "position", url, checked_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'rival-shoes.co.il', 3, 'https://m.rival-shoes.co.il/running', '2026-09-20T06:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'competitor-b.com', NULL, NULL, '2026-09-20T06:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-222222222222', 'rival-shoes.co.il', 12, 'https://rival-shoes.co.il/trail', '2026-09-20T06:00:00Z'),
  ('22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'someone-else.com', 1, 'https://someone-else.com/', '2026-09-20T06:00:00Z');
RESET ROLE;

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- Run `sql` as `role_name` with auth.uid() = `uid`, inside a subtransaction that
-- is always rolled back, so no check changes the fixture for the next one.
-- Returns 'ok:<rowcount or scalar>' or 'denied:<sqlstate>'.
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
  -- In the 'mutated' phase every isolation check must report the leak.
  broken boolean := (ph = 'mutated');
  r text;
  ins_owner text := format($q$ WITH i AS (INSERT INTO public.keyword_competitor_positions
      (user_id, project_id, tracking_target_id, competitor_domain, "position", checked_at)
      VALUES (%L, 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'planted.com', 1, now())
      RETURNING 1) SELECT count(*)::text FROM i $q$, V);
BEGIN
  -- REGRESSION, every phase: each owner reads their own project's rows.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.keyword_competitor_positions
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own rows (3) -> ' || r, r = 'ok:3');
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.keyword_competitor_positions
    WHERE project_id = 'a2222222-2222-2222-2222-222222222222' $q$);
  PERFORM chk(ph, 'other user reads their own project row (1) -> ' || r, r = 'ok:1');

  -- ISOLATION: reads. Unfiltered, the owner sees their 3 rows and nothing else.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.keyword_competitor_positions $q$);
  PERFORM chk(ph, 'owner reads the whole table and gets only own rows -> ' || r, (r = 'ok:3') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.keyword_competitor_positions
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'other user reads owner rows -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM public.keyword_competitor_positions
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'admin (not the owner) reads owner rows: owner-only by design -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.keyword_competitor_positions $q$);
  PERFORM chk(ph, 'anon reads -> ' || r, (r = 'denied:42501') <> broken);

  -- ISOLATION: no browser role writes, not even the owner into their own project.
  r := try_as('authenticated', V, ins_owner);
  PERFORM chk(ph, 'owner inserts into own project -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', A, format($q$ WITH i AS (INSERT INTO public.keyword_competitor_positions
      (user_id, project_id, tracking_target_id, competitor_domain, "position", checked_at)
      VALUES (%L, 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'planted.com', 1, now())
      RETURNING 1) SELECT count(*)::text FROM i $q$, A));
  PERFORM chk(ph, 'other user plants a row in owner project -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH u AS (UPDATE public.keyword_competitor_positions SET "position" = 1
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'owner rewrites a competitor position -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH d AS (DELETE FROM public.keyword_competitor_positions
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'owner deletes competitor rows -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, ins_owner);
  PERFORM chk(ph, 'anon inserts -> ' || r, (r LIKE 'denied:%') <> broken);

  -- REGRESSION, every phase: the server (service_role) writes and reads.
  r := try_as('service_role', NULL, ins_owner);
  PERFORM chk(ph, 'service_role inserts -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.keyword_competitor_positions SET url = NULL, "position" = NULL
      WHERE competitor_domain = 'rival-shoes.co.il' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'service_role updates -> ' || r, r = 'ok:2');
  r := try_as('service_role', NULL, $q$ SELECT count(*)::text FROM public.keyword_competitor_positions $q$);
  PERFORM chk(ph, 'service_role reads every row (4) -> ' || r, r = 'ok:4');
  r := try_as('service_role', NULL, $q$ WITH d AS (DELETE FROM public.keyword_competitor_positions RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'service_role deletes -> ' || r, r = 'ok:4');

  PERFORM chk(ph, 'RLS is enabled on the table',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.keyword_competitor_positions'::regclass));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: the policy made permissive, Supabase's default grants back.
DROP POLICY keyword_competitor_positions_owner_select ON public.keyword_competitor_positions;
CREATE POLICY keyword_competitor_positions_owner_select ON public.keyword_competitor_positions
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.keyword_competitor_positions TO anon, authenticated;
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the broken state, repairs it.
\i supabase/migrations/20260927000100_keyword_competitor_positions.sql
SELECT run_checks('restored');

-- Constraints (as service_role, the only writer).
DO $$
DECLARE r text;
  base text := $q$ INSERT INTO public.keyword_competitor_positions
    (user_id, project_id, tracking_target_id, competitor_domain, "position", url, checked_at)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
            'b1111111-1111-1111-1111-111111111111', %L, %s, %L, '2026-09-21T06:00:00Z') RETURNING 'inserted' $q$;
BEGIN
  r := try_as('service_role', NULL, format(base, 'x.com', '21', NULL));
  PERFORM chk('constraints', 'position 21 (outside the top 20) is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, 'x.com', '0', NULL));
  PERFORM chk('constraints', 'position 0 is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, 'x.com', 'NULL', 'https://x.com/'));
  PERFORM chk('constraints', 'a URL without a position is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '', '4', NULL));
  PERFORM chk('constraints', 'an empty competitor domain is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, 'x.com', '20', repeat('a', 2049)));
  PERFORM chk('constraints', 'a URL over 2048 characters is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, 'x.com', 'NULL', NULL));
  PERFORM chk('constraints', 'not in the top 20 (NULL position, NULL url) is stored -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, format(base, 'x.com', '20', 'https://x.com/p'));
  PERFORM chk('constraints', 'position 20 with its URL is stored -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.keyword_competitor_positions
    (user_id, project_id, tracking_target_id, competitor_domain, "position", checked_at)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
            'b1111111-1111-1111-1111-111111111111', 'rival-shoes.co.il', 5, '2026-09-20T06:00:00Z') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a second row for the same competitor in the same check is rejected -> ' || r, r = 'denied:23505');
  PERFORM chk('constraints', 'the latest-per-target-and-competitor index exists',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'uq_keyword_competitor_positions_target_competitor_checked'
      AND indexdef LIKE '%(tracking_target_id, competitor_domain, checked_at DESC)%'));
END $$;

-- Cascades (destructive, so last). A blocked delete is reported, not raised.
DO $$
DECLARE err text;
BEGIN
  BEGIN
    DELETE FROM public.tracking_targets WHERE id = 'b1111111-1111-1111-1111-222222222222';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE;
  END;
  PERFORM chk('cascade', 'deleting a keyword deletes its competitor rows' || coalesce(' -> blocked: ' || err, ''),
    err IS NULL AND NOT EXISTS (SELECT 1 FROM public.keyword_competitor_positions
      WHERE tracking_target_id = 'b1111111-1111-1111-1111-222222222222'));
  PERFORM chk('cascade', 'deleting a keyword leaves the other keyword''s rows',
    (SELECT count(*) FROM public.keyword_competitor_positions WHERE tracking_target_id = 'b1111111-1111-1111-1111-111111111111') = 2);

  err := NULL;
  BEGIN
    DELETE FROM public.projects WHERE id = 'a1111111-1111-1111-1111-111111111111';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE;
  END;
  PERFORM chk('cascade', 'deleting a project deletes all its competitor rows' || coalesce(' -> blocked: ' || err, ''),
    err IS NULL AND NOT EXISTS (SELECT 1 FROM public.keyword_competitor_positions
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  PERFORM chk('cascade', 'deleting a project leaves other projects'' rows',
    (SELECT count(*) FROM public.keyword_competitor_positions WHERE project_id = 'a2222222-2222-2222-2222-222222222222') = 1);
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

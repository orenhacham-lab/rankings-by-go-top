-- ============================================================================
-- EXECUTED PROBE — 20261002000000_site_links_gsc_imports.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster that carries Supabase's roles, its default
-- grants (including the default privileges every NEW table in public gets) and
-- the projects isolation policy as it stands after the OWASP hardening. Then:
--
--   'after'     the owner reads, inserts and updates the row of their OWN
--               project; another user, an admin who is not the owner and anon
--               read and write nothing; the owner cannot plant a row in someone
--               else's project nor forge another user_id; service_role reads and
--               writes everything.
--   'mutated'   MUTATION CONTROL. The policy is replaced by a permissive one and
--               Supabase's default grants are put back: every isolation check
--               must now report the leak. A check that cannot fail tests nothing.
--   'restored'  the migration file is applied again over the broken state and
--               every check holds again.
--
-- Then the constraints (one row per project, jsonb lists are arrays of at most
-- 500, totals in range, file name length) and the project ON DELETE CASCADE.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/site-links-gsc-imports.probe.sql
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

CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select exists (select 1 from public.profiles where id = user_id and role = 'admin'); $$;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY projects_isolation_policy ON public.projects FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid()) WITH CHECK (is_admin(auth.uid()) OR user_id = auth.uid());

-- Fixture: owner V (two projects), other user A (two projects, one with a snapshot), admin M.
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'owner second project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project'),
  ('a3333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'other second project (no snapshot)');

\i supabase/migrations/20261002000000_site_links_gsc_imports.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261002000000_site_links_gsc_imports.sql

SET ROLE service_role;
INSERT INTO public.site_links_gsc_imports (user_id, project_id, file_name, linking_sites, linking_sites_total) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'owner-links.zip',
   '[{"site":"owner-fan.example.org","linkingPages":4,"targetPages":2}]', 1);
INSERT INTO public.site_links_gsc_imports (user_id, project_id, file_name) VALUES
  ('22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'other-links.csv');
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
  -- Inserts into the owner's SECOND project (free of a row), as the given user id.
  ins_second text := $q$ WITH i AS (INSERT INTO public.site_links_gsc_imports (user_id, project_id, file_name)
      VALUES (%L, 'a1111111-1111-1111-1111-222222222222', 'planted.csv') RETURNING 1) SELECT count(*)::text FROM i $q$;
BEGIN
  -- REGRESSION, every phase: the owner reads their own row.
  r := try_as('authenticated', V, $q$ SELECT file_name || ':' || (linking_sites->0->>'site') FROM public.site_links_gsc_imports
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own row -> ' || r, r = 'ok:owner-links.zip:owner-fan.example.org');

  -- ISOLATION: rows. Unfiltered, the owner sees their one row and nothing else.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM (SELECT id FROM public.site_links_gsc_imports) s $q$);
  PERFORM chk(ph, 'owner reads the whole table and gets only own row -> ' || r, (r = 'ok:1') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM (SELECT id FROM public.site_links_gsc_imports
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111') s $q$);
  PERFORM chk(ph, 'other user reads owner row -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM (SELECT id FROM public.site_links_gsc_imports
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111') s $q$);
  PERFORM chk(ph, 'admin (not the owner) reads owner row: owner-only by design -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM (SELECT id FROM public.site_links_gsc_imports) s $q$);
  PERFORM chk(ph, 'anon reads -> ' || r, (r = 'denied:42501') <> broken);

  -- OWNER WRITES (own project): allowed in every phase.
  r := try_as('authenticated', V, format(ins_second, V));
  PERFORM chk(ph, 'owner inserts into own project -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, $q$ WITH u AS (UPDATE public.site_links_gsc_imports SET file_name = 'replaced.zip'
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'owner updates own row -> ' || r, r = 'ok:1');

  -- ISOLATION: writes that must fail.
  r := try_as('authenticated', A, format(ins_second, A));
  PERFORM chk(ph, 'other user inserts into the owner''s project -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, format(ins_second, A));
  PERFORM chk(ph, 'owner inserts a row under another user id -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH i AS (INSERT INTO public.site_links_gsc_imports (user_id, project_id)
      VALUES ('11111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333') RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk(ph, 'owner inserts into another user''s project -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', A, $q$ WITH u AS (UPDATE public.site_links_gsc_imports SET file_name = 'hijacked'
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'other user updates owner row -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', A, $q$ WITH d AS (DELETE FROM public.site_links_gsc_imports
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'other user deletes owner row -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, format(ins_second, V));
  PERFORM chk(ph, 'anon inserts -> ' || r, (r LIKE 'denied:%') <> broken);

  -- REGRESSION, every phase: the server reads and writes everything.
  r := try_as('service_role', NULL, format(ins_second, V));
  PERFORM chk(ph, 'service_role inserts (a duplicate project row is refused by UNIQUE, so 23505 is fine) -> ' || r, r LIKE 'denied:23505' OR r = 'ok:1');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.site_links_gsc_imports SET updated_at = now() RETURNING 1) SELECT (count(*) >= 2)::text FROM u $q$);
  PERFORM chk(ph, 'service_role updates every row -> ' || r, r = 'ok:true');

  PERFORM chk(ph, 'RLS is enabled on the table',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.site_links_gsc_imports'::regclass));
END; $$;

SELECT run_checks('after');
-- The owner's own writes in 'after' left a row for their second project and a renamed first one; put both back.
SET ROLE service_role;
DELETE FROM public.site_links_gsc_imports WHERE project_id = 'a1111111-1111-1111-1111-222222222222';
UPDATE public.site_links_gsc_imports SET file_name = 'owner-links.zip' WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
RESET ROLE;

-- MUTATION CONTROL: the policy made permissive, Supabase's default grants back.
DROP POLICY site_links_gsc_imports_owner ON public.site_links_gsc_imports;
CREATE POLICY site_links_gsc_imports_owner ON public.site_links_gsc_imports
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.site_links_gsc_imports TO anon, authenticated;
SELECT run_checks('mutated');
SET ROLE service_role;
DELETE FROM public.site_links_gsc_imports WHERE project_id = 'a1111111-1111-1111-1111-222222222222';
RESET ROLE;

-- RESTORE: the migration file, applied over the broken state, repairs it.
\i supabase/migrations/20261002000000_site_links_gsc_imports.sql
SET ROLE service_role;
UPDATE public.site_links_gsc_imports SET file_name = 'owner-links.zip' WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
RESET ROLE;
SELECT run_checks('restored');
SET ROLE service_role;
DELETE FROM public.site_links_gsc_imports WHERE project_id = 'a1111111-1111-1111-1111-222222222222';
RESET ROLE;

-- Constraints (as service_role, the only app writer).
DO $$
DECLARE r text;
  ins text := $q$ INSERT INTO public.site_links_gsc_imports (user_id, project_id, file_name, linking_sites, linking_sites_total)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-222222222222', %L, %L::jsonb, %s) RETURNING 'inserted' $q$;
  big text := (SELECT jsonb_agg(jsonb_build_object('site', 's' || g))::text FROM generate_series(1, 501) g);
  ok500 text := (SELECT jsonb_agg(jsonb_build_object('site', 's' || g))::text FROM generate_series(1, 500) g);
BEGIN
  r := try_as('service_role', NULL, format(ins, 'f.csv', big, 501));
  PERFORM chk('constraints', '501 linking sites are rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(ins, 'f.csv', '{"site":"x"}', 1));
  PERFORM chk('constraints', 'a jsonb object instead of an array is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(ins, repeat('x', 201), '[]', 0));
  PERFORM chk('constraints', 'a 201-character file name is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(ins, 'f.csv', '[]', -1));
  PERFORM chk('constraints', 'a negative total is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(ins, 'f.csv', ok500, 500));
  PERFORM chk('constraints', '500 linking sites are stored -> ' || r, r = 'ok:inserted');
END $$;
DO $$
DECLARE r text;
BEGIN
  r := try_as('service_role', NULL, $q$ INSERT INTO public.site_links_gsc_imports (user_id, project_id)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a second snapshot for a project that has one is rejected (UNIQUE) -> ' || r, r = 'denied:23505');
END $$;

-- Cascade (destructive, so last).
DO $$
DECLARE err text;
BEGIN
  BEGIN
    DELETE FROM public.projects WHERE id = 'a1111111-1111-1111-1111-111111111111';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE;
  END;
  PERFORM chk('cascade', 'deleting a project deletes its snapshot' || coalesce(' -> blocked: ' || err, ''),
    err IS NULL AND NOT EXISTS (SELECT 1 FROM public.site_links_gsc_imports
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  PERFORM chk('cascade', 'deleting a project leaves other projects'' snapshots',
    (SELECT count(*) FROM public.site_links_gsc_imports WHERE project_id = 'a2222222-2222-2222-2222-222222222222') = 1);
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

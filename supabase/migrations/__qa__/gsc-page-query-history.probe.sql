-- ============================================================================
-- EXECUTED PROBE — 20261121140000_gsc_page_query_history.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster carrying Supabase's roles and default grants.
--
--   'isolation'   the owner reads their own history; another user and anon read
--                 none; no browser role can write; service_role can.
--   'mutated'     MUTATION CONTROL. The owner policy is replaced by a permissive
--                 one: the isolation checks must now report the leak.
--   'restored'    the migration applied again over the broken state fixes it.
--   'constraints' a position of 0 or past 100, a window of 7 days, negative
--                 impressions, and a duplicate (project, window, query, page) are
--                 all refused; ON CONFLICT DO NOTHING keeps the stored row.
--   'cascade'     deleting the project deletes its history; nothing else does.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/gsc-page-query-history.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_isolation_policy ON public.projects FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project');

\i supabase/migrations/20261121140000_gsc_page_query_history.sql
\i supabase/migrations/20261121140000_gsc_page_query_history.sql

SET ROLE service_role;
INSERT INTO public.gsc_page_query_history (project_id, window_end, window_days, query, page, clicks, impressions, "position") VALUES
  ('a1111111-1111-1111-1111-111111111111', '2026-11-18', 28, 'idraulico milano', '/it/a', 3, 120, 9.4),
  ('a1111111-1111-1111-1111-111111111111', '2026-11-18', 28, 'idraulico torino', '/it/b', 0, 40, 14.0),
  ('a2222222-2222-2222-2222-222222222222', '2026-11-18', 28, 'other', '/x', 0, 10, 20.0);
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
  broken boolean := (ph = 'mutated');
  r text;
BEGIN
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.gsc_page_query_history $q$);
  PERFORM chk(ph, 'owner reads exactly their own 2 rows -> ' || r, CASE WHEN broken THEN r <> 'ok:2' ELSE r = 'ok:2' END);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.gsc_page_query_history $q$);
  PERFORM chk(ph, 'another user reads exactly their own 1 row -> ' || r, CASE WHEN broken THEN r <> 'ok:1' ELSE r = 'ok:1' END);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.gsc_page_query_history $q$);
  PERFORM chk(ph, 'anon reads nothing (denied) -> ' || r, r LIKE 'denied:%');
  r := try_as('authenticated', V, $q$ WITH i AS (INSERT INTO public.gsc_page_query_history
      (project_id, window_end, window_days, query, page, "position") VALUES
      ('a1111111-1111-1111-1111-111111111111', '2026-11-25', 28, 'x', '/y', 5) RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk(ph, 'an owner cannot write -> ' || r, r LIKE 'denied:%');
  r := try_as('service_role', NULL, $q$ SELECT count(*)::text FROM public.gsc_page_query_history $q$);
  PERFORM chk(ph, 'service_role reads all 3 -> ' || r, r = 'ok:3');
END $$;

SELECT run_checks('isolation');

-- MUTATION CONTROL: a permissive policy and the default grants back.
DROP POLICY gsc_page_query_history_owner_select ON public.gsc_page_query_history;
CREATE POLICY gsc_page_query_history_owner_select ON public.gsc_page_query_history FOR SELECT TO authenticated USING (true);
SELECT run_checks('mutated');

\i supabase/migrations/20261121140000_gsc_page_query_history.sql
SELECT run_checks('restored');

DO $$
DECLARE err text;
  PROJ uuid := 'a1111111-1111-1111-1111-111111111111';
BEGIN
  PERFORM chk('constraints', 'idempotent: the table and one policy exist exactly once',
    (SELECT count(*) FROM pg_policies WHERE tablename = 'gsc_page_query_history') = 1);
  err := NULL; BEGIN INSERT INTO public.gsc_page_query_history (project_id, window_end, window_days, query, page, "position") VALUES (PROJ, '2026-11-18', 28, 'z', '/z', 0);
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE; END;
  PERFORM chk('constraints', 'position 0 refused', err = '23514');
  err := NULL; BEGIN INSERT INTO public.gsc_page_query_history (project_id, window_end, window_days, query, page, "position") VALUES (PROJ, '2026-11-18', 28, 'z', '/z', 101);
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE; END;
  PERFORM chk('constraints', 'position 101 refused', err = '23514');
  err := NULL; BEGIN INSERT INTO public.gsc_page_query_history (project_id, window_end, window_days, query, page, "position") VALUES (PROJ, '2026-11-18', 7, 'z', '/z', 5);
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE; END;
  PERFORM chk('constraints', 'a 7-day window refused', err = '23514');
  err := NULL; BEGIN INSERT INTO public.gsc_page_query_history (project_id, window_end, window_days, query, page, impressions, "position") VALUES (PROJ, '2026-11-18', 28, 'z', '/z', -1, 5);
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE; END;
  PERFORM chk('constraints', 'negative impressions refused', err = '23514');
  err := NULL; BEGIN INSERT INTO public.gsc_page_query_history (project_id, window_end, window_days, query, page, "position") VALUES (PROJ, '2026-11-18', 28, 'idraulico milano', '/it/a', 5);
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE; END;
  PERFORM chk('constraints', 'a duplicate (project, window, query, page) refused', err = '23505');
  INSERT INTO public.gsc_page_query_history (project_id, window_end, window_days, query, page, impressions, "position")
    VALUES (PROJ, '2026-11-18', 28, 'idraulico milano', '/it/a', 999, 1) ON CONFLICT DO NOTHING;
  PERFORM chk('constraints', 'ON CONFLICT DO NOTHING keeps the stored row untouched',
    (SELECT impressions FROM public.gsc_page_query_history WHERE query = 'idraulico milano') = 120);
  INSERT INTO public.gsc_page_query_history (project_id, window_end, window_days, query, page, "position")
    VALUES (PROJ, '2026-11-25', 28, 'idraulico milano', '/it/a', 7);
  PERFORM chk('constraints', 'the same query on the same page in a LATER window is a new row',
    (SELECT count(*) FROM public.gsc_page_query_history WHERE query = 'idraulico milano') = 2);
  DELETE FROM public.gsc_page_query_history WHERE window_end = '2026-11-25';

  DELETE FROM public.projects WHERE id = 'a2222222-2222-2222-2222-222222222222';
  PERFORM chk('cascade', 'deleting a project deletes its history',
    NOT EXISTS (SELECT 1 FROM public.gsc_page_query_history WHERE project_id = 'a2222222-2222-2222-2222-222222222222'));
  PERFORM chk('cascade', 'and leaves the other project''s history',
    (SELECT count(*) FROM public.gsc_page_query_history WHERE project_id = PROJ) = 2);
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['isolation','mutated','restored','constraints','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

-- ============================================================================
-- EXECUTED PROBE — 20260928000000_project_monthly_reports.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster that carries Supabase's roles, its default
-- grants (including the default privileges every NEW table in public gets) and
-- the projects isolation policy as it stands after the OWASP hardening. Then:
--
--   'after'     the owner reads their own report and preference rows; another
--               user, an admin and anon read none; no browser role can write;
--               service_role creates, reads and deletes a report, but cannot
--               UPDATE one (a finished report is never rewritten), and does
--               read and write preferences.
--   'mutated'   MUTATION CONTROL. Both owner policies are replaced by permissive
--               ones and Supabase's default grants are put back (UPDATE for
--               service_role included): every isolation check above must now
--               report the leak. A check that cannot fail tests nothing.
--   'restored'  the migration file is applied again over the broken state and
--               every isolation check holds again.
--
-- Then the constraints (first of month, one per project and month, generated_by,
-- object data), the preference default (OFF) and the ON DELETE CASCADEs.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-monthly-reports.probe.sql
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

-- Supabase's default grants: on the tables that exist, AND on every table
-- created later in public (so the migration's REVOKE is tested against them).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY projects_isolation_policy ON public.projects FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid()) WITH CHECK (is_admin(auth.uid()) OR user_id = auth.uid());

-- Fixture: owner V (one project), other user A (one project), admin M.
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project');

\i supabase/migrations/20260928000000_project_monthly_reports.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20260928000000_project_monthly_reports.sql

-- The rows are written the way the app writes them: as service_role.
SET ROLE service_role;
INSERT INTO public.project_monthly_reports (user_id, project_id, period_month, generated_by, data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '2026-07-01', 'cron', '{"v":1}'),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '2026-08-01', 'owner', '{"v":1}'),
  ('22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', '2026-08-01', 'cron', '{"v":1}');
INSERT INTO public.project_report_preferences (project_id, user_id) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');
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
  broken boolean := (ph = 'mutated');
  r text;
  ins_report text := format($q$ WITH i AS (INSERT INTO public.project_monthly_reports
      (user_id, project_id, period_month, generated_by, data)
      VALUES (%L, 'a1111111-1111-1111-1111-111111111111', '2026-09-01', 'owner', '{"planted":true}')
      RETURNING 1) SELECT count(*)::text FROM i $q$, V);
  upd_report text := $q$ WITH u AS (UPDATE public.project_monthly_reports SET data = '{"rewritten":true}'
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$;
  upd_pref text := $q$ WITH u AS (UPDATE public.project_report_preferences SET weekly_email_summary = true
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$;
BEGIN
  -- REGRESSION, every phase: each owner reads their own rows.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.project_monthly_reports
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own reports (2) -> ' || r, r = 'ok:2');
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.project_monthly_reports
    WHERE project_id = 'a2222222-2222-2222-2222-222222222222' $q$);
  PERFORM chk(ph, 'other user reads their own report (1) -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.project_report_preferences
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own preference (1) -> ' || r, r = 'ok:1');

  -- ISOLATION: reads.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.project_monthly_reports $q$);
  PERFORM chk(ph, 'owner reads the whole report table and gets only own rows -> ' || r, (r = 'ok:2') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.project_monthly_reports
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'other user reads owner reports -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM public.project_monthly_reports
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'admin (not the owner) reads owner reports: owner-only by design -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.project_monthly_reports $q$);
  PERFORM chk(ph, 'anon reads reports -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.project_report_preferences
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'other user reads owner preference -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.project_report_preferences $q$);
  PERFORM chk(ph, 'anon reads preferences -> ' || r, (r = 'denied:42501') <> broken);

  -- ISOLATION: no browser role writes, not even the owner into their own project.
  r := try_as('authenticated', V, ins_report);
  PERFORM chk(ph, 'owner inserts a report -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, upd_report);
  PERFORM chk(ph, 'owner rewrites a report -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH d AS (DELETE FROM public.project_monthly_reports
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'owner deletes reports -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', A, ins_report);
  PERFORM chk(ph, 'other user plants a report in owner project -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, upd_pref);
  PERFORM chk(ph, 'owner flips the email switch directly (bypassing the route) -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, ins_report);
  PERFORM chk(ph, 'anon inserts a report -> ' || r, (r LIKE 'denied:%') <> broken);

  -- A FINISHED REPORT IS NEVER REWRITTEN: not even by the server.
  r := try_as('service_role', NULL, upd_report);
  PERFORM chk(ph, 'service_role rewrites a finished report -> ' || r, (r LIKE 'denied:%') <> broken);

  -- REGRESSION, every phase: the server (service_role) creates, reads, deletes.
  r := try_as('service_role', NULL, ins_report);
  PERFORM chk(ph, 'service_role inserts a report -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, $q$ SELECT count(*)::text FROM public.project_monthly_reports $q$);
  PERFORM chk(ph, 'service_role reads every report (3) -> ' || r, r = 'ok:3');
  r := try_as('service_role', NULL, $q$ WITH d AS (DELETE FROM public.project_monthly_reports RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'service_role deletes reports -> ' || r, r = 'ok:3');
  r := try_as('service_role', NULL, upd_pref);
  PERFORM chk(ph, 'service_role updates a preference -> ' || r, r = 'ok:1');

  PERFORM chk(ph, 'RLS is enabled on both tables',
    (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
      ('public.project_monthly_reports'::regclass, 'public.project_report_preferences'::regclass)));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: the policies made permissive, Supabase's default grants back.
DROP POLICY project_monthly_reports_owner_select ON public.project_monthly_reports;
CREATE POLICY project_monthly_reports_owner_select ON public.project_monthly_reports FOR ALL USING (true) WITH CHECK (true);
DROP POLICY project_report_preferences_owner_select ON public.project_report_preferences;
CREATE POLICY project_report_preferences_owner_select ON public.project_report_preferences FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.project_monthly_reports TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.project_report_preferences TO anon, authenticated;
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the broken state, repairs it.
\i supabase/migrations/20260928000000_project_monthly_reports.sql
SELECT run_checks('restored');

-- Constraints (as service_role, the only writer).
DO $$
DECLARE r text;
  base text := $q$ INSERT INTO public.project_monthly_reports (user_id, project_id, period_month, generated_by, data)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', %L, %L, %s) RETURNING 'inserted' $q$;
BEGIN
  r := try_as('service_role', NULL, format(base, '2026-08-15', 'cron', $j$'{}'$j$));
  PERFORM chk('constraints', 'a month that does not start on the 1st is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '2026-05-01', 'someone', $j$'{}'$j$));
  PERFORM chk('constraints', 'an unknown generated_by is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '2026-05-01', 'cron', $j$'[1,2]'$j$));
  PERFORM chk('constraints', 'data that is not an object is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '2026-05-01', 'cron', $j$'{}'$j$));
  PERFORM chk('constraints', 'a well-formed report is stored -> ' || r, r = 'ok:inserted');
END $$;

-- One report per project and month (committed rows this time).
SET ROLE service_role;
INSERT INTO public.project_monthly_reports (user_id, project_id, period_month, generated_by, data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '2026-06-01', 'cron', '{"first":true}');
RESET ROLE;
DO $$
DECLARE r text;
BEGIN
  r := try_as('service_role', NULL, $q$ INSERT INTO public.project_monthly_reports (user_id, project_id, period_month, generated_by, data)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '2026-06-01', 'owner', '{"second":true}') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a second report for the same project and month is rejected -> ' || r, r = 'denied:23505');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.project_monthly_reports (user_id, project_id, period_month, generated_by, data)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '2026-06-01', 'owner', '{"second":true}')
    ON CONFLICT DO NOTHING RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'the same insert with ON CONFLICT DO NOTHING stores nothing -> ' || r, r = 'ok:null');
  PERFORM chk('constraints', 'the first report of the month is unchanged',
    (SELECT data FROM public.project_monthly_reports WHERE project_id = 'a1111111-1111-1111-1111-111111111111' AND period_month = '2026-06-01') = '{"first":true}'::jsonb);
END $$;

-- The email switch is OFF unless the owner turns it on.
DO $$
DECLARE r text;
BEGIN
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.project_report_preferences (project_id, user_id)
    VALUES ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111')
    ON CONFLICT (project_id) DO UPDATE SET updated_at = now() RETURNING weekly_email_summary) SELECT weekly_email_summary::text FROM i $q$);
  PERFORM chk('defaults', 'a new preference row has the weekly email OFF -> ' || r, r = 'ok:false');
  PERFORM chk('defaults', 'the column default is false',
    (SELECT column_default FROM information_schema.columns WHERE table_name = 'project_report_preferences' AND column_name = 'weekly_email_summary') = 'false');
END $$;

-- Cascade (destructive, so last).
DO $$
DECLARE err text;
BEGIN
  BEGIN
    DELETE FROM public.projects WHERE id = 'a1111111-1111-1111-1111-111111111111';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE;
  END;
  PERFORM chk('cascade', 'deleting a project deletes its reports and preference' || coalesce(' -> blocked: ' || err, ''),
    err IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.project_monthly_reports WHERE project_id = 'a1111111-1111-1111-1111-111111111111')
    AND NOT EXISTS (SELECT 1 FROM public.project_report_preferences WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  PERFORM chk('cascade', 'deleting a project leaves other projects'' preference',
    (SELECT count(*) FROM public.project_report_preferences WHERE project_id = 'a2222222-2222-2222-2222-222222222222') = 1);
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints','defaults','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

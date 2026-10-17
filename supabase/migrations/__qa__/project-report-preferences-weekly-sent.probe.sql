-- ============================================================================
-- EXECUTED PROBE — 20261009184500_project_report_preferences_weekly_sent.sql
--
-- Builds the table as 20260928000000 left it (with rows in it), then applies the
-- new migration (via \i, twice, for idempotency) to a disposable PostgreSQL
-- cluster with Supabase's roles and the projects isolation policy. Checks:
--   defaults      a row that already existed keeps its switch and gets NULLs.
--   constraints   only a YYYY-Www week is accepted.
--   isolation     the owner reads their own new columns; another user, an admin
--                 and anon read nothing; no browser role writes them.
--   mutated       MUTATION CONTROL: the owner policy made permissive, the
--                 browser grants put back and the constraint dropped — every
--                 check must report the leak.
-- NOT run against Supabase or Production.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-report-preferences-weekly-sent.probe.sql
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
GRANT SELECT ON TABLE public.projects TO authenticated, service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_isolation_policy ON public.projects FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid()) WITH CHECK (is_admin(auth.uid()) OR user_id = auth.uid());

INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project');

-- Only the preferences half of the report migration: the reports table needs columns
-- this probe does not care about, so the table is built exactly as that file builds it.
CREATE TABLE public.project_report_preferences (
  project_id            uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL,
  weekly_email_summary  boolean NOT NULL DEFAULT false,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_report_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_report_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_report_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_report_preferences TO service_role;
CREATE POLICY project_report_preferences_owner_select ON public.project_report_preferences
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

SET ROLE service_role;
INSERT INTO public.project_report_preferences (project_id, user_id, weekly_email_summary) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', true),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', false);
RESET ROLE;

\i supabase/migrations/20261009184500_project_report_preferences_weekly_sent.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261009184500_project_report_preferences_weekly_sent.sql

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
  own text := $q$ SELECT coalesce(weekly_last_week, 'none') FROM public.project_report_preferences
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$;
  wr text := $q$ WITH u AS (UPDATE public.project_report_preferences SET weekly_last_week = '2026-W01'
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$;
BEGIN
  r := try_as('authenticated', V, own);
  PERFORM chk(ph, 'owner reads own weekly log -> ' || r, r = 'ok:2026-W41');
  r := try_as('service_role', NULL, wr);
  PERFORM chk(ph, 'service_role writes it -> ' || r, r = 'ok:1');
  r := try_as('authenticated', A, own);
  PERFORM chk(ph, 'another user reads the owner''s log -> ' || r, (r = 'ok:null') <> broken);
  r := try_as('authenticated', M, own);
  PERFORM chk(ph, 'admin (not the owner) reads it -> ' || r, (r = 'ok:null') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.project_report_preferences $q$);
  PERFORM chk(ph, 'anon reads the table -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('authenticated', V, wr);
  PERFORM chk(ph, 'the owner''s own browser session writes it -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('service_role', NULL, $q$ UPDATE public.project_report_preferences SET weekly_last_week = 'last week'
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 'updated' $q$);
  PERFORM chk(ph, 'a week that is not YYYY-Www -> ' || r, (r = 'denied:23514') <> broken);
END $$;

SET ROLE service_role;
UPDATE public.project_report_preferences
  SET weekly_last_week = '2026-W41', weekly_last_sent_at = '2026-10-11 06:00+00'
  WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
RESET ROLE;

DO $$
BEGIN
  PERFORM chk('defaults', 'the switch a project already had is untouched',
    (SELECT weekly_email_summary FROM public.project_report_preferences WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  PERFORM chk('defaults', 'a project nothing was sent for has no week and no date',
    (SELECT weekly_last_week IS NULL AND weekly_last_sent_at IS NULL FROM public.project_report_preferences
     WHERE project_id = 'a2222222-2222-2222-2222-222222222222'));
END $$;

SELECT run_checks('after');

-- MUTATION CONTROL.
DROP POLICY project_report_preferences_owner_select ON public.project_report_preferences;
CREATE POLICY project_report_preferences_owner_select ON public.project_report_preferences FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.project_report_preferences TO anon, authenticated, service_role;
ALTER TABLE public.project_report_preferences DROP CONSTRAINT project_report_preferences_weekly_last_week;
SELECT run_checks('mutated');

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['defaults','after','mutated'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

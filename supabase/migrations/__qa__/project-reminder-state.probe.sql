-- ============================================================================
-- EXECUTED PROBE — 20260929030000_project_reminder_state.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster with Supabase's roles, its default grants and the
-- projects isolation policy. Then:
--   'after'     the owner reads their own row; another user, an admin and anon
--               read none; no browser role writes; service_role reads and writes.
--   'mutated'   MUTATION CONTROL: the owner policy made permissive and Supabase's
--               default grants put back: every isolation check must report the leak.
--   'restored'  the migration applied over the broken state repairs it.
-- Then the defaults (reminders ON, nothing sent), the constraint (at most 3 emails
-- for a batch), and the ON DELETE CASCADE. NOT run against Supabase or Production.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-reminder-state.probe.sql
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

INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project');

\i supabase/migrations/20260929030000_project_reminder_state.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20260929030000_project_reminder_state.sql

SET ROLE service_role;
INSERT INTO public.project_reminder_state (project_id, user_id, batch_key, sent_count, last_sent_at) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'art-1', 1, now()),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', NULL, 0, NULL);
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
  upd text := $q$ WITH u AS (UPDATE public.project_reminder_state SET reminders_enabled = false
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$;
  ins text := $q$ WITH i AS (INSERT INTO public.project_reminder_state (project_id, user_id)
      VALUES ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111')
      ON CONFLICT (project_id) DO NOTHING RETURNING 1) SELECT count(*)::text FROM i $q$;
BEGIN
  -- REGRESSION, every phase.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.project_reminder_state
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own row (1) -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, upd);
  PERFORM chk(ph, 'service_role updates the switch -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, $q$ SELECT count(*)::text FROM public.project_reminder_state $q$);
  PERFORM chk(ph, 'service_role reads every row (2) -> ' || r, r = 'ok:2');

  -- ISOLATION.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.project_reminder_state $q$);
  PERFORM chk(ph, 'owner reads the whole table and gets only own row -> ' || r, (r = 'ok:1') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.project_reminder_state
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'other user reads the owner row -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM public.project_reminder_state
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'admin (not the owner) reads the owner row -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.project_reminder_state $q$);
  PERFORM chk(ph, 'anon reads the table -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('authenticated', V, upd);
  PERFORM chk(ph, 'owner flips the switch directly, bypassing the route -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', A, ins);
  PERFORM chk(ph, 'other user writes into the owner project -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH d AS (DELETE FROM public.project_reminder_state RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'owner deletes the sent-log -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, upd);
  PERFORM chk(ph, 'anon flips the switch -> ' || r, (r LIKE 'denied:%') <> broken);

  PERFORM chk(ph, 'RLS is enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.project_reminder_state'::regclass));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL.
DROP POLICY project_reminder_state_owner_select ON public.project_reminder_state;
CREATE POLICY project_reminder_state_owner_select ON public.project_reminder_state FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.project_reminder_state TO anon, authenticated, service_role;
SELECT run_checks('mutated');

-- RESTORE.
\i supabase/migrations/20260929030000_project_reminder_state.sql
SELECT run_checks('restored');

-- Defaults and constraints.
DO $$
DECLARE r text;
BEGIN
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.project_reminder_state (project_id, user_id)
    VALUES ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111')
    ON CONFLICT (project_id) DO UPDATE SET updated_at = now() RETURNING reminders_enabled::text || ',' || sent_count::text) SELECT * FROM i $q$);
  PERFORM chk('defaults', 'an existing row keeps its state on conflict (switch false from the check above is rolled back: true) -> ' || r, r LIKE 'ok:true,%');
  PERFORM chk('defaults', 'the switch defaults to ON', (SELECT column_default FROM information_schema.columns WHERE table_name = 'project_reminder_state' AND column_name = 'reminders_enabled') = 'true');
  PERFORM chk('defaults', 'nothing is sent by default', (SELECT column_default FROM information_schema.columns WHERE table_name = 'project_reminder_state' AND column_name = 'sent_count') = '0');
  r := try_as('service_role', NULL, $q$ UPDATE public.project_reminder_state SET sent_count = 4 WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 'updated' $q$);
  PERFORM chk('constraints', 'a fourth email for a batch cannot be recorded -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ UPDATE public.project_reminder_state SET sent_count = 3 WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 'updated' $q$);
  PERFORM chk('constraints', 'the third one can -> ' || r, r = 'ok:updated');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.project_reminder_state (project_id, user_id) VALUES ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'one row per project -> ' || r, r = 'denied:23505');
END $$;

-- Cascade (destructive, so last).
DO $$
DECLARE err text;
BEGIN
  BEGIN
    DELETE FROM public.projects WHERE id = 'a1111111-1111-1111-1111-111111111111';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE;
  END;
  PERFORM chk('cascade', 'deleting a project deletes its reminder state' || coalesce(' -> blocked: ' || err, ''),
    err IS NULL AND NOT EXISTS (SELECT 1 FROM public.project_reminder_state WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  PERFORM chk('cascade', 'deleting a project leaves other projects'' state',
    (SELECT count(*) FROM public.project_reminder_state WHERE project_id = 'a2222222-2222-2222-2222-222222222222') = 1);
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','defaults','constraints','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

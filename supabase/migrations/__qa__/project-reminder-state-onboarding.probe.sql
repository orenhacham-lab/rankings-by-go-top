-- ============================================================================
-- EXECUTED PROBE — 20261009170000_project_reminder_state_onboarding.sql
--
-- Builds the table as 20260929030000 left it (with a row already in it), then
-- applies the new migration (via \i, twice, for idempotency) to a disposable
-- PostgreSQL cluster with Supabase's roles and the projects isolation policy.
-- Checks:
--   defaults      an existing row gets onboarding_sent_count 0 and NULLs, and
--                 the approval reminder's own columns are untouched.
--   constraints   only 'connect' and 'publish' pass as a stage, and at most 2
--                 setup emails are recorded for one stage.
--   isolation     the owner reads their own new columns; another user, an admin
--                 and anon read nothing; no browser role writes them.
--   mutated       MUTATION CONTROL: the owner policy made permissive and the
--                 browser grants put back — every isolation check must report
--                 the leak, and the two constraints dropped must report theirs.
-- NOT run against Supabase or Production.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-reminder-state-onboarding.probe.sql
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

-- The table as the approval-reminder migration leaves it, with rows already in it.
\i supabase/migrations/20260929030000_project_reminder_state.sql
SET ROLE service_role;
INSERT INTO public.project_reminder_state (project_id, user_id, batch_key, sent_count, last_sent_at) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'art-1', 1, '2026-10-01 06:00+00'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', NULL, 0, NULL);
RESET ROLE;

\i supabase/migrations/20261009170000_project_reminder_state_onboarding.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261009170000_project_reminder_state_onboarding.sql

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
  P text := 'a1111111-1111-1111-1111-111111111111';
  r text;
  own text := $q$ SELECT coalesce(onboarding_stage, 'none') || ',' || onboarding_sent_count::text
      FROM public.project_reminder_state WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$;
  wr text := $q$ WITH u AS (UPDATE public.project_reminder_state SET onboarding_sent_count = 0
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$;
BEGIN
  -- REGRESSION, every phase: the owner and the service role can do their job.
  r := try_as('authenticated', V, own);
  PERFORM chk(ph, 'owner reads own setup state -> ' || r, r = 'ok:connect,1');
  r := try_as('service_role', NULL, wr);
  PERFORM chk(ph, 'service_role writes the setup columns -> ' || r, r = 'ok:1');

  -- ISOLATION of the new columns.
  r := try_as('authenticated', A, own);
  PERFORM chk(ph, 'another user reads the owner''s setup state -> ' || r, (r = 'ok:null') <> broken);
  r := try_as('authenticated', M, own);
  PERFORM chk(ph, 'admin (not the owner) reads it -> ' || r, (r = 'ok:null') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.project_reminder_state $q$);
  PERFORM chk(ph, 'anon reads the table -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('authenticated', V, wr);
  PERFORM chk(ph, 'the owner''s own browser session writes the count -> ' || r, (r = 'denied:42501') <> broken);

  -- CONSTRAINTS (service role, the only writer).
  r := try_as('service_role', NULL, $q$ UPDATE public.project_reminder_state SET onboarding_stage = 'whatever'
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 'updated' $q$);
  PERFORM chk(ph, 'a stage that is not connect/publish -> ' || r, (r = 'denied:23514') <> broken);
  r := try_as('service_role', NULL, $q$ UPDATE public.project_reminder_state SET onboarding_sent_count = 3
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 'updated' $q$);
  PERFORM chk(ph, 'a third setup email for one stage -> ' || r, (r = 'denied:23514') <> broken);
  -- The narrow stop ("stop the setup emails, keep the approval reminder"): the public
  -- unsubscribe route writes it with the service role, and a browser session cannot.
  r := try_as('service_role', NULL, $q$ UPDATE public.project_reminder_state SET onboarding_opt_out = true
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 'updated' $q$);
  PERFORM chk(ph, 'service_role records the narrow stop -> ' || r, r = 'ok:updated');
  r := try_as('service_role', NULL, $q$ UPDATE public.project_reminder_state SET onboarding_opt_out = false
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 'updated' $q$);
  PERFORM chk(ph, 'and clears it when the switch goes back on -> ' || r, r = 'ok:updated');
  r := try_as('authenticated', V, $q$ UPDATE public.project_reminder_state SET onboarding_opt_out = true
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 'updated' $q$);
  PERFORM chk(ph, 'the owner''s own browser session writes it -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('service_role', NULL, $q$ UPDATE public.project_reminder_state SET onboarding_stage = 'publish', onboarding_sent_count = 2
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 'updated' $q$);
  PERFORM chk(ph, 'the second one, on a real stage -> ' || r, r = 'ok:updated');
END $$;

-- The state the checks read: one setup email sent for the connect stage.
SET ROLE service_role;
UPDATE public.project_reminder_state
  SET onboarding_stage = 'connect', onboarding_sent_count = 1, onboarding_last_sent_at = '2026-10-05 06:00+00'
  WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
RESET ROLE;

DO $$
BEGIN
  PERFORM chk('defaults', 'the setup count defaults to 0',
    (SELECT column_default FROM information_schema.columns
     WHERE table_name = 'project_reminder_state' AND column_name = 'onboarding_sent_count') = '0');
  PERFORM chk('defaults', 'a row that already existed keeps its approval state',
    (SELECT batch_key = 'art-1' AND sent_count = 1 FROM public.project_reminder_state
     WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  PERFORM chk('defaults', 'a row nothing was sent for has no stage and no date',
    (SELECT onboarding_stage IS NULL AND onboarding_sent_count = 0 AND onboarding_last_sent_at IS NULL
     FROM public.project_reminder_state WHERE project_id = 'a2222222-2222-2222-2222-222222222222'));
  -- The narrow stop ("stop the setup emails, keep the reminder"): nobody is stopped unless
  -- they asked, and asking never reaches the switch the owner pays for.
  PERFORM chk('defaults', 'nobody is opted out of the setup emails by default',
    (SELECT column_default FROM information_schema.columns
     WHERE table_name = 'project_reminder_state' AND column_name = 'onboarding_opt_out') = 'false'
    AND (SELECT bool_and(onboarding_opt_out = false) FROM public.project_reminder_state));
  PERFORM chk('defaults', 'the opt-out column can never be null',
    (SELECT is_nullable FROM information_schema.columns
     WHERE table_name = 'project_reminder_state' AND column_name = 'onboarding_opt_out') = 'NO');
END $$;

SELECT run_checks('after');

-- MUTATION CONTROL: break the isolation and drop the constraints.
DROP POLICY project_reminder_state_owner_select ON public.project_reminder_state;
CREATE POLICY project_reminder_state_owner_select ON public.project_reminder_state FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.project_reminder_state TO anon, authenticated, service_role;
ALTER TABLE public.project_reminder_state DROP CONSTRAINT project_reminder_state_onboarding_stage;
ALTER TABLE public.project_reminder_state DROP CONSTRAINT project_reminder_state_onboarding_count;
SELECT run_checks('mutated');

-- RESTORE: both migrations applied over the broken state repair it.
\i supabase/migrations/20260929030000_project_reminder_state.sql
\i supabase/migrations/20261009170000_project_reminder_state_onboarding.sql
SET ROLE service_role;
UPDATE public.project_reminder_state
  SET onboarding_stage = 'connect', onboarding_sent_count = 1, onboarding_last_sent_at = '2026-10-05 06:00+00'
  WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
RESET ROLE;
SELECT run_checks('restored');

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['defaults','after','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

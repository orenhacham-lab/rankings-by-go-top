-- ============================================================================
-- EXECUTED PROBE — 20261006140000_site_fix_auto_grants.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster that carries Supabase's roles, its default
-- grants (including the default privileges every NEW table in public gets) and
-- the projects isolation policy. Then:
--
--   'after'     the owner reads their own grants and only theirs; another user,
--               an admin and anon read nothing; no browser role writes; the
--               server turns a grant on, runs it and turns it off, but can never
--               delete one; the trigger refuses changing who turned it on, from
--               which IP and for what, and turning a grant that is off back on.
--   'mutated'   MUTATION CONTROL. The owner policy is replaced by a permissive
--               one, Supabase's default grants are put back and the guard
--               trigger is dropped: every isolation and guard check must now
--               report the hole. A check that cannot fail tests nothing.
--   'restored'  the migration file is applied again over the broken state and
--               every check holds again.
--
-- Then the constraints (the closed list of three types, one active grant per
-- project, the owner is the one who turned it on, the IP's length) and the
-- project ON DELETE CASCADE (the only way a grant row goes).
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/site-fix-auto-grants.probe.sql
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

-- Fixture: owner V, other user A, admin M.
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'owner second project'),
  ('a1111111-1111-1111-1111-333333333333', '11111111-1111-1111-1111-111111111111', 'owner third project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project');

\i supabase/migrations/20261006140000_site_fix_auto_grants.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261006140000_site_fix_auto_grants.sql

SET ROLE service_role;
INSERT INTO public.site_fix_auto_grants (id, user_id, project_id, fix_types, enabled_by, enabled_at, enabled_ip) VALUES
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   ARRAY['image_alt', 'broken_link', 'meta_description'], '11111111-1111-1111-1111-111111111111', '2026-10-01T10:00:00Z', '203.0.113.9'),
  ('c2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222',
   ARRAY['image_alt'], '22222222-2222-2222-2222-222222222222', '2026-10-01T10:00:00Z', '198.51.100.7');
-- A grant of the owner's second project, already turned off.
INSERT INTO public.site_fix_auto_grants (id, user_id, project_id, fix_types, enabled_by, enabled_at, enabled_ip, disabled_at, disabled_by) VALUES
  ('c3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-222222222222',
   ARRAY['image_alt', 'broken_link', 'meta_description'], '11111111-1111-1111-1111-111111111111', '2026-09-01T10:00:00Z', '203.0.113.9',
   '2026-09-02T10:00:00Z', '11111111-1111-1111-1111-111111111111');
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
  ins text := format($q$ WITH i AS (INSERT INTO public.site_fix_auto_grants (user_id, project_id, fix_types, enabled_by, enabled_ip)
      VALUES (%L, 'a1111111-1111-1111-1111-333333333333', ARRAY['image_alt'], %L, '203.0.113.9') RETURNING 1) SELECT count(*)::text FROM i $q$, V, V);
  upd text := $q$ WITH u AS (UPDATE public.site_fix_auto_grants SET %s WHERE id = 'c1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$;
BEGIN
  -- REGRESSION, every phase: the owner reads their own grant.
  r := try_as('authenticated', V, $q$ SELECT array_to_string(fix_types, ',') || ':' || enabled_ip FROM public.site_fix_auto_grants
    WHERE id = 'c1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own grant -> ' || r, r = 'ok:image_alt,broken_link,meta_description:203.0.113.9');

  -- ISOLATION: unfiltered, the owner sees only their own rows; nobody else sees them.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.site_fix_auto_grants $q$);
  PERFORM chk(ph, 'owner reads all grants and gets only own (2) -> ' || r, (r = 'ok:2') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.site_fix_auto_grants WHERE user_id = '11111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'other user reads owner grants -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM public.site_fix_auto_grants WHERE user_id = '11111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'admin (not the owner) reads owner grants: owner-only by design -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.site_fix_auto_grants $q$);
  PERFORM chk(ph, 'anon reads grants -> ' || r, (r = 'denied:42501') <> broken);

  -- ISOLATION: no browser role writes, not even the owner into their own project.
  r := try_as('authenticated', V, ins);
  PERFORM chk(ph, 'owner turns the switch on directly (bypassing the route) -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, format(upd, 'last_run_at = now()'));
  PERFORM chk(ph, 'owner updates own grant -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', A, format(upd, 'run_claimed_until = now()'));
  PERFORM chk(ph, 'other user updates owner grant -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, ins);
  PERFORM chk(ph, 'anon inserts a grant -> ' || r, (r LIKE 'denied:%') <> broken);

  -- NEVER DELETED, not even by the server.
  r := try_as('service_role', NULL, $q$ WITH d AS (DELETE FROM public.site_fix_auto_grants RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'service_role deletes grants -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH d AS (DELETE FROM public.site_fix_auto_grants RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'owner deletes own grants -> ' || r, (r LIKE 'denied:%') <> broken);

  -- THE GUARD: what was granted never changes, off stays off.
  r := try_as('service_role', NULL, format(upd, $s$enabled_ip = '192.0.2.1'$s$));
  PERFORM chk(ph, 'service_role rewrites the IP recorded at switch-on -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('service_role', NULL, format(upd, $s$fix_types = ARRAY['image_alt']$s$));
  PERFORM chk(ph, 'service_role changes the types after switch-on -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('service_role', NULL, format(upd, $s$enabled_at = '2026-01-01T00:00:00Z'$s$));
  PERFORM chk(ph, 'service_role moves the switch-on time -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.site_fix_auto_grants SET disabled_at = NULL, disabled_by = NULL
      WHERE id = 'c3333333-3333-3333-3333-333333333333' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'service_role turns a grant that is off back on -> ' || r, (r LIKE 'denied:%') <> broken);

  -- REGRESSION, every phase: the server runs a grant and turns one off.
  r := try_as('service_role', NULL, format(upd, 'last_run_at = now(), run_claimed_until = NULL, updated_at = now()'));
  PERFORM chk(ph, 'service_role records a run -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, format(upd, $s$disabled_at = now(), disabled_by = '11111111-1111-1111-1111-111111111111'$s$));
  PERFORM chk(ph, 'service_role turns the switch off -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, ins);
  PERFORM chk(ph, 'service_role turns the switch on -> ' || r, r = 'ok:1');

  PERFORM chk(ph, 'RLS is enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.site_fix_auto_grants'::regclass));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: a permissive policy, Supabase's default grants back, the guard gone.
DROP POLICY site_fix_auto_grants_owner_select ON public.site_fix_auto_grants;
CREATE POLICY site_fix_auto_grants_owner_select ON public.site_fix_auto_grants FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.site_fix_auto_grants TO anon, authenticated, service_role;
DROP TRIGGER site_fix_auto_grants_guard ON public.site_fix_auto_grants;
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the broken state, repairs it.
\i supabase/migrations/20261006140000_site_fix_auto_grants.sql
SELECT run_checks('restored');

-- Constraints (as service_role, the only writer).
DO $$
DECLARE r text;
  g text := $q$ INSERT INTO public.site_fix_auto_grants (user_id, project_id, fix_types, enabled_by, enabled_ip)
    VALUES ('11111111-1111-1111-1111-111111111111', %L, %L::text[], %L, %L) RETURNING 'inserted' $q$;
  V text := '11111111-1111-1111-1111-111111111111';
BEGIN
  r := try_as('service_role', NULL, format(g, 'a1111111-1111-1111-1111-222222222222', '{seo_title}', V, '203.0.113.9'));
  PERFORM chk('constraints', 'seo_title is never automatic -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, 'a1111111-1111-1111-1111-222222222222', '{image_alt,canonical}', V, '203.0.113.9'));
  PERFORM chk('constraints', 'a list with one type outside the three is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, 'a1111111-1111-1111-1111-222222222222', '{}', V, '203.0.113.9'));
  PERFORM chk('constraints', 'an empty list is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, 'a1111111-1111-1111-1111-222222222222', '{image_alt,image_alt,broken_link,meta_description}', V, '203.0.113.9'));
  PERFORM chk('constraints', 'more than three entries are rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, 'a1111111-1111-1111-1111-222222222222', '{image_alt}', '22222222-2222-2222-2222-222222222222', '203.0.113.9'));
  PERFORM chk('constraints', 'a grant turned on by someone other than the owner is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, 'a1111111-1111-1111-1111-222222222222', '{image_alt}', V, repeat('9', 65)));
  PERFORM chk('constraints', 'an IP longer than 64 characters is rejected -> ' || r, r = 'denied:23514');
  -- The 'after' and 'restored' phases each turned the third project's switch on (and rolled back); it is free.
  r := try_as('service_role', NULL, format(g, 'a1111111-1111-1111-1111-333333333333', '{image_alt,broken_link,meta_description}', V, '203.0.113.9'));
  PERFORM chk('constraints', 'the three covered types are accepted -> ' || r, r = 'ok:inserted');
END $$;
-- One active grant per project: kept for real this time, then a second one is refused.
INSERT INTO public.site_fix_auto_grants (user_id, project_id, fix_types, enabled_by, enabled_ip)
  VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-333333333333', ARRAY['image_alt'], '11111111-1111-1111-1111-111111111111', '203.0.113.9');
DO $$
DECLARE r text;
BEGIN
  r := try_as('service_role', NULL, $q$ INSERT INTO public.site_fix_auto_grants (user_id, project_id, fix_types, enabled_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-333333333333', ARRAY['broken_link'], '11111111-1111-1111-1111-111111111111') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a second active grant for one project is rejected -> ' || r, r = 'denied:23505');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.site_fix_auto_grants (user_id, project_id, fix_types, enabled_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-222222222222', ARRAY['broken_link'], '11111111-1111-1111-1111-111111111111') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a new grant beside one that is off is accepted (on again = a new row) -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.site_fix_auto_grants SET disabled_at = enabled_at - interval '1 day', disabled_by = user_id
      WHERE project_id = 'a1111111-1111-1111-1111-333333333333' AND disabled_at IS NULL RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('constraints', 'turned off before it was turned on is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.site_fix_auto_grants SET disabled_at = now(), disabled_by = '22222222-2222-2222-2222-222222222222'
      WHERE project_id = 'a1111111-1111-1111-1111-333333333333' AND disabled_at IS NULL RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('constraints', 'turned off by someone other than the owner is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ TRUNCATE public.site_fix_auto_grants $q$);
  PERFORM chk('constraints', 'service_role cannot truncate the grants -> ' || r, r LIKE 'denied:%');
  r := try_as('postgres', NULL, $q$ WITH d AS (DELETE FROM public.site_fix_auto_grants WHERE project_id = 'a1111111-1111-1111-1111-333333333333' RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk('constraints', 'even the table owner cannot delete a grant of a live project -> ' || r, r = 'denied:42501');
END $$;

-- Project deletion: the one way a grant row goes.
DELETE FROM public.projects WHERE id = 'a1111111-1111-1111-1111-333333333333';
SELECT chk('cascade', 'the grants of a deleted project are removed with it',
  (SELECT count(*) FROM public.site_fix_auto_grants WHERE project_id = 'a1111111-1111-1111-1111-333333333333') = 0);
SELECT chk('cascade', 'the grants of other projects stay',
  (SELECT count(*) FROM public.site_fix_auto_grants WHERE project_id <> 'a1111111-1111-1111-1111-333333333333') >= 3);

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

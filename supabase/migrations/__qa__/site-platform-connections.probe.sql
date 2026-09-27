-- ============================================================================
-- EXECUTED PROBE — 20260928000000_site_platform_connections.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster that carries Supabase's roles, its default
-- grants (including the default privileges every NEW table in public gets) and
-- the projects isolation policy as it stands after the OWASP hardening. Then:
--
--   'after'     the owner reads the non-secret columns of their own row; the
--               encrypted secret is unreadable to every browser role; another
--               user, an admin and anon read nothing; no browser role writes;
--               service_role reads and writes everything.
--   'mutated'   MUTATION CONTROL. The owner policy is replaced by a permissive
--               one and Supabase's default grants are put back: every isolation
--               check must now report the leak. A check that cannot fail tests
--               nothing.
--   'restored'  the migration file is applied again over the broken state and
--               every isolation check holds again.
--
-- Then the constraints (one row per project, the platform's own fields only,
-- https only, ciphertext shape, error-code shape), the generated_articles
-- columns, and the project ON DELETE CASCADE.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/site-platform-connections.probe.sql
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
CREATE TABLE public.generated_articles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE, title text, wp_post_id bigint);

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

-- Fixture: owner V, other user A, admin M. A generated article with a WordPress id.
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'owner second project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project');
INSERT INTO public.generated_articles (id, user_id, project_id, title, wp_post_id) VALUES
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'existing article', 42);

\i supabase/migrations/20260928000000_site_platform_connections.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20260928000000_site_platform_connections.sql

SET ROLE service_role;
INSERT INTO public.site_platform_connections
  (user_id, project_id, platform, wix_site_id, site_url, secret_encrypted, secret_hint, connection_status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'wix',
   '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'https://owner.wixsite.com/blog', 'aa:bb:cc', '••••a1b2', 'connected');
INSERT INTO public.site_platform_connections
  (user_id, project_id, platform, endpoint_url, secret_encrypted, secret_hint) VALUES
  ('22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'webhook',
   'https://other.example.org/hooks/gotop', '0f:1e:2d', 'whsec_••••9f');
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
  ins_owner text := format($q$ WITH i AS (INSERT INTO public.site_platform_connections
      (user_id, project_id, platform, endpoint_url, secret_encrypted, secret_hint)
      VALUES (%L, 'a1111111-1111-1111-1111-222222222222', 'webhook', 'https://planted.example.com/', 'ab:cd:ef', 'x')
      RETURNING 1) SELECT count(*)::text FROM i $q$, V);
BEGIN
  -- REGRESSION, every phase: the owner reads the safe columns of their own row.
  r := try_as('authenticated', V, $q$ SELECT platform || ':' || secret_hint || ':' || connection_status
    FROM public.site_platform_connections WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads the safe columns of own row -> ' || r, r = 'ok:wix:••••a1b2:connected');

  -- ISOLATION: the ciphertext is never readable by a browser role, not even the owner's own.
  r := try_as('authenticated', V, $q$ SELECT secret_encrypted FROM public.site_platform_connections
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads the encrypted secret -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM (SELECT * FROM public.site_platform_connections) s $q$);
  PERFORM chk(ph, 'owner SELECT * (includes the secret column) -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ SELECT wix_member_id FROM public.site_platform_connections LIMIT 1 $q$);
  PERFORM chk(ph, 'owner reads the internal author id -> ' || r, (r LIKE 'denied:%') <> broken);

  -- ISOLATION: rows. Unfiltered, the owner sees their one row and nothing else.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM (SELECT id FROM public.site_platform_connections) s $q$);
  PERFORM chk(ph, 'owner reads the whole table and gets only own row -> ' || r, (r = 'ok:1') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM (SELECT id FROM public.site_platform_connections
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111') s $q$);
  PERFORM chk(ph, 'other user reads owner row -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM (SELECT id FROM public.site_platform_connections
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111') s $q$);
  PERFORM chk(ph, 'admin (not the owner) reads owner row: owner-only by design -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM (SELECT id FROM public.site_platform_connections) s $q$);
  PERFORM chk(ph, 'anon reads -> ' || r, (r = 'denied:42501') <> broken);

  -- ISOLATION: no browser role writes, not even the owner into their own project.
  r := try_as('authenticated', V, ins_owner);
  PERFORM chk(ph, 'owner inserts into own project -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH u AS (UPDATE public.site_platform_connections SET connection_status = 'connected'
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'owner updates own row -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', A, $q$ WITH d AS (DELETE FROM public.site_platform_connections
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'other user deletes owner row -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, ins_owner);
  PERFORM chk(ph, 'anon inserts -> ' || r, (r LIKE 'denied:%') <> broken);

  -- REGRESSION, every phase: the server writes and reads everything, the secret included.
  r := try_as('service_role', NULL, ins_owner);
  PERFORM chk(ph, 'service_role inserts -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, $q$ SELECT secret_encrypted FROM public.site_platform_connections
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'service_role reads the encrypted secret -> ' || r, r = 'ok:aa:bb:cc');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.site_platform_connections SET last_error_code = 'wix_auth_failed'
      RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'service_role updates -> ' || r, r = 'ok:2');

  PERFORM chk(ph, 'RLS is enabled on the table',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.site_platform_connections'::regclass));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: the policy made permissive, Supabase's default grants back.
DROP POLICY site_platform_connections_owner_select ON public.site_platform_connections;
CREATE POLICY site_platform_connections_owner_select ON public.site_platform_connections
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.site_platform_connections TO anon, authenticated;
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the broken state, repairs it.
\i supabase/migrations/20260928000000_site_platform_connections.sql
SELECT run_checks('restored');

-- Constraints (as service_role, the only writer).
DO $$
DECLARE r text;
  wix text := $q$ INSERT INTO public.site_platform_connections
    (user_id, project_id, platform, wix_site_id, endpoint_url, secret_encrypted, secret_hint, last_error_code)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-222222222222', %L, %L, %L, %L, 'h', %L) RETURNING 'inserted' $q$;
BEGIN
  r := try_as('service_role', NULL, format(wix, 'squarespace', NULL, 'https://x.example.com/', 'ab:cd:ef', NULL));
  PERFORM chk('constraints', 'an unknown platform is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(wix, 'wix', 'not-a-uuid', NULL, 'ab:cd:ef', NULL));
  PERFORM chk('constraints', 'a Wix row without a UUID site id is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(wix, 'wix', NULL, NULL, 'ab:cd:ef', NULL));
  PERFORM chk('constraints', 'a Wix row without a site id is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(wix, 'wix', '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'https://x.example.com/', 'ab:cd:ef', NULL));
  PERFORM chk('constraints', 'a Wix row carrying a webhook URL is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(wix, 'webhook', NULL, 'http://x.example.com/', 'ab:cd:ef', NULL));
  PERFORM chk('constraints', 'an http:// webhook is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(wix, 'webhook', NULL, NULL, 'ab:cd:ef', NULL));
  PERFORM chk('constraints', 'a webhook row without a URL is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(wix, 'webhook', NULL, 'https://x.example.com/', 'IST.plaintext-api-key', NULL));
  PERFORM chk('constraints', 'a plaintext secret is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(wix, 'webhook', NULL, 'https://x.example.com/', 'ab:cd:ef', 'Remote said: 500 <html>'));
  PERFORM chk('constraints', 'a raw provider message as the error code is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(wix, 'webhook', NULL, 'https://x.example.com/', 'ab:cd:ef', 'webhook_timeout'));
  PERFORM chk('constraints', 'a well-formed webhook row is stored -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.site_platform_connections
    (user_id, project_id, platform, endpoint_url, secret_encrypted, secret_hint)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'webhook', 'https://y.example.com/', 'ab:cd:ef', 'h') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a second connection for the same project is rejected -> ' || r, r = 'denied:23505');

  -- generated_articles: the new columns exist, are nullable, and only name known platforms.
  PERFORM chk('articles', 'the existing article is untouched (wp_post_id kept, new columns NULL)',
    (SELECT wp_post_id = 42 AND site_post_id IS NULL AND site_post_platform IS NULL AND site_post_url IS NULL
       FROM public.generated_articles WHERE id = 'c1111111-1111-1111-1111-111111111111'));
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.generated_articles SET site_post_platform = 'wix',
      site_post_id = 'post-1', site_post_url = 'https://owner.wixsite.com/blog/post/x' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('articles', 'a Wix post id is recorded on an article -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.generated_articles SET site_post_platform = 'ghost' RETURNING 1)
      SELECT count(*)::text FROM u $q$);
  PERFORM chk('articles', 'an unknown site_post_platform is rejected -> ' || r, r = 'denied:23514');
END $$;

-- Cascade (destructive, so last).
DO $$
DECLARE err text;
BEGIN
  BEGIN
    DELETE FROM public.projects WHERE id = 'a1111111-1111-1111-1111-111111111111';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE;
  END;
  PERFORM chk('cascade', 'deleting a project deletes its connection' || coalesce(' -> blocked: ' || err, ''),
    err IS NULL AND NOT EXISTS (SELECT 1 FROM public.site_platform_connections
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  PERFORM chk('cascade', 'deleting a project leaves other projects'' connections',
    (SELECT count(*) FROM public.site_platform_connections WHERE project_id = 'a2222222-2222-2222-2222-222222222222') = 1);
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints','articles','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

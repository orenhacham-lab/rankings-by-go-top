-- ============================================================================
-- EXECUTED PROBE — 20260929000000_gbp_local_posts.sql
--
-- Applies the migration file (via \i, twice, for idempotency) to a disposable
-- PostgreSQL cluster that carries Supabase's roles, its default grants (every
-- NEW table in public gets ALL for anon/authenticated) and the projects
-- isolation policy. Then:
--
--   'after'     the owner reads their own connection (never its token), their
--               location and their posts; another user, an admin and anon read
--               nothing; the OAuth state table is invisible to every browser
--               role; no browser role writes; service_role does everything.
--   'mutated'   MUTATION CONTROL: permissive policies and Supabase's default
--               grants put back. Every isolation check must now report the leak.
--   'restored'  the migration applied again over the broken state; every
--               isolation check holds again.
--
-- Then the constraints (1,500 characters, button types, the URL rules, https,
-- encrypted token shape, error-code shape, published-needs-an-id) and cascades.
-- NOT run against Supabase or Production; every row is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/gbp-local-posts.probe.sql
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
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE, title text);

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
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project');
INSERT INTO public.generated_articles (id, user_id, project_id, title) VALUES
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'article');

\i supabase/migrations/20260929000000_gbp_local_posts.sql
\i supabase/migrations/20260929000000_gbp_local_posts.sql

SET ROLE service_role;
INSERT INTO public.gbp_connections (id, user_id, encrypted_refresh_token, granted_scope) VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'v1:aa:bb:cc', 'https://www.googleapis.com/auth/business.manage'),
  ('d2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'v1:0f:1e:2d', 'https://www.googleapis.com/auth/business.manage');
INSERT INTO public.gbp_oauth_states (state_hash, user_id, project_id, code_verifier_encrypted, expires_at) VALUES
  (repeat('a', 64), '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'v1:01:02:03', now() + interval '10 minutes');
INSERT INTO public.project_gbp_locations (project_id, user_id, connection_id, account_name, location_name, location_title, maps_uri) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'accounts/100', 'locations/200', 'המאפייה של דנה', 'https://maps.google.com/?cid=1'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', 'accounts/300', 'locations/400', 'Other shop', NULL);
INSERT INTO public.gbp_posts (project_id, user_id, source_article_id, summary, cta_type, cta_url, status) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'לחם טרי כל בוקר', 'LEARN_MORE', 'https://dana.co.il/bread', 'scheduled'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', NULL, 'Other post', NULL, NULL, 'scheduled');
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
  ins_post text := $q$ WITH i AS (INSERT INTO public.gbp_posts (project_id, user_id, summary)
      VALUES ('a1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'planted') RETURNING 1)
      SELECT count(*)::text FROM i $q$;
BEGIN
  -- REGRESSION, every phase: the owner reads their own safe rows.
  r := try_as('authenticated', V, $q$ SELECT status || ':' || granted_scope FROM public.gbp_connections WHERE user_id = '11111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own connection status -> ' || r, r = 'ok:connected:https://www.googleapis.com/auth/business.manage');
  r := try_as('authenticated', V, $q$ SELECT location_title FROM public.project_gbp_locations WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own location -> ' || r, r = 'ok:המאפייה של דנה');
  r := try_as('authenticated', V, $q$ SELECT summary FROM public.gbp_posts WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own post -> ' || r, r = 'ok:לחם טרי כל בוקר');

  -- ISOLATION: the encrypted token never reaches a browser role.
  r := try_as('authenticated', V, $q$ SELECT encrypted_refresh_token FROM public.gbp_connections WHERE user_id = '11111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads the encrypted token -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM (SELECT * FROM public.gbp_connections) s $q$);
  PERFORM chk(ph, 'owner SELECT * on connections (includes the token) -> ' || r, (r LIKE 'denied:%') <> broken);

  -- ISOLATION: the OAuth state + PKCE verifier are invisible to browsers, even the owner.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM (SELECT state_hash FROM public.gbp_oauth_states) s $q$);
  PERFORM chk(ph, 'owner reads OAuth states -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM (SELECT code_verifier_encrypted FROM public.gbp_oauth_states) s $q$);
  PERFORM chk(ph, 'anon reads PKCE verifiers -> ' || r, (r LIKE 'denied:%') <> broken);

  -- ISOLATION: rows.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM (SELECT id FROM public.gbp_connections) s $q$);
  PERFORM chk(ph, 'owner sees only own connection -> ' || r, (r = 'ok:1') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM (SELECT project_id FROM public.project_gbp_locations WHERE project_id = 'a1111111-1111-1111-1111-111111111111') s $q$);
  PERFORM chk(ph, 'other user reads owner location -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM (SELECT id FROM public.gbp_posts WHERE project_id = 'a1111111-1111-1111-1111-111111111111') s $q$);
  PERFORM chk(ph, 'other user reads owner posts -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM (SELECT id FROM public.gbp_posts WHERE project_id = 'a1111111-1111-1111-1111-111111111111') s $q$);
  PERFORM chk(ph, 'admin (not the owner) reads owner posts: owner-only by design -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM (SELECT id FROM public.gbp_posts) s $q$);
  PERFORM chk(ph, 'anon reads posts -> ' || r, (r = 'denied:42501') <> broken);

  -- ISOLATION: no browser role writes.
  r := try_as('authenticated', V, ins_post);
  PERFORM chk(ph, 'owner inserts a post directly -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH u AS (UPDATE public.gbp_posts SET status = 'published', google_post_name = 'accounts/1/locations/2/localPosts/3'
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'owner marks own post published -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH u AS (UPDATE public.project_gbp_locations SET connection_id = 'd2222222-2222-2222-2222-222222222222'
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'owner repoints own location to another user''s connection -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', A, $q$ WITH d AS (DELETE FROM public.gbp_connections WHERE user_id = '11111111-1111-1111-1111-111111111111' RETURNING 1)
      SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'other user deletes owner connection -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, ins_post);
  PERFORM chk(ph, 'anon inserts a post -> ' || r, (r LIKE 'denied:%') <> broken);

  -- REGRESSION: the server does everything.
  r := try_as('service_role', NULL, ins_post);
  PERFORM chk(ph, 'service_role inserts a post -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, $q$ SELECT encrypted_refresh_token FROM public.gbp_connections WHERE user_id = '11111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'service_role reads the encrypted token -> ' || r, r = 'ok:v1:aa:bb:cc');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.gbp_oauth_states SET consumed_at = now() RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'service_role consumes a state -> ' || r, r = 'ok:1');

  PERFORM chk(ph, 'RLS is enabled on all four tables',
    (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.gbp_connections'::regclass, 'public.gbp_oauth_states'::regclass,
      'public.project_gbp_locations'::regclass, 'public.gbp_posts'::regclass)));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL.
DROP POLICY gbp_connections_owner_select ON public.gbp_connections;
CREATE POLICY gbp_connections_owner_select ON public.gbp_connections FOR ALL USING (true) WITH CHECK (true);
DROP POLICY project_gbp_locations_owner_select ON public.project_gbp_locations;
CREATE POLICY project_gbp_locations_owner_select ON public.project_gbp_locations FOR ALL USING (true) WITH CHECK (true);
DROP POLICY gbp_posts_owner_select ON public.gbp_posts;
CREATE POLICY gbp_posts_owner_select ON public.gbp_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY gbp_oauth_states_leak ON public.gbp_oauth_states FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.gbp_connections, public.gbp_oauth_states, public.project_gbp_locations, public.gbp_posts TO anon, authenticated;
SELECT run_checks('mutated');

-- RESTORE: the migration (plus dropping the planted extra policy, which it does not know about).
DROP POLICY gbp_oauth_states_leak ON public.gbp_oauth_states;
\i supabase/migrations/20260929000000_gbp_local_posts.sql
SELECT run_checks('restored');

-- Constraints (service_role is the only writer).
DO $$
DECLARE r text;
  post text := $q$ INSERT INTO public.gbp_posts (project_id, user_id, summary, cta_type, cta_url, image_url, status, google_post_name, last_error_code)
    VALUES ('a1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', %L, %L, %L, %L, %L, %L, %L) RETURNING 'inserted' $q$;
BEGIN
  r := try_as('service_role', NULL, format(post, repeat('א', 1500), NULL, NULL, NULL, 'scheduled', NULL, NULL));
  PERFORM chk('constraints', '1,500 Hebrew characters are accepted -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, format(post, repeat('א', 1501), NULL, NULL, NULL, 'scheduled', NULL, NULL));
  PERFORM chk('constraints', '1,501 characters are rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, '', NULL, NULL, NULL, 'scheduled', NULL, NULL));
  PERFORM chk('constraints', 'an empty text is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'x', 'GET_OFFER', 'https://a.example.com/', NULL, 'scheduled', NULL, NULL));
  PERFORM chk('constraints', 'the deprecated GET_OFFER button is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'x', 'BOOK', NULL, NULL, 'scheduled', NULL, NULL));
  PERFORM chk('constraints', 'a BOOK button without a URL is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'x', 'BOOK', 'http://a.example.com/', NULL, 'scheduled', NULL, NULL));
  PERFORM chk('constraints', 'an http:// button URL is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'x', 'CALL', 'https://a.example.com/', NULL, 'scheduled', NULL, NULL));
  PERFORM chk('constraints', 'a CALL button with a URL is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'x', NULL, 'https://a.example.com/', NULL, 'scheduled', NULL, NULL));
  PERFORM chk('constraints', 'a URL without a button is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'x', 'CALL', NULL, NULL, 'scheduled', NULL, NULL));
  PERFORM chk('constraints', 'a CALL button alone is accepted -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, format(post, 'x', 'SHOP', 'https://a.example.com/p', 'https://x.supabase.co/storage/v1/object/public/b/p.jpg', 'scheduled', NULL, NULL));
  PERFORM chk('constraints', 'a SHOP button with an https URL and an image is accepted -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, format(post, 'x', NULL, NULL, 'http://x.example.com/p.jpg', 'scheduled', NULL, NULL));
  PERFORM chk('constraints', 'an http:// image is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'x', NULL, NULL, NULL, 'published', NULL, NULL));
  PERFORM chk('constraints', 'published without Google''s post id is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'x', NULL, NULL, NULL, 'failed', NULL, 'Request had invalid argument <html>'));
  PERFORM chk('constraints', 'a raw provider message as the error code is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'x', NULL, NULL, NULL, 'draft', NULL, NULL));
  PERFORM chk('constraints', 'an unknown status is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.gbp_connections (user_id, encrypted_refresh_token)
    VALUES ('33333333-3333-3333-3333-333333333333', '1//0g-plaintext-refresh-token') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a plaintext refresh token is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.gbp_connections (user_id, encrypted_refresh_token)
    VALUES ('11111111-1111-1111-1111-111111111111', 'v1:01:02:03') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a second connection for the same user is rejected -> ' || r, r = 'denied:23505');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.gbp_oauth_states (state_hash, user_id, project_id, code_verifier_encrypted, expires_at)
    VALUES (repeat('b', 64), '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'plain-verifier', now()) RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a plaintext PKCE verifier is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.project_gbp_locations (project_id, user_id, connection_id, account_name, location_name, location_title)
    VALUES ('a1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'accounts/1/../2', 'locations/2', 't') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a malformed account name is rejected -> ' || r, r = 'denied:23514');
END $$;

-- Cascades (destructive, so last).
DO $$
BEGIN
  DELETE FROM public.generated_articles WHERE id = 'c1111111-1111-1111-1111-111111111111';
  PERFORM chk('cascade', 'deleting the source article keeps the post and clears the link',
    (SELECT source_article_id IS NULL FROM public.gbp_posts WHERE summary = 'לחם טרי כל בוקר'));
  DELETE FROM public.gbp_connections WHERE user_id = '11111111-1111-1111-1111-111111111111';
  PERFORM chk('cascade', 'deleting a connection removes the locations that used it',
    NOT EXISTS (SELECT 1 FROM public.project_gbp_locations WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  DELETE FROM public.projects WHERE id = 'a1111111-1111-1111-1111-111111111111';
  PERFORM chk('cascade', 'deleting a project removes its posts and states',
    NOT EXISTS (SELECT 1 FROM public.gbp_posts WHERE project_id = 'a1111111-1111-1111-1111-111111111111')
    AND NOT EXISTS (SELECT 1 FROM public.gbp_oauth_states WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  PERFORM chk('cascade', 'other users'' rows are untouched',
    (SELECT count(*) FROM public.gbp_posts WHERE project_id = 'a2222222-2222-2222-2222-222222222222') = 1
    AND (SELECT count(*) FROM public.project_gbp_locations WHERE project_id = 'a2222222-2222-2222-2222-222222222222') = 1);
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

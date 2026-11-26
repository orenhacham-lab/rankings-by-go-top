-- ============================================================================
-- EXECUTED PROBE — 20261125180000_meta_social_posts.sql
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
-- encrypted token shape, error-code shape, published-needs-an-id) and cascades,
-- including deleting the auth user (with a mutation control that drops the FK).
-- NOT run against Supabase or Production; every row is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/meta-social-posts.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
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
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');
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

\i supabase/migrations/20261125180000_meta_social_posts.sql
\i supabase/migrations/20261125180000_meta_social_posts.sql

SET ROLE service_role;
INSERT INTO public.meta_connections (id, user_id, fb_user_id, encrypted_user_token, granted_scopes) VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '555', 'v1:aa:bb:cc', 'pages_show_list'),
  ('d2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '777', 'v1:0f:1e:2d', 'pages_show_list');
INSERT INTO public.meta_oauth_states (state_hash, user_id, project_id, expires_at) VALUES
  (repeat('a', 64), '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', now() + interval '10 minutes');
INSERT INTO public.project_meta_pages (project_id, user_id, connection_id, page_id, page_name, encrypted_page_token) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', '100', 'המאפייה של דנה', 'v1:11:22:33'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', '300', 'Other page', 'v1:44:55:66');
INSERT INTO public.meta_posts (project_id, user_id, source_article_id, target, body, status) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'facebook', 'לחם טרי כל בוקר', 'draft'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', NULL, 'facebook', 'Other post', 'draft');
INSERT INTO public.meta_deletion_requests (code, kind) VALUES (repeat('a', 24), 'deletion');
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
  ins_post text := $q$ WITH i AS (INSERT INTO public.meta_posts (project_id, user_id, target, body)
      VALUES ('a1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'facebook', 'planted') RETURNING 1)
      SELECT count(*)::text FROM i $q$;
BEGIN
  -- REGRESSION: the owner reads their own safe rows.
  r := try_as('authenticated', V, $q$ SELECT status || ':' || granted_scopes FROM public.meta_connections WHERE user_id = '11111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own connection status -> ' || r, r = 'ok:connected:pages_show_list');
  r := try_as('authenticated', V, $q$ SELECT page_name FROM public.project_meta_pages WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own page name -> ' || r, r = 'ok:המאפייה של דנה');
  r := try_as('authenticated', V, $q$ SELECT body FROM public.meta_posts WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own post -> ' || r, r = 'ok:לחם טרי כל בוקר');

  -- ISOLATION: tokens never reach a browser role.
  r := try_as('authenticated', V, $q$ SELECT encrypted_user_token FROM public.meta_connections WHERE user_id = '11111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads the encrypted user token -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ SELECT encrypted_page_token FROM public.project_meta_pages WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads the encrypted page token -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM (SELECT * FROM public.meta_connections) s $q$);
  PERFORM chk(ph, 'owner SELECT * on connections (includes the token) -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM (SELECT state_hash FROM public.meta_oauth_states) s $q$);
  PERFORM chk(ph, 'owner reads OAuth states -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM (SELECT code FROM public.meta_deletion_requests) s $q$);
  PERFORM chk(ph, 'a browser role lists deletion codes -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM (SELECT code FROM public.meta_deletion_requests) s $q$);
  PERFORM chk(ph, 'anon lists deletion codes -> ' || r, (r LIKE 'denied:%') <> broken);

  -- ISOLATION: rows.
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM (SELECT project_id FROM public.project_meta_pages WHERE project_id = 'a1111111-1111-1111-1111-111111111111') s $q$);
  PERFORM chk(ph, 'other user reads owner page -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM (SELECT id FROM public.meta_posts WHERE project_id = 'a1111111-1111-1111-1111-111111111111') s $q$);
  PERFORM chk(ph, 'other user reads owner posts -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM (SELECT id FROM public.meta_posts) s $q$);
  PERFORM chk(ph, 'anon reads posts -> ' || r, (r = 'denied:42501') <> broken);

  -- ISOLATION: no browser role writes (so no browser role can approve).
  r := try_as('authenticated', V, ins_post);
  PERFORM chk(ph, 'owner inserts a post directly -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH u AS (UPDATE public.meta_posts SET status = 'scheduled', approved_at = now()
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'owner approves a post straight in the table -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', A, $q$ WITH d AS (DELETE FROM public.meta_connections WHERE user_id = '11111111-1111-1111-1111-111111111111' RETURNING 1)
      SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'other user deletes owner connection -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, ins_post);
  PERFORM chk(ph, 'anon inserts a post -> ' || r, (r LIKE 'denied:%') <> broken);

  -- REGRESSION: the server does everything.
  r := try_as('service_role', NULL, ins_post);
  PERFORM chk(ph, 'service_role inserts a post -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, $q$ SELECT encrypted_user_token FROM public.meta_connections WHERE user_id = '11111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'service_role reads the encrypted token -> ' || r, r = 'ok:v1:aa:bb:cc');
  r := try_as('service_role', NULL, $q$ SELECT status FROM public.meta_deletion_requests WHERE code = repeat('a', 24) $q$);
  PERFORM chk(ph, 'service_role reads a deletion status -> ' || r, r = 'ok:completed');

  PERFORM chk(ph, 'RLS is enabled on all five tables',
    (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.meta_connections'::regclass, 'public.meta_oauth_states'::regclass,
      'public.project_meta_pages'::regclass, 'public.meta_posts'::regclass, 'public.meta_deletion_requests'::regclass)));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL.
DROP POLICY meta_connections_owner_select ON public.meta_connections;
CREATE POLICY meta_connections_owner_select ON public.meta_connections FOR ALL USING (true) WITH CHECK (true);
DROP POLICY project_meta_pages_owner_select ON public.project_meta_pages;
CREATE POLICY project_meta_pages_owner_select ON public.project_meta_pages FOR ALL USING (true) WITH CHECK (true);
DROP POLICY meta_posts_owner_select ON public.meta_posts;
CREATE POLICY meta_posts_owner_select ON public.meta_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY meta_oauth_states_leak ON public.meta_oauth_states FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY meta_deletion_requests_leak ON public.meta_deletion_requests FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.meta_connections, public.meta_oauth_states, public.project_meta_pages, public.meta_posts, public.meta_deletion_requests TO anon, authenticated;
SELECT run_checks('mutated');

-- RESTORE.
DROP POLICY meta_oauth_states_leak ON public.meta_oauth_states;
DROP POLICY meta_deletion_requests_leak ON public.meta_deletion_requests;
\i supabase/migrations/20261125180000_meta_social_posts.sql
SELECT run_checks('restored');

-- Constraints (service_role is the only writer).
DO $$
DECLARE r text;
  post text := $q$ INSERT INTO public.meta_posts (project_id, user_id, target, body, image_url, status, approved_at, remote_post_id, last_error_code, language_code)
    VALUES ('a1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', %L, %L, %L, %L, %L, %L, %L, %L) RETURNING 'inserted' $q$;
BEGIN
  r := try_as('service_role', NULL, format(post, 'facebook', repeat('א', 2200), NULL, 'draft', NULL, NULL, NULL, 'he'));
  PERFORM chk('constraints', '2,200 Hebrew characters are accepted -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, format(post, 'facebook', repeat('א', 2201), NULL, 'draft', NULL, NULL, NULL, 'he'));
  PERFORM chk('constraints', '2,201 characters are rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'facebook', '', NULL, 'draft', NULL, NULL, NULL, 'en'));
  PERFORM chk('constraints', 'an empty text is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'tiktok', 'x', NULL, 'draft', NULL, NULL, NULL, 'en'));
  PERFORM chk('constraints', 'an unknown target is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'facebook', 'x', NULL, 'draft', NULL, NULL, NULL, 'xx'));
  PERFORM chk('constraints', 'a twelfth language is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'facebook', 'x', NULL, 'draft', NULL, NULL, NULL, 'pt-BR'));
  PERFORM chk('constraints', 'pt-BR is accepted -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, format(post, 'instagram', 'x', NULL, 'draft', NULL, NULL, NULL, 'en'));
  PERFORM chk('constraints', 'an Instagram post without a photo is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'instagram', 'x', 'https://x.supabase.co/p.jpg', 'draft', NULL, NULL, NULL, 'en'));
  PERFORM chk('constraints', 'an Instagram post with an https photo is accepted -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, format(post, 'facebook', 'x', 'http://x.example.com/p.jpg', 'draft', NULL, NULL, NULL, 'en'));
  PERFORM chk('constraints', 'an http:// photo is rejected -> ' || r, r = 'denied:23514');
  -- CONDITION 1: nothing is scheduled, being published or published without approval.
  r := try_as('service_role', NULL, format(post, 'facebook', 'x', NULL, 'scheduled', NULL, NULL, NULL, 'en'));
  PERFORM chk('constraints', 'a scheduled post with no approval is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'facebook', 'x', NULL, 'publishing', NULL, NULL, NULL, 'en'));
  PERFORM chk('constraints', 'a publishing post with no approval is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'facebook', 'x', NULL, 'published', NULL, '123_456', NULL, 'en'));
  PERFORM chk('constraints', 'a published post with no approval is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'facebook', 'x', NULL, 'scheduled', now()::text, NULL, NULL, 'en'));
  PERFORM chk('constraints', 'an approved scheduled post is accepted -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, format(post, 'facebook', 'x', NULL, 'published', now()::text, NULL, NULL, 'en'));
  PERFORM chk('constraints', 'published without Meta''s post id is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(post, 'facebook', 'x', NULL, 'failed', NULL, NULL, 'Error validating access token <html>', 'en'));
  PERFORM chk('constraints', 'a raw provider message as the error code is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.meta_connections (user_id, fb_user_id, encrypted_user_token)
    VALUES ('33333333-3333-3333-3333-333333333333', '9', 'EAAB-plaintext-token') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a plaintext user token is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.meta_connections (user_id, fb_user_id, encrypted_user_token)
    VALUES ('33333333-3333-3333-3333-333333333333', 'abc', 'v1:01:02:03') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a non-numeric Facebook id is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.meta_connections (user_id, fb_user_id, encrypted_user_token)
    VALUES ('11111111-1111-1111-1111-111111111111', '5', 'v1:01:02:03') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a second connection for the same user is rejected -> ' || r, r = 'denied:23505');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.project_meta_pages (project_id, user_id, connection_id, page_id, page_name, encrypted_page_token)
    VALUES ('a1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', '1', 'p', 'plain-page-token') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a plaintext page token is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.meta_deletion_requests (code, kind) VALUES ('not-a-code', 'deletion') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a malformed deletion code is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.meta_deletion_requests (code, kind, status) VALUES (repeat('b', 24), 'deauthorize', 'completed') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a well-formed deletion code is accepted -> ' || r, r = 'ok:inserted');
END $$;

-- Cascades (destructive, so last).
DO $$
DECLARE
  A constant uuid := '22222222-2222-2222-2222-222222222222';
  survived boolean;
  drop_fk text;
BEGIN
  DELETE FROM public.meta_connections WHERE user_id = '11111111-1111-1111-1111-111111111111';
  PERFORM chk('cascade', 'deleting a connection (disconnect) removes the saved page and its token',
    NOT EXISTS (SELECT 1 FROM public.project_meta_pages WHERE user_id = '11111111-1111-1111-1111-111111111111'));
  PERFORM chk('cascade', 'disconnect keeps the post history',
    EXISTS (SELECT 1 FROM public.meta_posts WHERE user_id = '11111111-1111-1111-1111-111111111111'));
  DELETE FROM public.projects WHERE id = 'a1111111-1111-1111-1111-111111111111';
  PERFORM chk('cascade', 'deleting a project removes its posts and states',
    NOT EXISTS (SELECT 1 FROM public.meta_posts WHERE project_id = 'a1111111-1111-1111-1111-111111111111')
    AND NOT EXISTS (SELECT 1 FROM public.meta_oauth_states WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  PERFORM chk('cascade', 'other users'' rows are untouched',
    (SELECT count(*) FROM public.meta_posts WHERE project_id = 'a2222222-2222-2222-2222-222222222222') = 1
    AND (SELECT count(*) FROM public.project_meta_pages WHERE project_id = 'a2222222-2222-2222-2222-222222222222') = 1);

  PERFORM chk('cascade', 'every Meta table''s user_id references auth.users ON DELETE CASCADE',
    (SELECT count(DISTINCT c.conrelid) FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey) AND a.attname = 'user_id'
      WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass AND c.confdeltype = 'c'
        AND c.conrelid IN ('public.meta_connections'::regclass, 'public.meta_oauth_states'::regclass,
                           'public.project_meta_pages'::regclass, 'public.meta_posts'::regclass)) = 4);

  -- MUTATION CONTROL: without the foreign key, the deleted user's token row survives.
  BEGIN
    SELECT string_agg(format('ALTER TABLE %s DROP CONSTRAINT %I', c.conrelid::regclass, c.conname), '; ') INTO drop_fk
      FROM pg_constraint c WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass
       AND c.conrelid = 'public.meta_connections'::regclass;
    IF drop_fk IS NOT NULL THEN EXECUTE drop_fk; END IF;
    DELETE FROM auth.users WHERE id = A;
    survived := EXISTS (SELECT 1 FROM public.meta_connections WHERE user_id = A);
    RAISE EXCEPTION 'undo_mutation';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  PERFORM chk('cascade', 'MUTATION CONTROL: without the foreign key the deleted user''s token row survives', survived);

  DELETE FROM auth.users WHERE id = A;
  PERFORM chk('cascade', 'deleting the auth user removes their connection (encrypted token) row',
    NOT EXISTS (SELECT 1 FROM public.meta_connections WHERE user_id = A));
  PERFORM chk('cascade', 'deleting the auth user removes their pages, posts and OAuth states',
    NOT EXISTS (SELECT 1 FROM public.project_meta_pages WHERE user_id = A)
    AND NOT EXISTS (SELECT 1 FROM public.meta_posts WHERE user_id = A)
    AND NOT EXISTS (SELECT 1 FROM public.meta_oauth_states WHERE user_id = A));
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

-- ============================================================================
-- EXECUTED PROBE — 20261016180000_project_author_box_overrides.sql
--
-- A disposable PostgreSQL cluster with Supabase's roles and default grants,
-- the article settings table as Production has it (20260928001000, the call
-- to action, the writing guidance and the author-box switch 20261016120000,
-- applied first), then the new migration, twice (idempotent).
--
--   'after'     existing rows read no name, no link and image 'none'; the
--               switch and other columns are untouched; the owner writes a
--               name, an https (and an http) link and 'site_icon' on their own
--               row; another user and anon cannot; a NULL image is refused.
--               Then the guarantees: a new row's image is 'none'; an unknown
--               image, a javascript: or ftp: link and a name with markup are
--               refused.
--   'mutated'   MUTATION CONTROL: the CHECKs dropped and the default 'site_icon';
--               every guarantee fails.
--   'restored'  the migration applied again over the broken state; all hold.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-author-box-overrides.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

-- The shared updated_at trigger function already in Production.
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS
  $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

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

-- Fixture: owner V (projects P1 with a row, P3 without), other user A (P2 with a row), admin M.
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project'),
  ('a3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'owner second project');

\i supabase/migrations/20260928001000_project_article_styles.sql

SET ROLE service_role;
INSERT INTO public.project_article_styles (project_id, user_id, brand_colors, design) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '{#e11d48}', 'formatted'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '{#0f766e}', 'minimal');
RESET ROLE;

\i supabase/migrations/20260929120000_project_article_cta.sql
\i supabase/migrations/20261005200000_project_writing_guidance.sql
UPDATE public.project_article_styles SET article_cta = '{"enabled": false, "heading": "keep me"}'::jsonb,
  writing_guidance = '{"instructions": "keep me too"}'::jsonb
  WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
\i supabase/migrations/20261016120000_project_author_box.sql
UPDATE public.project_article_styles SET author_box = true WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
\i supabase/migrations/20261016180000_project_author_box_overrides.sql
\i supabase/migrations/20261016180000_project_author_box_overrides.sql

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

-- The guarantees the mutation control breaks.
CREATE FUNCTION upd(sql_set text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN try_as('authenticated', '11111111-1111-1111-1111-111111111111', format($q$ WITH u AS (UPDATE public.project_article_styles SET %s
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$, sql_set));
END; $$;
CREATE FUNCTION run_defaults(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE broken boolean := (ph = 'mutated'); r text;
BEGIN
  r := try_as('authenticated', '11111111-1111-1111-1111-111111111111', $q$ WITH i AS (INSERT INTO public.project_article_styles (project_id, user_id)
    VALUES ('a3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111') RETURNING author_box_image) SELECT (author_box_image = 'none')::text FROM i $q$);
  PERFORM chk(ph, 'a new row has no image -> ' || r, (r = 'ok:true') <> broken);
  r := upd('author_box_image = ''upload_not_yet''');
  PERFORM chk(ph, 'an unknown image choice is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := upd('author_box_url = ''javascript:alert(1)''');
  PERFORM chk(ph, 'a javascript: link is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := upd('author_box_url = ''ftp://levi.example/a''');
  PERFORM chk(ph, 'an ftp: link is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := upd('author_box_name = ''<b>Dana</b>''');
  PERFORM chk(ph, 'a name with markup is refused -> ' || r, (r = 'denied:23514') <> broken);
END; $$;

DO $$
DECLARE r text;
BEGIN
  PERFORM chk('after', 'existing rows read no name, no link, no image',
    (SELECT bool_and(author_box_name IS NULL AND author_box_url IS NULL AND author_box_image = 'none') FROM public.project_article_styles));
  PERFORM chk('after', 'the switch, design, call-to-action and guidance columns are untouched',
    (SELECT author_box IS TRUE AND design = 'formatted' AND article_cta ->> 'heading' = 'keep me' AND writing_guidance ->> 'instructions' = 'keep me too'
     FROM public.project_article_styles WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  r := upd('author_box_name = ''Dana Levi'', author_box_url = ''https://levi.example/team'', author_box_image = ''site_icon''');
  PERFORM chk('after', 'the owner writes a name, an https link and the site icon on their own row -> ' || r, r = 'ok:1');
  r := upd('author_box_url = ''http://levi.example/team''');
  PERFORM chk('after', 'an http link is accepted -> ' || r, r = 'ok:1');
  r := upd('author_box_name = NULL, author_box_url = NULL');
  PERFORM chk('after', 'both can be cleared back to NULL -> ' || r, r = 'ok:1');
  r := try_as('authenticated', '22222222-2222-2222-2222-222222222222', $q$ WITH u AS (UPDATE public.project_article_styles SET author_box_name = 'x'
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('after', 'another user cannot write the owner''s name -> ' || r, r = 'ok:0');
  r := try_as('anon', NULL, $q$ WITH u AS (UPDATE public.project_article_styles SET author_box_name = 'x' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('after', 'anon cannot write it -> ' || r, r LIKE 'denied:%' OR r = 'ok:0');
  r := upd('author_box_image = NULL');
  PERFORM chk('after', 'a NULL image is refused -> ' || r, r = 'denied:23502');
END $$;
SELECT run_defaults('after');

-- MUTATION CONTROL: the CHECKs dropped, and the default the site icon.
ALTER TABLE public.project_article_styles
  DROP CONSTRAINT project_article_styles_author_box_name,
  DROP CONSTRAINT project_article_styles_author_box_url,
  DROP CONSTRAINT project_article_styles_author_box_image,
  ALTER COLUMN author_box_image SET DEFAULT 'site_icon';
DELETE FROM public.project_article_styles WHERE project_id = 'a3333333-3333-3333-3333-333333333333';
SELECT run_defaults('mutated');

-- Restored: the migration again over the broken state.
UPDATE public.project_article_styles SET author_box_name = NULL, author_box_url = NULL, author_box_image = 'none';
DELETE FROM public.project_article_styles WHERE project_id = 'a3333333-3333-3333-3333-333333333333';
\i supabase/migrations/20261016180000_project_author_box_overrides.sql
SELECT run_defaults('restored');

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

-- ============================================================================
-- EXECUTED PROBE — 20261016120000_project_author_box.sql
--
-- A disposable PostgreSQL cluster with Supabase's roles and default grants,
-- the article settings table as Production has it (20260928001000, the
-- call-to-action column 20260929120000 and the writing guidance
-- 20261005200000, applied first), then the new migration, twice (idempotent).
--
--   'after'     existing rows read author_box = false and an unknown theme
--               test; the other columns are untouched; the owner writes the
--               switch on their own row, another user and anon cannot read or
--               write it; the server (service role) writes the theme test for
--               one project and owner. Then the defaults: a new row is off,
--               NULL is refused.
--   'mutated'   MUTATION CONTROL: the default set to true and NOT NULL
--               dropped; "a new row defaults off" and "NULL is refused" fail.
--   'restored'  the migration applied again over the broken state; both hold.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-author-box.probe.sql
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
\i supabase/migrations/20261016120000_project_author_box.sql

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

-- The guarantees the mutation control breaks: a new row is off, NULL is refused.
CREATE FUNCTION run_defaults(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE broken boolean := (ph = 'mutated'); r text;
BEGIN
  r := try_as('authenticated', '11111111-1111-1111-1111-111111111111', $q$ WITH i AS (INSERT INTO public.project_article_styles (project_id, user_id)
    VALUES ('a3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111') RETURNING author_box) SELECT (author_box IS FALSE)::text FROM i $q$);
  PERFORM chk(ph, 'a new row defaults off -> ' || r, (r = 'ok:true') <> broken);
  r := try_as('authenticated', '11111111-1111-1111-1111-111111111111', $q$ WITH u AS (UPDATE public.project_article_styles SET author_box = NULL
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'NULL is refused -> ' || r, (r = 'denied:23502') <> broken);
END; $$;

DO $$
DECLARE r text;
BEGIN
  PERFORM chk('after', 'existing rows read author_box = false',
    (SELECT bool_and(author_box IS FALSE) FROM public.project_article_styles));
  PERFORM chk('after', 'existing rows read an unknown theme test',
    (SELECT bool_and(theme_author_box IS NULL AND theme_author_box_checked_at IS NULL) FROM public.project_article_styles));
  PERFORM chk('after', 'the design, call-to-action and guidance columns are untouched',
    (SELECT design = 'formatted' AND article_cta ->> 'heading' = 'keep me' AND writing_guidance ->> 'instructions' = 'keep me too'
     FROM public.project_article_styles WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  r := try_as('authenticated', '11111111-1111-1111-1111-111111111111', $q$ WITH u AS (UPDATE public.project_article_styles SET author_box = true
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('after', 'the owner switches it on for their own row -> ' || r, r = 'ok:1');
  r := try_as('authenticated', '22222222-2222-2222-2222-222222222222', $q$ WITH u AS (UPDATE public.project_article_styles SET author_box = true
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('after', 'another user cannot write the owner''s switch -> ' || r, r = 'ok:0');
  r := try_as('authenticated', '22222222-2222-2222-2222-222222222222', $q$ SELECT count(*)::text FROM public.project_article_styles
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk('after', 'another user cannot read it -> ' || r, r = 'ok:0');
  r := try_as('anon', NULL, $q$ WITH u AS (UPDATE public.project_article_styles SET author_box = true RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('after', 'anon cannot write it -> ' || r, r LIKE 'denied:%' OR r = 'ok:0');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.project_article_styles SET theme_author_box = false, theme_author_box_checked_at = now()
    WHERE project_id = 'a2222222-2222-2222-2222-222222222222' AND user_id = '22222222-2222-2222-2222-222222222222' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('after', 'the server caches the theme test for one project and owner -> ' || r, r = 'ok:1');
END $$;
SELECT run_defaults('after');

-- MUTATION CONTROL: the default on and NOT NULL dropped.
ALTER TABLE public.project_article_styles ALTER COLUMN author_box SET DEFAULT true, ALTER COLUMN author_box DROP NOT NULL;
SELECT run_defaults('mutated');

-- Restored: the migration again over the broken state.
\i supabase/migrations/20261016120000_project_author_box.sql
SELECT run_defaults('restored');

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

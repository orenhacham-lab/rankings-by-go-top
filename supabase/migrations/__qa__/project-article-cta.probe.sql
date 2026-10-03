-- ============================================================================
-- EXECUTED PROBE — 20260929120000_project_article_cta.sql
--
-- A disposable PostgreSQL cluster with Supabase's roles and default grants,
-- the article-design table as Production has it (20260928001000, applied
-- first), then the new column's migration, twice (idempotent). Then:
--
--   'after'       existing rows read '{}' (off); the owner writes a complete,
--                 https call to action on their own row; another user and
--                 anon cannot write it; the design columns are untouched.
--   'constraints' every unsafe or incomplete value is refused by the CHECK:
--                 javascript:, data:, http:, a link with a quote or a space,
--                 an unknown key, a heading over 80, "enabled" as a string,
--                 on without a heading / label / link, not an object.
--   'mutated'     MUTATION CONTROL: the CHECK dropped; every refused value
--                 above now gets in (so the constraint checks would fail).
--   'restored'    the migration applied again over the broken state; every
--                 refusal holds again.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-article-cta.probe.sql
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
\i supabase/migrations/20260929120000_project_article_cta.sql

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

-- The owner writes article_cta on their own row; 'ok:1' or 'denied:<state>'.
CREATE FUNCTION set_cta(v jsonb) RETURNS text LANGUAGE sql AS $f$
  SELECT try_as('authenticated', '11111111-1111-1111-1111-111111111111', format(
    $q$ WITH u AS (UPDATE public.project_article_styles SET article_cta = %L::jsonb
        WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$, v::text))
$f$;

CREATE FUNCTION run_constraints(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  broken boolean := (ph = 'mutated');
  bad jsonb;
  label text;
  r text;
BEGIN
  -- Always allowed (regression): off, a draft, a complete https call to action.
  r := set_cta('{}');
  PERFORM chk(ph, 'empty (off) is allowed -> ' || r, r = 'ok:1');
  r := set_cta('{"enabled": false, "heading": "draft", "text": "", "button_label": "", "button_url": ""}');
  PERFORM chk(ph, 'an off draft with no link is allowed -> ' || r, r = 'ok:1');
  r := set_cta('{"enabled": true, "heading": "מתעניינים ביפן?", "text": "נשמח לעזור", "button_label": "צרו קשר", "button_url": "https://japan4u.co.il/contact/"}');
  PERFORM chk(ph, 'a complete https call to action is allowed -> ' || r, r = 'ok:1');

  FOR label, bad IN VALUES
    ('javascript: link', '{"enabled": true, "heading": "h", "button_label": "b", "button_url": "javascript:alert(1)"}'::jsonb),
    ('javascript: link while off', '{"enabled": false, "heading": "h", "button_label": "b", "button_url": "javascript:alert(1)"}'::jsonb),
    ('data: link', '{"enabled": true, "heading": "h", "button_label": "b", "button_url": "data:text/html,x"}'::jsonb),
    ('http: link', '{"enabled": true, "heading": "h", "button_label": "b", "button_url": "http://example.com/"}'::jsonb),
    ('a link with a quote', '{"enabled": true, "heading": "h", "button_label": "b", "button_url": "https://example.com/\" onclick=\"x"}'::jsonb),
    ('a link with a space', '{"enabled": true, "heading": "h", "button_label": "b", "button_url": "https://example.com/a b"}'::jsonb),
    ('an unknown key', '{"enabled": false, "onclick": "x"}'::jsonb),
    ('a heading over 80 characters', jsonb_build_object('enabled', false, 'heading', repeat('א', 81))),
    ('enabled as a string', '{"enabled": "true", "heading": "h", "button_label": "b", "button_url": "https://example.com/"}'::jsonb),
    ('on without a heading', '{"enabled": true, "heading": "", "button_label": "b", "button_url": "https://example.com/"}'::jsonb),
    ('on without a button label', '{"enabled": true, "heading": "h", "button_url": "https://example.com/"}'::jsonb),
    ('on without a link', '{"enabled": true, "heading": "h", "button_label": "b", "button_url": ""}'::jsonb),
    ('not an object', '["x"]'::jsonb),
    ('a heading that is a number', '{"enabled": false, "heading": 5}'::jsonb)
  LOOP
    r := set_cta(bad);
    PERFORM chk(ph, 'refused: ' || label || ' -> ' || r, (r = 'denied:23514') <> broken);
  END LOOP;
END; $$;

-- 'after': the column, its default on existing rows, and who may write it.
DO $$
DECLARE r text;
BEGIN
  PERFORM chk('after', 'existing rows read {} (off)',
    (SELECT bool_and(article_cta = '{}'::jsonb) FROM public.project_article_styles));
  PERFORM chk('after', 'the design columns are untouched',
    (SELECT design FROM public.project_article_styles WHERE project_id = 'a1111111-1111-1111-1111-111111111111') = 'formatted');
  r := try_as('authenticated', '22222222-2222-2222-2222-222222222222', $q$ WITH u AS (UPDATE public.project_article_styles
    SET article_cta = '{"enabled": false}' WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('after', 'another user cannot write the owner''s call to action -> ' || r, r = 'ok:0');
  r := try_as('anon', NULL, $q$ WITH u AS (UPDATE public.project_article_styles
    SET article_cta = '{"enabled": false}' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('after', 'anon cannot write it -> ' || r, r LIKE 'denied:%');
  r := try_as('service_role', NULL, $q$ SELECT count(*)::text FROM public.project_article_styles WHERE article_cta IS NOT NULL $q$);
  PERFORM chk('after', 'the server reads the column -> ' || r, r = 'ok:2');
END $$;

SELECT run_constraints('constraints');

-- MUTATION CONTROL: drop the CHECK; the unsafe values must now get in.
ALTER TABLE public.project_article_styles DROP CONSTRAINT project_article_styles_article_cta;
SELECT run_constraints('mutated');

-- Restored: the migration over the broken state (the row holds a valid value).
UPDATE public.project_article_styles SET article_cta = '{}'::jsonb;
\i supabase/migrations/20260929120000_project_article_cta.sql
SELECT run_constraints('restored');

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','constraints','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

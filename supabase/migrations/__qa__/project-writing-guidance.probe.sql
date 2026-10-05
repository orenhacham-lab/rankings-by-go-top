-- ============================================================================
-- EXECUTED PROBE — 20261005200000_project_writing_guidance.sql
--
-- A disposable PostgreSQL cluster with Supabase's roles and default grants,
-- the article settings table as Production has it (20260928001000 and the
-- call-to-action column 20260929120000, applied first), then the new
-- column's migration, twice (idempotent). Then:
--
--   'after'       existing rows read '{}' (no guidance); the owner writes
--                 guidance on their own row; another user and anon cannot;
--                 the design and call-to-action columns are untouched.
--   'constraints' every malformed value is refused by the CHECK: an unknown
--                 key, instructions over 2000 or not a string, an exclusion
--                 over 120 / empty / a number, 21 exclusions, a rule over
--                 300 / without text / with an unknown key / not an object,
--                 31 rules, not an object.
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
UPDATE public.project_article_styles SET article_cta = '{"enabled": false, "heading": "keep me"}'::jsonb
  WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
\i supabase/migrations/20261005200000_project_writing_guidance.sql
\i supabase/migrations/20261005200000_project_writing_guidance.sql

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

-- The owner writes writing_guidance on their own row; 'ok:1' or 'denied:<state>'.
CREATE FUNCTION set_g(v jsonb) RETURNS text LANGUAGE sql AS $f$
  SELECT try_as('authenticated', '11111111-1111-1111-1111-111111111111', format(
    $q$ WITH u AS (UPDATE public.project_article_styles SET writing_guidance = %L::jsonb
        WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$, v::text))
$f$;

CREATE FUNCTION run_constraints(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  broken boolean := (ph = 'mutated');
  bad jsonb;
  label text;
  r text;
BEGIN
  -- Always allowed (regression): none, a full valid value, the limits exactly.
  r := set_g('{}');
  PERFORM chk(ph, 'empty is allowed -> ' || r, r = 'ok:1');
  r := set_g('{"instructions": "כתבו בגוף ראשון רבים.\nאל תזכירו מחירים.", "exclusions": ["תיקוני צנרת", "משלוחים לאילת"], "rules": [{"text": "האחריות היא שנתיים", "at": "2026-10-05T20:00:00.000Z", "article_id": "b1111111-1111-1111-1111-111111111111"}, {"text": "בלי מחירים", "at": "2026-10-05T20:01:00.000Z", "article_id": null}]}');
  PERFORM chk(ph, 'a full valid value is allowed -> ' || r, r = 'ok:1');
  r := set_g(jsonb_build_object('instructions', repeat('א', 2000), 'exclusions', (SELECT jsonb_agg(repeat('ב', 120)) FROM generate_series(1, 20)),
    'rules', (SELECT jsonb_agg(jsonb_build_object('text', repeat('ג', 300), 'at', '2026-10-05T20:00:00.000Z', 'article_id', NULL)) FROM generate_series(1, 30))));
  PERFORM chk(ph, 'every limit exactly is allowed -> ' || r, r = 'ok:1');

  FOR label, bad IN VALUES
    ('an unknown key', '{"instructions": "x", "script": "x"}'::jsonb),
    ('instructions over 2000', jsonb_build_object('instructions', repeat('א', 2001))),
    ('instructions as a number', '{"instructions": 5}'::jsonb),
    ('an exclusion over 120', jsonb_build_object('exclusions', jsonb_build_array(repeat('ב', 121)))),
    ('an empty exclusion', '{"exclusions": [""]}'::jsonb),
    ('an exclusion that is a number', '{"exclusions": [5]}'::jsonb),
    ('exclusions as a string', '{"exclusions": "x"}'::jsonb),
    ('21 exclusions', jsonb_build_object('exclusions', (SELECT jsonb_agg('x' || g) FROM generate_series(1, 21) g))),
    ('a rule over 300', jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('text', repeat('ג', 301))))),
    ('a rule without text', '{"rules": [{"at": "2026-10-05T20:00:00.000Z"}]}'::jsonb),
    ('a rule whose text is a number', '{"rules": [{"text": 5}]}'::jsonb),
    ('a rule with an unknown key', '{"rules": [{"text": "x", "onclick": "x"}]}'::jsonb),
    ('a rule that is a string', '{"rules": ["x"]}'::jsonb),
    ('31 rules', jsonb_build_object('rules', (SELECT jsonb_agg(jsonb_build_object('text', 'r' || g)) FROM generate_series(1, 31) g))),
    ('not an object', '["x"]'::jsonb)
  LOOP
    r := set_g(bad);
    PERFORM chk(ph, 'refused: ' || label || ' -> ' || r, (r = 'denied:23514') <> broken);
  END LOOP;
END; $$;

-- 'after': the column, its default on existing rows, and who may write it.
DO $$
DECLARE r text;
BEGIN
  PERFORM chk('after', 'existing rows read {} (no guidance)',
    (SELECT bool_and(writing_guidance = '{}'::jsonb) FROM public.project_article_styles));
  PERFORM chk('after', 'the design and call-to-action columns are untouched',
    (SELECT design = 'formatted' AND article_cta ->> 'heading' = 'keep me' FROM public.project_article_styles WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  r := set_g('{"instructions": "own row"}');
  PERFORM chk('after', 'the owner writes their own row -> ' || r, r = 'ok:1');
  r := try_as('authenticated', '22222222-2222-2222-2222-222222222222', $q$ WITH u AS (UPDATE public.project_article_styles
    SET writing_guidance = '{"instructions": "hijack"}' WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('after', 'another user cannot write the owner''s guidance -> ' || r, r = 'ok:0');
  r := try_as('authenticated', '22222222-2222-2222-2222-222222222222', $q$ SELECT count(*)::text FROM public.project_article_styles
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk('after', 'another user cannot read the owner''s guidance -> ' || r, r = 'ok:0');
  r := try_as('anon', NULL, $q$ WITH u AS (UPDATE public.project_article_styles
    SET writing_guidance = '{}' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('after', 'anon cannot write it -> ' || r, r LIKE 'denied:%' OR r = 'ok:0');
  r := try_as('service_role', NULL, $q$ SELECT count(*)::text FROM public.project_article_styles WHERE writing_guidance IS NOT NULL $q$);
  PERFORM chk('after', 'the server reads the column -> ' || r, r = 'ok:2');
END $$;

SELECT run_constraints('constraints');

-- MUTATION CONTROL: drop the CHECK; the malformed values must now get in.
ALTER TABLE public.project_article_styles DROP CONSTRAINT project_article_styles_writing_guidance;
SELECT run_constraints('mutated');

-- Restored: the migration over the broken state (the row holds a valid value).
UPDATE public.project_article_styles SET writing_guidance = '{}'::jsonb;
\i supabase/migrations/20261005200000_project_writing_guidance.sql
SELECT run_constraints('restored');

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','constraints','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

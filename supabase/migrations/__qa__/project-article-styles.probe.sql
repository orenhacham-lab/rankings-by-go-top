-- ============================================================================
-- EXECUTED PROBE — 20260928001000_project_article_styles.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster carrying Supabase's roles, its default grants
-- (including the default privileges every NEW table in public gets) and the
-- projects isolation policy as it stands after the OWASP hardening. Then:
--
--   'after'     the owner reads, creates and edits their own project's row;
--               another user, an admin who is not the owner and anon read and
--               write nothing of it; nobody deletes or truncates from the
--               browser; the server (service_role) reads every row.
--   'mutated'   MUTATION CONTROL. The three owner policies are replaced by
--               permissive ones and Supabase's default grants are put back:
--               every isolation check above must now report the leak.
--   'restored'  the migration file applied again over the broken state, and
--               every isolation check holds again.
--
-- Then the CHECKs (hex colours only, at most six, every choice from its list,
-- 0-4 images), the defaults (today's behaviour), and ON DELETE CASCADE.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-article-styles.probe.sql
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
\i supabase/migrations/20260928001000_project_article_styles.sql

SET ROLE service_role;
INSERT INTO public.project_article_styles (project_id, user_id, brand_colors, design) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '{#e11d48}', 'formatted'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '{#0f766e,#f59e0b}', 'minimal');
RESET ROLE;

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- Run `sql` as `role_name` with auth.uid() = `uid`, inside a subtransaction that
-- is always rolled back. Returns 'ok:<scalar>' or 'denied:<sqlstate>'.
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
  P1 text := 'a1111111-1111-1111-1111-111111111111';
  P2 text := 'a2222222-2222-2222-2222-222222222222';
  P3 text := 'a3333333-3333-3333-3333-333333333333';
  broken boolean := (ph = 'mutated');
  r text;
  ins text := $q$ WITH i AS (INSERT INTO public.project_article_styles (project_id, user_id, design)
      VALUES (%L, %L, 'formatted') RETURNING 1) SELECT count(*)::text FROM i $q$;
  upd text := $q$ WITH u AS (UPDATE public.project_article_styles SET design = 'formatted', inline_images = 2
      WHERE project_id = %L RETURNING 1) SELECT count(*)::text FROM u $q$;
BEGIN
  -- REGRESSION, every phase: the owner uses their own row.
  r := try_as('authenticated', V, format($q$ SELECT count(*)::text FROM public.project_article_styles WHERE project_id = %L $q$, P1));
  PERFORM chk(ph, 'owner reads own row (1) -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, format(ins, P3, V));
  PERFORM chk(ph, 'owner creates the row of their other project -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, format(upd, P1));
  PERFORM chk(ph, 'owner edits own row -> ' || r, r = 'ok:1');

  -- ISOLATION: reads.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.project_article_styles $q$);
  PERFORM chk(ph, 'owner reads the whole table and gets only own rows -> ' || r, (r = 'ok:1') <> broken);
  r := try_as('authenticated', A, format($q$ SELECT count(*)::text FROM public.project_article_styles WHERE project_id = %L $q$, P1));
  PERFORM chk(ph, 'other user reads owner row -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', M, format($q$ SELECT count(*)::text FROM public.project_article_styles WHERE project_id = %L $q$, P1));
  PERFORM chk(ph, 'admin (not the owner) reads owner row: owner-only -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.project_article_styles $q$);
  PERFORM chk(ph, 'anon reads rows -> ' || r, (r = 'denied:42501') <> broken);

  -- ISOLATION: writes.
  r := try_as('authenticated', A, format(upd, P1));
  PERFORM chk(ph, 'other user edits owner row -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', A, format(ins, P3, A));
  PERFORM chk(ph, 'other user plants a row in owner project -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, format(ins, P3, A));
  PERFORM chk(ph, 'owner writes a row stamped with another user -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, format($q$ WITH u AS (UPDATE public.project_article_styles SET user_id = %L
      WHERE project_id = %L RETURNING 1) SELECT count(*)::text FROM u $q$, A, P1));
  PERFORM chk(ph, 'owner hands their row to another user -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, format($q$ WITH d AS (DELETE FROM public.project_article_styles
      WHERE project_id = %L RETURNING 1) SELECT count(*)::text FROM d $q$, P1));
  PERFORM chk(ph, 'owner deletes a row from the browser -> ' || r, (r LIKE 'denied:%') <> broken);
  -- TRUNCATE is not governed by RLS, only by the grant.
  PERFORM chk(ph, 'no browser role holds TRUNCATE',
    (NOT has_table_privilege('authenticated', 'public.project_article_styles', 'TRUNCATE')
     AND NOT has_table_privilege('anon', 'public.project_article_styles', 'TRUNCATE')) <> broken);
  r := try_as('anon', NULL, format(ins, P3, V));
  PERFORM chk(ph, 'anon inserts a row -> ' || r, (r LIKE 'denied:%') <> broken);

  -- REGRESSION, every phase: the server reads every row.
  r := try_as('service_role', NULL, $q$ SELECT count(*)::text FROM public.project_article_styles $q$);
  PERFORM chk(ph, 'service_role reads every row (2) -> ' || r, r = 'ok:2');
  PERFORM chk(ph, 'RLS is enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.project_article_styles'::regclass));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: permissive policies and Supabase's default grants back.
DROP POLICY project_article_styles_select ON public.project_article_styles;
CREATE POLICY project_article_styles_select ON public.project_article_styles FOR ALL USING (true) WITH CHECK (true);
DROP POLICY project_article_styles_insert ON public.project_article_styles;
DROP POLICY project_article_styles_update ON public.project_article_styles;
GRANT ALL ON TABLE public.project_article_styles TO anon, authenticated;
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the broken state, repairs it.
\i supabase/migrations/20260928001000_project_article_styles.sql
SELECT run_checks('restored');

-- Constraints (as service_role).
DO $$
DECLARE r text;
  base text := $q$ INSERT INTO public.project_article_styles (project_id, user_id, brand_colors, design, image_style, hero_ratio, inline_images)
    VALUES ('a3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', %s, %L, %L, %L, %s) RETURNING 'inserted' $q$;
BEGIN
  r := try_as('service_role', NULL, format(base, $v$'{red}'$v$, 'formatted', 'realistic', '16:9', 0));
  PERFORM chk('constraints', 'a colour name is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, $v$'{"#E11D48"}'$v$, 'formatted', 'realistic', '16:9', 0));
  PERFORM chk('constraints', 'an upper-case hex is rejected (the app stores lower case) -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, $v$'{"#e11d48;background:url(x)"}'$v$, 'formatted', 'realistic', '16:9', 0));
  PERFORM chk('constraints', 'a colour carrying CSS is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, $v$ARRAY['#e11d48', NULL]$v$, 'formatted', 'realistic', '16:9', 0));
  PERFORM chk('constraints', 'a NULL colour is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, $v$'{#000001,#000002,#000003,#000004,#000005,#000006,#000007}'$v$, 'formatted', 'realistic', '16:9', 0));
  PERFORM chk('constraints', 'a seventh colour is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, $v$'{}'$v$, 'fancy', 'realistic', '16:9', 0));
  PERFORM chk('constraints', 'an unknown design is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, $v$'{}'$v$, 'formatted', 'anime', '16:9', 0));
  PERFORM chk('constraints', 'an unknown image style is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, $v$'{}'$v$, 'formatted', 'realistic', '4:3', 0));
  PERFORM chk('constraints', 'an unknown hero ratio is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, $v$'{}'$v$, 'formatted', 'realistic', '16:9', 5));
  PERFORM chk('constraints', 'five inline images are rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, $v$'{}'$v$, 'formatted', 'realistic', '16:9', -1));
  PERFORM chk('constraints', 'a negative image count is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, $v$'{#e11d48,#0f766e}'$v$, 'formatted', 'watercolor', '1:1', 4));
  PERFORM chk('constraints', 'a well-formed row is stored -> ' || r, r = 'ok:inserted');
END $$;

-- Official profiles: known networks, https URLs only.
DO $$
DECLARE r text;
  base text := $q$ INSERT INTO public.project_article_styles (project_id, user_id, official_profiles)
    VALUES ('a3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', %L::jsonb) RETURNING 'inserted' $q$;
BEGIN
  r := try_as('service_role', NULL, format(base, '{"facebook":"https://www.facebook.com/acme","wikidata":"https://www.wikidata.org/wiki/Q42"}'));
  PERFORM chk('constraints', 'valid profiles are stored -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, format(base, '{"facebook":"http://www.facebook.com/acme"}'));
  PERFORM chk('constraints', 'an http profile is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '{"facebook":"javascript:alert(1)"}'));
  PERFORM chk('constraints', 'a javascript: profile is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '{"myspace":"https://myspace.com/acme"}'));
  PERFORM chk('constraints', 'an unknown network is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '{"x":42}'));
  PERFORM chk('constraints', 'a non-string profile is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '["https://x.com/acme"]'));
  PERFORM chk('constraints', 'profiles that are not an object are rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, '{"x":"https://x.com/' || repeat('a', 300) || '"}'));
  PERFORM chk('constraints', 'a profile URL over 300 characters is rejected -> ' || r, r = 'denied:23514');
END $$;

-- Defaults: a row with nothing chosen is today's behaviour.
DO $$
DECLARE r text;
BEGIN
  r := try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.project_article_styles (project_id, user_id)
    VALUES ('a3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111')
    RETURNING design || '|' || image_style || '|' || hero_ratio || '|' || inline_images || '|' || own_images_only || '|' || cardinality(brand_colors) || '|' || official_profiles::text)
    SELECT * FROM i $q$);
  PERFORM chk('defaults', 'defaults are minimal, realistic, 16:9, no inline images, AI images on, no colours, no profiles -> ' || r,
    r = 'ok:minimal|realistic|16:9|0|false|0|{}');
END $$;

-- updated_at moves on update.
DO $$
DECLARE before timestamptz; after timestamptz;
BEGIN
  UPDATE public.project_article_styles SET updated_at = '2020-01-01' WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
  SELECT updated_at INTO before FROM public.project_article_styles WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
  UPDATE public.project_article_styles SET design = 'minimal' WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
  SELECT updated_at INTO after FROM public.project_article_styles WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
  PERFORM chk('defaults', 'the updated_at trigger moves the timestamp', after > '2020-01-02'::timestamptz);
END $$;

-- Cascade (destructive, so last).
DO $$
DECLARE err text;
BEGIN
  BEGIN
    DELETE FROM public.projects WHERE id = 'a1111111-1111-1111-1111-111111111111';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE;
  END;
  PERFORM chk('cascade', 'deleting a project deletes its row' || coalesce(' -> blocked: ' || err, ''),
    err IS NULL AND NOT EXISTS (SELECT 1 FROM public.project_article_styles WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  PERFORM chk('cascade', 'other projects keep theirs',
    (SELECT count(*) FROM public.project_article_styles WHERE project_id = 'a2222222-2222-2222-2222-222222222222') = 1);
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints','defaults','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

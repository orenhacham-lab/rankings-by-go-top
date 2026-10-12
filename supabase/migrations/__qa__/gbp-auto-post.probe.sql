-- ============================================================================
-- EXECUTED PROBE — 20261012170000_gbp_auto_post.sql
--
-- Applies the base GBP migration and then this one (twice, for idempotency) to a
-- disposable PostgreSQL cluster carrying Supabase's roles and the projects
-- isolation policy. Then:
--
--   'defaults'  the switch and both post flags default to OFF, and every row that
--               existed BEFORE the migration still reads false — applying this
--               file turns automatic posting on for nobody.
--   'dedupe'    one automatic post per article, enforced by the index: a second
--               auto row for the same article is refused, while hand-written
--               posts about that same article are still allowed, any number.
--               MUTATION CONTROL: with the index dropped the duplicate goes in.
--   'access'    the owner READS the switch and the flags; another user and anon
--               read nothing; no browser role may turn the switch on.
--               MUTATION CONTROL: with a permissive policy and the default
--               grants back, the browser write succeeds — so the check is real.
--   'restored'  the migration applied again over the broken state: the index is
--               back, the browser write is refused again, and a value
--               service_role committed before is still there (nothing is reset).
--
-- NOT run against Supabase or Production; every row is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/gbp-auto-post.probe.sql
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

-- Fixture: owner V, other user A.
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project');
INSERT INTO public.generated_articles (id, user_id, project_id, title) VALUES
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'article one'),
  ('c2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'article two');

\i supabase/migrations/20260929020000_gbp_local_posts.sql

-- Rows that exist BEFORE the new columns, so the probe can prove they stay OFF.
SET ROLE service_role;
INSERT INTO public.gbp_connections (id, user_id, encrypted_refresh_token, granted_scope) VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'v1:aa:bb:cc', 'https://www.googleapis.com/auth/business.manage'),
  ('d2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'v1:0f:1e:2d', 'https://www.googleapis.com/auth/business.manage');
INSERT INTO public.project_gbp_locations (project_id, user_id, connection_id, account_name, location_name, location_title) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'accounts/100', 'locations/200', 'המאפייה של דנה'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', 'accounts/300', 'locations/400', 'Other shop');
INSERT INTO public.gbp_posts (id, project_id, user_id, source_article_id, summary, status) VALUES
  ('e1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'c1111111-1111-1111-1111-111111111111', 'פוסט שהעסק כתב בעצמו', 'scheduled'),
  -- No source article, so the dedupe index does not cover it and RLS is the only
  -- thing standing between a browser and the automatic flag.
  ('e8888888-8888-8888-8888-888888888888', 'a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   NULL, 'פוסט חופשי', 'scheduled');
RESET ROLE;

\i supabase/migrations/20261012170000_gbp_auto_post.sql
\i supabase/migrations/20261012170000_gbp_auto_post.sql

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

-- ── defaults ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM chk('defaults', 'the location row that existed before the migration still has the switch OFF',
    (SELECT auto_post_on_publish = false FROM public.project_gbp_locations
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  PERFORM chk('defaults', 'every location in the table has the switch OFF',
    NOT EXISTS (SELECT 1 FROM public.project_gbp_locations WHERE auto_post_on_publish));
  PERFORM chk('defaults', 'the post that existed before the migration is not marked automatic',
    (SELECT auto_created = false AND needs_ai_draft = false FROM public.gbp_posts
      WHERE id = 'e1111111-1111-1111-1111-111111111111'));
  PERFORM chk('defaults', 'no location has an approval time yet',
    NOT EXISTS (SELECT 1 FROM public.project_gbp_locations WHERE auto_post_enabled_at IS NOT NULL));
  PERFORM chk('defaults', 'all three new boolean columns are NOT NULL with a false default',
    (SELECT count(*) = 3 FROM information_schema.columns
      WHERE table_schema = 'public' AND is_nullable = 'NO' AND column_default = 'false'
        AND ((table_name = 'project_gbp_locations' AND column_name = 'auto_post_on_publish')
          OR (table_name = 'gbp_posts' AND column_name IN ('auto_created', 'needs_ai_draft')))));
END $$;

-- ── the approval time ───────────────────────────────────────────────────────
DO $$
DECLARE r text;
BEGIN
  SET ROLE service_role;
  -- An approval time only ever sits on a switch that is ON.
  BEGIN
    UPDATE public.project_gbp_locations SET auto_post_enabled_at = now()
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
    r := 'accepted';
  EXCEPTION WHEN OTHERS THEN r := 'denied:' || SQLSTATE;
  END;
  PERFORM chk('defaults', 'an approval time on a switch that is OFF is refused -> ' || r, r = 'denied:23514');

  BEGIN
    UPDATE public.project_gbp_locations SET auto_post_on_publish = true, auto_post_enabled_at = now()
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
    r := 'accepted';
  EXCEPTION WHEN OTHERS THEN r := 'denied:' || SQLSTATE;
  END;
  PERFORM chk('defaults', 'turning the switch on WITH an approval time is accepted -> ' || r, r = 'accepted');

  BEGIN
    UPDATE public.project_gbp_locations SET auto_post_on_publish = false, auto_post_enabled_at = NULL
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
    r := 'accepted';
  EXCEPTION WHEN OTHERS THEN r := 'denied:' || SQLSTATE;
  END;
  PERFORM chk('defaults', 'turning it off and clearing the time together is accepted -> ' || r, r = 'accepted');

  BEGIN
    UPDATE public.project_gbp_locations SET auto_post_on_publish = true WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
    UPDATE public.project_gbp_locations SET auto_post_on_publish = false
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
    r := 'accepted';
  EXCEPTION WHEN OTHERS THEN r := 'denied:' || SQLSTATE;
  END;
  PERFORM chk('defaults', 'the switch alone still toggles freely while the time stays NULL -> ' || r, r = 'accepted');
  UPDATE public.project_gbp_locations SET auto_post_on_publish = false, auto_post_enabled_at = NULL
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
  RESET ROLE;
END $$;

-- MUTATION CONTROL for that constraint: without it the contradictory row goes in.
DO $$
DECLARE planted boolean := false;
BEGIN
  BEGIN
    ALTER TABLE public.project_gbp_locations DROP CONSTRAINT project_gbp_locations_auto_post_enabled_at;
    SET ROLE service_role;
    UPDATE public.project_gbp_locations SET auto_post_enabled_at = now()
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
    planted := EXISTS (SELECT 1 FROM public.project_gbp_locations
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111'
        AND auto_post_on_publish = false AND auto_post_enabled_at IS NOT NULL);
    RESET ROLE;
    RAISE EXCEPTION 'undo_mutation';
  EXCEPTION WHEN raise_exception THEN RESET ROLE;
  END;
  PERFORM chk('defaults', 'MUTATION CONTROL: without the constraint an approval time sits on a switch that is off', planted);
END $$;

-- ── dedupe ──────────────────────────────────────────────────────────────────
CREATE FUNCTION ins_auto(post_id uuid, article uuid, auto boolean) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    INSERT INTO public.gbp_posts (id, project_id, user_id, source_article_id, summary, auto_created, needs_ai_draft)
      VALUES (post_id, 'a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
              article, 'אוטומטי', auto, auto);
    RETURN 'inserted';
  EXCEPTION WHEN OTHERS THEN RETURN 'denied:' || SQLSTATE;
  END;
END; $$;

DO $$
DECLARE r text; dup boolean;
BEGIN
  SET ROLE service_role;
  PERFORM chk('dedupe', 'the first automatic post for an article goes in',
    ins_auto('e2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', true) = 'inserted');
  r := ins_auto('e3333333-3333-3333-3333-333333333333', 'c1111111-1111-1111-1111-111111111111', true);
  PERFORM chk('dedupe', 'a SECOND automatic post for the same article is refused -> ' || r, r LIKE 'denied:23505');
  PERFORM chk('dedupe', 'an automatic post for a DIFFERENT article still goes in',
    ins_auto('e4444444-4444-4444-4444-444444444444', 'c2222222-2222-2222-2222-222222222222', true) = 'inserted');
  PERFORM chk('dedupe', 'a hand-written post about an article that already has an automatic one is allowed',
    ins_auto('e5555555-5555-5555-5555-555555555555', 'c1111111-1111-1111-1111-111111111111', false) = 'inserted');
  PERFORM chk('dedupe', 'a second hand-written post about that same article is allowed too',
    ins_auto('e6666666-6666-6666-6666-666666666666', 'c1111111-1111-1111-1111-111111111111', false) = 'inserted');
  RESET ROLE;

  -- MUTATION CONTROL: without the index the duplicate is accepted.
  BEGIN
    -- The index belongs to the table owner, so the drop runs as the probe's own
    -- role; only the insert takes service_role.
    DROP INDEX public.uq_gbp_posts_auto_article;
    SET ROLE service_role;
    dup := ins_auto('e7777777-7777-7777-7777-777777777777', 'c1111111-1111-1111-1111-111111111111', true) = 'inserted';
    RESET ROLE;
    RAISE EXCEPTION 'undo_mutation';   -- rolls the drop and the insert back
  EXCEPTION WHEN raise_exception THEN RESET ROLE;
  END;
  PERFORM chk('dedupe', 'MUTATION CONTROL: with the index dropped the duplicate automatic post is accepted', dup);
END $$;

-- ── access + restored ───────────────────────────────────────────────────────
CREATE FUNCTION run_access(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  V text := '11111111-1111-1111-1111-111111111111';
  A text := '22222222-2222-2222-2222-222222222222';
  broken boolean := (ph = 'mutated');
  r text;
  turn_on text := $q$ WITH u AS (UPDATE public.project_gbp_locations SET auto_post_on_publish = true
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$;
  mark_auto text := $q$ WITH u AS (UPDATE public.gbp_posts SET auto_created = true
      WHERE id = 'e8888888-8888-8888-8888-888888888888' RETURNING 1) SELECT count(*)::text FROM u $q$;
  -- This article already has an automatic post, so the index refuses the write on
  -- its own — in EVERY phase, even the one where RLS is wide open.
  mark_auto_dup text := $q$ WITH u AS (UPDATE public.gbp_posts SET auto_created = true
      WHERE id = 'e5555555-5555-5555-5555-555555555555' RETURNING 1) SELECT count(*)::text FROM u $q$;
BEGIN
  -- REGRESSION, every phase: the owner can READ their own switch and flags.
  r := try_as('authenticated', V, $q$ SELECT auto_post_on_publish::text FROM public.project_gbp_locations
        WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads their own switch -> ' || r, r LIKE 'ok:%');
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.gbp_posts
        WHERE project_id = 'a1111111-1111-1111-1111-111111111111' AND auto_created $q$);
  PERFORM chk(ph, 'owner reads which of their posts are automatic -> ' || r, r LIKE 'ok:%');

  -- ISOLATION: another user's switch, and anon, read nothing.
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.project_gbp_locations
        WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'another user reads the owner''s switch -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.project_gbp_locations $q$);
  PERFORM chk(ph, 'anon reads any switch -> ' || r, (r = 'ok:0' OR r LIKE 'denied:%') <> broken);

  -- ISOLATION: NO browser role turns automatic posting on. Only server code does.
  r := try_as('authenticated', V, turn_on);
  PERFORM chk(ph, 'owner turns their OWN switch on straight from the browser -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', A, turn_on);
  PERFORM chk(ph, 'another user turns the owner''s switch on -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, turn_on);
  PERFORM chk(ph, 'anon turns a switch on -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, mark_auto);
  PERFORM chk(ph, 'owner marks one of their posts as automatic -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, mark_auto_dup);
  -- Refused in every phase. Where RLS is wide open the refusal must come from the
  -- index itself (23505, unique violation), not from permissions.
  PERFORM chk(ph, 'a second automatic post for one article is refused, and with RLS wide open it is the index that refuses -> ' || r,
    r LIKE 'denied:%' AND (NOT broken OR r = 'denied:23505'));
END $$;

DO $$ BEGIN PERFORM run_access('access'); END $$;

-- MUTATION CONTROL: Supabase's default grants AND a permissive policy back, so a
-- browser write really can get through. Grants alone are not enough: the table
-- has no UPDATE policy, so RLS would still refuse (the lesson from the reviews probe).
DO $$
BEGIN
  GRANT ALL ON public.project_gbp_locations, public.gbp_posts TO anon, authenticated;
  CREATE POLICY probe_loc_all ON public.project_gbp_locations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  CREATE POLICY probe_posts_all ON public.gbp_posts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  PERFORM run_access('mutated');
END $$;

-- A value service_role really committed, to prove re-applying the file resets nothing.
SET ROLE service_role;
UPDATE public.project_gbp_locations SET auto_post_on_publish = true WHERE project_id = 'a2222222-2222-2222-2222-222222222222';
RESET ROLE;

DO $$
BEGIN
  DROP POLICY probe_loc_all ON public.project_gbp_locations;
  DROP POLICY probe_posts_all ON public.gbp_posts;
  REVOKE ALL ON public.project_gbp_locations, public.gbp_posts FROM anon, authenticated;
  GRANT SELECT ON public.project_gbp_locations, public.gbp_posts TO authenticated;
END $$;

\i supabase/migrations/20261012170000_gbp_auto_post.sql

DO $$
DECLARE r text;
BEGIN
  PERFORM run_access('restored');
  PERFORM chk('restored', 'the unique index is back',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_gbp_posts_auto_article'));
  PERFORM chk('restored', 're-applying the migration kept the switch service_role turned on',
    (SELECT auto_post_on_publish FROM public.project_gbp_locations WHERE project_id = 'a2222222-2222-2222-2222-222222222222'));
  PERFORM chk('restored', 're-applying the migration did not turn the other switch on',
    (SELECT auto_post_on_publish = false FROM public.project_gbp_locations WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  PERFORM chk('restored', 'the approval-time constraint is back',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_gbp_locations_auto_post_enabled_at'));
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['defaults','dedupe','access','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

-- ============================================================================
-- EXECUTED PROBE — 20261012120000_gbp_review_alerts.sql
--
-- Applies the base GBP migration and then the review-alert migration (twice,
-- for idempotency) to a disposable PostgreSQL cluster carrying Supabase's
-- roles, its default grants (every NEW table in public gets ALL for
-- anon/authenticated) and the projects isolation policy. Then:
--
--   'shape'     both columns exist, are timestamptz, are nullable, start NULL
--               on a row written before the migration, and carry their comment.
--   'isolation' the owner reads their own row including the new columns; another
--               user and anon read nothing; no browser role writes them;
--               service_role writes them.
--   'mutated'   MUTATION CONTROL: Supabase's default grants put back. Every
--               isolation check must now report the leak.
--   'restored'  the migration applied again over the broken state (it must NOT
--               repair the grants by itself — the base migration does), and the
--               columns and their values survived the re-apply unchanged.
--   'content'   the table holds NO review text column: nothing in it could
--               store a reviewer's name, a rating or a review comment.
--
-- NOT run against Supabase or Production; every row is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/gbp-review-alerts.probe.sql
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

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project');

\i supabase/migrations/20260929020000_gbp_local_posts.sql

-- A location row written BEFORE the new columns exist, so the probe proves the
-- migration leaves existing rows readable with NULL marks.
SET ROLE service_role;
INSERT INTO public.gbp_connections (id, user_id, encrypted_refresh_token, granted_scope) VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'v1:aa:bb:cc', 'https://www.googleapis.com/auth/business.manage'),
  ('d2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'v1:0f:1e:2d', 'https://www.googleapis.com/auth/business.manage');
INSERT INTO public.project_gbp_locations (project_id, user_id, connection_id, account_name, location_name, location_title) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'accounts/100', 'locations/200', 'המאפייה של דנה'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', 'accounts/300', 'locations/400', 'Other shop');
RESET ROLE;

\i supabase/migrations/20261012120000_gbp_review_alerts.sql
\i supabase/migrations/20261012120000_gbp_review_alerts.sql

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

-- ── shape ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  OWNER_ID constant text := '11111111-1111-1111-1111-111111111111';
  OTHER_ID constant text := '22222222-2222-2222-2222-222222222222';
  P1 constant text := 'a1111111-1111-1111-1111-111111111111';
BEGIN
  PERFORM chk('shape', 'both columns exist as nullable timestamptz', (
    SELECT count(*) = 2 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'project_gbp_locations'
       AND column_name IN ('reviews_seen_update_time', 'reviews_alerted_at')
       AND data_type = 'timestamp with time zone' AND is_nullable = 'YES'));

  PERFORM chk('shape', 'a row written before the migration reads NULL for both marks', (
    SELECT reviews_seen_update_time IS NULL AND reviews_alerted_at IS NULL
      FROM public.project_gbp_locations WHERE project_id = P1::uuid));

  PERFORM chk('shape', 'both columns carry a comment that says no review content is stored', (
    SELECT count(*) = 2 FROM pg_description d
      JOIN pg_class c ON c.oid = d.objoid
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.objsubid
     WHERE c.relname = 'project_gbp_locations'
       AND a.attname IN ('reviews_seen_update_time', 'reviews_alerted_at')
       AND d.description IS NOT NULL AND length(d.description) > 10));

  -- ── content: the table cannot hold a review ───────────────────────────────
  PERFORM chk('content', 'no column on the table could store review text, a reviewer or a rating', (
    SELECT count(*) = 0 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'project_gbp_locations'
       AND (column_name ~ 'review' AND column_name NOT IN ('reviews_seen_update_time', 'reviews_alerted_at'))));
  PERFORM chk('content', 'the two review columns are timestamps, so no text can be written to them', (
    SELECT bool_and(data_type = 'timestamp with time zone') FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'project_gbp_locations'
       AND column_name LIKE 'reviews%'));

  -- ── isolation ─────────────────────────────────────────────────────────────
  PERFORM chk('isolation', 'the owner reads their own row with the new columns',
    try_as('authenticated', OWNER_ID,
      'SELECT count(*)::text FROM public.project_gbp_locations WHERE reviews_alerted_at IS NULL') = 'ok:1');
  PERFORM chk('isolation', 'another user reads none of the owner''s rows',
    try_as('authenticated', OTHER_ID,
      format('SELECT count(*)::text FROM public.project_gbp_locations WHERE project_id = %L', P1)) = 'ok:0');
  PERFORM chk('isolation', 'anon reads nothing',
    try_as('anon', NULL, 'SELECT count(*)::text FROM public.project_gbp_locations') IN ('ok:0', 'denied:42501'));
  PERFORM chk('isolation', 'the owner cannot write the alert marks',
    try_as('authenticated', OWNER_ID,
      format('UPDATE public.project_gbp_locations SET reviews_alerted_at = now() WHERE project_id = %L RETURNING ''w''', P1))
      LIKE 'denied:%');
  PERFORM chk('isolation', 'anon cannot write the alert marks',
    try_as('anon', NULL,
      format('UPDATE public.project_gbp_locations SET reviews_seen_update_time = now() WHERE project_id = %L RETURNING ''w''', P1))
      LIKE 'denied:%');
  PERFORM chk('isolation', 'service_role writes both marks',
    try_as('service_role', NULL,
      format('UPDATE public.project_gbp_locations SET reviews_seen_update_time = now(), reviews_alerted_at = now() WHERE project_id = %L RETURNING ''w''', P1))
      = 'ok:w');
END $$;

-- A real write by service_role, so the 'restored' phase can prove a re-apply
-- keeps it (every try_as call rolls its statement back by design).
SET ROLE service_role;
UPDATE public.project_gbp_locations
   SET reviews_seen_update_time = '2026-10-11T06:00:00Z', reviews_alerted_at = '2026-10-11T07:00:00Z'
 WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
RESET ROLE;

-- ── mutated: the browser roles given write access ───────────────────────────
-- Both halves are needed, which is itself the finding: Supabase's default
-- grants alone are not enough while the table has no UPDATE policy, so the
-- control puts back the grant AND a permissive policy.
GRANT ALL ON TABLE public.project_gbp_locations TO anon, authenticated;
CREATE POLICY gbp_locations_mutation_control ON public.project_gbp_locations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DO $$
DECLARE
  OWNER_ID constant text := '11111111-1111-1111-1111-111111111111';
  P1 constant text := 'a1111111-1111-1111-1111-111111111111';
BEGIN
  PERFORM chk('mutated', 'MUTATION CONTROL: with the grant and a permissive policy back the owner can write the alert marks',
    try_as('authenticated', OWNER_ID,
      format('UPDATE public.project_gbp_locations SET reviews_alerted_at = now() WHERE project_id = %L RETURNING ''w''', P1))
      = 'ok:w');
END $$;

-- ── restored ───────────────────────────────────────────────────────────────
DROP POLICY gbp_locations_mutation_control ON public.project_gbp_locations;
\i supabase/migrations/20260929020000_gbp_local_posts.sql
\i supabase/migrations/20261012120000_gbp_review_alerts.sql
DO $$
DECLARE
  OWNER_ID constant text := '11111111-1111-1111-1111-111111111111';
  P1 constant text := 'a1111111-1111-1111-1111-111111111111';
BEGIN
  PERFORM chk('restored', 'the owner cannot write the alert marks again',
    try_as('authenticated', OWNER_ID,
      format('UPDATE public.project_gbp_locations SET reviews_alerted_at = now() WHERE project_id = %L RETURNING ''w''', P1))
      LIKE 'denied:%');
  PERFORM chk('restored', 'the owner still reads their own row',
    try_as('authenticated', OWNER_ID,
      format('SELECT count(*)::text FROM public.project_gbp_locations WHERE project_id = %L', P1)) = 'ok:1');
  PERFORM chk('restored', 're-applying the migration kept the value service_role wrote', (
    SELECT reviews_seen_update_time = '2026-10-11T06:00:00Z'::timestamptz
      FROM public.project_gbp_locations WHERE project_id = P1::uuid));
  PERFORM chk('restored', 'the location row itself is unchanged', (
    SELECT location_title = 'המאפייה של דנה' FROM public.project_gbp_locations WHERE project_id = P1::uuid));
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['shape','content','isolation','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

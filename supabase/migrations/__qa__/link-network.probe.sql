-- ============================================================================
-- EXECUTED PROBE — 20260929010000_link_network.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster that carries Supabase's roles, its default
-- grants (including the default privileges every NEW table in public gets) and
-- the projects isolation policy as it stands after the OWASP hardening. Then:
--
--   'after'     the owner reads their own membership; a placement is read
--               directly by the owner of the GIVING side only, and never its
--               account-id columns; the receiving side reads nothing of the row
--               (not source_user_id, source_article_id or source_domain: the
--               route shows it what it may see); nobody else reads it (another
--               user, an admin who owns neither side, anon); no browser role writes;
--               service_role writes; the settings row is invisible to browsers.
--               The hard rules hold: never reciprocal, never self, never the
--               same owner, one placed link per article.
--   'mutated'   MUTATION CONTROL. The policies are made permissive, Supabase's
--               default grants are put back and the reciprocity trigger is
--               dropped: every isolation and reciprocity check must now report
--               the leak. A check that cannot fail tests nothing.
--   'restored'  the migration file is applied again over the broken state and
--               every check holds again.
--
-- Then constraints, defaults and cascades.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/link-network.probe.sql
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
CREATE TABLE public.generated_articles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE, title text NOT NULL DEFAULT 't');

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

-- Fixture: owner V (projects PV, PV2), other member W (PW), third member X (PX),
-- bystander U (PU), admin M. Articles: AV1, AV2 (PV), AW1 (PW), AX1 (PX).
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('44444444-4444-4444-4444-444444444444', 'user'),
  ('55555555-5555-5555-5555-555555555555', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'PV'),
  ('a1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'PV2'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'PW'),
  ('a4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'PX'),
  ('a5555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 'PU');
INSERT INTO public.generated_articles (id, user_id, project_id) VALUES
  ('e1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111'),
  ('e1111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111'),
  ('e2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222'),
  ('e4444444-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'a4444444-4444-4444-4444-444444444444');

\i supabase/migrations/20260929010000_link_network.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20260929010000_link_network.sql

-- The rows are written the way the app writes them: as service_role.
SET ROLE service_role;
INSERT INTO public.link_network_members (project_id, user_id, active, consent_version, consented_by, consent_link_rel) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', true, 'v1', '11111111-1111-1111-1111-111111111111', 'nofollow'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', true, 'v1', '22222222-2222-2222-2222-222222222222', 'nofollow'),
  ('a4444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', true, 'v1', '44444444-4444-4444-4444-444444444444', 'nofollow');
-- V gave W one link (from AV1).
INSERT INTO public.link_network_placements (id, source_project_id, source_user_id, source_article_id, source_domain,
    target_project_id, target_user_id, target_url, anchor_text, link_rel, anchor_kind, relevance) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'e1111111-0000-0000-0000-000000000001', 'v-site.co.il',
   'a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'https://w-site.co.il/page', 'עיצוב פנים לדירה', 'follow', 'partial', 82);
RESET ROLE;

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- Run `sql` as `role_name` with auth.uid() = `uid`, inside a subtransaction that
-- is always rolled back, so no check changes the fixture for the next one.
-- Returns 'ok:<scalar>' or 'denied:<sqlstate>'.
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

-- A placement insert as a query that returns the inserted count.
CREATE FUNCTION ins_placement(src text, src_user text, art text, tgt text, tgt_user text) RETURNS text LANGUAGE sql AS $f$
  SELECT format($q$ WITH i AS (INSERT INTO public.link_network_placements
      (source_project_id, source_user_id, source_article_id, source_domain, target_project_id, target_user_id, target_url, anchor_text, link_rel, anchor_kind, relevance)
      VALUES (%L, %L, %L, 'src.co.il', %L, %L, 'https://t.co.il/p', 'מילים טבעיות', 'follow', 'natural', 80) RETURNING 1) SELECT count(*)::text FROM i $q$,
    src, src_user, art, tgt, tgt_user)
$f$;
GRANT EXECUTE ON FUNCTION ins_placement(text, text, text, text, text) TO PUBLIC;

CREATE FUNCTION run_checks(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  V text := '11111111-1111-1111-1111-111111111111';
  W text := '22222222-2222-2222-2222-222222222222';
  X text := '44444444-4444-4444-4444-444444444444';
  U text := '55555555-5555-5555-5555-555555555555';
  M text := '33333333-3333-3333-3333-333333333333';
  PV text := 'a1111111-1111-1111-1111-111111111111';
  PV2 text := 'a1111111-1111-1111-1111-222222222222';
  PW text := 'a2222222-2222-2222-2222-222222222222';
  PX text := 'a4444444-4444-4444-4444-444444444444';
  AV2 text := 'e1111111-0000-0000-0000-000000000002';
  AW1 text := 'e2222222-0000-0000-0000-000000000001';
  AX1 text := 'e4444444-0000-0000-0000-000000000001';
  broken boolean := (ph = 'mutated');
  r text;
  join_sql text := format($q$ WITH i AS (INSERT INTO public.link_network_members (project_id, user_id, active, consent_version, consented_by, consent_link_rel)
      VALUES ('a5555555-5555-5555-5555-555555555555', %L, true, 'v1', %L, 'nofollow') RETURNING 1) SELECT count(*)::text FROM i $q$,
      '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555');
  flip_sql text := $q$ WITH u AS (UPDATE public.link_network_members SET active = false
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$;
  reject_sql text := $q$ WITH u AS (UPDATE public.link_network_placements SET status = 'rejected', rejected_at = now()
      WHERE id = 'f0000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*)::text FROM u $q$;
BEGIN
  -- REGRESSION, every phase: each side reads its own rows.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.link_network_members WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own membership (1) -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.link_network_placements WHERE source_project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'giving side reads the placement it gave (1) -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, $q$ SELECT source_article_id::text FROM public.link_network_placements WHERE id = 'f0000000-0000-0000-0000-000000000001' $q$);
  PERFORM chk(ph, 'giving side reads its own row''s article id -> ' || r, r = 'ok:e1111111-0000-0000-0000-000000000001');

  -- ISOLATION: the receiving side learns nothing about the giver from the table.
  r := try_as('authenticated', W, $q$ SELECT count(*)::text FROM public.link_network_placements WHERE target_project_id = 'a2222222-2222-2222-2222-222222222222' $q$);
  PERFORM chk(ph, 'receiving side reads no placement row directly (0) -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', W, $q$ SELECT source_user_id::text FROM public.link_network_placements WHERE target_project_id = 'a2222222-2222-2222-2222-222222222222' LIMIT 1 $q$);
  PERFORM chk(ph, 'receiving side cannot select source_user_id -> ' || r, (r IS DISTINCT FROM 'ok:11111111-1111-1111-1111-111111111111') <> broken);
  r := try_as('authenticated', W, $q$ SELECT source_article_id::text FROM public.link_network_placements WHERE target_project_id = 'a2222222-2222-2222-2222-222222222222' LIMIT 1 $q$);
  PERFORM chk(ph, 'receiving side cannot select source_article_id -> ' || r, (r IS DISTINCT FROM 'ok:e1111111-0000-0000-0000-000000000001') <> broken);
  r := try_as('authenticated', W, $q$ SELECT source_domain FROM public.link_network_placements WHERE target_project_id = 'a2222222-2222-2222-2222-222222222222' LIMIT 1 $q$);
  PERFORM chk(ph, 'receiving side cannot learn the giving site of a draft (source_domain) -> ' || r, (r IS DISTINCT FROM 'ok:v-site.co.il') <> broken);
  r := try_as('authenticated', W, $q$ SELECT source_user_id::text FROM public.link_network_placements LIMIT 1 $q$);
  PERFORM chk(ph, 'the account-id column is not granted to browser roles at all -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('authenticated', V, $q$ SELECT target_user_id::text FROM public.link_network_placements WHERE id = 'f0000000-0000-0000-0000-000000000001' $q$);
  PERFORM chk(ph, 'giving side cannot select the receiver''s account id (target_user_id) -> ' || r, (r = 'denied:42501') <> broken);

  -- ISOLATION: reads.
  r := try_as('authenticated', W, $q$ SELECT count(*)::text FROM public.link_network_members $q$);
  PERFORM chk(ph, 'a member reads the whole member table and gets only own row -> ' || r, (r = 'ok:1') <> broken);
  r := try_as('authenticated', U, $q$ SELECT count(*)::text FROM public.link_network_members $q$);
  PERFORM chk(ph, 'a non-member reads no membership (the member list is never exposed) -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM public.link_network_members $q$);
  PERFORM chk(ph, 'admin (owns no member project) reads no membership -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.link_network_members $q$);
  PERFORM chk(ph, 'anon reads memberships -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('authenticated', X, $q$ SELECT count(*)::text FROM public.link_network_placements $q$);
  PERFORM chk(ph, 'a third member (neither side) reads the placement -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM public.link_network_placements $q$);
  PERFORM chk(ph, 'admin (neither side) reads the placement -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.link_network_placements $q$);
  PERFORM chk(ph, 'anon reads placements -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('authenticated', V, $q$ SELECT link_rel FROM public.link_network_settings $q$);
  PERFORM chk(ph, 'a browser role reads the settings row directly -> ' || r, (r LIKE 'denied:%') <> broken);

  -- ISOLATION: no browser role writes, not even the owner into their own project.
  r := try_as('authenticated', U, join_sql);
  PERFORM chk(ph, 'an owner joins directly (bypassing the consent route) -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, flip_sql);
  PERFORM chk(ph, 'an owner flips membership directly -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, reject_sql);
  PERFORM chk(ph, 'the giving side updates a placement directly -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', W, ins_placement(PX, X, AX1, PW, W));
  PERFORM chk(ph, 'a member plants a placement to itself -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH u AS (UPDATE public.link_network_settings SET link_rel = 'nofollow' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'a browser role switches the network link type -> ' || r, (r LIKE 'denied:%') <> broken);

  -- HARD RULES (as service_role, the only writer).
  r := try_as('service_role', NULL, ins_placement(PW, W, AW1, PV, V));
  PERFORM chk(ph, 'reciprocal: W -> V while V -> W is placed is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := try_as('service_role', NULL, format($q$ WITH u AS (UPDATE public.link_network_placements SET status = 'rejected', rejected_at = now()
      WHERE id = 'f0000000-0000-0000-0000-000000000001' RETURNING 1),
      i AS (SELECT 1) SELECT count(*)::text FROM u $q$));
  PERFORM chk(ph, 'service_role rejects a placement -> ' || r, r = 'ok:1');

  -- REGRESSION, every phase: the server writes.
  r := try_as('service_role', NULL, ins_placement(PX, X, AX1, PW, W));
  PERFORM chk(ph, 'service_role places X -> W (not reciprocal) -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, join_sql);
  PERFORM chk(ph, 'service_role records a consented membership -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, $q$ SELECT link_rel FROM public.link_network_settings WHERE id = 1 $q$);
  PERFORM chk(ph, 'service_role reads the network link type, follow by default (the owner''s decision) -> ' || r, r = 'ok:follow');

  PERFORM chk(ph, 'RLS is enabled on the three tables',
    (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
      ('public.link_network_members'::regclass, 'public.link_network_placements'::regclass, 'public.link_network_settings'::regclass)));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: permissive policies, Supabase's default grants back, no reciprocity trigger.
DROP POLICY link_network_members_owner_select ON public.link_network_members;
CREATE POLICY link_network_members_owner_select ON public.link_network_members FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS link_network_placements_source_select ON public.link_network_placements;
DROP POLICY IF EXISTS link_network_placements_sides_select ON public.link_network_placements;
CREATE POLICY link_network_placements_sides_select ON public.link_network_placements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY link_network_settings_open ON public.link_network_settings FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.link_network_members TO anon, authenticated;
GRANT ALL ON TABLE public.link_network_placements TO anon, authenticated;
GRANT ALL ON TABLE public.link_network_settings TO anon, authenticated;
DROP TRIGGER link_network_placements_guard ON public.link_network_placements;
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the broken state, repairs it
-- (the extra permissive policy on settings is not the migration's; drop it as
-- the repair of that one table's policies would).
DROP POLICY link_network_settings_open ON public.link_network_settings;
\i supabase/migrations/20260929010000_link_network.sql
SELECT run_checks('restored');

-- Constraints (as service_role, the only writer).
DO $$
DECLARE r text;
  V text := '11111111-1111-1111-1111-111111111111';
  W text := '22222222-2222-2222-2222-222222222222';
  PV text := 'a1111111-1111-1111-1111-111111111111';
  PV2 text := 'a1111111-1111-1111-1111-222222222222';
  PW text := 'a2222222-2222-2222-2222-222222222222';
  AV2 text := 'e1111111-0000-0000-0000-000000000002';
  base text := $q$ INSERT INTO public.link_network_placements
      (source_project_id, source_user_id, source_article_id, source_domain, target_project_id, target_user_id, target_url, anchor_text, link_rel, status, rejected_at, anchor_kind, relevance)
      VALUES (%L, %L, %L, 'v-site.co.il', %L, %L, %L, %L, %L, %L, %s, %L, %s) RETURNING 'inserted' $q$;
BEGIN
  r := try_as('service_role', NULL, format(base, PV, V, AV2, PV, V, 'https://v.co.il/x', 'שתי מילים', 'nofollow', 'placed', 'NULL', 'natural', '80'));
  PERFORM chk('constraints', 'a project never links to itself -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, PV, V, AV2, PV2, V, 'https://v2.co.il/x', 'שתי מילים', 'nofollow', 'placed', 'NULL', 'natural', '80'));
  PERFORM chk('constraints', 'two projects of the same owner never link to each other -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, PV, V, AV2, PW, W, 'javascript:alert(1)', 'שתי מילים', 'nofollow', 'placed', 'NULL', 'natural', '80'));
  PERFORM chk('constraints', 'a target url that is not http(s) is refused -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, PV, V, AV2, PW, W, 'https://w.co.il/x', 'x', 'nofollow', 'placed', 'NULL', 'natural', '80'));
  PERFORM chk('constraints', 'a one-letter anchor is refused -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, PV, V, AV2, PW, W, 'https://w.co.il/x', 'שתי מילים', 'sponsored', 'placed', 'NULL', 'natural', '80'));
  PERFORM chk('constraints', 'a link type other than nofollow/follow is refused -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, PV, V, AV2, PW, W, 'https://w.co.il/x', 'שתי מילים', 'nofollow', 'rejected', 'NULL', 'natural', '80'));
  PERFORM chk('constraints', 'a rejected placement without its time is refused -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, replace(format(base, PV, V, AV2, PW, W, 'https://w.co.il/x', 'שתי מילים', 'follow', 'placed', 'NULL', 'natural', '80'), '''natural''', '''keyword'''));
  PERFORM chk('constraints', 'an unknown anchor kind is refused -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(base, PV, V, AV2, PW, W, 'https://w.co.il/x', 'שתי מילים', 'follow', 'placed', 'NULL', 'natural', '101'));
  PERFORM chk('constraints', 'a relevance above 100 is refused -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ UPDATE public.link_network_settings SET link_rel = 'nofollow' RETURNING link_rel $q$);
  PERFORM chk('constraints', 'the API role (service_role) cannot switch the link type; only the app owner in SQL -> ' || r, r LIKE 'denied:%');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.link_network_settings (id) VALUES (2) RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'there is one settings row only -> ' || r, r LIKE 'denied:%');
END $$;

-- The link type switches with one UPDATE (the app owner, in SQL).
UPDATE public.link_network_settings SET link_rel = 'nofollow';
DO $$ BEGIN
  PERFORM chk('settings', 'one UPDATE switches the network to nofollow', (SELECT link_rel FROM public.link_network_settings) = 'nofollow');
END $$;
DO $$
DECLARE r text; BEGIN
  r := (SELECT try_as('postgres', NULL, $q$ UPDATE public.link_network_settings SET link_rel = 'sponsored' RETURNING link_rel $q$));
  PERFORM chk('settings', 'and nothing but nofollow/follow is accepted -> ' || r, r = 'denied:23514');
END $$;
UPDATE public.link_network_settings SET link_rel = 'follow';

-- Committed rows for the last checks: V -> W is rejected in the fixture? No: the
-- run_checks rejections were rolled back, so V -> W is still placed here.
DO $$
DECLARE r text;
  V text := '11111111-1111-1111-1111-111111111111';
  W text := '22222222-2222-2222-2222-222222222222';
  X text := '44444444-4444-4444-4444-444444444444';
  PV text := 'a1111111-1111-1111-1111-111111111111';
  PW text := 'a2222222-2222-2222-2222-222222222222';
  PX text := 'a4444444-4444-4444-4444-444444444444';
  AV1 text := 'e1111111-0000-0000-0000-000000000001';
  AW1 text := 'e2222222-0000-0000-0000-000000000001';
BEGIN
  r := try_as('service_role', NULL, ins_placement(PV, V, AV1, PX, X));
  PERFORM chk('rules', 'a second placed link from the same article is refused -> ' || r, r = 'denied:23505');
  -- Reject V -> W for real, then W -> V is allowed (no reciprocal pair exists any more).
  UPDATE public.link_network_placements SET status = 'rejected', rejected_at = now() WHERE id = 'f0000000-0000-0000-0000-000000000001';
  r := try_as('service_role', NULL, ins_placement(PW, W, AW1, PV, V));
  PERFORM chk('rules', 'after V -> W was rejected, W -> V may be placed -> ' || r, r = 'ok:1');
  INSERT INTO public.link_network_placements (source_project_id, source_user_id, source_article_id, source_domain, target_project_id, target_user_id, target_url, anchor_text, link_rel, anchor_kind, relevance)
    VALUES (PW::uuid, W::uuid, AW1::uuid, 'w-site.co.il', PV::uuid, V::uuid, 'https://v.co.il/p', 'מילים טבעיות', 'follow', 'branded', 90);
  r := try_as('service_role', NULL, $q$ UPDATE public.link_network_placements SET status = 'placed', rejected_at = NULL
      WHERE id = 'f0000000-0000-0000-0000-000000000001' RETURNING 'updated' $q$);
  PERFORM chk('rules', 'a rejected V -> W cannot be brought back while W -> V is placed -> ' || r, r = 'denied:23514');
END $$;

-- Cascades (destructive, so last).
DO $$
DECLARE err text;
BEGIN
  BEGIN
    DELETE FROM public.generated_articles WHERE id = 'e2222222-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE;
  END;
  PERFORM chk('cascade', 'deleting a source article keeps the log line, without the article' || coalesce(' -> blocked: ' || err, ''),
    err IS NULL AND EXISTS (SELECT 1 FROM public.link_network_placements
      WHERE source_project_id = 'a2222222-2222-2222-2222-222222222222' AND source_article_id IS NULL));
  BEGIN
    DELETE FROM public.projects WHERE id = 'a2222222-2222-2222-2222-222222222222';
  EXCEPTION WHEN OTHERS THEN err := SQLSTATE;
  END;
  PERFORM chk('cascade', 'deleting a project deletes its membership and both sides of its placements' || coalesce(' -> blocked: ' || err, ''),
    err IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.link_network_members WHERE project_id = 'a2222222-2222-2222-2222-222222222222')
    AND NOT EXISTS (SELECT 1 FROM public.link_network_placements WHERE source_project_id = 'a2222222-2222-2222-2222-222222222222' OR target_project_id = 'a2222222-2222-2222-2222-222222222222'));
  PERFORM chk('cascade', 'other members are untouched',
    (SELECT count(*) FROM public.link_network_members WHERE project_id IN ('a1111111-1111-1111-1111-111111111111', 'a4444444-4444-4444-4444-444444444444')) = 2);
  PERFORM chk('defaults', 'a membership row is inactive unless the server says otherwise',
    (SELECT column_default FROM information_schema.columns WHERE table_name = 'link_network_members' AND column_name = 'active') = 'false');
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;

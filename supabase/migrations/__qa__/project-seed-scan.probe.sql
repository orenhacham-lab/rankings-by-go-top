-- ============================================================================
-- EXECUTED PROBE — 20260927000000_project_seed_scan.sql (seed scan data model)
--
-- Builds, in a DISPOSABLE PostgreSQL cluster, the part of Production the
-- migration relies on: the Supabase roles and auth.uid(), public.projects with
-- the policy 20260925000000 left on it, the shared updated_at trigger function,
-- wordpress_content_index from its own migration file, and Supabase's default
-- privileges, which grant ALL on every NEW public table to anon and
-- authenticated. Without those default grants every "denied" below would pass
-- vacuously; with them, each denial has to come from the migration itself.
--
-- The migration is then applied TWICE via \i (a re-run must not error), and
-- every check runs as the role PostgREST would use, inside a subtransaction
-- that is always rolled back, so each check sees the same fixture:
--   * the owner reads own rows in all five tables; another user and anon
--     read none of them;
--   * the owner writes profile and audiences for an own project, but not for
--     another user's project, and never with someone else's user_id;
--   * authenticated cannot insert, update or delete runs, steps or crawl-index
--     rows, and cannot TRUNCATE any of the five; anon can do nothing at all;
--   * the CHECKs reject bad enum values, an error_code with spaces, and the
--     other malformed values, each by the constraint meant to catch it;
--   * deleting a project, even as its owner through RLS, cascades to all five;
--   * site_crawl_index has exactly the columns, defaults and CHECKs of
--     wordpress_content_index.
--
-- NOT run against Supabase or Production; the rows are fabricated here.
--
-- Run (from the repo root):
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-seed-scan.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

-- Supabase's default privileges: every table created in public from here on
-- (the five under test included) starts with ALL granted to the API roles.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- Production objects the migration depends on.
CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'user');
CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select exists (select 1 from public.profiles where id = user_id and role = 'admin'); $$;
CREATE TABLE public.clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text);
CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
  client_id uuid REFERENCES public.clients(id), name text);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
-- projects_isolation_policy exactly as 20260925000000_security_owasp_hardening.sql left it.
CREATE POLICY projects_isolation_policy ON public.projects
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid())
  WITH CHECK (
    is_admin(auth.uid())
    OR (
      user_id = auth.uid()
      AND (client_id IS NULL OR client_id IN (SELECT c.id FROM public.clients c WHERE c.user_id = auth.uid()))
    )
  );
-- The shared updated_at trigger function, with the search_path 20260925000000 pinned on it.
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS
  $$ begin new.updated_at = now(); return new; end; $$;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- The reference shape for site_crawl_index, from its own migration file.
\i supabase/migrations/20260718_add_wordpress_content_index.sql

-- The migration under test, twice: every statement must be re-runnable.
\i supabase/migrations/20260927000000_project_seed_scan.sql
\i supabase/migrations/20260927000000_project_seed_scan.sql

-- Fixture: owner O and another user X. Each has one project with rows in all
-- five tables and one project with no rows yet.
--   O  11111111-...  projects a...01 (rows), a...02 (empty)   run c...01
--   X  22222222-...  projects b...01 (rows), b...02 (empty)   run c...02
INSERT INTO public.projects (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'owner project, not scanned yet'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'other project'),
  ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'other project, not scanned yet');
-- updated_at is backdated so the trigger's bump on UPDATE is observable.
INSERT INTO public.project_profiles (project_id, user_id, niche, field_sources, updated_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'bakery', '{"niche": "scan"}', '2000-01-01'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'plumbing', '{"niche": "user"}', '2000-01-01');
INSERT INTO public.project_audiences (id, project_id, user_id, position, label, source) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 0, 'Parents of young children', 'scan'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 'Office managers', 'user'),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 0, 'Landlords', 'scan');
INSERT INTO public.project_seed_runs (id, project_id, user_id, trigger) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'create'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'create');
INSERT INTO public.project_seed_steps (run_id, project_id, user_id, step, status, item_count) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1', 'done', 12),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a2', 'running', NULL),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'a1', 'done', 3);
INSERT INTO public.site_crawl_index (project_id, user_id, site_url) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'https://owner.example'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'https://other.example');

CREATE TABLE results (seq serial, name text, ok boolean);
CREATE FUNCTION chk(n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results (name, ok) VALUES (n, COALESCE(c, false)); END; $$;

-- Run `sql` as `role_name` with auth.uid() = `uid`, inside a subtransaction
-- that is always rolled back. Returns
--   'ok:<first column of the first row>'   ('ok:done' for a statement without rows)
--   'denied:42501:rls'                      a policy rejected the row
--   'denied:42501:privilege'                the role lacks the table privilege
--   'denied:<sqlstate>[:<constraint>]'      anything else, e.g. a CHECK
CREATE FUNCTION try_as(role_name text, uid text, sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text; con text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', coalesce(uid, ''), true);
    EXECUTE format('SET LOCAL ROLE %I', role_name);
    IF sql ~* '^\s*(select|with)\M' THEN EXECUTE sql INTO r; ELSE EXECUTE sql; r := 'done'; END IF;
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback:' || coalesce(r, 'null');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM LIKE 'rollback:%' THEN RETURN 'ok:' || substr(SQLERRM, 10); END IF;
    IF SQLSTATE = '42501' THEN
      RETURN 'denied:42501:' || CASE WHEN SQLERRM LIKE '%row-level security%' THEN 'rls' ELSE 'privilege' END;
    END IF;
    GET STACKED DIAGNOSTICS con = CONSTRAINT_NAME;
    RETURN 'denied:' || SQLSTATE || CASE WHEN coalesce(con, '') <> '' THEN ':' || con ELSE '' END;
  END;
END; $$;

-- Wrap a DML statement so it reports how many rows it touched.
CREATE FUNCTION n(dml text) RETURNS text LANGUAGE sql IMMUTABLE AS
  $$ SELECT format('WITH w AS (%s RETURNING 1) SELECT count(*)::text FROM w', dml) $$;

-- Delete as `role_name`/`uid`, then count as the superuser; always rolled back.
CREATE FUNCTION delete_then_count(role_name text, uid text, del text, cnt text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE k int; r text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', coalesce(uid, ''), true);
    EXECUTE format('SET LOCAL ROLE %I', role_name);
    EXECUTE del;
    GET DIAGNOSTICS k = ROW_COUNT;
    RESET ROLE;
    EXECUTE cnt INTO r;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback:deleted ' || k || '; ' || coalesce(r, 'null');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM LIKE 'rollback:%' THEN RETURN substr(SQLERRM, 10); END IF;
    RETURN 'denied:' || SQLSTATE || ' ' || SQLERRM;
  END;
END; $$;

-- Table privileges `role_name` holds on `tbl`, e.g. 'SELECT,INSERT' or '-'.
CREATE FUNCTION privs(role_name text, tbl text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(p, ',' ORDER BY o), '-')
  FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) WITH ORDINALITY AS u(p, o)
  WHERE has_table_privilege(role_name, tbl, p)
$$;

-- Column shape of a table: name, type, NOT NULL and default, in column order.
CREATE FUNCTION col_shape(tbl regclass) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT string_agg(format('%s %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
           CASE WHEN a.attnotnull THEN ' not null' ELSE '' END,
           coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')), ', ' ORDER BY a.attnum)
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = tbl AND a.attnum > 0 AND NOT a.attisdropped
$$;

-- Constraint definitions of one kind (c = CHECK, f = FK, p = PK, u = UNIQUE), sorted.
CREATE FUNCTION con_defs(tbl regclass, kind "char") RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(pg_get_constraintdef(oid), ' | ' ORDER BY pg_get_constraintdef(oid)), '-')
  FROM pg_constraint WHERE conrelid = tbl AND contype = kind
$$;

CREATE FUNCTION run_checks() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  O    text := '11111111-1111-1111-1111-111111111111';  -- the owner
  X    text := '22222222-2222-2222-2222-222222222222';  -- another user
  P_O  text := 'a0000000-0000-0000-0000-000000000001';  -- O's project, with rows
  P_O2 text := 'a0000000-0000-0000-0000-000000000002';  -- O's project, no rows yet
  P_X  text := 'b0000000-0000-0000-0000-000000000001';  -- X's project, with rows
  P_X2 text := 'b0000000-0000-0000-0000-000000000002';  -- X's project, no rows yet
  R_O  text := 'c0000000-0000-0000-0000-000000000001';  -- O's run
  AU_O text := 'd0000000-0000-0000-0000-000000000001';  -- one of O's audiences
  AU_X text := 'd0000000-0000-0000-0000-000000000003';  -- X's audience
  tables text[] := ARRAY['project_profiles', 'project_audiences', 'project_seed_runs', 'project_seed_steps', 'site_crawl_index'];
  service_tables text[] := ARRAY['project_seed_runs', 'project_seed_steps', 'site_crawl_index'];
  t text; own_o int; own_x int; seen text; r text; e text;
  ins_sql text; upd_sql text; del_sql text;
BEGIN
  -- ── 1. Structure ──────────────────────────────────────────────────────────
  r := (SELECT count(*)::text FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY (tables) AND relrowsecurity);
  PERFORM chk('structure: RLS is enabled on all five tables -> ' || r, r = '5');
  r := (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY (tables));
  PERFORM chk('structure: 10 policies in all (3 profiles, 4 audiences, 1 each for runs, steps, crawl index) -> ' || r, r = '10');
  r := (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY (tables) AND roles <> '{authenticated}');
  PERFORM chk('structure: every policy is TO authenticated only (none for anon or PUBLIC) -> ' || r, r = '0');
  r := (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY (service_tables) AND cmd <> 'SELECT');
  PERFORM chk('structure: runs, steps and crawl index have no INSERT/UPDATE/DELETE/ALL policy -> ' || r, r = '0');
  r := (SELECT string_agg(tablename || ':' || cmd, ',' ORDER BY tablename, cmd) FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('project_profiles', 'project_audiences'));
  PERFORM chk('structure: profiles allow SELECT/INSERT/UPDATE, audiences add DELETE -> ' || r,
    r = 'project_audiences:DELETE,project_audiences:INSERT,project_audiences:SELECT,project_audiences:UPDATE,project_profiles:INSERT,project_profiles:SELECT,project_profiles:UPDATE');
  FOREACH t IN ARRAY tables LOOP
    r := privs('anon', 'public.' || t) || ' / ' || privs('public', 'public.' || t)
         || ' / ' || has_any_column_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, REFERENCES')::text;
    PERFORM chk(format('grants: anon and PUBLIC hold nothing on %s, not even per column -> %s', t, r), r = '- / - / false');
    r := privs('authenticated', 'public.' || t);
    PERFORM chk(format('grants: authenticated holds exactly what the policies allow on %s -> %s', t, r),
      r = CASE t WHEN 'project_profiles' THEN 'SELECT,INSERT,UPDATE'
                 WHEN 'project_audiences' THEN 'SELECT,INSERT,UPDATE,DELETE'
                 ELSE 'SELECT' END);
    r := privs('service_role', 'public.' || t);
    PERFORM chk(format('grants: service_role reads and writes %s -> %s', t, r), r LIKE 'SELECT,INSERT,UPDATE,DELETE%');
  END LOOP;
  r := (SELECT string_agg(indexdef, ' | ' ORDER BY indexname) FROM pg_indexes WHERE schemaname = 'public'
        AND indexname IN ('idx_project_audiences_project_position', 'idx_project_seed_runs_project_created',
                          'idx_project_seed_runs_lease', 'idx_project_seed_steps_project_finished'));
  PERFORM chk('structure: the four indexes exist as specified -> ' || r,
    r = 'CREATE INDEX idx_project_audiences_project_position ON public.project_audiences USING btree (project_id, "position")'
     || ' | CREATE INDEX idx_project_seed_runs_lease ON public.project_seed_runs USING btree (lease_expires_at) WHERE (status = ''running''::text)'
     || ' | CREATE INDEX idx_project_seed_runs_project_created ON public.project_seed_runs USING btree (project_id, created_at DESC)'
     || ' | CREATE INDEX idx_project_seed_steps_project_finished ON public.project_seed_steps USING btree (project_id, finished_at DESC)');
  r := con_defs('public.project_profiles', 'p') || ' / ' || con_defs('public.project_seed_steps', 'p');
  PERFORM chk('structure: profiles keyed by project_id, steps by (run_id, step) -> ' || r,
    r = 'PRIMARY KEY (project_id) / PRIMARY KEY (run_id, step)');
  FOREACH t IN ARRAY tables LOOP
    r := con_defs(('public.' || t)::regclass, 'f');
    PERFORM chk(format('structure: %s cascades from projects%s -> %s', t, CASE WHEN t = 'project_seed_steps' THEN ' and from its run' ELSE '' END, r),
      r = CASE WHEN t = 'project_seed_steps'
               THEN 'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE | FOREIGN KEY (run_id) REFERENCES project_seed_runs(id) ON DELETE CASCADE'
               ELSE 'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE' END);
  END LOOP;
  r := (SELECT string_agg(tgname || ' ' || tgfoid::regprocedure::text, ',') FROM pg_trigger
        WHERE tgrelid = 'public.project_profiles'::regclass AND NOT tgisinternal);
  PERFORM chk('structure: profiles.updated_at uses the shared trigger function -> ' || r,
    r = 'project_profiles_update_updated_at update_updated_at_column()');

  -- site_crawl_index against the reference, wordpress_content_index.
  r := col_shape('public.site_crawl_index');
  PERFORM chk('parity: site_crawl_index has the columns, types, NOT NULLs and defaults of wordpress_content_index, in order',
    r = col_shape('public.wordpress_content_index') AND r LIKE 'id uuid not null default gen_random_uuid(), user_id uuid not null, project_id uuid not null%');
  r := con_defs('public.site_crawl_index', 'c');
  PERFORM chk('parity: site_crawl_index has the CHECKs of wordpress_content_index -> ' || r,
    r = con_defs('public.wordpress_content_index', 'c') AND r LIKE '%scan_status%');
  r := con_defs('public.site_crawl_index', 'f') || ' / ' || con_defs('public.site_crawl_index', 'p');
  PERFORM chk('parity: site_crawl_index has the key and project FK of wordpress_content_index -> ' || r,
    r = con_defs('public.wordpress_content_index', 'f') || ' / ' || con_defs('public.wordpress_content_index', 'p'));
  r := (SELECT conname || ' ' || pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.site_crawl_index'::regclass AND contype = 'u');
  PERFORM chk('parity: site_crawl_index has its own site_crawl_index_project_unique UNIQUE (project_id) -> ' || r,
    r = 'site_crawl_index_project_unique UNIQUE (project_id)');

  -- ── 2. Reads ──────────────────────────────────────────────────────────────
  -- Each read reports '<rows of O's project>/<rows of X's project>' it can see.
  FOR t, own_o, own_x IN SELECT * FROM (VALUES
      ('project_profiles', 1, 1), ('project_audiences', 2, 1), ('project_seed_runs', 1, 1),
      ('project_seed_steps', 2, 1), ('site_crawl_index', 1, 1)) v LOOP
    seen := format($q$ SELECT count(*) FILTER (WHERE project_id = %L) || '/' || count(*) FILTER (WHERE project_id = %L) FROM public.%I $q$, P_O, P_X, t);
    r := try_as('authenticated', O, seen);
    PERFORM chk(format('read: the owner sees own %s rows and none of the other user''s -> %s', t, r), r = format('ok:%s/0', own_o));
    r := try_as('authenticated', X, seen);
    PERFORM chk(format('read: another user sees none of the owner''s %s rows (only own) -> %s', t, r), r = format('ok:0/%s', own_x));
    r := try_as('anon', NULL, seen);
    PERFORM chk(format('read: anon is refused %s -> %s', t, r), r = 'denied:42501:privilege');
    r := try_as('service_role', NULL, seen);
    PERFORM chk(format('read: service_role sees every %s row -> %s', t, r), r = format('ok:%s/%s', own_o, own_x));
  END LOOP;

  -- ── 3. Owner writes: project_profiles ─────────────────────────────────────
  r := try_as('authenticated', O, n(format($q$ INSERT INTO public.project_profiles (project_id, user_id, niche, field_sources) VALUES (%L, %L, 'cafe', '{"niche": "user"}') $q$, P_O2, O)));
  PERFORM chk('profiles: the owner creates the profile of an own project -> ' || r, r = 'ok:1');
  r := try_as('authenticated', O, n(format($q$ INSERT INTO public.project_profiles (project_id, user_id, niche) VALUES (%L, %L, 'cafe') ON CONFLICT (project_id) DO UPDATE SET niche = EXCLUDED.niche $q$, P_O, O)));
  PERFORM chk('profiles: the owner upserts the profile of an own project -> ' || r, r = 'ok:1');
  r := try_as('authenticated', O, format($q$ WITH u AS (UPDATE public.project_profiles SET niche = 'bakery and cafe', field_sources = '{"niche": "user"}' WHERE project_id = %L RETURNING updated_at > '2001-01-01'::timestamptz AS bumped) SELECT count(*) || ':' || bool_and(bumped) FROM u $q$, P_O));
  PERFORM chk('profiles: the owner edits own profile, and the trigger bumps updated_at -> ' || r, r = 'ok:1:true');
  r := try_as('authenticated', O, n(format($q$ INSERT INTO public.project_profiles (project_id, user_id, niche) VALUES (%L, %L, 'planted') $q$, P_X2, O)));
  PERFORM chk('profiles: the owner cannot create a profile for another user''s project -> ' || r, r = 'denied:42501:rls');
  r := try_as('authenticated', O, n(format($q$ INSERT INTO public.project_profiles (project_id, user_id, niche) VALUES (%L, %L, 'planted') $q$, P_X2, X)));
  PERFORM chk('profiles: ... not even with that user''s user_id -> ' || r, r = 'denied:42501:rls');
  r := try_as('authenticated', O, n(format($q$ INSERT INTO public.project_profiles (project_id, user_id, niche) VALUES (%L, %L, 'x') ON CONFLICT (project_id) DO UPDATE SET niche = 'hijacked' $q$, P_X, O)));
  PERFORM chk('profiles: the owner cannot upsert over another user''s profile -> ' || r, r = 'denied:42501:rls');
  r := try_as('authenticated', O, n(format($q$ UPDATE public.project_profiles SET niche = 'hijacked', user_id = %L WHERE project_id = %L $q$, O, P_X)));
  PERFORM chk('profiles: the owner cannot edit another user''s profile (0 rows) -> ' || r, r = 'ok:0');
  r := try_as('authenticated', X, n(format($q$ UPDATE public.project_profiles SET niche = 'hijacked' WHERE project_id = %L $q$, P_O)));
  PERFORM chk('profiles: another user cannot edit the owner''s profile (0 rows) -> ' || r, r = 'ok:0');
  r := try_as('authenticated', O, n(format($q$ INSERT INTO public.project_profiles (project_id, user_id, niche) VALUES (%L, %L, 'cafe') $q$, P_O2, X)));
  PERFORM chk('profiles: the owner cannot write a row carrying someone else''s user_id -> ' || r, r = 'denied:42501:rls');
  r := try_as('authenticated', O, n(format($q$ UPDATE public.project_profiles SET user_id = %L WHERE project_id = %L $q$, X, P_O)));
  PERFORM chk('profiles: the owner cannot hand own profile to someone else''s user_id -> ' || r, r = 'denied:42501:rls');
  r := try_as('authenticated', O, n(format($q$ UPDATE public.project_profiles SET project_id = %L WHERE project_id = %L $q$, P_X2, P_O)));
  PERFORM chk('profiles: the owner cannot move own profile into another user''s project -> ' || r, r = 'denied:42501:rls');
  r := try_as('authenticated', O, n(format($q$ DELETE FROM public.project_profiles WHERE project_id = %L $q$, P_O)));
  PERFORM chk('profiles: the owner cannot delete own profile (it carries field_sources) -> ' || r, r = 'denied:42501:privilege');

  -- ── 4. Owner writes: project_audiences ────────────────────────────────────
  r := try_as('authenticated', O, n(format($q$ INSERT INTO public.project_audiences (project_id, user_id, position, label) VALUES (%L, %L, 2, 'Event planners') $q$, P_O, O)));
  PERFORM chk('audiences: the owner adds an audience to an own project -> ' || r, r = 'ok:1');
  r := try_as('authenticated', O, n(format($q$ UPDATE public.project_audiences SET label = 'Parents of toddlers', source = 'user' WHERE id = %L $q$, AU_O)));
  PERFORM chk('audiences: the owner edits own audience -> ' || r, r = 'ok:1');
  r := try_as('authenticated', O, n(format($q$ DELETE FROM public.project_audiences WHERE id = %L $q$, AU_O)));
  PERFORM chk('audiences: the owner removes own audience -> ' || r, r = 'ok:1');
  r := try_as('authenticated', O, n(format($q$ INSERT INTO public.project_audiences (project_id, user_id, label) VALUES (%L, %L, 'planted') $q$, P_X, O)));
  PERFORM chk('audiences: the owner cannot add an audience to another user''s project -> ' || r, r = 'denied:42501:rls');
  r := try_as('authenticated', O, n(format($q$ INSERT INTO public.project_audiences (project_id, user_id, label) VALUES (%L, %L, 'planted') $q$, P_X, X)));
  PERFORM chk('audiences: ... not even with that user''s user_id -> ' || r, r = 'denied:42501:rls');
  r := try_as('authenticated', O, n(format($q$ UPDATE public.project_audiences SET label = 'hijacked' WHERE id = %L $q$, AU_X)));
  PERFORM chk('audiences: the owner cannot edit another user''s audience (0 rows) -> ' || r, r = 'ok:0');
  r := try_as('authenticated', O, n(format($q$ DELETE FROM public.project_audiences WHERE id = %L $q$, AU_X)));
  PERFORM chk('audiences: the owner cannot remove another user''s audience (0 rows) -> ' || r, r = 'ok:0');
  r := try_as('authenticated', X, n(format($q$ DELETE FROM public.project_audiences WHERE project_id = %L $q$, P_O)));
  PERFORM chk('audiences: another user cannot remove the owner''s audiences (0 rows) -> ' || r, r = 'ok:0');
  r := try_as('authenticated', O, n(format($q$ INSERT INTO public.project_audiences (project_id, user_id, label) VALUES (%L, %L, 'x') $q$, P_O, X)));
  PERFORM chk('audiences: the owner cannot write a row carrying someone else''s user_id -> ' || r, r = 'denied:42501:rls');
  r := try_as('authenticated', O, n(format($q$ UPDATE public.project_audiences SET user_id = %L WHERE id = %L $q$, X, AU_O)));
  PERFORM chk('audiences: the owner cannot hand own audience to someone else''s user_id -> ' || r, r = 'denied:42501:rls');
  r := try_as('authenticated', O, n(format($q$ UPDATE public.project_audiences SET project_id = %L WHERE id = %L $q$, P_X, AU_O)));
  PERFORM chk('audiences: the owner cannot move own audience into another user''s project -> ' || r, r = 'denied:42501:rls');

  -- ── 5. Runs, steps and crawl index: service-role writes only ──────────────
  FOREACH t IN ARRAY service_tables LOOP
    ins_sql := CASE t
      WHEN 'project_seed_runs' THEN format($q$ INSERT INTO public.project_seed_runs (project_id, user_id, trigger) VALUES (%L, %L, 'rescan') $q$, P_O, O)
      WHEN 'project_seed_steps' THEN format($q$ INSERT INTO public.project_seed_steps (run_id, project_id, user_id, step) VALUES (%L, %L, %L, 'a3') $q$, R_O, P_O, O)
      ELSE format($q$ INSERT INTO public.site_crawl_index (project_id, user_id) VALUES (%L, %L) $q$, P_O2, O) END;
    upd_sql := CASE t
      WHEN 'project_seed_runs' THEN format($q$ UPDATE public.project_seed_runs SET status = 'done' WHERE project_id = %L $q$, P_O)
      WHEN 'project_seed_steps' THEN format($q$ UPDATE public.project_seed_steps SET status = 'done', item_count = 999 WHERE project_id = %L $q$, P_O)
      ELSE format($q$ UPDATE public.site_crawl_index SET scan_status = 'failed' WHERE project_id = %L $q$, P_O) END;
    del_sql := format($q$ DELETE FROM public.%I WHERE project_id = %L $q$, t, P_O);
    r := try_as('authenticated', O, n(ins_sql));
    PERFORM chk(format('%s: the owner cannot insert, even for an own project -> %s', t, r), r = 'denied:42501:privilege');
    r := try_as('authenticated', O, n(upd_sql));
    PERFORM chk(format('%s: the owner cannot update own rows -> %s', t, r), r = 'denied:42501:privilege');
    r := try_as('authenticated', O, n(del_sql));
    PERFORM chk(format('%s: the owner cannot delete own rows -> %s', t, r), r = 'denied:42501:privilege');
    r := try_as('service_role', NULL, n(ins_sql));
    PERFORM chk(format('%s: service_role inserts -> %s', t, r), r = 'ok:1');
    r := try_as('service_role', NULL, n(upd_sql));
    PERFORM chk(format('%s: service_role updates -> %s', t, r), r LIKE 'ok:%' AND r <> 'ok:0');
    r := try_as('service_role', NULL, n(del_sql));
    PERFORM chk(format('%s: service_role deletes -> %s', t, r), r LIKE 'ok:%' AND r <> 'ok:0');
  END LOOP;
  -- TRUNCATE is not governed by RLS, and Supabase's default grants include it.
  FOREACH t IN ARRAY tables LOOP
    r := try_as('authenticated', O, format('TRUNCATE public.%I CASCADE', t));
    PERFORM chk(format('%s: authenticated cannot TRUNCATE (RLS does not cover it) -> %s', t, r), r = 'denied:42501:privilege');
    r := try_as('anon', NULL, n(CASE t
      WHEN 'project_profiles' THEN format($q$ INSERT INTO public.project_profiles (project_id, user_id) VALUES (%L, %L) $q$, P_O2, O)
      WHEN 'project_audiences' THEN format($q$ INSERT INTO public.project_audiences (project_id, user_id, label) VALUES (%L, %L, 'x') $q$, P_O, O)
      WHEN 'project_seed_runs' THEN format($q$ INSERT INTO public.project_seed_runs (project_id, user_id, trigger) VALUES (%L, %L, 'create') $q$, P_O, O)
      WHEN 'project_seed_steps' THEN format($q$ INSERT INTO public.project_seed_steps (run_id, project_id, user_id, step) VALUES (%L, %L, %L, 'b1') $q$, R_O, P_O, O)
      ELSE format($q$ INSERT INTO public.site_crawl_index (project_id, user_id) VALUES (%L, %L) $q$, P_O2, O) END));
    PERFORM chk(format('%s: anon cannot insert -> %s', t, r), r = 'denied:42501:privilege');
  END LOOP;

  -- ── 6. CHECKs and defaults (as service_role, so only the constraint decides) ─
  -- Each rejected row differs from an accepted row in exactly one column.
  e := format($q$ INSERT INTO public.project_seed_runs (project_id, user_id, trigger, stage, status, error_code) VALUES (%L, %L, %%L, %%L, %%L, %%L) $q$, P_O, O);
  r := try_as('service_role', NULL, n(format(e, 'rescan', 'b', 'partial', 'serper_timeout')));
  PERFORM chk('check runs: a well-formed run is accepted (control) -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, n(format(e, 'manual', 'b', 'partial', 'serper_timeout')));
  PERFORM chk('check runs: trigger outside create/rescan/claim/shopify_install -> ' || r, r = 'denied:23514:project_seed_runs_trigger_check');
  r := try_as('service_role', NULL, n(format(e, 'rescan', 'c', 'partial', 'serper_timeout')));
  PERFORM chk('check runs: stage outside a/b -> ' || r, r = 'denied:23514:project_seed_runs_stage_check');
  r := try_as('service_role', NULL, n(format(e, 'rescan', 'b', 'succeeded', 'serper_timeout')));
  PERFORM chk('check runs: status outside running/done/partial/failed -> ' || r, r = 'denied:23514:project_seed_runs_status_check');
  r := try_as('service_role', NULL, n(format(e, 'rescan', 'b', 'failed', 'upstream said no')));
  PERFORM chk('check runs: error_code with spaces (provider-style text) -> ' || r, r = 'denied:23514:project_seed_runs_error_code_check');
  r := try_as('service_role', NULL, n(format(e, 'rescan', 'b', 'failed', 'HTTP_500')));
  PERFORM chk('check runs: error_code with capitals -> ' || r, r = 'denied:23514:project_seed_runs_error_code_check');
  r := try_as('service_role', NULL, n(format(e, 'rescan', 'b', 'failed', repeat('x', 65))));
  PERFORM chk('check runs: error_code longer than 64 -> ' || r, r = 'denied:23514:project_seed_runs_error_code_check');
  r := try_as('service_role', NULL, n(format(e, 'rescan', 'b', 'failed', '')));
  PERFORM chk('check runs: empty error_code -> ' || r, r = 'denied:23514:project_seed_runs_error_code_check');
  r := try_as('service_role', NULL, format($q$ WITH w AS (INSERT INTO public.project_seed_runs (project_id, user_id, trigger) VALUES (%L, %L, 'claim') RETURNING stage, status, summary, error_code, started_at, created_at) SELECT stage || '/' || status || '/' || summary::text || '/' || coalesce(error_code, 'null') || '/' || (started_at IS NOT NULL AND created_at IS NOT NULL) FROM w $q$, P_O, O));
  PERFORM chk('defaults runs: stage a, status running, summary {}, no error, timestamps set -> ' || r, r = 'ok:a/running/{}/null/true');

  e := format($q$ INSERT INTO public.project_seed_steps (run_id, project_id, user_id, step, status, item_count, error_code) VALUES (%L, %L, %L, %%L, %%L, %%s, %%L) $q$, R_O, P_O, O);
  r := try_as('service_role', NULL, n(format(e, 'b6', 'skipped', '0', 'quota_exhausted')));
  PERFORM chk('check steps: a well-formed step is accepted (control) -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, n(format(e, 'a5', 'skipped', '0', 'quota_exhausted')));
  PERFORM chk('check steps: step a5 does not exist -> ' || r, r = 'denied:23514:project_seed_steps_step_check');
  r := try_as('service_role', NULL, n(format(e, 'b7', 'skipped', '0', 'quota_exhausted')));
  PERFORM chk('check steps: step b7 does not exist -> ' || r, r = 'denied:23514:project_seed_steps_step_check');
  r := try_as('service_role', NULL, n(format(e, 'b6', 'completed', '0', 'quota_exhausted')));
  PERFORM chk('check steps: status outside pending/running/done/skipped/failed -> ' || r, r = 'denied:23514:project_seed_steps_status_check');
  r := try_as('service_role', NULL, n(format(e, 'b6', 'skipped', '-1', 'quota_exhausted')));
  PERFORM chk('check steps: negative item_count -> ' || r, r = 'denied:23514:project_seed_steps_item_count_check');
  r := try_as('service_role', NULL, n(format(e, 'b6', 'failed', 'NULL', 'Timeout: upstream 503')));
  PERFORM chk('check steps: error_code with spaces -> ' || r, r = 'denied:23514:project_seed_steps_error_code_check');
  r := try_as('service_role', NULL, n(format(e, 'a1', 'done', '1', 'quota_exhausted')));
  PERFORM chk('check steps: one row per (run, step) -> ' || r, r = 'denied:23505:project_seed_steps_pkey');
  r := try_as('service_role', NULL, format($q$ WITH w AS (INSERT INTO public.project_seed_steps (run_id, project_id, user_id, step) VALUES (%L, %L, %L, 'b2') RETURNING status, detail, item_count, started_at) SELECT status || '/' || detail::text || '/' || coalesce(item_count::text, 'null') || '/' || coalesce(started_at::text, 'null') FROM w $q$, R_O, P_O, O));
  PERFORM chk('defaults steps: status pending, detail {}, no count, not started -> ' || r, r = 'ok:pending/{}/null/null');

  e := format($q$ INSERT INTO public.project_profiles (project_id, user_id, commerce_type, description, niche, detected_platform, field_sources) VALUES (%L, %L, %%L, repeat('d', %%s), repeat('n', %%s), repeat('p', %%s), %%L) $q$, P_O2, O);
  r := try_as('service_role', NULL, n(format(e, 'service', 1500, 120, 40, '{"description": "scan", "niche": "user"}')));
  PERFORM chk('check profiles: a profile at every length limit is accepted (control) -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, n(format(e, 'retail', 1500, 120, 40, '{}')));
  PERFORM chk('check profiles: commerce_type outside product/service/content/other -> ' || r, r = 'denied:23514:project_profiles_commerce_type_check');
  r := try_as('service_role', NULL, n(format(e, 'service', 1501, 120, 40, '{}')));
  PERFORM chk('check profiles: description over 1500 characters -> ' || r, r = 'denied:23514:project_profiles_description_check');
  r := try_as('service_role', NULL, n(format(e, 'service', 1500, 121, 40, '{}')));
  PERFORM chk('check profiles: niche over 120 characters -> ' || r, r = 'denied:23514:project_profiles_niche_check');
  r := try_as('service_role', NULL, n(format(e, 'service', 1500, 120, 41, '{}')));
  PERFORM chk('check profiles: detected_platform over 40 characters -> ' || r, r = 'denied:23514:project_profiles_detected_platform_check');
  r := try_as('service_role', NULL, n(format(e, 'service', 1500, 120, 40, '{"niche": "ai"}')));
  PERFORM chk('check profiles: field_sources value other than scan/user -> ' || r, r = 'denied:23514:project_profiles_field_sources_check');
  r := try_as('service_role', NULL, n(format(e, 'service', 1500, 120, 40, '{"niche": ["scan"]}')));
  PERFORM chk('check profiles: field_sources value that is not a string -> ' || r, r = 'denied:23514:project_profiles_field_sources_check');
  r := try_as('service_role', NULL, n(format(e, 'service', 1500, 120, 40, '["scan"]')));
  PERFORM chk('check profiles: field_sources that is not an object -> ' || r, r = 'denied:23514:project_profiles_field_sources_check');
  r := try_as('service_role', NULL, format($q$ WITH w AS (INSERT INTO public.project_profiles (project_id, user_id) VALUES (%L, %L) RETURNING field_sources, created_at, updated_at) SELECT field_sources::text || '/' || (created_at IS NOT NULL AND updated_at IS NOT NULL) FROM w $q$, P_O2, O));
  PERFORM chk('defaults profiles: field_sources {}, timestamps set -> ' || r, r = 'ok:{}/true');

  e := format($q$ INSERT INTO public.project_audiences (project_id, user_id, label, source) VALUES (%L, %L, %%L, %%L) $q$, P_O, O);
  r := try_as('service_role', NULL, n(format(e, repeat('a', 300), 'scan')));
  PERFORM chk('check audiences: a 300-character scan audience is accepted (control) -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, n(format(e, repeat('a', 301), 'scan')));
  PERFORM chk('check audiences: label over 300 characters -> ' || r, r = 'denied:23514:project_audiences_label_check');
  r := try_as('service_role', NULL, n(format(e, '   ', 'scan')));
  PERFORM chk('check audiences: label blank after trim -> ' || r, r = 'denied:23514:project_audiences_label_check');
  r := try_as('service_role', NULL, n(format(e, 'Landlords', 'ai')));
  PERFORM chk('check audiences: source outside scan/user -> ' || r, r = 'denied:23514:project_audiences_source_check');
  r := try_as('service_role', NULL, format($q$ WITH w AS (INSERT INTO public.project_audiences (project_id, user_id, label) VALUES (%L, %L, 'Tourists') RETURNING position, source) SELECT position || '/' || source FROM w $q$, P_O, O));
  PERFORM chk('defaults audiences: position 0, source user -> ' || r, r = 'ok:0/user');

  r := try_as('service_role', NULL, n(format($q$ INSERT INTO public.site_crawl_index (project_id, user_id, scan_status) VALUES (%L, %L, 'partial') $q$, P_O2, O)));
  PERFORM chk('check crawl index: a partial scan is accepted (control) -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, n(format($q$ INSERT INTO public.site_crawl_index (project_id, user_id, scan_status) VALUES (%L, %L, 'done') $q$, P_O2, O)));
  PERFORM chk('check crawl index: scan_status outside running/completed/partial/failed -> ' || r, r = 'denied:23514:site_crawl_index_scan_status_check');
  r := try_as('service_role', NULL, n(format($q$ INSERT INTO public.site_crawl_index (project_id, user_id) VALUES (%L, %L) $q$, P_O, O)));
  PERFORM chk('check crawl index: one row per project -> ' || r, r = 'denied:23505:site_crawl_index_project_unique');

  -- ── 7. Deleting a project cascades to all five ────────────────────────────
  seen := format($q$ SELECT format('owner rows left %%s/%%s/%%s/%%s/%%s, other user''s rows left %%s/%%s/%%s/%%s/%%s',
      (SELECT count(*) FROM public.project_profiles WHERE project_id = %1$L), (SELECT count(*) FROM public.project_audiences WHERE project_id = %1$L),
      (SELECT count(*) FROM public.project_seed_runs WHERE project_id = %1$L), (SELECT count(*) FROM public.project_seed_steps WHERE project_id = %1$L),
      (SELECT count(*) FROM public.site_crawl_index WHERE project_id = %1$L),
      (SELECT count(*) FROM public.project_profiles WHERE project_id = %2$L), (SELECT count(*) FROM public.project_audiences WHERE project_id = %2$L),
      (SELECT count(*) FROM public.project_seed_runs WHERE project_id = %2$L), (SELECT count(*) FROM public.project_seed_steps WHERE project_id = %2$L),
      (SELECT count(*) FROM public.site_crawl_index WHERE project_id = %2$L)) $q$, P_O, P_X);
  EXECUTE seen INTO r;
  PERFORM chk('cascade: before, the owner''s project has rows in all five tables -> ' || r,
    r = 'owner rows left 1/2/1/2/1, other user''s rows left 1/1/1/1/1');
  r := delete_then_count('authenticated', O, format('DELETE FROM public.projects WHERE id = %L', P_O), seen);
  PERFORM chk('cascade: the owner deletes the project through RLS; all five tables follow -> ' || r,
    r = 'deleted 1; owner rows left 0/0/0/0/0, other user''s rows left 1/1/1/1/1');
  r := delete_then_count('service_role', NULL, format('DELETE FROM public.projects WHERE id = %L', P_O), seen);
  PERFORM chk('cascade: the same through the service role -> ' || r,
    r = 'deleted 1; owner rows left 0/0/0/0/0, other user''s rows left 1/1/1/1/1');
  r := delete_then_count('service_role', NULL, format('DELETE FROM public.project_seed_runs WHERE id = %L', R_O),
    format('SELECT count(*)::text || '' steps left'' FROM public.project_seed_steps WHERE run_id = %L', R_O));
  PERFORM chk('cascade: deleting a run removes its steps -> ' || r, r = 'deleted 1; 0 steps left');
END; $$;

SELECT run_checks();

\set QUIET off
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY seq;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

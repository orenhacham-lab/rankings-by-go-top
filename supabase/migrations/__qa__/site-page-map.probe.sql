-- ============================================================================
-- EXECUTED PROBE — 20260929000000_site_page_map.sql (full-site mapping)
--
-- Builds, in a DISPOSABLE PostgreSQL cluster, the part of Production the
-- migration relies on (the Supabase roles and auth.uid(), public.projects with
-- its RLS policy, the shared updated_at trigger function, and Supabase's default
-- privileges, which grant ALL on every NEW public table to anon and
-- authenticated, so every "denied" below has to come from the migration).
--
-- The migration is applied TWICE (a re-run must not error), and every check
-- runs as the role PostgREST would use, inside a rolled-back subtransaction:
--   * the owner reads the row of their own project; another user and anon read none;
--   * authenticated cannot insert, update, delete or TRUNCATE; anon can do nothing;
--   * the service role can write, and the CHECKs refuse a bad status, phase,
--     stop_reason, negative counters and a non-array entries value;
--   * one row per project; deleting the project removes its row.
--
-- NOT run against Supabase or Production; the rows are fabricated here.
--
-- Run (from the repo root):
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/site-page-map.probe.sql
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

-- The migration under test, twice: every statement must be re-runnable.
\i supabase/migrations/20260929000000_site_page_map.sql
\i supabase/migrations/20260929000000_site_page_map.sql

INSERT INTO public.projects (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'owner project, not mapped yet'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'other project');
INSERT INTO public.site_page_map (project_id, user_id, status, urls_found, entries, counts, updated_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'completed', 2,
   '[{"u":"https://owner.example/products/a","k":"product"},{"u":"https://owner.example/blog/b","k":"article"}]',
   '{"all":2,"product":1,"article":1,"page":0,"category":0}', '2000-01-01'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'running', 0, '[]', '{}', '2000-01-01');

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
  O    text := '11111111-1111-1111-1111-111111111111';
  X    text := '22222222-2222-2222-2222-222222222222';
  P_O  text := 'a0000000-0000-0000-0000-000000000001';
  P_O2 text := 'a0000000-0000-0000-0000-000000000002';
  P_X  text := 'b0000000-0000-0000-0000-000000000001';
  r text; ins text;
BEGIN
  -- 1. Structure
  r := (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.site_page_map'::regclass);
  PERFORM chk('structure: RLS is enabled -> ' || r, r = 'true');
  r := (SELECT string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ' ' ORDER BY policyname) FROM pg_policies WHERE tablename = 'site_page_map');
  PERFORM chk('structure: exactly one policy, SELECT for authenticated -> ' || r, r = 'site_page_map_select:SELECT:authenticated');
  r := con_defs('public.site_page_map', 'p');
  PERFORM chk('structure: the project is the primary key (one row per project) -> ' || r, r = 'PRIMARY KEY (project_id)');
  r := con_defs('public.site_page_map', 'f');
  PERFORM chk('structure: the project is a foreign key with ON DELETE CASCADE -> ' || r, r = 'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE');

  -- 2. Grants
  r := privs('authenticated', 'public.site_page_map');
  PERFORM chk('grants: authenticated holds SELECT only -> ' || r, r = 'SELECT');
  r := privs('anon', 'public.site_page_map');
  PERFORM chk('grants: anon holds nothing -> ' || r, r = '-');
  r := privs('service_role', 'public.site_page_map');
  -- The service role keeps Supabase's defaults (as in every migration here); the four the code uses must be there.
  PERFORM chk('grants: service_role reads and writes -> ' || r, r LIKE 'SELECT,INSERT,UPDATE,DELETE%');

  -- 3. Reads
  r := try_as('authenticated', O, 'SELECT count(*)::text FROM public.site_page_map');
  PERFORM chk('read: the owner sees their own row only -> ' || r, r = 'ok:1');
  r := try_as('authenticated', O, format('SELECT jsonb_array_length(entries)::text FROM public.site_page_map WHERE project_id = %L', P_O));
  PERFORM chk('read: the owner reads the entries -> ' || r, r = 'ok:2');
  r := try_as('authenticated', X, format('SELECT count(*)::text FROM public.site_page_map WHERE project_id = %L', P_O));
  PERFORM chk('read: another user does not see the owner''s row -> ' || r, r = 'ok:0');
  r := try_as('anon', NULL, 'SELECT count(*)::text FROM public.site_page_map');
  PERFORM chk('read: anon is refused -> ' || r, r = 'denied:42501:privilege');

  -- 4. Writes from the browser are refused
  ins := format($q$ INSERT INTO public.site_page_map (project_id, user_id) VALUES (%L, %L) $q$, P_O2, O);
  r := try_as('authenticated', O, n(ins));
  PERFORM chk('write: the owner cannot insert -> ' || r, r = 'denied:42501:privilege');
  r := try_as('authenticated', O, n(format($q$ UPDATE public.site_page_map SET status = 'failed' WHERE project_id = %L $q$, P_O)));
  PERFORM chk('write: the owner cannot update -> ' || r, r = 'denied:42501:privilege');
  r := try_as('authenticated', O, n(format($q$ DELETE FROM public.site_page_map WHERE project_id = %L $q$, P_O)));
  PERFORM chk('write: the owner cannot delete -> ' || r, r = 'denied:42501:privilege');
  r := try_as('authenticated', O, 'TRUNCATE public.site_page_map');
  PERFORM chk('write: the owner cannot truncate -> ' || r, r = 'denied:42501:privilege');
  r := try_as('anon', NULL, n(ins));
  PERFORM chk('write: anon cannot insert -> ' || r, r = 'denied:42501:privilege');

  -- 5. The service role writes; the CHECKs hold
  r := try_as('service_role', NULL, n(ins));
  PERFORM chk('service: inserts a row (control) -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, format($q$ WITH w AS (INSERT INTO public.site_page_map (project_id, user_id) VALUES (%L, %L) RETURNING status || '/' || jsonb_typeof(entries) || '/' || capped) SELECT * FROM w $q$, P_O2, O));
  PERFORM chk('defaults: running, an empty array, not capped -> ' || r, r = 'ok:running/array/false');
  r := try_as('service_role', NULL, n(format($q$ UPDATE public.site_page_map SET status = 'partial', stop_reason = 'cap', capped = true WHERE project_id = %L $q$, P_O)));
  PERFORM chk('service: updates a row (control) -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, format($q$ WITH w AS (UPDATE public.site_page_map SET urls_found = 3 WHERE project_id = %L RETURNING (updated_at > '2000-01-02')::text) SELECT * FROM w $q$, P_O));
  PERFORM chk('trigger: an update bumps updated_at -> ' || r, r = 'ok:true');
  r := try_as('service_role', NULL, n(format($q$ INSERT INTO public.site_page_map (project_id, user_id) VALUES (%L, %L) $q$, P_O, O)));
  PERFORM chk('check: one row per project -> ' || r, r = 'denied:23505:site_page_map_pkey');
  r := try_as('service_role', NULL, n(format($q$ UPDATE public.site_page_map SET status = 'done' WHERE project_id = %L $q$, P_O)));
  PERFORM chk('check: status outside running/completed/partial/failed -> ' || r, r = 'denied:23514:site_page_map_status_check');
  r := try_as('service_role', NULL, n(format($q$ UPDATE public.site_page_map SET phase = 'pages' WHERE project_id = %L $q$, P_O)));
  PERFORM chk('check: phase outside robots/sitemaps/platform -> ' || r, r = 'denied:23514:site_page_map_phase_check');
  r := try_as('service_role', NULL, n(format($q$ UPDATE public.site_page_map SET stop_reason = 'fetch failed: ECONNRESET' WHERE project_id = %L $q$, P_O)));
  PERFORM chk('check: stop_reason is a stable code, never provider text -> ' || r, r = 'denied:23514:site_page_map_stop_reason_check');
  r := try_as('service_role', NULL, n(format($q$ UPDATE public.site_page_map SET urls_found = -1 WHERE project_id = %L $q$, P_O)));
  PERFORM chk('check: urls_found is never negative -> ' || r, r = 'denied:23514:site_page_map_urls_found_check');
  r := try_as('service_role', NULL, n(format($q$ UPDATE public.site_page_map SET entries = '{}' WHERE project_id = %L $q$, P_O)));
  PERFORM chk('check: entries is an array -> ' || r, r = 'denied:23514:site_page_map_entries_check');
  r := try_as('service_role', NULL, n(format($q$ UPDATE public.site_page_map SET counts = '[]' WHERE project_id = %L $q$, P_O)));
  PERFORM chk('check: counts is an object -> ' || r, r = 'denied:23514:site_page_map_counts_check');

  -- 6. Cascade
  r := delete_then_count('authenticated', O, format('DELETE FROM public.projects WHERE id = %L', P_O),
    format('SELECT count(*) FILTER (WHERE project_id = %L) || ''/'' || count(*) FILTER (WHERE project_id = %L) FROM public.site_page_map', P_O, P_X));
  PERFORM chk('cascade: the owner deletes the project; its row goes, the other user''s stays -> ' || r, r = 'deleted 1; 0/1');
END; $$;

SELECT run_checks();

\set QUIET off
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY seq;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

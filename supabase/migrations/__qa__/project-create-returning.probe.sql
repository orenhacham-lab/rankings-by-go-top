-- ============================================================================
-- EXECUTED PROBE — creating a project returns its id under RLS
--
-- /api/projects/create now asks for the new row back
-- (`insert(data).select('id').single()`), so the app can open the project it
-- just created. With RLS, INSERT ... RETURNING also requires the new row to
-- pass the table's SELECT (USING) policy; if it did not, the insert itself
-- would fail and project creation would break for every merchant.
--
-- This runs the Production policy (projects_isolation_policy as written by
-- 20260925000000_security_owasp_hardening.sql, copied verbatim) against a
-- disposable PostgreSQL cluster:
--   * an owner's insert returns exactly its own new id;
--   * the policy's existing refusals still hold (another user's user_id,
--     another user's client);
--   * MUTATION CONTROL: under a policy whose USING does not cover the new row,
--     the same INSERT ... RETURNING is refused, so this probe can tell the
--     difference and is not passing vacuously.
--
-- NOT run against Supabase or Production. The rows below are fabricated here.
--   scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-create-returning.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'user');
CREATE TABLE public.clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text);
CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
  client_id uuid REFERENCES public.clients(id), name text, target_domain text, is_active boolean DEFAULT true);
-- The mutation-control twin: identical columns, a policy that hides the new row.
CREATE TABLE public.projects_hidden (LIKE public.projects INCLUDING DEFAULTS);

CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select exists (select 1 from public.profiles where id = user_id and role = 'admin'); $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects_hidden ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_isolation_policy ON public.clients FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR (user_id = auth.uid())) WITH CHECK (is_admin(auth.uid()) OR (user_id = auth.uid()));
-- Verbatim from 20260925000000_security_owasp_hardening.sql.
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
CREATE POLICY projects_hidden_policy ON public.projects_hidden
  FOR ALL TO authenticated USING (false) WITH CHECK (user_id = auth.uid());

INSERT INTO public.profiles (id) VALUES
  ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.clients (id, user_id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A client'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B client');

CREATE TABLE results (name text, ok boolean);
CREATE FUNCTION chk(n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (n, COALESCE(c, false)); END; $$;

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

DO $$
DECLARE r text;
  A text := '11111111-1111-1111-1111-111111111111';
BEGIN
  -- The route's insert, as the signed-in owner: the row comes back, and it is the new one.
  r := try_as('authenticated', A, $q$
    WITH ins AS (INSERT INTO public.projects (user_id, name, target_domain)
                 VALUES ('11111111-1111-1111-1111-111111111111', 'New site', 'example.com') RETURNING id, user_id)
    SELECT (count(*) = 1 AND bool_and(user_id = auth.uid()) AND bool_and(id IS NOT NULL))::text FROM ins $q$);
  PERFORM chk('owner insert returns exactly its own new id -> ' || r, r = 'ok:true');

  -- …also when the project belongs to one of the owner's clients.
  r := try_as('authenticated', A, $q$
    WITH ins AS (INSERT INTO public.projects (user_id, client_id, name)
                 VALUES ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'Client site') RETURNING id)
    SELECT count(*)::text FROM ins $q$);
  PERFORM chk('owner insert under an own client returns its id -> ' || r, r = 'ok:1');

  -- The policy's refusals are unchanged.
  r := try_as('authenticated', A, $q$
    WITH ins AS (INSERT INTO public.projects (user_id, name)
                 VALUES ('22222222-2222-2222-2222-222222222222', 'Not mine') RETURNING id)
    SELECT count(*)::text FROM ins $q$);
  PERFORM chk('an insert naming another user is refused -> ' || r, r LIKE 'denied:%');
  r := try_as('authenticated', A, $q$
    WITH ins AS (INSERT INTO public.projects (user_id, client_id, name)
                 VALUES ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001', 'Their client') RETURNING id)
    SELECT count(*)::text FROM ins $q$);
  PERFORM chk('an insert under another user''s client is refused -> ' || r, r LIKE 'denied:%');
  r := try_as('anon', NULL, $q$
    WITH ins AS (INSERT INTO public.projects (user_id, name)
                 VALUES ('11111111-1111-1111-1111-111111111111', 'Anon') RETURNING id)
    SELECT count(*)::text FROM ins $q$);
  PERFORM chk('an anonymous insert is refused -> ' || r, r LIKE 'denied:%');

  -- MUTATION CONTROL: the same statement against a policy that hides the new row.
  r := try_as('authenticated', A, $q$
    WITH ins AS (INSERT INTO public.projects_hidden (user_id, name)
                 VALUES ('11111111-1111-1111-1111-111111111111', 'Hidden') RETURNING id)
    SELECT count(*)::text FROM ins $q$);
  PERFORM chk('MUT: RETURNING under a policy that hides the new row is refused -> ' || r, r LIKE 'denied:%');
  -- …while the same insert WITHOUT returning goes through: the difference is RETURNING.
  r := try_as('authenticated', A, $q$
    WITH ins AS (INSERT INTO public.projects_hidden (user_id, name) VALUES ('11111111-1111-1111-1111-111111111111', 'Hidden'))
    SELECT 'inserted' $q$);
  PERFORM chk('MUT: …the same insert without RETURNING is accepted -> ' || r, r LIKE 'ok:%');
END; $$;

\set QUIET off
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

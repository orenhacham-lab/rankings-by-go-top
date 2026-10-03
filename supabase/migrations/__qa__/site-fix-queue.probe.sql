-- ============================================================================
-- EXECUTED PROBE — 20260928000300_site_fix_queue.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster that carries Supabase's roles, its default
-- grants (including the default privileges every NEW table in public gets) and
-- the projects isolation policy. Then:
--
--   'after'     the owner reads their own jobs, their own audit rows and the
--               non-secret columns of their plugin link; the plugin secret is
--               unreadable to every browser role; another user, an admin and
--               anon read nothing; no browser role writes; service_role writes
--               jobs and links and APPENDS to the audit, but can neither update
--               nor delete an audit row.
--   'mutated'   MUTATION CONTROL. The owner policies are replaced by permissive
--               ones, Supabase's default grants are put back and the
--               append-only trigger is dropped: every isolation check must now
--               report the leak. A check that cannot fail tests nothing.
--   'restored'  the migration file is applied again over the broken state and
--               every check holds again.
--
-- Then the constraints (the closed fix-type whitelist, statuses, channels, URL
-- and ciphertext shapes, key id shape, one link per project) and the project
-- ON DELETE CASCADE (jobs and link go, the audit trail stays).
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/site-fix-queue.probe.sql
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

-- Fixture: owner V, other user A, admin M.
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.projects VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner project'),
  ('a1111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'owner second project'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other project');

\i supabase/migrations/20260928000300_site_fix_queue.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20260928000300_site_fix_queue.sql

SET ROLE service_role;
INSERT INTO public.site_fix_plugin_links (user_id, project_id, site_url, key_id, secret_encrypted, secret_hint, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'https://owner.example.com',
   'gtk_0123456789abcdef', 'aa:bb:cc', '••••a1b2', 'connected'),
  ('22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'https://other.example.org',
   'gtk_fedcba9876543210', '0f:1e:2d', '••••9f9f', 'pending');
INSERT INTO public.site_fix_jobs (id, user_id, project_id, fix_type, finding_kind, page_url, payload, channel, status, approved_by, approved_ip) VALUES
  ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'seo_title', 'title_long', 'https://owner.example.com/about/', '{"value":"About the shop"}', 'plugin', 'applied',
   '11111111-1111-1111-1111-111111111111', '203.0.113.9'),
  ('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222',
   'image_alt', 'images_alt', 'https://other.example.org/', '{"images":[]}', 'webhook', 'sent',
   '22222222-2222-2222-2222-222222222222', '198.51.100.7');
INSERT INTO public.site_fix_audit (job_id, user_id, project_id, action, actor_id, actor_ip, channel, previous_value, new_value) VALUES
  ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
   'approved', '11111111-1111-1111-1111-111111111111', '203.0.113.9', 'plugin', 'About us – the long story', 'About the shop'),
  ('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222',
   'sent', '22222222-2222-2222-2222-222222222222', '198.51.100.7', 'webhook', '', 'alt');
RESET ROLE;

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

CREATE FUNCTION run_checks(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  V text := '11111111-1111-1111-1111-111111111111';
  A text := '22222222-2222-2222-2222-222222222222';
  M text := '33333333-3333-3333-3333-333333333333';
  broken boolean := (ph = 'mutated');
  r text;
  ins_job text := format($q$ WITH i AS (INSERT INTO public.site_fix_jobs
      (user_id, project_id, fix_type, finding_kind, page_url, payload, channel, status, approved_by)
      VALUES (%L, 'a1111111-1111-1111-1111-222222222222', 'seo_title', 'title_long', 'https://owner.example.com/x', '{"value":"x"}', 'manual', 'manual', %L)
      RETURNING 1) SELECT count(*)::text FROM i $q$, V, V);
  ins_audit text := format($q$ WITH i AS (INSERT INTO public.site_fix_audit
      (job_id, user_id, project_id, action, actor_id) VALUES ('b1111111-1111-1111-1111-111111111111', %L, 'a1111111-1111-1111-1111-111111111111', 'applied', %L)
      RETURNING 1) SELECT count(*)::text FROM i $q$, V, V);
BEGIN
  -- REGRESSION, every phase: the owner reads their own queue, trail and link.
  r := try_as('authenticated', V, $q$ SELECT fix_type || ':' || status || ':' || approved_ip FROM public.site_fix_jobs
    WHERE id = 'b1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads own job -> ' || r, r = 'ok:seo_title:applied:203.0.113.9');
  r := try_as('authenticated', V, $q$ SELECT action || ':' || previous_value || '>' || new_value FROM public.site_fix_audit
    WHERE job_id = 'b1111111-1111-1111-1111-111111111111' AND action = 'approved' $q$);
  PERFORM chk(ph, 'owner reads own audit row -> ' || r, r = 'ok:approved:About us – the long story>About the shop');
  r := try_as('authenticated', V, $q$ SELECT key_id || ':' || secret_hint || ':' || status FROM public.site_fix_plugin_links
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads the safe columns of own plugin link -> ' || r, r = 'ok:gtk_0123456789abcdef:••••a1b2:connected');

  -- ISOLATION: the plugin secret never reaches a browser role.
  r := try_as('authenticated', V, $q$ SELECT secret_encrypted FROM public.site_fix_plugin_links
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'owner reads the encrypted plugin secret -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM (SELECT * FROM public.site_fix_plugin_links) s $q$);
  PERFORM chk(ph, 'owner SELECT * on plugin links (includes the secret) -> ' || r, (r LIKE 'denied:%') <> broken);

  -- ISOLATION: rows. Unfiltered, the owner sees only their own.
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.site_fix_jobs $q$);
  PERFORM chk(ph, 'owner reads all jobs and gets only own -> ' || r, (r = 'ok:1') <> broken);
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.site_fix_audit $q$);
  PERFORM chk(ph, 'owner reads the whole trail and gets only own -> ' || r, (r = 'ok:1') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.site_fix_jobs WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'other user reads owner jobs -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.site_fix_audit WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'other user reads owner audit -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM (SELECT id FROM public.site_fix_plugin_links WHERE project_id = 'a1111111-1111-1111-1111-111111111111') s $q$);
  PERFORM chk(ph, 'other user reads owner plugin link -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM public.site_fix_jobs WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'admin (not the owner) reads owner jobs: owner-only by design -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.site_fix_jobs $q$);
  PERFORM chk(ph, 'anon reads jobs -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.site_fix_audit $q$);
  PERFORM chk(ph, 'anon reads the trail -> ' || r, (r = 'denied:42501') <> broken);

  -- ISOLATION: no browser role writes, not even the owner into their own project.
  r := try_as('authenticated', V, ins_job);
  PERFORM chk(ph, 'owner inserts a job (bypassing approval) -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH u AS (UPDATE public.site_fix_jobs SET status = 'applied'
      WHERE id = 'b1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'owner updates own job -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, ins_audit);
  PERFORM chk(ph, 'owner forges an audit row -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH d AS (DELETE FROM public.site_fix_audit RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'owner deletes own audit rows -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', A, $q$ WITH u AS (UPDATE public.site_fix_plugin_links SET status = 'connected'
      WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'other user updates owner plugin link -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, ins_job);
  PERFORM chk(ph, 'anon inserts a job -> ' || r, (r LIKE 'denied:%') <> broken);

  -- APPEND-ONLY: not even the server rewrites or erases history.
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.site_fix_audit SET new_value = 'rewritten' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'service_role rewrites an audit row -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('service_role', NULL, $q$ WITH d AS (DELETE FROM public.site_fix_audit RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'service_role deletes audit rows -> ' || r, (r LIKE 'denied:%') <> broken);

  -- REGRESSION, every phase: the server writes jobs and links, and appends to the trail.
  r := try_as('service_role', NULL, ins_job);
  PERFORM chk(ph, 'service_role inserts a job -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, ins_audit);
  PERFORM chk(ph, 'service_role appends to the trail -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, $q$ SELECT secret_encrypted FROM public.site_fix_plugin_links
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' $q$);
  PERFORM chk(ph, 'service_role reads the encrypted plugin secret -> ' || r, r = 'ok:aa:bb:cc');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.site_fix_jobs SET status = 'reverted'
      WHERE id = 'b1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'service_role updates a job -> ' || r, r = 'ok:1');

  PERFORM chk(ph, 'RLS is enabled on all three tables',
    (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
      ('public.site_fix_jobs'::regclass, 'public.site_fix_audit'::regclass, 'public.site_fix_plugin_links'::regclass)));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: permissive policies, Supabase's default grants back, the trigger gone.
DROP POLICY site_fix_jobs_owner_select ON public.site_fix_jobs;
CREATE POLICY site_fix_jobs_owner_select ON public.site_fix_jobs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY site_fix_audit_owner_select ON public.site_fix_audit;
CREATE POLICY site_fix_audit_owner_select ON public.site_fix_audit FOR ALL USING (true) WITH CHECK (true);
DROP POLICY site_fix_plugin_links_owner_select ON public.site_fix_plugin_links;
CREATE POLICY site_fix_plugin_links_owner_select ON public.site_fix_plugin_links FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.site_fix_jobs, public.site_fix_audit, public.site_fix_plugin_links TO anon, authenticated, service_role;
DROP TRIGGER site_fix_audit_no_update ON public.site_fix_audit;
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the broken state, repairs it.
\i supabase/migrations/20260928000300_site_fix_queue.sql
SELECT run_checks('restored');

-- Constraints (as service_role, the only writer).
DO $$
DECLARE r text;
  job text := $q$ INSERT INTO public.site_fix_jobs
    (user_id, project_id, fix_type, finding_kind, page_url, payload, channel, status, approved_by, error_code)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', %L, 'title_long', %L, %L::jsonb, %L, %L,
            '11111111-1111-1111-1111-111111111111', %L) RETURNING 'inserted' $q$;
  link text := $q$ INSERT INTO public.site_fix_plugin_links (user_id, project_id, site_url, key_id, secret_encrypted, secret_hint, status)
    VALUES ('11111111-1111-1111-1111-111111111111', %L, %L, %L, %L, 'h', %L) RETURNING 'inserted' $q$;
BEGIN
  r := try_as('service_role', NULL, format(job, 'seo_title', 'https://owner.example.com/a', '{"value":"x"}', 'plugin', 'pending', NULL));
  PERFORM chk('constraints', 'a whitelisted fix is accepted -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, format(job, 'delete_post', 'https://owner.example.com/a', '{}', 'plugin', 'pending', NULL));
  PERFORM chk('constraints', 'a fix type outside the whitelist is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(job, 'theme_change', 'https://owner.example.com/a', '{}', 'plugin', 'pending', NULL));
  PERFORM chk('constraints', 'a theme change is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(job, 'seo_title', 'https://owner.example.com/a', '{"value":"x"}', 'ftp', 'pending', NULL));
  PERFORM chk('constraints', 'an unknown channel is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(job, 'seo_title', 'https://owner.example.com/a', '{"value":"x"}', 'plugin', 'done', NULL));
  PERFORM chk('constraints', 'an unknown status is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(job, 'seo_title', 'javascript:alert(1)', '{"value":"x"}', 'plugin', 'pending', NULL));
  PERFORM chk('constraints', 'a non-http page url is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(job, 'seo_title', 'https://owner.example.com/a', '["x"]', 'plugin', 'pending', NULL));
  PERFORM chk('constraints', 'a non-object payload is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(job, 'seo_title', 'https://owner.example.com/a', '{"value":"x"}', 'plugin', 'failed', 'WordPress said: 500 <html>'));
  PERFORM chk('constraints', 'provider text as an error code is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(job, 'seo_title', 'https://owner.example.com/a', '{"value":"x"}', 'plugin', 'failed', 'plugin_unreachable'));
  PERFORM chk('constraints', 'a stable error code is accepted -> ' || r, r = 'ok:inserted');

  r := try_as('service_role', NULL, format(link, 'a1111111-1111-1111-1111-111111111111', 'https://owner.example.com', 'gtk_1111111111111111', 'ab:cd:ef', 'pending'));
  PERFORM chk('constraints', 'a second plugin link for one project is rejected -> ' || r, r = 'denied:23505');
  r := try_as('service_role', NULL, format(link, 'a1111111-1111-1111-1111-222222222222', 'https://owner.example.com', 'gtk_0123456789abcdef', 'ab:cd:ef', 'pending'));
  PERFORM chk('constraints', 'a reused key id is rejected -> ' || r, r = 'denied:23505');
  r := try_as('service_role', NULL, format(link, 'a1111111-1111-1111-1111-222222222222', 'https://owner.example.com', 'key-1', 'ab:cd:ef', 'pending'));
  PERFORM chk('constraints', 'a malformed key id is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(link, 'a1111111-1111-1111-1111-222222222222', 'https://owner.example.com', 'gtk_2222222222222222', 'plain-secret', 'pending'));
  PERFORM chk('constraints', 'a plaintext secret is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(link, 'a1111111-1111-1111-1111-222222222222', 'http://owner.example.com', 'gtk_2222222222222222', 'ab:cd:ef', 'pending'));
  PERFORM chk('constraints', 'an http:// site is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(link, 'a1111111-1111-1111-1111-222222222222', 'https://owner.example.com', 'gtk_2222222222222222', 'ab:cd:ef', 'active'));
  PERFORM chk('constraints', 'an unknown link status is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.site_fix_audit (job_id, user_id, project_id, action)
    VALUES ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'edited') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'an unknown audit action is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ TRUNCATE public.site_fix_audit $q$);
  PERFORM chk('constraints', 'service_role cannot truncate the trail -> ' || r, r LIKE 'denied:%');
END $$;

-- Project deletion: jobs and the link cascade, the audit trail stays (retention).
DELETE FROM public.projects WHERE id = 'a1111111-1111-1111-1111-111111111111';
SELECT chk('cascade', 'jobs of a deleted project are removed',
  (SELECT count(*) FROM public.site_fix_jobs WHERE project_id = 'a1111111-1111-1111-1111-111111111111') = 0);
SELECT chk('cascade', 'the plugin link of a deleted project is removed',
  (SELECT count(*) FROM public.site_fix_plugin_links WHERE project_id = 'a1111111-1111-1111-1111-111111111111') = 0);
SELECT chk('cascade', 'the audit trail of a deleted project is kept',
  (SELECT count(*) FROM public.site_fix_audit WHERE project_id = 'a1111111-1111-1111-1111-111111111111') >= 1);

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints','cascade'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

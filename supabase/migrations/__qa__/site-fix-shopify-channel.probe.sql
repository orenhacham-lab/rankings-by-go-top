-- ============================================================================
-- EXECUTED PROBE — 20261006090000_site_fix_shopify_channel.sql
--
-- Builds the site-fix queue from its own migrations, puts in a row of every
-- existing channel, then applies the new migration TWICE (idempotent) and checks:
--   'after'     the 'shopify' channel is accepted on jobs and on the audit; the
--               four existing channels still are; a channel outside the
--               whitelist is still rejected; earlier rows stay; the audit stays
--               append-only.
--   'mutated'   MUTATION CONTROL: the old four-channel checks are put back and
--               'shopify' must now be rejected (the checks really decide).
--   'restored'  the migration applied again over the old checks fixes it.
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/site-fix-shopify-channel.probe.sql
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
\i supabase/migrations/20260928000300_site_fix_queue.sql

SET ROLE service_role;
INSERT INTO public.site_fix_jobs (id, user_id, project_id, fix_type, finding_kind, page_url, payload, channel, status, approved_by)
SELECT gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'seo_title', 'title_long',
       'https://owner.example.com/before/', '{"value":"x"}', c, 'applied', '11111111-1111-1111-1111-111111111111'
FROM unnest(ARRAY['plugin','app_password','webhook','manual']) AS c;
RESET ROLE;

\i supabase/migrations/20260929100000_site_fix_h1_llms.sql
\i supabase/migrations/20261006090000_site_fix_shopify_channel.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261006090000_site_fix_shopify_channel.sql

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- One job insert as service_role (the only writer), rolled back: 'ok' or the SQLSTATE.
CREATE FUNCTION try_job(ch text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.site_fix_jobs (user_id, project_id, fix_type, finding_kind, page_url, payload, channel, status, approved_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'seo_title', 'title_long',
            'https://owner.example.com/blogs/news/a', '{"value":"x"}', ch, 'pending', '11111111-1111-1111-1111-111111111111');
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM = 'rollback' THEN RETURN 'ok'; END IF;
    RETURN SQLSTATE;
  END;
END; $$;

-- One audit insert as service_role, rolled back.
CREATE FUNCTION try_audit(ch text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.site_fix_audit (job_id, user_id, project_id, action, channel)
    VALUES (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'approved', ch);
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM = 'rollback' THEN RETURN 'ok'; END IF;
    RETURN SQLSTATE;
  END;
END; $$;

CREATE FUNCTION run_checks(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  old boolean := (ph = 'mutated');
  c text;
  r text;
BEGIN
  FOREACH c IN ARRAY ARRAY['plugin','app_password','webhook','manual'] LOOP
    r := try_job(c);
    PERFORM chk(ph, 'job: existing channel ' || c || ' accepted -> ' || r, r = 'ok');
    r := try_audit(c);
    PERFORM chk(ph, 'audit: existing channel ' || c || ' accepted -> ' || r, r = 'ok');
  END LOOP;
  r := try_job('shopify');
  PERFORM chk(ph, 'job: shopify ' || CASE WHEN old THEN 'rejected by the old check' ELSE 'accepted' END || ' -> ' || r,
    CASE WHEN old THEN r = '23514' ELSE r = 'ok' END);
  r := try_audit('shopify');
  PERFORM chk(ph, 'audit: shopify ' || CASE WHEN old THEN 'rejected by the old check' ELSE 'accepted' END || ' -> ' || r,
    CASE WHEN old THEN r = '23514' ELSE r = 'ok' END);
  r := try_audit(NULL);
  PERFORM chk(ph, 'audit: no channel is still accepted -> ' || r, r = 'ok');
  r := try_job('wix');
  PERFORM chk(ph, 'job: a channel outside the whitelist is rejected -> ' || r, r = '23514');
  r := try_audit('ftp');
  PERFORM chk(ph, 'audit: a channel outside the whitelist is rejected -> ' || r, r = '23514');
  PERFORM chk(ph, 'the four rows written before are kept',
    (SELECT count(*) FROM public.site_fix_jobs WHERE page_url = 'https://owner.example.com/before/') = 4);
  PERFORM chk(ph, 'the audit is still append-only (its trigger is in place)',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'site_fix_audit_no_update' AND tgrelid = 'public.site_fix_audit'::regclass));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: back to the four-channel checks of 20260928000300.
ALTER TABLE public.site_fix_jobs DROP CONSTRAINT site_fix_jobs_channel;
ALTER TABLE public.site_fix_jobs ADD CONSTRAINT site_fix_jobs_channel CHECK (channel IN ('plugin', 'app_password', 'webhook', 'manual'));
ALTER TABLE public.site_fix_audit DROP CONSTRAINT site_fix_audit_channel;
ALTER TABLE public.site_fix_audit ADD CONSTRAINT site_fix_audit_channel CHECK (channel IS NULL OR channel IN ('plugin', 'app_password', 'webhook', 'manual'));
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the old checks, widens them again.
\i supabase/migrations/20261006090000_site_fix_shopify_channel.sql
SELECT run_checks('restored');

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

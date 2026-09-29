-- ============================================================================
-- EXECUTED PROBE — 20260929100000_site_fix_h1_llms.sql
--
-- Builds the site-fix queue from its own migration (20260928000300), puts in a
-- row of every existing type, then applies the new migration TWICE (idempotent)
-- and checks:
--   'after'     all eleven types are accepted (h1_demote and llms_txt too); a
--               type outside the whitelist is still rejected; the rows written
--               before stay; the rest of the table's constraints still hold.
--   'mutated'   MUTATION CONTROL: the old nine-type check and the old finding-
--               kind shape are put back, and the two new types must now be
--               rejected (the checks really decide).
--   'restored'  the migration applied again over the old check fixes it.
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/site-fix-h1-llms.probe.sql
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
SELECT gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', t, 'title_long',
       'https://owner.example.com/before/', '{"value":"x"}', 'plugin', 'applied', '11111111-1111-1111-1111-111111111111'
FROM unnest(ARRAY['seo_title','meta_description','canonical','focus_keyphrase','image_alt','faq_block','schema_jsonld','broken_link','internal_link']) AS t;
RESET ROLE;

\i supabase/migrations/20260929100000_site_fix_h1_llms.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20260929100000_site_fix_h1_llms.sql

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- One insert as service_role (the only writer), rolled back: 'ok' or the SQLSTATE.
CREATE FUNCTION try_insert(t text, url text, payload text, kind text DEFAULT 'title_long') RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.site_fix_jobs (user_id, project_id, fix_type, finding_kind, page_url, payload, channel, status, approved_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', t, kind, url, payload::jsonb,
            'plugin', 'pending', '11111111-1111-1111-1111-111111111111');
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
  t text;
  r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['seo_title','meta_description','canonical','focus_keyphrase','image_alt','faq_block','schema_jsonld','broken_link','internal_link'] LOOP
    r := try_insert(t, 'https://owner.example.com/a/', '{"value":"x"}');
    PERFORM chk(ph, 'existing type ' || t || ' accepted -> ' || r, r = 'ok');
  END LOOP;
  r := try_insert('h1_demote', 'https://owner.example.com/a/', '{"headings":[{"n":1,"text":"Our story"}]}', 'h1_multiple');
  PERFORM chk(ph, 'h1_demote ' || CASE WHEN old THEN 'rejected by the old check' ELSE 'accepted' END || ' -> ' || r,
    CASE WHEN old THEN r = '23514' ELSE r = 'ok' END);
  r := try_insert('llms_txt', 'https://owner.example.com/', '{"text":"# Shop\n\n> A shop.\n"}', 'llms_missing');
  PERFORM chk(ph, 'llms_txt ' || CASE WHEN old THEN 'rejected by the old check' ELSE 'accepted' END || ' -> ' || r,
    CASE WHEN old THEN r = '23514' ELSE r = 'ok' END);
  r := try_insert('delete_post', 'https://owner.example.com/a/', '{}');
  PERFORM chk(ph, 'a type outside the whitelist is rejected -> ' || r, r = '23514');
  r := try_insert('seo_title', 'https://owner.example.com/a/', '{"value":"x"}', 'Title Long; drop');
  PERFORM chk(ph, 'a finding kind with other characters is still rejected -> ' || r, r = '23514');
  r := try_insert('seo_title', 'https://owner.example.com/a/', '{"value":"x"}', repeat('a', 41));
  PERFORM chk(ph, 'a finding kind over 40 characters is still rejected -> ' || r, r = '23514');
  r := try_insert('llms_txt', 'ftp://owner.example.com/', '{"text":"x"}');
  PERFORM chk(ph, 'the page url check still holds -> ' || r, r = '23514');
  r := try_insert('h1_demote', 'https://owner.example.com/a/', '["x"]');
  PERFORM chk(ph, 'the payload check still holds -> ' || r, r = '23514');
  PERFORM chk(ph, 'the nine rows written before are kept',
    (SELECT count(*) FROM public.site_fix_jobs WHERE page_url = 'https://owner.example.com/before/') = 9);
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: back to the nine-type check of 20260928000300.
ALTER TABLE public.site_fix_jobs DROP CONSTRAINT site_fix_jobs_fix_type;
ALTER TABLE public.site_fix_jobs ADD CONSTRAINT site_fix_jobs_fix_type CHECK (fix_type IN (
  'seo_title', 'meta_description', 'canonical', 'focus_keyphrase', 'image_alt',
  'faq_block', 'schema_jsonld', 'broken_link', 'internal_link'));
ALTER TABLE public.site_fix_jobs DROP CONSTRAINT site_fix_jobs_finding_kind;
ALTER TABLE public.site_fix_jobs ADD CONSTRAINT site_fix_jobs_finding_kind CHECK (finding_kind ~ '^[a-z_]{1,40}$');
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the old check, widens it again.
\i supabase/migrations/20260929100000_site_fix_h1_llms.sql
SELECT run_checks('restored');

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

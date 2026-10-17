-- ============================================================================
-- EXECUTED PROBE — 20261017120000_project_author_photo.sql
--
-- A disposable PostgreSQL cluster with Supabase's roles and default grants, the
-- article settings table as Production has it (20260928001000 through the
-- author-box overrides 20261016180000, applied first), a stub of Supabase's
-- storage schema (buckets; objects with RLS on), then the new migration, twice
-- (idempotent).
--
--   'after'     existing rows read no photo and no copy; nothing else changes;
--               the owner sets 'upload' with a well-formed path of their own
--               project and records a site copy; back to 'none' clears both;
--               another user cannot; the service role sees the object.
--               Then the guarantees: a path with a name, a path under another
--               project, another extension, a non-object copy and an unknown
--               choice are refused; the bucket is private, 2 MB, jpeg/png/webp;
--               anon and a signed-in owner see no object; no storage policy
--               names the bucket.
--   'mutated'   MUTATION CONTROL: the CHECKs dropped, the bucket made public
--               with a public read policy; every guarantee fails.
--   'restored'  the policy dropped, the migration again; all hold.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-author-photo.probe.sql
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

SET ROLE service_role;
INSERT INTO public.project_article_styles (project_id, user_id, brand_colors, design) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '{#e11d48}', 'formatted'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '{#0f766e}', 'minimal');
RESET ROLE;

\i supabase/migrations/20260929120000_project_article_cta.sql
\i supabase/migrations/20261005200000_project_writing_guidance.sql
UPDATE public.project_article_styles SET article_cta = '{"enabled": false, "heading": "keep me"}'::jsonb,
  writing_guidance = '{"instructions": "keep me too"}'::jsonb
  WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
\i supabase/migrations/20261016120000_project_author_box.sql
UPDATE public.project_article_styles SET author_box = true WHERE project_id = 'a1111111-1111-1111-1111-111111111111';
\i supabase/migrations/20261016180000_project_author_box_overrides.sql

-- Supabase's storage schema, as far as this migration touches it: the buckets table and
-- the objects table with RLS on and no policy for the new bucket.
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text, owner uuid);
GRANT ALL ON storage.buckets, storage.objects TO anon, authenticated, service_role;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- An existing public bucket of another feature, with its public read policy (20260613).
INSERT INTO storage.buckets (id, name, public) VALUES ('article-images', 'article-images', true);
CREATE POLICY article_images_public_read ON storage.objects FOR SELECT TO public USING (bucket_id = 'article-images');

\i supabase/migrations/20261017120000_project_author_photo.sql
\i supabase/migrations/20261017120000_project_author_photo.sql

-- A photo object, written as the service role (as the app does).
SET ROLE service_role;
INSERT INTO storage.objects (bucket_id, name) VALUES ('author-photos', 'a1111111-1111-1111-1111-111111111111/0f0e0d0c-0b0a-4908-8706-050403020100.jpg');
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

CREATE FUNCTION upd(sql_set text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN try_as('authenticated', '11111111-1111-1111-1111-111111111111', format($q$ WITH u AS (UPDATE public.project_article_styles SET %s
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$, sql_set));
END; $$;

-- The guarantees the mutation control breaks.
CREATE FUNCTION run_guarantees(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE broken boolean := (ph = 'mutated'); r text;
BEGIN
  r := upd('author_box_photo_path = ''a1111111-1111-1111-1111-111111111111/dana-levi.jpg''');
  PERFORM chk(ph, 'a path with a name in it is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := upd('author_box_photo_path = ''a2222222-2222-2222-2222-222222222222/0f0e0d0c-0b0a-4908-8706-050403020100.jpg''');
  PERFORM chk(ph, 'a path under another project is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := upd('author_box_photo_path = ''a1111111-1111-1111-1111-111111111111/0f0e0d0c-0b0a-4908-8706-050403020100.gif''');
  PERFORM chk(ph, 'a path with another extension is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := upd('author_box_photo_media = ''[1]''::jsonb');
  PERFORM chk(ph, 'a site copy that is not an object is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := upd('author_box_image = ''photo''');
  PERFORM chk(ph, 'an unknown image choice is still refused -> ' || r, (r = 'denied:23514') <> broken);
  PERFORM chk(ph, 'the bucket is private, 2 MB, jpeg/png/webp only',
    (SELECT public = false AND file_size_limit = 2097152 AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'] FROM storage.buckets WHERE id = 'author-photos') <> broken);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'author-photos' $q$);
  PERFORM chk(ph, 'anon cannot see the photo object -> ' || r, (r = 'ok:0') <> broken);
  r := try_as('authenticated', '11111111-1111-1111-1111-111111111111', $q$ SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'author-photos' $q$);
  PERFORM chk(ph, 'even the owner, signed in, cannot read it directly (service role only) -> ' || r, (r = 'ok:0') <> broken);
  PERFORM chk(ph, 'no storage policy names the bucket',
    ((SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND (coalesce(qual, '') LIKE '%author-photos%' OR coalesce(with_check, '') LIKE '%author-photos%')) = 0) <> broken);
END; $$;

DO $$
DECLARE r text;
BEGIN
  PERFORM chk('after', 'existing rows: no photo, no copy, the image as it was',
    (SELECT bool_and(author_box_photo_path IS NULL AND author_box_photo_media IS NULL AND author_box_image = 'none') FROM public.project_article_styles));
  PERFORM chk('after', 'the switch, name, design, call-to-action and guidance are untouched',
    (SELECT author_box IS TRUE AND design = 'formatted' AND article_cta ->> 'heading' = 'keep me' AND writing_guidance ->> 'instructions' = 'keep me too'
     FROM public.project_article_styles WHERE project_id = 'a1111111-1111-1111-1111-111111111111'));
  r := upd('author_box_image = ''upload'', author_box_photo_path = ''a1111111-1111-1111-1111-111111111111/0f0e0d0c-0b0a-4908-8706-050403020100.jpg''');
  PERFORM chk('after', 'the owner sets upload with a well-formed path of their project -> ' || r, r = 'ok:1');
  r := upd('author_box_photo_media = ''{"site":"https://levi.example","path":"x","media_id":7,"url":"https://levi.example/wp-content/uploads/a.jpg"}''::jsonb');
  PERFORM chk('after', 'the owner records the site copy -> ' || r, r = 'ok:1');
  r := upd('author_box_image = ''none'', author_box_photo_path = NULL, author_box_photo_media = NULL');
  PERFORM chk('after', 'back to none clears both -> ' || r, r = 'ok:1');
  r := try_as('authenticated', '22222222-2222-2222-2222-222222222222', $q$ WITH u AS (UPDATE public.project_article_styles SET author_box_photo_path = NULL
    WHERE project_id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('after', 'another user cannot touch the owner''s photo pointer -> ' || r, r = 'ok:0');
  r := try_as('service_role', NULL, $q$ SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'author-photos' $q$);
  PERFORM chk('after', 'the service role sees the object -> ' || r, r = 'ok:1');
  PERFORM chk('after', 'the other bucket is untouched (still public)', (SELECT public FROM storage.buckets WHERE id = 'article-images'));
END $$;
SELECT run_guarantees('after');

-- MUTATION CONTROL: the CHECKs dropped, the bucket public with a public read policy.
ALTER TABLE public.project_article_styles
  DROP CONSTRAINT project_article_styles_author_box_photo_path,
  DROP CONSTRAINT project_article_styles_author_box_photo_media,
  DROP CONSTRAINT project_article_styles_author_box_image;
UPDATE storage.buckets SET public = true, file_size_limit = NULL WHERE id = 'author-photos';
CREATE POLICY author_photos_read ON storage.objects FOR SELECT TO public USING (bucket_id = 'author-photos');
SELECT run_guarantees('mutated');

-- Restored: the broken policy dropped (the migration creates none) and the migration again.
DROP POLICY author_photos_read ON storage.objects;
UPDATE public.project_article_styles SET author_box_image = 'none', author_box_photo_path = NULL, author_box_photo_media = NULL;
\i supabase/migrations/20261017120000_project_author_photo.sql
SELECT run_guarantees('restored');

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

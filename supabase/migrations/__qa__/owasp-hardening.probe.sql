-- ============================================================================
-- EXECUTED PROBE — 20260925000000_security_owasp_hardening.sql
--
-- Runs every attack TWICE against a disposable PostgreSQL cluster: once on the
-- schema as it stands in Production (policies copied verbatim from
-- pg_policies, view definitions from pg_get_viewdef, Supabase's default
-- table grants), and once after applying the migration file itself via \i.
-- Each attack must SUCCEED before (proving the probe reproduces the hole — a
-- guard that cannot fail tests nothing) and FAIL after. Legitimate owner and
-- admin operations must succeed in both phases (regression).
--
-- NOT run against Supabase or Production. No production data was read; the
-- rows below are fabricated here.
--
-- To re-run (initdb refuses root — use an unprivileged user):
--   initdb -D <dir> -A trust -U postgres && pg_ctl -D <dir> -o '-p 55452' start
--   psql -h 127.0.0.1 -p 55452 -U postgres -v ON_ERROR_STOP=1 \
--        -f supabase/migrations/__qa__/owasp-hardening.probe.sql      (from repo root)
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'user',
  billing_market_claimed_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text);
CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, client_id uuid REFERENCES public.clients(id), name text);
CREATE TABLE public.tracking_targets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, project_id uuid REFERENCES public.projects(id), keyword text, is_active boolean DEFAULT true);
CREATE TABLE public.scans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, project_id uuid);
CREATE TABLE public.scan_results (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scan_id uuid REFERENCES public.scans(id),
  tracking_target_id uuid REFERENCES public.tracking_targets(id), keyword text, engine_type text, found boolean,
  "position" int, previous_position int, change_value int, result_url text, result_title text, checked_at timestamptz DEFAULT now());

-- Functions as they exist in Production (pg_get_functiondef).
CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select exists (select 1 from public.profiles where id = user_id and role = 'admin'); $$;
CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ begin return new; end; $$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ begin new.updated_at = now(); return new; end; $$;
CREATE FUNCTION public.update_articles_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ begin return new; end; $$;
CREATE FUNCTION public.gsc_opp_decisions_lock_created_topic() RETURNS trigger LANGUAGE plpgsql AS $$ begin return new; end; $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Views verbatim (pg_get_viewdef), created WITHOUT security_invoker as in Production.
CREATE VIEW public.latest_rankings AS
 SELECT DISTINCT ON (sr.tracking_target_id) sr.tracking_target_id, sr.keyword, sr.engine_type, sr.found,
    sr."position" AS latest_position, sr.previous_position, sr.change_value, sr.result_url, sr.result_title,
    sr.checked_at AS last_checked_at, tt.project_id, tt.is_active
   FROM (scan_results sr JOIN tracking_targets tt ON ((tt.id = sr.tracking_target_id)))
  ORDER BY sr.tracking_target_id, sr.checked_at DESC;
CREATE VIEW public.project_ranking_summary AS
 SELECT tt.project_id, count(DISTINCT tt.id) AS total_targets,
    count(DISTINCT tt.id) FILTER (WHERE tt.is_active) AS active_targets,
    count(DISTINCT lr.tracking_target_id) FILTER (WHERE lr.found) AS found_count,
    round(avg(lr.latest_position) FILTER (WHERE (lr.latest_position IS NOT NULL))) AS avg_position,
    min(lr.latest_position) AS best_position, max(lr.latest_position) AS worst_position
   FROM (tracking_targets tt LEFT JOIN latest_rankings lr ON ((lr.tracking_target_id = tt.id)))
  GROUP BY tt.project_id;

-- Supabase's default grants on public.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- RLS + policies verbatim from pg_policies.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY clients_isolation_policy ON public.clients FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR (user_id = auth.uid())) WITH CHECK (is_admin(auth.uid()) OR (user_id = auth.uid()));
CREATE POLICY projects_isolation_policy ON public.projects FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR (user_id = auth.uid())) WITH CHECK (is_admin(auth.uid()) OR (user_id = auth.uid()));
CREATE POLICY tracking_targets_isolation_policy ON public.tracking_targets FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR (user_id = auth.uid())) WITH CHECK (is_admin(auth.uid()) OR (user_id = auth.uid()));
CREATE POLICY scans_isolation_policy ON public.scans FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR (user_id = auth.uid())) WITH CHECK (is_admin(auth.uid()) OR (user_id = auth.uid()));
CREATE POLICY scan_results_isolation_policy ON public.scan_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM scans WHERE scans.id = scan_results.scan_id AND (is_admin(auth.uid()) OR scans.user_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM scans WHERE scans.id = scan_results.scan_id AND (is_admin(auth.uid()) OR scans.user_id = auth.uid())));


-- storage.objects with the bucket policies verbatim from pg_policies.
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT CASE WHEN auth.uid() IS NULL THEN 'anon' ELSE 'authenticated' END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA storage, auth TO PUBLIC;
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
GRANT ALL ON storage.objects TO anon, authenticated, service_role;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated deletes" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'article-images');
CREATE POLICY "Allow authenticated updates" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'article-images');
CREATE POLICY "Allow authenticated uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'article-images');
CREATE POLICY "Allow public reads" ON storage.objects FOR SELECT USING (bucket_id = 'article-images');
CREATE POLICY "Give users authenticated access to folder qt2lnz_0" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'article-images') AND ((storage.foldername(name))[1] = 'private') AND (auth.role() = 'authenticated'));
CREATE POLICY "Give users authenticated access to folder qt2lnz_1" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'article-images') AND ((storage.foldername(name))[1] = 'private') AND (auth.role() = 'authenticated'));
CREATE POLICY "Give users authenticated access to folder qt2lnz_2" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'article-images') AND ((storage.foldername(name))[1] = 'private') AND (auth.role() = 'authenticated'));
CREATE POLICY "Give users authenticated access to folder qt2lnz_3" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'article-images') AND ((storage.foldername(name))[1] = 'private') AND (auth.role() = 'authenticated'));
CREATE POLICY article_images_public_read ON storage.objects FOR SELECT USING (bucket_id = 'article-images');
INSERT INTO storage.objects (bucket_id, name) VALUES ('article-images', 'article-1.png'), ('article-images', 'private/a.png');

-- Fixture: victim V, attacker A, admin M.
INSERT INTO public.profiles (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'user'),
  ('33333333-3333-3333-3333-333333333333', 'admin');
INSERT INTO public.clients VALUES ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'victim client');
INSERT INTO public.clients VALUES ('c2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'attacker client');
INSERT INTO public.projects VALUES ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'victim project');
INSERT INTO public.projects VALUES ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'attacker project');
INSERT INTO public.tracking_targets VALUES ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'victim secret keyword', true);
INSERT INTO public.scans VALUES ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111');
INSERT INTO public.scan_results (scan_id, tracking_target_id, keyword, found, "position", result_url)
  VALUES ('d1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'victim secret keyword', true, 3, 'https://victim.example/p');

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- Run `sql` as `role_name` with auth.uid() = `uid`, inside a subtransaction that
-- is always rolled back, so attacks never change the fixture between checks.
-- Returns 'ok:<rowcount or scalar>' or 'denied:<sqlstate>'.
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
  A text := '22222222-2222-2222-2222-222222222222';
  V text := '11111111-1111-1111-1111-111111111111';
  M text := '33333333-3333-3333-3333-333333333333';
  exploited boolean := (ph = 'before');
  r text;
BEGIN
  -- ATTACK 1: attacker promotes self to admin.
  r := try_as('authenticated', A, $q$ WITH u AS (UPDATE public.profiles SET role='admin' WHERE id = auth.uid() RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'attack: self-promote to admin -> ' || r, (r = 'ok:1') = exploited);
  -- ATTACK 1b: attacker resets the one-time billing-market claim.
  r := try_as('authenticated', A, $q$ WITH u AS (UPDATE public.profiles SET billing_market_claimed_at = null WHERE id = auth.uid() RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'attack: reset billing_market_claimed_at -> ' || r, (r = 'ok:1') = exploited);
  -- ATTACK 2: signed-out anon reads another tenant's rankings through the views.
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.latest_rankings $q$);
  PERFORM chk(ph, 'attack: anon reads latest_rankings -> ' || r, (r = 'ok:1') = exploited);
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.project_ranking_summary $q$);
  PERFORM chk(ph, 'attack: anon reads project_ranking_summary -> ' || r, (r = 'ok:1') = exploited);
  -- ATTACK 2b: signed-in attacker reads victim rows through the view.
  r := try_as('authenticated', A, $q$ SELECT count(*)::text FROM public.latest_rankings $q$);
  PERFORM chk(ph, 'attack: attacker reads victim latest_rankings -> ' || r, (r = 'ok:1') = exploited);
  -- ATTACK 3: attacker plants a keyword in the victim's project.
  r := try_as('authenticated', A, format($q$ WITH i AS (INSERT INTO public.tracking_targets (user_id, project_id, keyword) VALUES (%L, 'a1111111-1111-1111-1111-111111111111', 'planted') RETURNING 1) SELECT count(*)::text FROM i $q$, A));
  PERFORM chk(ph, 'attack: plant target in victim project -> ' || r, (r = 'ok:1') = exploited);
  -- ATTACK 3b: attacker attaches own project to the victim's client.
  r := try_as('authenticated', A, format($q$ WITH i AS (INSERT INTO public.projects (user_id, client_id, name) VALUES (%L, 'c1111111-1111-1111-1111-111111111111', 'x') RETURNING 1) SELECT count(*)::text FROM i $q$, A));
  PERFORM chk(ph, 'attack: project on victim client -> ' || r, (r = 'ok:1') = exploited);
  -- ATTACK 4: anon calls SECURITY DEFINER is_admin over RPC.
  r := try_as('anon', NULL, $q$ SELECT public.is_admin('33333333-3333-3333-3333-333333333333')::text $q$);
  PERFORM chk(ph, 'attack: anon probes is_admin -> ' || r, (r = 'ok:true') = exploited);

  -- ATTACK 5: a merchant deletes / overwrites / uploads public blog images.
  r := try_as('authenticated', A, $q$ WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'article-images' RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'attack: merchant deletes blog images -> ' || r, (r <> 'ok:0' AND r LIKE 'ok:%') = exploited);
  r := try_as('authenticated', A, $q$ WITH u AS (UPDATE storage.objects SET name = 'defaced.png' WHERE name = 'article-1.png' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'attack: merchant overwrites a blog image -> ' || r, (r = 'ok:1') = exploited);
  r := try_as('authenticated', A, $q$ WITH i AS (INSERT INTO storage.objects (bucket_id, name) VALUES ('article-images', 'phish.png') RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk(ph, 'attack: merchant uploads into the blog bucket -> ' || r, (r = 'ok:1') = exploited);
  -- REGRESSION: public read, admin write.
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM storage.objects WHERE name = 'article-1.png' $q$);
  PERFORM chk(ph, 'regress: anyone reads a public blog image -> ' || r, r = 'ok:1');
  r := try_as('authenticated', M, $q$ WITH i AS (INSERT INTO storage.objects (bucket_id, name) VALUES ('article-images', 'admin.png') RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk(ph, 'regress: admin uploads a blog image -> ' || r, r = 'ok:1');
  r := try_as('authenticated', M, $q$ WITH d AS (DELETE FROM storage.objects WHERE name = 'article-1.png' RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'regress: admin deletes a blog image -> ' || r, r = 'ok:1');

  -- REGRESSION (must hold in both phases).
  r := try_as('authenticated', V, $q$ SELECT role FROM public.profiles WHERE id = auth.uid() $q$);
  PERFORM chk(ph, 'regress: user reads own profile role -> ' || r, r = 'ok:user');
  r := try_as('authenticated', V, format($q$ WITH i AS (INSERT INTO public.tracking_targets (user_id, project_id, keyword) VALUES (%L, 'a1111111-1111-1111-1111-111111111111', 'own kw') RETURNING 1) SELECT count(*)::text FROM i $q$, V));
  PERFORM chk(ph, 'regress: owner adds keyword to own project -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, $q$ WITH u AS (UPDATE public.tracking_targets SET is_active = false WHERE id = 'b1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'regress: owner updates own keyword -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, format($q$ WITH i AS (INSERT INTO public.projects (user_id, client_id, name) VALUES (%L, 'c1111111-1111-1111-1111-111111111111', 'p2') RETURNING 1) SELECT count(*)::text FROM i $q$, V));
  PERFORM chk(ph, 'regress: owner creates project on own client -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, format($q$ WITH i AS (INSERT INTO public.projects (user_id, client_id, name) VALUES (%L, NULL, 'p3') RETURNING 1) SELECT count(*)::text FROM i $q$, V));
  PERFORM chk(ph, 'regress: owner creates project without client -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, $q$ WITH u AS (UPDATE public.projects SET name = 'renamed' WHERE id = 'a1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'regress: owner renames own project -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, $q$ SELECT count(*)::text FROM public.latest_rankings $q$);
  PERFORM chk(ph, 'regress: owner reads own latest_rankings -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, $q$ SELECT total_targets::text FROM public.project_ranking_summary $q$);
  PERFORM chk(ph, 'regress: owner reads own summary -> ' || r, r = 'ok:1');
  r := try_as('authenticated', M, format($q$ WITH i AS (INSERT INTO public.tracking_targets (user_id, project_id, keyword) VALUES (%L, 'a1111111-1111-1111-1111-111111111111', 'admin kw') RETURNING 1) SELECT count(*)::text FROM i $q$, M));
  PERFORM chk(ph, 'regress: admin still manages any project -> ' || r, r = 'ok:1');
  r := try_as('authenticated', M, $q$ SELECT count(*)::text FROM public.projects $q$);
  PERFORM chk(ph, 'regress: admin reads all projects -> ' || r, r = 'ok:2');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.profiles SET billing_market_claimed_at = now() WHERE id = '11111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'regress: service_role writes profiles (billing-market route) -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, $q$ SELECT public.is_admin(auth.uid())::text $q$);
  PERFORM chk(ph, 'regress: authenticated can evaluate is_admin -> ' || r, r = 'ok:false');
END; $$;

SELECT run_checks('before');
\i supabase/migrations/20260925000000_security_owasp_hardening.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20260925000000_security_owasp_hardening.sql
SELECT run_checks('after');

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase DESC, name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

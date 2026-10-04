-- ============================================================================
-- EXECUTED PROBE — 20261004000000_article_pool_monthly_share.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster carrying Supabase's roles and an article_pools
-- table with the owner isolation it has in production. Then:
--   'shape'       the column is nullable with no default, so every row that
--                 existed keeps NULL — the even split, today's behaviour.
--   'constraint'  a positive share is stored; zero and a negative are refused;
--                 clearing it back to NULL is always allowed.
--   'after'       the OWNER sets the share on their own pool; another user, a
--                 third user and anon read and write nothing; service_role can.
--   'mutated'     MUTATION CONTROL. The policy is replaced by a permissive one:
--                 every isolation check must now report the leak. A check that
--                 cannot fail tests nothing.
--   'restored'    the isolation put back and every check holds again, with the
--                 column and its constraint untouched.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/article-pool-monthly-share.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text);
CREATE TABLE public.article_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  cadence text NOT NULL DEFAULT 'weekly',
  interval_days integer,
  publish_time text,
  timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
  is_active boolean NOT NULL DEFAULT false,
  next_publish_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  publish_days smallint[]
);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_own ON public.projects FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY article_pools_own ON public.article_pools FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

INSERT INTO public.projects (id, user_id, name) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner site'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'other site');
INSERT INTO public.article_pools (id, user_id, project_id, name) VALUES
  ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'owner pool'),
  ('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'other pool');
\set QUIET off

\i supabase/migrations/20261004000000_article_pool_monthly_share.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261004000000_article_pool_monthly_share.sql

\set QUIET on
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
  V text := '11111111-1111-1111-1111-111111111111';  -- the owner
  A text := '22222222-2222-2222-2222-222222222222';  -- another account, with its own pool
  M text := '33333333-3333-3333-3333-333333333333';  -- a third user, with nothing
  broken boolean := (ph = 'mutated');
  r text;
  set_own text := $q$ WITH u AS (UPDATE public.article_pools SET monthly_share = 20
    WHERE id = 'b1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$;
  set_theirs text := $q$ WITH u AS (UPDATE public.article_pools SET monthly_share = 99
    WHERE id = 'b2222222-2222-2222-2222-222222222222' RETURNING 1) SELECT count(*)::text FROM u $q$;
  read_all text := $q$ SELECT count(*)::text FROM public.article_pools $q$;
BEGIN
  -- REGRESSION, every phase: the owner sets the share on their OWN website.
  r := try_as('authenticated', V, set_own);
  PERFORM chk(ph, 'the owner sets the share on their own website -> ' || r, r = 'ok:1');
  r := try_as('authenticated', V, read_all);
  PERFORM chk(ph, 'the owner sees their own pool and no other -> ' || r, r = (CASE WHEN broken THEN 'ok:2' ELSE 'ok:1' END));

  -- The owner must NOT be able to set the share on an account that is not theirs.
  r := try_as('authenticated', V, set_theirs);
  PERFORM chk(ph, 'the owner on another account''s website -> ' || r, (CASE WHEN broken THEN r = 'ok:1' ELSE r = 'ok:0' END));

  -- A user with nothing in the table reads nothing and writes nothing.
  r := try_as('authenticated', M, read_all);
  PERFORM chk(ph, 'a third user reads -> ' || r, r = (CASE WHEN broken THEN 'ok:2' ELSE 'ok:0' END));
  r := try_as('authenticated', M, set_theirs);
  PERFORM chk(ph, 'a third user writes another account''s share -> ' || r, (CASE WHEN broken THEN r = 'ok:1' ELSE r = 'ok:0' END));

  -- Anonymous: nothing, in every phase but the mutated one (where the
  -- permissive policy is granted to anon too, which is the leak).
  r := try_as('anon', NULL, read_all);
  PERFORM chk(ph, 'anon reads -> ' || r, (CASE WHEN broken THEN r = 'ok:2' ELSE r IN ('ok:0', 'denied:42501') END));

  -- service_role is the app's own key and bypasses RLS, in every phase.
  r := try_as('service_role', NULL, read_all);
  PERFORM chk(ph, 'service_role reads everything -> ' || r, r = 'ok:2');
END; $$;
\set QUIET off

\echo ''
\echo '=== shape: nullable, no default, so every row that existed keeps the even split ==='
SELECT data_type, is_nullable, coalesce(column_default, '(none)') AS column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'article_pools' AND column_name = 'monthly_share';

SELECT chk('shape', 'the column exists, as a nullable integer with no default', (
  SELECT count(*) = 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'article_pools' AND column_name = 'monthly_share'
    AND data_type = 'integer' AND is_nullable = 'YES' AND column_default IS NULL));
SELECT chk('shape', 'no existing row was given a share: NULL everywhere, which is the even split', (
  SELECT count(monthly_share) = 0 AND count(*) = 2 FROM public.article_pools));
SELECT chk('shape', 'the column carries the comment that says what NULL means', (
  SELECT col_description('public.article_pools'::regclass, (
    SELECT attnum FROM pg_attribute WHERE attrelid = 'public.article_pools'::regclass AND attname = 'monthly_share'
  )) LIKE '%even split%'));

\echo ''
\echo '=== constraint: a positive share is stored, zero and a negative refused ==='
DO $$
DECLARE bad int; stored boolean;
BEGIN
  UPDATE public.article_pools SET monthly_share = 12 WHERE id = 'b1111111-1111-1111-1111-111111111111';
  PERFORM chk('constraint', 'a positive share is stored', (
    SELECT monthly_share = 12 FROM public.article_pools WHERE id = 'b1111111-1111-1111-1111-111111111111'));
  FOREACH bad IN ARRAY ARRAY[0, -3] LOOP
    stored := true;
    BEGIN
      UPDATE public.article_pools SET monthly_share = bad WHERE id = 'b1111111-1111-1111-1111-111111111111';
    EXCEPTION WHEN check_violation THEN
      stored := false;
    END;
    PERFORM chk('constraint', 'a share of ' || bad || ' is refused by the check', NOT stored);
  END LOOP;
  PERFORM chk('constraint', 'the refused writes left the accepted value alone', (
    SELECT monthly_share = 12 FROM public.article_pools WHERE id = 'b1111111-1111-1111-1111-111111111111'));
  UPDATE public.article_pools SET monthly_share = NULL WHERE id = 'b1111111-1111-1111-1111-111111111111';
  PERFORM chk('constraint', 'clearing it back to the even split is always allowed', (
    SELECT monthly_share IS NULL FROM public.article_pools WHERE id = 'b1111111-1111-1111-1111-111111111111'));
END $$;

\echo ''
\echo '=== after: who may set a website''s share ==='
SELECT run_checks('after');

\echo ''
\echo '=== mutated: MUTATION CONTROL, a permissive policy must leak ==='
DROP POLICY article_pools_own ON public.article_pools;
CREATE POLICY article_pools_everyone ON public.article_pools FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
SELECT run_checks('mutated');

\echo ''
\echo '=== restored: the isolation put back, the column and its check untouched ==='
DROP POLICY article_pools_everyone ON public.article_pools;
CREATE POLICY article_pools_own ON public.article_pools FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
UPDATE public.article_pools SET monthly_share = NULL;
SELECT run_checks('restored');
SELECT chk('restored', 'the check is still exactly "NULL or positive"', (
  SELECT pg_get_constraintdef(oid) = 'CHECK (((monthly_share IS NULL) OR (monthly_share > 0)))'
  FROM pg_constraint WHERE conrelid = 'public.article_pools'::regclass AND conname = 'article_pools_monthly_share_positive'));

\echo ''
SELECT phase, name, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END AS result FROM results ORDER BY ctid;
\echo ''
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

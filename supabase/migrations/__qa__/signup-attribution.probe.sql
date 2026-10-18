-- ============================================================================
-- EXECUTED PROBE — 20261019000000_signup_attribution.sql
--
-- A disposable PostgreSQL cluster with Supabase's roles and default grants, a
-- stand-in auth.users, then the new migration, twice (idempotent).
--
--   'after'     the service role writes one row per account; a second row for
--               the same account is refused; the owner reads only their own
--               row; another user reads nothing; anon is denied; no role but
--               the service role may INSERT, UPDATE or DELETE; a value with
--               markup, an empty value and one over 200 characters are
--               refused; deleting the account deletes the row.
--   'mutated'   MUTATION CONTROL: the CHECK and the owner policy dropped;
--               every guarantee above that depends on them fails.
--   'restored'  the migration applied again over the broken state; all hold.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/signup-attribution.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

-- Stand-in for auth.users: only the column the foreign key needs.
CREATE TABLE auth.users (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON auth.users TO anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- Fixture: account V (the owner), account A (someone else), account D (deleted below).
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

\i supabase/migrations/20261019000000_signup_attribution.sql
\i supabase/migrations/20261019000000_signup_attribution.sql

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

-- One service-role insert, expressed as a single statement so try_as can run it.
CREATE FUNCTION ins(uid text, cols text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN try_as('service_role', NULL, format($q$ WITH i AS (INSERT INTO public.signup_attribution (user_id, %s)
    VALUES ('%s', %s) RETURNING 1) SELECT count(*)::text FROM i $q$,
    split_part(cols, '|', 1), uid, split_part(cols, '|', 2)));
END; $$;

-- The guarantees the mutation control breaks.
CREATE FUNCTION run_attr(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE broken boolean := (ph = 'mutated'); r text;
BEGIN
  r := ins('22222222-2222-2222-2222-222222222222', 'source|''<b>community</b>''');
  PERFORM chk(ph, 'a source with markup is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := ins('22222222-2222-2222-2222-222222222222', 'source|''''');
  PERFORM chk(ph, 'an empty source is refused (NULL is how it is left out) -> ' || r, (r = 'denied:23514') <> broken);
  r := ins('22222222-2222-2222-2222-222222222222', 'campaign|repeat(''a'', 201)');
  PERFORM chk(ph, 'a campaign over 200 characters is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := ins('22222222-2222-2222-2222-222222222222', 'referrer_host|''google.com/search?q=secret''');
  PERFORM chk(ph, 'a referrer host of 200 characters or less is accepted (the app sends the host alone) -> ' || r, r = 'ok:1');
  DELETE FROM public.signup_attribution WHERE user_id = '22222222-2222-2222-2222-222222222222';

  r := try_as('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$ SELECT count(*)::text FROM public.signup_attribution $q$);
  PERFORM chk(ph, 'the owner reads exactly their own row -> ' || r, (r = 'ok:1') <> broken);
  r := try_as('authenticated', '22222222-2222-2222-2222-222222222222',
    $q$ SELECT count(*)::text FROM public.signup_attribution $q$);
  PERFORM chk(ph, 'another account reads nothing -> ' || r, r = 'ok:0');
END; $$;

-- The row the sign-up writes, persisted (try_as always rolls back, so the
-- permission probes below cannot be the thing that creates it).
SET ROLE service_role;
INSERT INTO public.signup_attribution (user_id, source, medium, campaign, referrer_host, landing_path)
  VALUES ('11111111-1111-1111-1111-111111111111', 'community', 'social', 'fb-smb', 'facebook.com', '/free-check');
RESET ROLE;

DO $$
DECLARE r text;
BEGIN
  PERFORM chk('after', 'the service role wrote exactly one row',
    (SELECT count(*) FROM public.signup_attribution) = 1);
  r := ins('11111111-1111-1111-1111-111111111111', 'source|''google''');
  PERFORM chk('after', 'a second row for the same account is refused -> ' || r, r = 'denied:23505');
  r := ins('44444444-4444-4444-4444-444444444444', 'source|''google''');
  PERFORM chk('after', 'a row for an account that does not exist is refused -> ' || r, r = 'denied:23503');

  -- Only the service role writes: there is no INSERT/UPDATE/DELETE policy at all.
  r := try_as('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$ WITH i AS (INSERT INTO public.signup_attribution (user_id, source)
      VALUES ('33333333-3333-3333-3333-333333333333', 'forged') RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk('after', 'a signed-in account cannot insert a row -> ' || r, r LIKE 'denied:%');
  r := try_as('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$ WITH u AS (UPDATE public.signup_attribution SET source = 'forged' RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk('after', 'a signed-in account cannot rewrite its own source -> ' || r, r LIKE 'denied:%');
  r := try_as('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$ WITH d AS (DELETE FROM public.signup_attribution RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk('after', 'a signed-in account cannot delete its row -> ' || r, r LIKE 'denied:%');
  r := try_as('anon', NULL, $q$ SELECT count(*)::text FROM public.signup_attribution $q$);
  PERFORM chk('after', 'anon cannot read the table at all -> ' || r, r LIKE 'denied:%');

  PERFORM chk('after', 'the row holds what was written',
    (SELECT source = 'community' AND medium = 'social' AND campaign = 'fb-smb'
        AND referrer_host = 'facebook.com' AND landing_path = '/free-check' AND self_reported IS NULL
     FROM public.signup_attribution WHERE user_id = '11111111-1111-1111-1111-111111111111'));
END $$;
SELECT run_attr('after');

-- Deleting the account takes its attribution with it.
DO $$
DECLARE r text;
BEGIN
  PERFORM try_as('service_role', NULL, $q$ WITH i AS (INSERT INTO public.signup_attribution (user_id, source)
    VALUES ('33333333-3333-3333-3333-333333333333', 'wordpress') RETURNING 1) SELECT count(*)::text FROM i $q$);
  DELETE FROM auth.users WHERE id = '33333333-3333-3333-3333-333333333333';
  PERFORM chk('after', 'deleting the account deletes its attribution row',
    (SELECT count(*) FROM public.signup_attribution WHERE user_id = '33333333-3333-3333-3333-333333333333') = 0);
END $$;

-- MUTATION CONTROL: the CHECK and the owner-read policy dropped.
ALTER TABLE public.signup_attribution DROP CONSTRAINT signup_attribution_text_shape;
DROP POLICY signup_attribution_owner_read ON public.signup_attribution;
SELECT run_attr('mutated');

-- Restored: the migration again over the broken state.
DELETE FROM public.signup_attribution WHERE user_id <> '11111111-1111-1111-1111-111111111111';
UPDATE public.signup_attribution SET source = 'community', medium = 'social', campaign = 'fb-smb',
  referrer_host = 'facebook.com', landing_path = '/free-check';
\i supabase/migrations/20261019000000_signup_attribution.sql
SELECT run_attr('restored');

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

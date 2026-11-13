-- ============================================================================
-- EXECUTED PROBE — 20261113020000_signup_country.sql
--
-- A disposable PostgreSQL cluster with Supabase's roles, a stand-in auth.users,
-- the table's own migration, then the new column's migration, twice
-- (idempotent).
--
--   'after'     a two-letter upper-case code is accepted; NULL is accepted
--               (the CDN could not place the request); lower case, one letter,
--               three letters, a digit pair, a code with a space and markup are
--               all refused; the attribution columns keep their own 200-
--               character shape, so neither constraint has swallowed the other;
--               the owner still reads only their own row and a signed-in
--               account still cannot write one.
--   'mutated'   MUTATION CONTROL: the country CHECK dropped; every refusal
--               above stops refusing, and the 200-character shape still holds,
--               which is what proves the two constraints are independent.
--   'restored'  the migration applied again over the broken state; all hold.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/signup-country.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

CREATE TABLE auth.users (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON auth.users TO anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

\i supabase/migrations/20261019000000_signup_attribution.sql
\i supabase/migrations/20261113020000_signup_country.sql
\i supabase/migrations/20261113020000_signup_country.sql

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

-- One service-role insert of a country value, as a single statement.
CREATE FUNCTION ins_country(uid text, value text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN try_as('service_role', NULL, format($q$ WITH i AS (INSERT INTO public.signup_attribution (user_id, signup_country)
    VALUES ('%s', %s) RETURNING 1) SELECT count(*)::text FROM i $q$, uid, value));
END; $$;

CREATE FUNCTION run_country(ph text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE broken boolean := (ph = 'mutated'); r text; u text := '22222222-2222-2222-2222-222222222222';
BEGIN
  -- Accepted whatever the phase: a real code, and the absence of one.
  r := ins_country(u, '''KR''');
  PERFORM chk(ph, 'KR is accepted -> ' || r, r = 'ok:1');
  r := ins_country(u, '''IL''');
  PERFORM chk(ph, 'IL is accepted -> ' || r, r = 'ok:1');
  r := ins_country(u, 'NULL');
  PERFORM chk(ph, 'NULL is accepted: the CDN could not place the request -> ' || r, r = 'ok:1');

  -- Refused by the constraint, so each of these stops being refused when it is dropped.
  r := ins_country(u, '''kr''');
  PERFORM chk(ph, 'lower case is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := ins_country(u, '''K''');
  PERFORM chk(ph, 'one letter is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := ins_country(u, '''KOR''');
  PERFORM chk(ph, 'three letters are refused -> ' || r, (r = 'denied:23514') <> broken);
  r := ins_country(u, '''82''');
  PERFORM chk(ph, 'a digit pair is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := ins_country(u, '''K R''');
  PERFORM chk(ph, 'a code with a space is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := ins_country(u, '''<b''');
  PERFORM chk(ph, 'markup is refused -> ' || r, (r = 'denied:23514') <> broken);
  r := ins_country(u, '''''');
  PERFORM chk(ph, 'an empty code is refused (NULL is how it is left out) -> ' || r, (r = 'denied:23514') <> broken);

  -- The attribution shape is a SEPARATE constraint and is untouched by the mutation.
  r := try_as('service_role', NULL, format($q$ WITH i AS (INSERT INTO public.signup_attribution (user_id, source)
    VALUES ('%s', '<b>community</b>') RETURNING 1) SELECT count(*)::text FROM i $q$, u));
  PERFORM chk(ph, 'a source with markup is still refused by its own constraint -> ' || r, r = 'denied:23514');

  -- RLS is unchanged by this migration.
  r := try_as('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$ SELECT count(*)::text FROM public.signup_attribution $q$);
  PERFORM chk(ph, 'the owner still reads exactly their own row -> ' || r, r = 'ok:1');
  r := try_as('authenticated', '22222222-2222-2222-2222-222222222222',
    $q$ WITH u2 AS (UPDATE public.signup_attribution SET signup_country = 'IL' RETURNING 1) SELECT count(*)::text FROM u2 $q$);
  PERFORM chk(ph, 'a signed-in account cannot write the country -> ' || r, r LIKE 'denied:%');
END; $$;

-- The owner's row, persisted (try_as always rolls back).
SET ROLE service_role;
INSERT INTO public.signup_attribution (user_id, source, signup_country)
  VALUES ('11111111-1111-1111-1111-111111111111', 'community', 'KR');
RESET ROLE;

DO $$
BEGIN
  PERFORM chk('after', 'the column exists and holds the code',
    (SELECT signup_country FROM public.signup_attribution
      WHERE user_id = '11111111-1111-1111-1111-111111111111') = 'KR');
  PERFORM chk('after', 'the column is nullable (every pre-existing row keeps NULL)',
    (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'signup_attribution'
        AND column_name = 'signup_country') = 'YES');
  PERFORM chk('after', 'the column carries its comment',
    (SELECT col_description('public.signup_attribution'::regclass,
      (SELECT ordinal_position FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'signup_attribution'
          AND column_name = 'signup_country')::int)) LIKE 'ISO 3166-1 alpha-2%');
  PERFORM run_country('after');
END; $$;

-- MUTATION CONTROL: drop the country CHECK alone.
ALTER TABLE public.signup_attribution DROP CONSTRAINT signup_attribution_country_shape;
DO $$ BEGIN PERFORM run_country('mutated'); END; $$;

-- Restored by applying the migration again over the broken state.
\i supabase/migrations/20261113020000_signup_country.sql
DO $$ BEGIN PERFORM run_country('restored'); END; $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

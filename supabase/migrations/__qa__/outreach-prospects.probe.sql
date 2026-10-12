-- ============================================================================
-- EXECUTED PROBE — 20261012170000_outreach_prospects.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster carrying Supabase's roles and the default
-- grants every NEW table in public gets. Then:
--
--   'after'     the server builds the list, sends, records and deletes a row
--               on a deletion request; no browser role reads an address or a
--               token at all; the guard refuses changing the unsubscribe token,
--               the key, or a send that already happened, and refuses putting a
--               redacted address back.
--   'mutated'   MUTATION CONTROL. Supabase's default grants are put back, a
--               permissive policy is added and the guard trigger is dropped:
--               every isolation and guard check must now report the hole. A
--               check that cannot fail tests nothing.
--   'restored'  the migration file is applied again over the broken state and
--               every check holds again.
--
-- Then the constraints that are the published privacy text in table form: the
-- country, the platform, two named sources, a finding that carries its date,
-- the token's shape, and one row per address.
--
-- NOT run against Supabase or Production; every address and business below is
-- fabricated.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/outreach-prospects.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

\i supabase/migrations/20261012170000_outreach_prospects.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261012170000_outreach_prospects.sql

-- Fixture: one prospect already written to once, one already redacted.
SET ROLE service_role;
INSERT INTO public.outreach_prospects
  (id, email, email_hash, unsub_token, company, site_host, platform, postal_address,
   source_site, source_second, status, finding, finding_checked, first_sent_at) VALUES
  ('e1111111-1111-1111-1111-111111111111', 'owner@store.example',
   encode(sha256('owner@store.example'::bytea), 'hex'), repeat('a', 48),
   'Store Example LLC', 'store.example', 'shopify', '1 Main St, Nashville, TN 37201',
   'https://store.example/contact', 'Made in Example directory', 'sent_first',
   'no meta description on the home page', '2026-10-12T09:00:00Z', '2026-10-12T13:00:00Z');
INSERT INTO public.outreach_prospects
  (id, email, email_hash, unsub_token, company, site_host, platform, postal_address,
   source_site, source_second, status, redacted_at) VALUES
  ('e2222222-2222-2222-2222-222222222222', NULL,
   encode(sha256('gone@store.example'::bytea), 'hex'), repeat('b', 48),
   'Gone Example LLC', 'gone.example', 'wordpress', '2 Main St, Memphis, TN 38103',
   'https://gone.example/about', 'Made in Example directory', 'opted_out', '2026-10-11T10:00:00Z');
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
  broken boolean := (ph = 'mutated');
  r text;
  lookup text := $q$ SELECT email FROM public.outreach_prospects WHERE unsub_token = repeat('a', 48) $q$;
  due text := $q$ SELECT count(*)::text FROM public.outreach_prospects WHERE status = 'new' $q$;
  upd text := $q$ WITH u AS (UPDATE public.outreach_prospects SET %s
    WHERE id = 'e1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$;
BEGIN
  -- REGRESSION, every phase: the route's own lookup and the sender's own query work.
  r := try_as('service_role', NULL, lookup);
  PERFORM chk(ph, 'the route finds the address a token names -> ' || r, r = 'ok:owner@store.example');
  r := try_as('service_role', NULL, due);
  PERFORM chk(ph, 'the sender reads who is due a message -> ' || r, r LIKE 'ok:%');

  -- ISOLATION: addresses and tokens are not a user's own data.
  r := try_as('authenticated', V, lookup);
  PERFORM chk(ph, 'a signed-in user reads a prospect address -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('anon', NULL, lookup);
  PERFORM chk(ph, 'anon reads a prospect address -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('anon', NULL, $q$ SELECT unsub_token FROM public.outreach_prospects LIMIT 1 $q$);
  PERFORM chk(ph, 'anon reads an unsubscribe token -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('authenticated', V, $q$ WITH i AS (INSERT INTO public.outreach_prospects
      (email, email_hash, company, site_host, platform, postal_address, source_site, source_second)
      VALUES ('x@store.example', encode(sha256('x@store.example'::bytea), 'hex'), 'X', 'x.example',
              'shopify', '3 Main St, TN', 'https://x.example', 'directory') RETURNING 1)
      SELECT count(*)::text FROM i $q$);
  PERFORM chk(ph, 'a signed-in user adds a prospect -> ' || r, (r LIKE 'denied:%') <> broken);

  -- THE GUARD: a link in a message already sent must keep working.
  r := try_as('service_role', NULL, format(upd, $s$unsub_token = repeat('c', 48)$s$));
  PERFORM chk(ph, 'the server changes an unsubscribe token -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('service_role', NULL, format(upd, $s$email_hash = encode(sha256('other@store.example'::bytea), 'hex')$s$));
  PERFORM chk(ph, 'the server repoints a row at another address -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('service_role', NULL, format(upd, $s$first_sent_at = '2026-01-01T00:00:00Z'$s$));
  PERFORM chk(ph, 'the server rewrites a send that happened -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.outreach_prospects
      SET email = 'gone@store.example', redacted_at = NULL WHERE id = 'e2222222-2222-2222-2222-222222222222'
      RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'the server puts a redacted address back -> ' || r, (r LIKE 'denied:%') <> broken);

  -- REGRESSION, every phase: the server may still record a second send and a reply.
  r := try_as('service_role', NULL, format(upd, $s$status = 'sent_second', second_sent_at = now()$s$));
  PERFORM chk(ph, 'the server records the second message -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, format(upd, $s$status = 'replied', replied_at = now()$s$));
  PERFORM chk(ph, 'the server records a reply -> ' || r, r = 'ok:1');

  -- A DELETION REQUEST DELETES THE ROW. This is the opposite of
  -- email_suppressions, where nothing is ever deleted.
  r := try_as('service_role', NULL, $q$ WITH d AS (DELETE FROM public.outreach_prospects
      WHERE id = 'e2222222-2222-2222-2222-222222222222' RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'the server deletes a prospect on a deletion request -> ' || r, r = 'ok:1');
  r := try_as('anon', NULL, $q$ WITH d AS (DELETE FROM public.outreach_prospects RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'anon deletes prospects -> ' || r, (r LIKE 'denied:%') <> broken);

  PERFORM chk(ph, 'RLS is enabled',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.outreach_prospects'::regclass));
  PERFORM chk(ph, 'no browser role holds any privilege on the table',
    (SELECT bool_and(NOT has_table_privilege(g, 'public.outreach_prospects', 'SELECT')
                 AND NOT has_table_privilege(g, 'public.outreach_prospects', 'INSERT'))
       FROM unnest(ARRAY['anon','authenticated']) AS g) <> broken);
  PERFORM chk(ph, 'every row carries a token no one else has',
    (SELECT count(DISTINCT unsub_token) = count(*) FROM public.outreach_prospects));
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: Supabase's default grants back, a permissive policy, no guard.
GRANT ALL ON TABLE public.outreach_prospects TO anon, authenticated, service_role;
CREATE POLICY outreach_prospects_open ON public.outreach_prospects FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER outreach_prospects_guard ON public.outreach_prospects;
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the broken state, repairs it.
DROP POLICY outreach_prospects_open ON public.outreach_prospects;
\i supabase/migrations/20261012170000_outreach_prospects.sql
SELECT run_checks('restored');

-- Constraints: the published privacy text, in table form.
DO $$
DECLARE r text;
  g text := $q$ INSERT INTO public.outreach_prospects
    (email, email_hash, company, site_host, platform, country, postal_address, source_site, source_second, finding, finding_checked)
    VALUES (%L, %L, 'Fresh LLC', %L, %L, %L, '9 Main St, TN', %L, %L, %L, %L) RETURNING 'inserted' $q$;
  h text := encode(sha256('fresh@store.example'::bytea), 'hex');
BEGIN
  r := try_as('service_role', NULL, format(g, 'fresh@store.example', h, 'fresh.example', 'shopify', 'IL',
    'https://fresh.example', 'directory', NULL, NULL));
  PERFORM chk('constraints', 'a country other than the United States is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, 'fresh@store.example', h, 'fresh.example', 'squarespace', 'US',
    'https://fresh.example', 'directory', NULL, NULL));
  PERFORM chk('constraints', 'a platform the product cannot act on is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.outreach_prospects
    (email, email_hash, company, site_host, platform, postal_address, source_site)
    VALUES ('fresh@store.example', encode(sha256('fresh@store.example'::bytea), 'hex'), 'Fresh LLC',
            'fresh.example', 'shopify', '9 Main St, TN', 'https://fresh.example') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a row naming only one source is rejected -> ' || r, r = 'denied:23502');
  r := try_as('service_role', NULL, format(g, 'fresh@store.example', h, 'fresh.example', 'shopify', 'US',
    'https://fresh.example', 'directory', 'no meta description', NULL));
  PERFORM chk('constraints', 'a finding with no date behind it is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, 'Fresh@Store.example', h, 'fresh.example', 'shopify', 'US',
    'https://fresh.example', 'directory', NULL, NULL));
  PERFORM chk('constraints', 'an address that is not normalized is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, 'fresh@store.example', h, 'https://fresh.example/x', 'shopify', 'US',
    'https://fresh.example', 'directory', NULL, NULL));
  PERFORM chk('constraints', 'a host that is really a URL is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.outreach_prospects
    (email, email_hash, unsub_token, company, site_host, platform, postal_address, source_site, source_second)
    VALUES ('fresh@store.example', encode(sha256('fresh@store.example'::bytea), 'hex'), 'short', 'Fresh LLC',
            'fresh.example', 'shopify', '9 Main St, TN', 'https://fresh.example', 'directory') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a guessable short token is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, 'fresh@store.example', h, 'fresh.example', 'wordpress', 'US',
    'https://fresh.example', 'Made in Example directory', 'no meta description', '2026-10-12T09:00:00Z'));
  PERFORM chk('constraints', 'a well-formed prospect is accepted -> ' || r, r = 'ok:inserted');
END $$;

-- The token is random, so two rows inserted the same way do not share one.
INSERT INTO public.outreach_prospects
  (email, email_hash, company, site_host, platform, postal_address, source_site, source_second) VALUES
  ('a@store.example', encode(sha256('a@store.example'::bytea), 'hex'), 'A LLC', 'a.example', 'shopify',
   '4 Main St, TN', 'https://a.example', 'directory'),
  ('b@store.example', encode(sha256('b@store.example'::bytea), 'hex'), 'B LLC', 'b.example', 'wordpress',
   '5 Main St, TN', 'https://b.example', 'directory');
SELECT chk('constraints', 'two new rows get different tokens, 64 hex characters each',
  (SELECT count(DISTINCT unsub_token) = 2 AND bool_and(unsub_token ~ '^[0-9a-f]{64}$')
     FROM public.outreach_prospects WHERE site_host IN ('a.example', 'b.example')));

-- One row per address.
DO $$
DECLARE r text;
BEGIN
  r := try_as('service_role', NULL, $q$ INSERT INTO public.outreach_prospects
    (email, email_hash, company, site_host, platform, postal_address, source_site, source_second)
    VALUES ('a@store.example', encode(sha256('a@store.example'::bytea), 'hex'), 'A LLC again', 'a2.example',
            'shopify', '6 Main St, TN', 'https://a2.example', 'directory') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'the same address twice is rejected -> ' || r, r = 'denied:23505');
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

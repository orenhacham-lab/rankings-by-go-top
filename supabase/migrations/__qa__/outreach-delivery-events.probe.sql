-- ============================================================================
-- EXECUTED PROBE — 20261016150000_outreach_delivery_events.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster carrying Supabase's roles and the default
-- grants every NEW table in public gets. Then:
--
--   'after'     the server records a bounce and reads the stop rules' own
--               query; no browser role reads or writes the table at all.
--   'mutated'   MUTATION CONTROL. Supabase's default grants are put back and a
--               permissive policy is added: every isolation check must now
--               report the hole. A check that cannot fail tests nothing.
--   'restored'  the migration file is applied again over the broken state and
--               every check holds again.
--
-- Then the constraints that keep the table honest: only the three kinds exist,
-- a hash is a hash, an event with no address can never be counted as ours, and
-- the detail column cannot grow into a copy of the provider's bounce text.
--
-- NOT run against Supabase or Production; every address below is fabricated.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/outreach-delivery-events.probe.sql
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

\i supabase/migrations/20261016150000_outreach_delivery_events.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261016150000_outreach_delivery_events.sql

-- Fixture: one attributed hard bounce, and one MAILER-DAEMON report that was
-- about somebody else's broken forwarder and must never count as ours.
SET ROLE service_role;
INSERT INTO public.outreach_delivery_events (email_hash, kind, attributed, detail, occurred_at) VALUES
  (encode(sha256('dead@store.example'::bytea), 'hex'), 'hard_bounce', true, 'dsn 5.1.1', '2026-10-16T13:00:00Z'),
  (encode(sha256('forwarded@store.example'::bytea), 'hex'), 'hard_bounce', false, 'unmatched recipient', '2026-10-16T13:05:00Z');
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
  -- The stop rules' own query: attributed, uncleared, newest first.
  stop_query text := $q$ SELECT count(*)::text FROM public.outreach_delivery_events
    WHERE attributed AND cleared_at IS NULL AND kind = 'hard_bounce' $q$;
  record_one text := $q$ WITH i AS (INSERT INTO public.outreach_delivery_events
    (email_hash, kind, attributed, detail)
    VALUES (encode(sha256('new@store.example'::bytea), 'hex'), 'soft_bounce', true, 'dsn 4.2.2')
    RETURNING 1) SELECT count(*)::text FROM i $q$;
BEGIN
  -- REGRESSION, every phase: the inbound route records, the sender counts, and
  -- a human clears a stop.
  r := try_as('service_role', NULL, record_one);
  PERFORM chk(ph, 'the inbound route records a bounce -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, stop_query);
  PERFORM chk(ph, 'the sender counts attributed hard bounces -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.outreach_delivery_events
      SET cleared_at = now() WHERE attributed AND cleared_at IS NULL RETURNING 1)
      SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'a human clears a stop -> ' || r, r LIKE 'ok:%');

  -- ISOLATION: a bounce says who we wrote to, so no browser role touches it.
  r := try_as('anon', NULL, $q$ SELECT email_hash FROM public.outreach_delivery_events LIMIT 1 $q$);
  PERFORM chk(ph, 'anon reads a bounce -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('authenticated', V, $q$ SELECT email_hash FROM public.outreach_delivery_events LIMIT 1 $q$);
  PERFORM chk(ph, 'a signed-in user reads a bounce -> ' || r, (r = 'denied:42501') <> broken);
  -- The one that would be worth an attacker's time: silencing the channel's
  -- own brakes, or clearing them.
  r := try_as('anon', NULL, $q$ WITH i AS (INSERT INTO public.outreach_delivery_events (kind)
      VALUES ('complaint') RETURNING 1) SELECT count(*)::text FROM i $q$);
  PERFORM chk(ph, 'anon invents a complaint -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, $q$ WITH u AS (UPDATE public.outreach_delivery_events
      SET cleared_at = now() RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'a signed-in user clears the brakes -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, $q$ WITH d AS (DELETE FROM public.outreach_delivery_events RETURNING 1)
      SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'anon deletes the bounce history -> ' || r, (r LIKE 'denied:%') <> broken);

  PERFORM chk(ph, 'RLS is enabled',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.outreach_delivery_events'::regclass));
  PERFORM chk(ph, 'no browser role holds any privilege on the table',
    (SELECT bool_and(NOT has_table_privilege(g, 'public.outreach_delivery_events', 'SELECT')
                 AND NOT has_table_privilege(g, 'public.outreach_delivery_events', 'INSERT'))
       FROM unnest(ARRAY['anon','authenticated']) AS g) <> broken);
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: Supabase's default grants back, and a permissive policy.
GRANT ALL ON TABLE public.outreach_delivery_events TO anon, authenticated, service_role;
CREATE POLICY outreach_delivery_events_open ON public.outreach_delivery_events FOR ALL USING (true) WITH CHECK (true);
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the broken state, repairs it.
DROP POLICY outreach_delivery_events_open ON public.outreach_delivery_events;
\i supabase/migrations/20261016150000_outreach_delivery_events.sql
SELECT run_checks('restored');

-- The constraints.
DO $$
DECLARE r text;
  ins text := $q$ INSERT INTO public.outreach_delivery_events (email_hash, kind, attributed, detail)
    VALUES (%L, %L, %L, %L) RETURNING 'inserted' $q$;
  h text := encode(sha256('c@store.example'::bytea), 'hex');
BEGIN
  r := try_as('service_role', NULL, format(ins, h, 'bounced', false, NULL));
  PERFORM chk('constraints', 'a kind we do not classify is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(ins, 'not-a-hash', 'hard_bounce', false, NULL));
  PERFORM chk('constraints', 'a hash that is not one is rejected -> ' || r, r = 'denied:23514');
  -- The db-toolco lesson in constraint form: an event with no address behind it
  -- cannot be counted as a failure we caused.
  r := try_as('service_role', NULL, format(ins, NULL, 'hard_bounce', true, 'no recipient'));
  PERFORM chk('constraints', 'an unattributable event counted as ours is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(ins, NULL, 'hard_bounce', false, 'no recipient'));
  PERFORM chk('constraints', 'an unattributable event recorded as not ours is accepted -> ' || r, r = 'ok:inserted');
  r := try_as('service_role', NULL, format(ins, h, 'complaint', true, repeat('x', 201)));
  PERFORM chk('constraints', 'a detail long enough to hold the bounce text is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(ins, h, 'complaint', true, 'feedback-report abuse'));
  PERFORM chk('constraints', 'a well-formed complaint is accepted -> ' || r, r = 'ok:inserted');
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

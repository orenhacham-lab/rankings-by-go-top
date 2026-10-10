-- ============================================================================
-- EXECUTED PROBE — 20261009180000_email_suppressions.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster carrying Supabase's roles and the default
-- grants every NEW table in public gets. Then:
--
--   'after'     the server reads the gate, adds a suppression and redacts a
--               plaintext; no browser role reads or writes the list at all; no
--               role deletes or truncates; the guard refuses changing the key
--               or the time, restoring a redacted plaintext, and undoing a
--               redaction.
--   'mutated'   MUTATION CONTROL. Supabase's default grants are put back, a
--               permissive policy is added and the guard trigger is dropped:
--               every isolation and guard check must now report the hole. A
--               check that cannot fail tests nothing.
--   'restored'  the migration file is applied again over the broken state and
--               every check holds again.
--
-- Then the constraints: the hash shape, a plaintext that is not normalized,
-- redaction and NULL plaintext as one fact, the closed source and channel
-- lists, the note's length, and one row per address.
--
-- NOT run against Supabase or Production; every address below is fabricated.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/email-suppressions.probe.sql
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

\i supabase/migrations/20261009180000_email_suppressions.sql
-- Idempotency: applying twice must not error.
\i supabase/migrations/20261009180000_email_suppressions.sql

-- Fixture. The hashes are sha256() of the address, as the helper computes them.
SET ROLE service_role;
INSERT INTO public.email_suppressions (id, email_hash, email, source, channel, suppressed_at) VALUES
  ('d1111111-1111-1111-1111-111111111111', encode(sha256('out@shop.example'::bytea), 'hex'),
   'out@shop.example', 'unsubscribe_link', 'outbound_prospect', '2026-10-01T10:00:00Z');
-- Already redacted on a deletion request: the plaintext is gone, the key remains.
INSERT INTO public.email_suppressions (id, email_hash, email, source, channel, suppressed_at, redacted_at) VALUES
  ('d2222222-2222-2222-2222-222222222222', encode(sha256('gone@shop.example'::bytea), 'hex'),
   NULL, 'deletion_request', 'outbound_prospect', '2026-10-02T10:00:00Z', '2026-10-02T10:00:00Z');
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
  gate text := $q$ SELECT count(*)::text FROM public.email_suppressions
    WHERE email_hash = encode(sha256('out@shop.example'::bytea), 'hex') $q$;
  ins text := $q$ WITH i AS (INSERT INTO public.email_suppressions (email_hash, email, source, channel)
    VALUES (encode(sha256('new@shop.example'::bytea), 'hex'), 'new@shop.example', 'manual', 'marketing')
    RETURNING 1) SELECT count(*)::text FROM i $q$;
  upd text := $q$ WITH u AS (UPDATE public.email_suppressions SET %s
    WHERE id = 'd1111111-1111-1111-1111-111111111111' RETURNING 1) SELECT count(*)::text FROM u $q$;
BEGIN
  -- REGRESSION, every phase: the server's gate read works.
  r := try_as('service_role', NULL, gate);
  PERFORM chk(ph, 'the server finds a suppressed address -> ' || r, r = 'ok:1');

  -- ISOLATION: this is not a user's own data. No browser role reads it, ever.
  r := try_as('authenticated', V, gate);
  PERFORM chk(ph, 'a signed-in user reads the list -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('anon', NULL, gate);
  PERFORM chk(ph, 'anon reads the list -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('authenticated', V, $q$ SELECT email FROM public.email_suppressions LIMIT 1 $q$);
  PERFORM chk(ph, 'a signed-in user reads a suppressed address -> ' || r, (r = 'denied:42501') <> broken);

  -- ISOLATION: no browser role writes.
  r := try_as('authenticated', V, ins);
  PERFORM chk(ph, 'a signed-in user adds a suppression -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('anon', NULL, ins);
  PERFORM chk(ph, 'anon adds a suppression -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('authenticated', V, format(upd, $s$email = NULL, redacted_at = now()$s$));
  PERFORM chk(ph, 'a signed-in user redacts a row -> ' || r, (r LIKE 'denied:%') <> broken);

  -- A SUPPRESSION IS NEVER LIFTED, not even by the server.
  r := try_as('service_role', NULL, $q$ WITH d AS (DELETE FROM public.email_suppressions RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'the server deletes a suppression -> ' || r, (r LIKE 'denied:%') <> broken);
  -- The guard's own error code, not any refusal: without the trigger a TRUNCATE
  -- goes through and only fails later, on having no result to return (42601).
  r := try_as('service_role', NULL, $q$ TRUNCATE public.email_suppressions $q$);
  PERFORM chk(ph, 'the server truncates the list -> ' || r, (r = 'denied:42501') <> broken);
  r := try_as('postgres', NULL, $q$ WITH d AS (DELETE FROM public.email_suppressions RETURNING 1) SELECT count(*)::text FROM d $q$);
  PERFORM chk(ph, 'even the table owner deletes a suppression -> ' || r, (r = 'denied:42501') <> broken);

  -- THE GUARD: the key and the time are fixed; a redaction is one-way and final.
  r := try_as('service_role', NULL, format(upd, $s$email_hash = encode(sha256('other@shop.example'::bytea), 'hex')$s$));
  PERFORM chk(ph, 'the server repoints a row at another address -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('service_role', NULL, format(upd, $s$suppressed_at = '2026-01-01T00:00:00Z'$s$));
  PERFORM chk(ph, 'the server moves the time of a suppression -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.email_suppressions
      SET email = 'gone@shop.example', redacted_at = NULL WHERE id = 'd2222222-2222-2222-2222-222222222222'
      RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'the server puts a redacted address back -> ' || r, (r LIKE 'denied:%') <> broken);
  r := try_as('service_role', NULL, $q$ WITH u AS (UPDATE public.email_suppressions
      SET redacted_at = '2026-10-05T10:00:00Z' WHERE id = 'd2222222-2222-2222-2222-222222222222'
      RETURNING 1) SELECT count(*)::text FROM u $q$);
  PERFORM chk(ph, 'the server moves the redaction time -> ' || r, (r LIKE 'denied:%') <> broken);

  -- REGRESSION, every phase: the server may still add and redact.
  r := try_as('service_role', NULL, ins);
  PERFORM chk(ph, 'the server adds a suppression -> ' || r, r = 'ok:1');
  r := try_as('service_role', NULL, format(upd, $s$email = NULL, redacted_at = now()$s$));
  PERFORM chk(ph, 'the server redacts on a deletion request -> ' || r, r = 'ok:1');
  -- The gate still answers after a redaction: the hash is what it reads.
  PERFORM chk(ph, 'a redacted row still suppresses its address',
    (SELECT count(*) FROM public.email_suppressions
      WHERE email_hash = encode(sha256('gone@shop.example'::bytea), 'hex') AND email IS NULL) = 1);

  PERFORM chk(ph, 'RLS is enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.email_suppressions'::regclass));
  PERFORM chk(ph, 'no role holds DELETE on the table',
    (SELECT bool_and(NOT has_table_privilege(g, 'public.email_suppressions', 'DELETE'))
       FROM unnest(ARRAY['anon','authenticated','service_role']) AS g) <> broken);
END; $$;

SELECT run_checks('after');

-- MUTATION CONTROL: Supabase's default grants back, a permissive policy, no guard.
GRANT ALL ON TABLE public.email_suppressions TO anon, authenticated, service_role;
CREATE POLICY email_suppressions_open ON public.email_suppressions FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER email_suppressions_guard ON public.email_suppressions;
DROP TRIGGER email_suppressions_no_truncate ON public.email_suppressions;
SELECT run_checks('mutated');

-- RESTORE: the migration file, applied over the broken state, repairs it.
DROP POLICY email_suppressions_open ON public.email_suppressions;
\i supabase/migrations/20261009180000_email_suppressions.sql
SELECT run_checks('restored');

-- Constraints (as service_role, the only writer).
DO $$
DECLARE r text;
  g text := $q$ INSERT INTO public.email_suppressions (email_hash, email, source, channel, note)
    VALUES (%L, %L, %L, %L, %L) RETURNING 'inserted' $q$;
  h text := encode(sha256('fresh@shop.example'::bytea), 'hex');
BEGIN
  r := try_as('service_role', NULL, format(g, 'NOTAHASH', 'fresh@shop.example', 'manual', 'marketing', NULL));
  PERFORM chk('constraints', 'a key that is not a sha256 is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, upper(h), 'fresh@shop.example', 'manual', 'marketing', NULL));
  PERFORM chk('constraints', 'an upper-case hash is rejected (one spelling only) -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, h, 'Fresh@Shop.example', 'manual', 'marketing', NULL));
  PERFORM chk('constraints', 'a plaintext that is not lower-cased is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, h, ' fresh@shop.example', 'manual', 'marketing', NULL));
  PERFORM chk('constraints', 'a plaintext that is not trimmed is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, h, 'noatsign', 'manual', 'marketing', NULL));
  PERFORM chk('constraints', 'a plaintext with no @ is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, h, 'fresh@shop.example', 'because_i_felt_like_it', 'marketing', NULL));
  PERFORM chk('constraints', 'a source outside the closed list is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, h, 'fresh@shop.example', 'manual', 'newsletter', NULL));
  PERFORM chk('constraints', 'a channel outside the closed list is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, h, 'fresh@shop.example', 'manual', 'marketing', repeat('x', 501)));
  PERFORM chk('constraints', 'a note longer than 500 characters is rejected -> ' || r, r = 'denied:23514');
  -- Redaction and the absence of plaintext are one fact, in both directions.
  r := try_as('service_role', NULL, $q$ INSERT INTO public.email_suppressions (email_hash, email, source, channel, redacted_at)
    VALUES (encode(sha256('fresh@shop.example'::bytea), 'hex'), 'fresh@shop.example', 'manual', 'marketing', now()) RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'a redaction stamp with the plaintext still there is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.email_suppressions (email_hash, email, source, channel)
    VALUES (encode(sha256('fresh@shop.example'::bytea), 'hex'), NULL, 'manual', 'marketing') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'no plaintext and no redaction stamp is rejected -> ' || r, r = 'denied:23514');
  r := try_as('service_role', NULL, format(g, h, 'fresh@shop.example', 'manual', 'marketing', 'asked by phone'));
  PERFORM chk('constraints', 'a well-formed suppression is accepted -> ' || r, r = 'ok:inserted');
END $$;

-- One row per address.
INSERT INTO public.email_suppressions (email_hash, email, source, channel)
  VALUES (encode(sha256('dup@shop.example'::bytea), 'hex'), 'dup@shop.example', 'unsubscribe_link', 'outbound_prospect');
DO $$
DECLARE r text;
BEGIN
  r := try_as('service_role', NULL, $q$ INSERT INTO public.email_suppressions (email_hash, email, source, channel)
    VALUES (encode(sha256('dup@shop.example'::bytea), 'hex'), 'dup@shop.example', 'manual', 'marketing') RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'the same address twice is rejected -> ' || r, r = 'denied:23505');
  r := try_as('service_role', NULL, $q$ INSERT INTO public.email_suppressions (email_hash, email, source, channel)
    VALUES (encode(sha256('dup@shop.example'::bytea), 'hex'), 'dup@shop.example', 'manual', 'marketing')
    ON CONFLICT (email_hash) DO NOTHING RETURNING 'inserted' $q$);
  PERFORM chk('constraints', 'the helper''s upsert leaves the first suppression alone -> ' || r, r = 'ok:null');
END $$;
SELECT chk('constraints', 'the first suppression kept its source and channel',
  (SELECT source = 'unsubscribe_link' AND channel = 'outbound_prospect' FROM public.email_suppressions
    WHERE email_hash = encode(sha256('dup@shop.example'::bytea), 'hex')));

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored','constraints'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;

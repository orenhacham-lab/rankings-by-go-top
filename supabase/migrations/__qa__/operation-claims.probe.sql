-- ============================================================================
-- EXECUTED PROBE — is the single-flight claim actually atomic?
--
-- WHY THIS EXISTS. A concurrency control that is only tested in JavaScript is
-- not tested: Node is single-threaded, so any claim written in it is trivially
-- "atomic" by construction. The guarantee this feature depends on belongs to
-- PostgreSQL — a single INSERT ... ON CONFLICT DO UPDATE ... WHERE against a
-- primary key — and it has to be measured with genuinely parallel backends.
--
-- RUN against a disposable cluster (initdb, discarded afterwards). NOT against
-- Supabase, NOT against Production. No production data is read; the user rows
-- below are created here.
--
-- Result at time of commit: 8 passed, 0 failed, plus the parallel race below.
--
--   initdb -D <dir> -A trust -U postgres && pg_ctl -D <dir> -o '-p 5440' start
--   psql -h 127.0.0.1 -p 5440 -U postgres -f <this file>
--
-- THE PARALLEL RACE is a shell loop, because one psql session cannot race
-- itself. Twenty separate backends, started together, claiming one scope:
--
--   for i in $(seq 1 20); do
--     ( psql -qtA -c "SELECT outcome FROM claim_operation(
--         '11111111-1111-1111-1111-111111111111','ranking_scan','target:t1','req-$i',60);" ) &
--   done; wait
--
-- Measured: exactly ONE `claimed`, nineteen `in_progress`, and
-- `SELECT count(*) FROM operation_claims` = 1. Repeated against an already
-- EXPIRED claim with twelve backends: one `claimed`, eleven `in_progress`,
-- count = 1. That is the property the routes rely on.
-- ============================================================================

CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users(id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

\i ../20260909000000_operation_claims.sql

CREATE TEMP TABLE probe(n int, name text, ok boolean);
DO $$
DECLARE r record; v_user uuid := '11111111-1111-1111-1111-111111111111';
        v_other uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  SELECT * INTO r FROM public.claim_operation(v_user,'ranking_scan','target:t1','req-A',60);
  INSERT INTO probe VALUES (1,'the first caller claims it', r.outcome = 'claimed' AND r.holder_request_id = 'req-A');

  SELECT * INTO r FROM public.claim_operation(v_user,'ranking_scan','target:t1','req-B',60);
  INSERT INTO probe VALUES (2,'a second caller for the same scope is told in-progress, and who holds it',
    r.outcome = 'in_progress' AND r.holder_request_id = 'req-A');

  SELECT * INTO r FROM public.claim_operation(v_user,'ranking_scan','all','req-C',60);
  INSERT INTO probe VALUES (3,'"scan all" is a DIFFERENT scope and is not blocked', r.outcome = 'claimed');

  SELECT * INTO r FROM public.claim_operation(v_other,'ranking_scan','target:t1','req-D',60);
  INSERT INTO probe VALUES (4,'another tenant, same scope string, is not blocked or joined', r.outcome = 'claimed');

  SELECT * INTO r FROM public.release_operation_claim(v_user,'ranking_scan','target:t1','req-B');
  INSERT INTO probe VALUES (5,'a NON-holder cannot release the claim', r.outcome = 'not_holder');

  SELECT * INTO r FROM public.release_operation_claim(v_user,'ranking_scan','target:t1','req-A');
  INSERT INTO probe VALUES (6,'the holder can', r.outcome = 'released');

  SELECT * INTO r FROM public.claim_operation(v_user,'ranking_scan','target:t1','req-E',60);
  INSERT INTO probe VALUES (7,'and a legitimate later operation then claims it', r.outcome = 'claimed');

  -- An abandoned claim — a function the platform killed before it released.
  UPDATE public.operation_claims SET expires_at = now() - interval '1 second'
   WHERE claim_key = v_user::text || ':ranking_scan:target:t1';
  SELECT * INTO r FROM public.claim_operation(v_user,'ranking_scan','target:t1','req-F',60);
  INSERT INTO probe VALUES (8,'an EXPIRED claim is taken over, so nothing wedges forever',
    r.outcome = 'claimed' AND r.holder_request_id = 'req-F');
END $$;

SELECT n, CASE WHEN ok THEN '  ok  ' ELSE ' FAIL ' END AS result, name FROM probe ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM probe;

-- ============================================================================
-- EXECUTED PROBE — 20261117170000_cron_pass_gate.sql
--
-- A disposable PostgreSQL cluster with Supabase's roles and default grants, then
-- the new migration, twice (idempotent).
--
--   'after'     the migration applies twice without error; the automation row
--               exists and is eligible at once; a second row for the same key
--               is refused (a NOTICE, not an error, so ON_ERROR_STOP holds);
--               the CONDITIONAL CLAIM hands the window to exactly
--               one of two callers; a refused caller does not move the window;
--               RLS is on and anon/authenticated read nothing.
--   'mutated'   MUTATION CONTROL: the primary key and RLS dropped; the double
--               row is accepted and the browser roles can read the table.
--   'restored'  a fresh table from the migration; every guarantee holds again.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/cron-pass-gate.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
\set QUIET off

\echo '--- applying the migration (first time) ---'
\i supabase/migrations/20261117170000_cron_pass_gate.sql
\echo '--- applying the migration again (idempotent) ---'
\i supabase/migrations/20261117170000_cron_pass_gate.sql

\echo ''
\echo '=== after ==='

\echo 'A1 the automation row exists and is eligible at once (expect t):'
SELECT count(*) = 1 AND min(last_started_at) < now() - interval '50 minutes' AS ok
FROM public.cron_pass_gate WHERE key = 'automation';

\echo 'A2 a second row for the same key is refused (expect a NOTICE, never a FAILED):'
DO $$
BEGIN
  BEGIN
    INSERT INTO public.cron_pass_gate (key) VALUES ('automation');
    RAISE EXCEPTION 'A2 FAILED: the duplicate key was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'A2 ok: the duplicate key was refused';
  END;
END $$;

\echo 'A3 the conditional claim grants the window to the first caller (expect 1 row):'
UPDATE public.cron_pass_gate SET last_started_at = now()
WHERE key = 'automation' AND last_started_at < now() - interval '50 minutes'
RETURNING key;

\echo 'A4 and refuses the second caller in the same window (expect 0 rows):'
UPDATE public.cron_pass_gate SET last_started_at = now()
WHERE key = 'automation' AND last_started_at < now() - interval '50 minutes'
RETURNING key;

\echo 'A5 the refused caller did not move the window (expect t):'
SELECT last_started_at > now() - interval '1 minute' AS ok
FROM public.cron_pass_gate WHERE key = 'automation';

\echo 'A6 RLS is enabled and no policy exists (expect t, 0):'
SELECT relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policies WHERE tablename = 'cron_pass_gate') AS policies
FROM pg_class WHERE relname = 'cron_pass_gate';

\echo 'A7 anon reads nothing through RLS (expect 0):'
SET ROLE anon;
SELECT count(*) AS visible FROM public.cron_pass_gate;
RESET ROLE;

\echo 'A8 authenticated reads nothing either (expect 0):'
SET ROLE authenticated;
SELECT count(*) AS visible FROM public.cron_pass_gate;
RESET ROLE;

\echo ''
\echo '=== mutated (MUTATION CONTROL) ==='
ALTER TABLE public.cron_pass_gate DROP CONSTRAINT cron_pass_gate_pkey;
ALTER TABLE public.cron_pass_gate DISABLE ROW LEVEL SECURITY;

\echo 'M1 without the primary key the duplicate row is ACCEPTED (expect INSERT 0 1):'
INSERT INTO public.cron_pass_gate (key, last_started_at) VALUES ('automation', 'epoch');

\echo 'M2 and the claim now hands the window to a SECOND caller as well (expect 1 row):'
UPDATE public.cron_pass_gate SET last_started_at = now()
WHERE key = 'automation' AND last_started_at < now() - interval '50 minutes'
RETURNING key;

\echo 'M3 without RLS anon can read the table (expect 2):'
SET ROLE anon;
SELECT count(*) AS visible FROM public.cron_pass_gate;
RESET ROLE;

\echo ''
\echo '=== restored ==='
DROP TABLE public.cron_pass_gate;
\i supabase/migrations/20261117170000_cron_pass_gate.sql

\echo 'R1 one eligible row again (expect t):'
SELECT count(*) = 1 AND min(last_started_at) < now() - interval '50 minutes' AS ok
FROM public.cron_pass_gate WHERE key = 'automation';

\echo 'R2 a second row for the same key is refused (expect a NOTICE, never a FAILED):'
DO $$
BEGIN
  BEGIN
    INSERT INTO public.cron_pass_gate (key) VALUES ('automation');
    RAISE EXCEPTION 'R2 FAILED: the duplicate key was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'R2 ok: the duplicate key was refused';
  END;
END $$;

\echo 'R3 anon reads nothing again (expect 0):'
SET ROLE anon;
SELECT count(*) AS visible FROM public.cron_pass_gate;
RESET ROLE;

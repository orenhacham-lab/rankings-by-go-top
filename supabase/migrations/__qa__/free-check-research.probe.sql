-- ============================================================================
-- EXECUTED PROBE — 20260928000200_free_check_research.sql (research before
-- sign-up: run reservations and report-by-email requests).
--
-- Builds, in a DISPOSABLE PostgreSQL cluster, the Supabase roles and the
-- default privileges Supabase applies to every NEW public table (ALL to anon
-- and authenticated), so every "denied" below has to come from the migration
-- itself and cannot pass vacuously. The free check's own migration is applied
-- first (the new tables reference its ledger), then the migration under test
-- TWICE (a re-run must not error). Checks:
--   * anon and authenticated can neither read, write nor TRUNCATE either
--     table, even with Supabase's default grants; service_role can;
--   * RLS is enabled on both, with no policy at all;
--   * the gate's queries (per client, spending today, the cache) see exactly
--     the rows they are meant to, with the partial indexes in place;
--   * an address is stored only with consent = true, a consent text and a
--     time; an upper-case or malformed address and a bad enum are rejected;
--   * one request per (research, address); deleting the ledger row removes
--     its requests and detaches its runs.
--
-- NOT run against Supabase or Production; the rows are fabricated here.
--
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/free-check-research.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

\i supabase/migrations/20260926000000_free_site_check.sql
\i supabase/migrations/20260928000200_free_check_research.sql
\i supabase/migrations/20260928000200_free_check_research.sql

CREATE TEMP TABLE probe(n int, name text, ok boolean);
GRANT ALL ON probe TO anon, authenticated, service_role;

INSERT INTO public.free_site_checks (id, domain, locale, url, result, seed, ai_used, client_hash) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'a.co.il', 'he', 'https://a.co.il/', '{}', '{"research":{"version":1}}', true, 'client-1'),
  ('c0000000-0000-4000-8000-000000000002', 'b.co.il', 'he', 'https://b.co.il/', '{}', '{"research":{"version":1}}', true, 'client-2');

INSERT INTO public.free_check_research_runs (client_hash, domain, locale, status, check_id, model_calls, searches, created_at) VALUES
  ('client-1', 'a.co.il', 'he', 'done',     'c0000000-0000-4000-8000-000000000001', 1, 3, now() - interval '20 minutes'),
  ('client-1', 'a.co.il', 'he', 'replayed', 'c0000000-0000-4000-8000-000000000001', 0, 0, now() - interval '10 minutes'),
  ('client-1', 'x.co.il', 'he', 'refused',  NULL, 0, 0, now() - interval '5 minutes'),
  ('client-1', 'y.co.il', 'he', 'running',  NULL, 0, 0, now() - interval '1 minute'),
  ('client-2', 'b.co.il', 'he', 'done',     'c0000000-0000-4000-8000-000000000002', 1, 3, now() - interval '30 hours'),
  ('client-3', 'a.co.il', 'en', 'failed',   NULL, 0, 0, now() - interval '2 minutes');

-- 1. The gate's queries, exactly as lib/presignup/gate.ts asks them.
DO $$
DECLARE n int; v uuid;
BEGIN
  SELECT count(*) INTO n FROM public.free_check_research_runs
   WHERE client_hash = 'client-1' AND status <> 'refused' AND created_at > now() - interval '1 hour';
  INSERT INTO probe VALUES (1, 'per visitor: counts their runs and replays, not a refused one', n = 3);

  SELECT count(*) INTO n FROM public.free_check_research_runs
   WHERE client_hash = 'client-1' AND status = 'running' AND created_at > now() - interval '5 minutes';
  INSERT INTO probe VALUES (2, 'in flight: one run of theirs is running', n = 1);

  SELECT count(*) INTO n FROM public.free_check_research_runs
   WHERE status IN ('running', 'done', 'failed') AND created_at > date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  INSERT INTO probe VALUES (3, 'per day: only runs that may have spent count (not replayed, not refused, not yesterday)', n = 3);

  SELECT check_id INTO v FROM public.free_check_research_runs
   WHERE domain = 'a.co.il' AND locale = 'he' AND status = 'done' AND check_id IS NOT NULL
     AND created_at > now() - interval '24 hours' ORDER BY created_at DESC LIMIT 1;
  INSERT INTO probe VALUES (4, 'cache: the newest finished research of this domain and language', v = 'c0000000-0000-4000-8000-000000000001');

  SELECT count(*) INTO n FROM public.free_check_research_runs
   WHERE domain = 'b.co.il' AND locale = 'he' AND status = 'done' AND created_at > now() - interval '24 hours';
  INSERT INTO probe VALUES (5, 'cache: a research older than a day is not replayed', n = 0);

  SELECT count(*) INTO n FROM pg_indexes WHERE tablename = 'free_check_research_runs'
   AND indexname IN ('free_check_research_runs_client_idx', 'free_check_research_runs_spending_idx', 'free_check_research_runs_cache_idx');
  INSERT INTO probe VALUES (6, 'the three indexes the gate reads through exist', n = 3);
END $$;

-- 2. Consent: an address only with it, its words and its time.
DO $$
DECLARE ok boolean; n int;
BEGIN
  INSERT INTO public.free_check_report_requests (check_id, email, consent, consented_at, consent_text, locale, client_hash)
    VALUES ('c0000000-0000-4000-8000-000000000001', 'dana@example.co.il', true, now(), 'I agree to receive this report [report-email-v1]', 'he', 'client-1');
  SELECT count(*) INTO n FROM public.free_check_report_requests WHERE email = 'dana@example.co.il' AND sent_at IS NULL;
  INSERT INTO probe VALUES (7, 'a consented request is stored, not sent', n = 1);

  BEGIN
    INSERT INTO public.free_check_report_requests (check_id, email, consent, consented_at, consent_text, locale, client_hash)
      VALUES ('c0000000-0000-4000-8000-000000000001', 'noconsent@example.com', false, now(), 'I agree to receive this report [report-email-v1]', 'he', 'client-1');
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  INSERT INTO probe VALUES (8, 'consent = false is rejected', ok);

  BEGIN
    INSERT INTO public.free_check_report_requests (check_id, email, consent, consented_at, consent_text, locale, client_hash)
      VALUES ('c0000000-0000-4000-8000-000000000001', 'nulltime@example.com', true, NULL, 'I agree to receive this report [report-email-v1]', 'he', 'client-1');
    ok := false;
  EXCEPTION WHEN not_null_violation THEN ok := true;
  END;
  INSERT INTO probe VALUES (9, 'a consent without its time is rejected', ok);

  BEGIN
    INSERT INTO public.free_check_report_requests (check_id, email, consent, consented_at, consent_text, locale, client_hash)
      VALUES ('c0000000-0000-4000-8000-000000000001', 'notext@example.com', true, now(), 'ok', 'he', 'client-1');
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  INSERT INTO probe VALUES (10, 'a consent without its words is rejected', ok);

  BEGIN
    INSERT INTO public.free_check_report_requests (check_id, email, consent, consented_at, consent_text, locale, client_hash)
      VALUES ('c0000000-0000-4000-8000-000000000001', 'Upper@Example.com', true, now(), 'I agree to receive this report [report-email-v1]', 'he', 'client-1');
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  INSERT INTO probe VALUES (11, 'an address not normalized to lower case is rejected', ok);

  BEGIN
    INSERT INTO public.free_check_report_requests (check_id, email, consent, consented_at, consent_text, locale, client_hash)
      VALUES ('c0000000-0000-4000-8000-000000000001', 'not an email', true, now(), 'I agree to receive this report [report-email-v1]', 'he', 'client-1');
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  INSERT INTO probe VALUES (12, 'a malformed address is rejected', ok);

  BEGIN
    INSERT INTO public.free_check_report_requests (check_id, email, consent, consented_at, consent_text, locale, client_hash)
      VALUES ('c0000000-0000-4000-8000-000000000001', 'dana@example.co.il', true, now(), 'I agree to receive this report [report-email-v1]', 'he', 'client-1');
    ok := false;
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  INSERT INTO probe VALUES (13, 'the same address for the same research is one request (23505)', ok);

  BEGIN
    INSERT INTO public.free_check_research_runs (client_hash, domain, locale, status) VALUES ('c', 'a.co.il', 'he', 'sent');
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  INSERT INTO probe VALUES (14, 'an unknown run status is rejected', ok);

  BEGIN
    INSERT INTO public.free_check_research_runs (client_hash, domain, locale, error_code) VALUES ('c', 'a.co.il', 'he', 'Provider said: 500 Internal');
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  INSERT INTO probe VALUES (15, 'an error code with provider-like text is rejected', ok);
END $$;

-- 3. Nobody but the service role, even with Supabase's default grants.
DO $$
DECLARE v boolean; n int;
BEGIN
  SELECT relrowsecurity INTO v FROM pg_class WHERE oid = 'public.free_check_research_runs'::regclass;
  INSERT INTO probe VALUES (16, 'RLS is on for the runs', v);
  SELECT relrowsecurity INTO v FROM pg_class WHERE oid = 'public.free_check_report_requests'::regclass;
  INSERT INTO probe VALUES (17, 'RLS is on for the report requests', v);
  SELECT count(*) INTO n FROM pg_policies WHERE tablename IN ('free_check_research_runs', 'free_check_report_requests');
  INSERT INTO probe VALUES (18, 'no policy exists on either table', n = 0);

  SELECT bool_or(has_table_privilege(r, t, p)) INTO v
    FROM (VALUES ('anon'), ('authenticated')) AS roles(r),
         (VALUES ('public.free_check_research_runs'), ('public.free_check_report_requests')) AS tabs(t),
         (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) AS privs(p);
  INSERT INTO probe VALUES (19, 'anon and authenticated hold no privilege on either table', NOT v);

  SELECT bool_and(has_table_privilege('service_role', t, p)) INTO v
    FROM (VALUES ('public.free_check_research_runs'), ('public.free_check_report_requests')) AS tabs(t),
         (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS privs(p);
  INSERT INTO probe VALUES (20, 'service_role can read and write both', v);
END $$;

-- Running as the browser roles, for real: every read and write is refused.
SET ROLE anon;
DO $$
DECLARE ok boolean;
BEGIN
  BEGIN PERFORM 1 FROM public.free_check_report_requests; ok := false; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  INSERT INTO probe VALUES (21, 'anon cannot read the report requests', ok);
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$
DECLARE ok boolean;
BEGIN
  BEGIN PERFORM 1 FROM public.free_check_research_runs; ok := false; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  INSERT INTO probe VALUES (22, 'authenticated cannot read the runs', ok);
  BEGIN
    INSERT INTO public.free_check_report_requests (check_id, email, consent, consented_at, consent_text, locale, client_hash)
      VALUES ('c0000000-0000-4000-8000-000000000001', 'x@example.com', true, now(), 'I agree to receive this report [report-email-v1]', 'he', 'c');
    ok := false;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  INSERT INTO probe VALUES (23, 'authenticated cannot insert a report request', ok);
  BEGIN TRUNCATE public.free_check_research_runs; ok := false; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  INSERT INTO probe VALUES (24, 'authenticated cannot TRUNCATE the runs', ok);
END $$;
RESET ROLE;

-- 4. The ledger row owns its requests; its runs survive, detached.
DO $$
DECLARE n int; m int;
BEGIN
  DELETE FROM public.free_site_checks WHERE id = 'c0000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO n FROM public.free_check_report_requests;
  SELECT count(*) INTO m FROM public.free_check_research_runs WHERE domain = 'a.co.il' AND locale = 'he' AND check_id IS NULL;
  INSERT INTO probe VALUES (25, 'deleting the ledger row removes its report requests', n = 0);
  INSERT INTO probe VALUES (26, 'and keeps its runs (for the caps), with check_id cleared', m = 2);
END $$;

SELECT n, CASE WHEN ok THEN '  ✓ ' ELSE '  ✗ FAIL ' END || name AS result FROM probe ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM probe;

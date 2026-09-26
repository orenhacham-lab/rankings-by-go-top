-- ============================================================================
-- EXECUTED PROBE — does the free-check ledger actually hold the three
-- guarantees the public route depends on?
--
-- WHY THIS EXISTS. /api/free-check is unauthenticated and pays for every run,
-- so its cache, its rate limit and its spend ceiling are the only things
-- between a stranger and a bill. All three are queries against ONE table, and
-- a table whose grants or indexes are wrong fails them silently: the reads
-- still return rows, just the wrong ones, or the service role loses access and
-- the gate fails closed on every visitor.
--
-- RUN against a disposable cluster (initdb, discarded afterwards). NOT against
-- Supabase, NOT against Production. No production data is read.
--
--   bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/free-site-check.probe.sql
--
-- Result at time of commit: 9 passed, 0 failed.
-- ============================================================================

CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

\i supabase/migrations/20260926000000_free_site_check.sql

CREATE TEMP TABLE probe(n int, name text, ok boolean);

INSERT INTO public.free_site_checks (domain, locale, url, result, ai_used, client_hash, created_at) VALUES
  ('a.co.il','he','https://a.co.il/','{"domain":"a.co.il"}',true ,'client-1', now() - interval '2 hours'),
  ('a.co.il','en','https://a.co.il/','{"domain":"a.co.il"}',true ,'client-1', now() - interval '3 hours'),
  ('a.co.il','he','https://a.co.il/','{"domain":"a.co.il"}',true ,'client-2', now() - interval '30 hours'),
  ('b.co.il','he','https://b.co.il/','{"domain":"b.co.il"}',false,'client-1', now() - interval '2 minutes'),
  ('c.co.il','he','https://c.co.il/','{"domain":"c.co.il"}',false,'client-1', now() - interval '3 minutes'),
  ('d.co.il','he','https://d.co.il/','{"domain":"d.co.il"}',true ,'client-3', now() - interval '1 hour');

DO $$
DECLARE n int; v boolean;
BEGIN
  -- 1) CACHE: the newest run for this domain AND locale inside 24h.
  SELECT count(*) INTO n FROM public.free_site_checks
   WHERE domain='a.co.il' AND locale='he' AND created_at > now() - interval '24 hours';
  INSERT INTO probe VALUES (1,'cache lookup finds the fresh Hebrew run only', n = 1);

  SELECT count(*) INTO n FROM public.free_site_checks
   WHERE domain='a.co.il' AND locale='en' AND created_at > now() - interval '24 hours';
  INSERT INTO probe VALUES (2,'the English visitor has a cache entry of their own', n = 1);

  SELECT count(*) INTO n FROM public.free_site_checks
   WHERE domain='a.co.il' AND locale='he' AND created_at > now() - interval '1 hour';
  INSERT INTO probe VALUES (3,'a run older than the TTL is not replayed', n = 0);

  -- 2) RATE LIMIT: runs by one hashed client in the burst window.
  SELECT count(*) INTO n FROM public.free_site_checks
   WHERE client_hash='client-1' AND created_at > now() - interval '10 minutes';
  INSERT INTO probe VALUES (4,'the burst window counts only this client''s recent runs', n = 2);

  SELECT count(*) INTO n FROM public.free_site_checks
   WHERE client_hash='client-3' AND created_at > now() - interval '10 minutes';
  INSERT INTO probe VALUES (5,'another client is unaffected by it', n = 0);

  -- 3) SPEND CEILING: model calls since midnight UTC.
  SELECT count(*) INTO n FROM public.free_site_checks
   WHERE ai_used AND created_at > date_trunc('day', now() AT TIME ZONE 'UTC');
  INSERT INTO probe VALUES (6,'only runs that spent a model call count toward the cap', n >= 1);

  SELECT count(*) INTO n FROM public.free_site_checks WHERE NOT ai_used;
  INSERT INTO probe VALUES (7,'runs that spent nothing are recorded but not counted', n = 2);

  -- 4) ACCESS: nothing but the service role may read the ledger.
  SELECT relrowsecurity INTO v FROM pg_class WHERE oid = 'public.free_site_checks'::regclass;
  INSERT INTO probe VALUES (8,'row level security is enabled on the table', v);

  SELECT bool_or(has_table_privilege(r, 'public.free_site_checks', 'SELECT')) INTO v
    FROM (VALUES ('anon'),('authenticated')) AS t(r);
  INSERT INTO probe VALUES (9,'anon and authenticated cannot read it at all', NOT v);
END $$;

SELECT n, CASE WHEN ok THEN '  ✓ ' ELSE '  ✗ ' END || name AS result FROM probe ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM probe;

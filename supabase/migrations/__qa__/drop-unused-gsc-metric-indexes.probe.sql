-- ============================================================================
-- EXECUTED PROBE — 20261111160000_drop_unused_gsc_metric_indexes.sql
--
-- Builds, in a DISPOSABLE PostgreSQL cluster, the table and all five secondary
-- indexes exactly as 20260812_add_gsc_readonly.sql leaves them, fills it with
-- three runs' worth of rows across two projects, and then asks the planner the
-- six questions the application actually asks — BEFORE the drop.
--
--   'before'     the premise. All three indexes exist, AND no plan for any of
--                the six real query shapes mentions them. That second half is
--                the whole argument: a drop is safe because the planner was
--                never using them, and a probe that only showed them existing
--                would be no evidence of that. The control runs with
--                enable_seqscan OFF, so the planner is pushed as hard as it can
--                be towards ANY index — if one of the three could serve these
--                filters, it would surface here.
--   'after'      the three are gone and the three that earn their keep — the
--                primary key, idx_gsc_metrics_project_run and
--                idx_gsc_metrics_impressions — are still there, with their
--                definitions unchanged.
--   'answers'    every one of the six queries returns the SAME rows, in the same
--                order, as it did before the drop. Recorded before, compared
--                after. This is what makes it a behaviour test and not an index
--                inventory.
--   'served'     the run-scoped WHERE is still answered by an index, not by a
--                sequential scan — the drop must not quietly turn the read path
--                into a table scan.
--   'intact'     no row, column, constraint or policy changed, and the row
--                counts per run are what they were.
--   'idempotent' the whole file applied a second time changes nothing, because
--                a migration that cannot be applied twice cannot be applied
--                safely.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/drop-unused-gsc-metric-indexes.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── the pre-state, copied from 20260812_add_gsc_readonly.sql ────────────────
-- Stubs stand in for projects and gsc_sync_runs: the real ones hang off
-- auth.users, and chaining that graph would test the graph rather than the
-- index set. What has to be faithful is gsc_query_page_metrics itself and its
-- five secondary indexes, and those are reproduced verbatim.
CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.gsc_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  window_days integer NOT NULL,
  status text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.gsc_query_page_metrics (
  sync_run_id   uuid NOT NULL REFERENCES public.gsc_sync_runs(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  query         text NOT NULL,
  page          text NOT NULL,
  clicks        bigint NOT NULL DEFAULT 0,
  impressions   bigint NOT NULL DEFAULT 0,
  ctr           double precision NOT NULL DEFAULT 0,
  position      double precision NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sync_run_id, query, page)
);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_project_run ON public.gsc_query_page_metrics (project_id, sync_run_id);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_query ON public.gsc_query_page_metrics (query);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_page ON public.gsc_query_page_metrics (page);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_impressions ON public.gsc_query_page_metrics (impressions);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_position ON public.gsc_query_page_metrics (position);
ALTER TABLE public.gsc_query_page_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY gsc_query_page_metrics_select ON public.gsc_query_page_metrics
  FOR SELECT USING (true);
CREATE POLICY gsc_query_page_metrics_service ON public.gsc_query_page_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Two projects, three runs, so a per-run filter has something to exclude and a
-- cross-owner row exists to be left alone.
INSERT INTO public.projects (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.gsc_sync_runs (id, project_id, window_days, status) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 28, 'succeeded'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111111', 7,  'succeeded'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '22222222-2222-4222-8222-222222222222', 28, 'succeeded');

INSERT INTO public.gsc_query_page_metrics (sync_run_id, project_id, query, page, clicks, impressions, ctr, position)
SELECT r.id, r.project_id,
       'query ' || lpad(g::text, 5, '0'),
       'https://example.test/page-' || (g % 97),
       g % 11, 10 + (g * 7) % 900, ((g % 11)::float / (10 + (g * 7) % 900)), 1 + (g % 93)
FROM public.gsc_sync_runs r, generate_series(1, 2000) g;

ANALYZE public.gsc_query_page_metrics;

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

CREATE FUNCTION has_index(n text) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = n);
$$;
CREATE FUNCTION index_def(n text) RETURNS text LANGUAGE sql AS $$
  SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = n;
$$;

-- The plan for a query, as one lowercase string. enable_seqscan is OFF for the
-- duration, which is what makes a "no index was used" answer meaningful.
CREATE FUNCTION plan_of(q text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE line text; out text := '';
BEGIN
  FOR line IN EXECUTE 'EXPLAIN (COSTS OFF) ' || q LOOP out := out || ' ' || line; END LOOP;
  RETURN lower(out);
END; $$;

-- The rows a query returns, as one ordered string, so before and after compare.
CREATE FUNCTION answer_of(q text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE res text;
BEGIN
  EXECUTE 'SELECT COALESCE(md5(string_agg(t::text, ''|'')), ''<empty>'') FROM (' || q || ') t' INTO res;
  RETURN res;
END; $$;

-- The six shapes, transcribed from the read paths named in the migration.
CREATE TABLE shapes (name text, q text);
INSERT INTO shapes VALUES
  ('existing-content',
   $q$SELECT query, page, clicks, impressions, position FROM public.gsc_query_page_metrics
      WHERE sync_run_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND project_id = '11111111-1111-4111-8111-111111111111'
      ORDER BY query, page$q$),
  ('cannibalization',
   $q$SELECT query, page, impressions, position FROM public.gsc_query_page_metrics
      WHERE sync_run_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND project_id = '11111111-1111-4111-8111-111111111111'
        AND position <= 20 AND impressions >= 10
      ORDER BY impressions DESC LIMIT 500$q$),
  ('opportunities',
   $q$SELECT query, page, clicks, impressions, ctr, position FROM public.gsc_query_page_metrics
      WHERE sync_run_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND project_id = '11111111-1111-4111-8111-111111111111'$q$),
  ('export',
   $q$SELECT query, page, clicks, impressions, ctr, position FROM public.gsc_query_page_metrics
      WHERE sync_run_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND project_id = '11111111-1111-4111-8111-111111111111'
      ORDER BY impressions DESC, query, page$q$),
  ('metrics-route-opportunities',
   $q$SELECT query, page, clicks, impressions, ctr, position FROM public.gsc_query_page_metrics
      WHERE sync_run_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND position >= 4 AND position <= 20
      ORDER BY impressions DESC, query LIMIT 50$q$),
  ('metrics-route-pages',
   $q$SELECT page, clicks FROM public.gsc_query_page_metrics
      WHERE sync_run_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' AND project_id = '11111111-1111-4111-8111-111111111111'
        AND clicks > 0
      ORDER BY clicks DESC, query, page$q$);

CREATE TABLE baseline (name text, answer text, rows bigint);
CREATE TABLE run_counts (sync_run_id uuid, n bigint);

-- ── before ─────────────────────────────────────────────────────────────────
SET enable_seqscan = off;
DO $$
DECLARE s record; idx text; p text;
BEGIN
  FOREACH idx IN ARRAY ARRAY['idx_gsc_metrics_query', 'idx_gsc_metrics_page', 'idx_gsc_metrics_position'] LOOP
    PERFORM chk('before', idx || ' exists today', has_index(idx));
  END LOOP;
  FOREACH idx IN ARRAY ARRAY['gsc_query_page_metrics_pkey', 'idx_gsc_metrics_project_run', 'idx_gsc_metrics_impressions'] LOOP
    PERFORM chk('before', idx || ' exists today', has_index(idx));
  END LOOP;
  FOR s IN SELECT * FROM shapes LOOP
    p := plan_of(s.q);
    PERFORM chk('before', s.name || ': the planner does not reach for idx_gsc_metrics_query',
                position('idx_gsc_metrics_query' in p) = 0);
    PERFORM chk('before', s.name || ': the planner does not reach for idx_gsc_metrics_page',
                position('idx_gsc_metrics_page' in p) = 0);
    PERFORM chk('before', s.name || ': the planner does not reach for idx_gsc_metrics_position',
                position('idx_gsc_metrics_position' in p) = 0);
    INSERT INTO baseline SELECT s.name, answer_of(s.q), NULL;
  END LOOP;
END $$;
INSERT INTO run_counts SELECT sync_run_id, count(*) FROM public.gsc_query_page_metrics GROUP BY 1;
RESET enable_seqscan;

-- ── the migration under test, twice ─────────────────────────────────────────
\i supabase/migrations/20261111160000_drop_unused_gsc_metric_indexes.sql
\i supabase/migrations/20261111160000_drop_unused_gsc_metric_indexes.sql

-- ── after ──────────────────────────────────────────────────────────────────
DO $$
DECLARE idx text;
BEGIN
  FOREACH idx IN ARRAY ARRAY['idx_gsc_metrics_query', 'idx_gsc_metrics_page', 'idx_gsc_metrics_position'] LOOP
    PERFORM chk('after', idx || ' is gone', NOT has_index(idx));
  END LOOP;
  PERFORM chk('after', 'the primary key survives', has_index('gsc_query_page_metrics_pkey'));
  PERFORM chk('after', 'idx_gsc_metrics_project_run survives unchanged',
    index_def('idx_gsc_metrics_project_run') =
    'CREATE INDEX idx_gsc_metrics_project_run ON public.gsc_query_page_metrics USING btree (project_id, sync_run_id)');
  PERFORM chk('after', 'idx_gsc_metrics_impressions survives unchanged — it has 850 production scans',
    index_def('idx_gsc_metrics_impressions') =
    'CREATE INDEX idx_gsc_metrics_impressions ON public.gsc_query_page_metrics USING btree (impressions)');
  PERFORM chk('after', 'exactly three indexes remain on the table',
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'gsc_query_page_metrics') = 3);
END $$;

-- ── answers ────────────────────────────────────────────────────────────────
ANALYZE public.gsc_query_page_metrics;
DO $$
DECLARE s record; b text;
BEGIN
  FOR s IN SELECT * FROM shapes LOOP
    SELECT answer FROM baseline WHERE name = s.name INTO b;
    PERFORM chk('answers', s.name || ' returns the same rows in the same order', answer_of(s.q) = b);
  END LOOP;
END $$;

-- ── served ─────────────────────────────────────────────────────────────────
DO $$
DECLARE s record; p text;
BEGIN
  FOR s IN SELECT * FROM shapes LOOP
    p := plan_of(s.q);
    PERFORM chk('served', s.name || ' is still answered by an index, not a table scan',
      position('index scan' in p) > 0 OR position('index only scan' in p) > 0 OR position('bitmap index scan' in p) > 0);
  END LOOP;
END $$;

-- ── intact ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  PERFORM chk('intact', 'every row is still there',
    (SELECT count(*) FROM public.gsc_query_page_metrics) = 6000);
  PERFORM chk('intact', 'the per-run row counts are unchanged',
    NOT EXISTS (SELECT 1 FROM run_counts c
                FULL JOIN (SELECT sync_run_id, count(*) n FROM public.gsc_query_page_metrics GROUP BY 1) a
                  USING (sync_run_id)
                WHERE c.n IS DISTINCT FROM a.n));
  PERFORM chk('intact', 'the other project''s rows are untouched',
    (SELECT count(*) FROM public.gsc_query_page_metrics
      WHERE project_id = '22222222-2222-4222-8222-222222222222') = 2000);
  PERFORM chk('intact', 'the columns are unchanged',
    (SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'gsc_query_page_metrics')
    = 'sync_run_id,project_id,query,page,clicks,impressions,ctr,position,created_at');
  PERFORM chk('intact', 'row level security is still on',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.gsc_query_page_metrics'::regclass));
  PERFORM chk('intact', 'both policies are still there',
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'gsc_query_page_metrics') = 2);
  PERFORM chk('intact', 'the primary key definition is unchanged',
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'public.gsc_query_page_metrics'::regclass AND contype = 'p')
    = 'PRIMARY KEY (sync_run_id, query, page)');
END $$;

-- ── idempotent ─────────────────────────────────────────────────────────────
\i supabase/migrations/20261111160000_drop_unused_gsc_metric_indexes.sql
DO $$ BEGIN
  PERFORM chk('idempotent', 'a third application still leaves three indexes',
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'gsc_query_page_metrics') = 3);
  PERFORM chk('idempotent', 'and every row',
    (SELECT count(*) FROM public.gsc_query_page_metrics) = 6000);
END $$;

-- ── summary ────────────────────────────────────────────────────────────────
\set QUIET off
SELECT phase, name FROM results WHERE NOT ok ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;

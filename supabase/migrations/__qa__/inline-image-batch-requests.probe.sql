-- ============================================================================
-- EXECUTED PROBE — 20261114010000_inline_image_batch_requests.sql
--
-- Applies the migration in a DISPOSABLE PostgreSQL cluster, twice (a re-run
-- must not error), and then asks the database the questions the image batch
-- lane's correctness rests on.
--
--   'shape'   the table, its defaults and its three indexes exist, and a row
--             can be written with only the fields the submit pass sets.
--   'states'  the status list is CLOSED. The collect pass reads 'submitted'
--             rows and nothing else, so a typo'd or invented status must be
--             refused by the database rather than quietly never matching.
--   'once'    (job_name, request_key) is unique, so two overlapping collect
--             passes cannot store the same picture twice — which would upload
--             two files to the content bucket and orphan one of them.
--   'free'    no foreign key to article_inline_images, generated_articles or
--             projects: an article deleted while its images are in flight must
--             not fail the collect pass, which simply finds no row to finish.
--   'closed'  RLS is enabled with NO policy, so the table is service-role only
--             and no merchant can read or write this bookkeeping.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/inline-image-batch-requests.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

\i supabase/migrations/20261114010000_inline_image_batch_requests.sql
-- Idempotent: the deploy may apply it again.
\i supabase/migrations/20261114010000_inline_image_batch_requests.sql

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- Does a status value survive the CHECK?
CREATE FUNCTION status_accepts(s text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    INSERT INTO public.inline_image_batch_requests (job_name, request_key, model, inline_image_id, status)
    VALUES ('batches/probe-' || s, '0', 'm', gen_random_uuid(), s);
    RETURN true;
  EXCEPTION
    WHEN check_violation THEN RETURN false;
  END;
END; $$;

-- ── shape ──────────────────────────────────────────────────────────────────
SELECT chk('shape', 'the table exists',
  EXISTS (SELECT 1 FROM pg_class WHERE relname = 'inline_image_batch_requests' AND relnamespace = 'public'::regnamespace));

INSERT INTO public.inline_image_batch_requests (job_name, request_key, model, inline_image_id, project_id, article_id)
VALUES ('batches/j1', '0', 'gemini-3.1-flash-image', gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

SELECT chk('shape', 'the submit pass''s fields are enough to write a row',
  (SELECT count(*) FROM public.inline_image_batch_requests WHERE job_name = 'batches/j1') = 1);
SELECT chk('shape', 'a fresh row defaults to submitted and uncollected',
  (SELECT status = 'submitted' AND collected_at IS NULL AND last_error IS NULL
     AND submitted_at IS NOT NULL AND id IS NOT NULL
   FROM public.inline_image_batch_requests WHERE job_name = 'batches/j1'));
SELECT chk('shape', 'the collect read has its index',
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'inline_image_batch_requests' AND indexname = 'inline_image_batch_requests_open_idx'));
SELECT chk('shape', 'the "already ordered?" read has its index',
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'inline_image_batch_requests' AND indexname = 'inline_image_batch_requests_image_idx'));
SELECT chk('shape', 'operator cleanup by article has its index',
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'inline_image_batch_requests' AND indexname = 'inline_image_batch_requests_article_idx'));
SELECT chk('shape', 'the table never holds the image itself',
  NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'inline_image_batch_requests'
                AND (data_type = 'bytea' OR column_name IN ('image', 'image_data', 'bytes', 'data'))));

-- ── states ─────────────────────────────────────────────────────────────────
SELECT chk('states', 'every state the lane writes is accepted',
  status_accepts('submitted') AND status_accepts('collected')
  AND status_accepts('failed') AND status_accepts('expired'));
SELECT chk('states', 'an invented state is refused', NOT status_accepts('pending'));
SELECT chk('states', 'the wrong case is refused', NOT status_accepts('COLLECTED'));
SELECT chk('states', 'the empty string is refused', NOT status_accepts(''));

-- ── once ───────────────────────────────────────────────────────────────────
CREATE FUNCTION duplicate_rejected() RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    INSERT INTO public.inline_image_batch_requests (job_name, request_key, model, inline_image_id)
    VALUES ('batches/j1', '0', 'gemini-3.1-flash-image', gen_random_uuid());
    RETURN false;
  EXCEPTION
    WHEN unique_violation THEN RETURN true;
  END;
END; $$;
SELECT chk('once', 'the same request of the same job cannot be stored twice', duplicate_rejected());
WITH ins AS (
  INSERT INTO public.inline_image_batch_requests (job_name, request_key, model, inline_image_id)
  VALUES ('batches/j1', '1', 'gemini-3.1-flash-image', gen_random_uuid()) RETURNING 1)
SELECT chk('once', 'but another request of the same job can', (SELECT count(*) > 0 FROM ins));

-- ── free ───────────────────────────────────────────────────────────────────
SELECT chk('free', 'no foreign key constrains a request to an image, article or project',
  NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
              WHERE rel.relname = 'inline_image_batch_requests' AND con.contype = 'f'));
WITH ins AS (
  INSERT INTO public.inline_image_batch_requests (job_name, request_key, model, inline_image_id, article_id, project_id)
  VALUES ('batches/j2', '0', 'm', gen_random_uuid(), NULL, NULL) RETURNING 1)
SELECT chk('free', 'a request with no article or project at all is still a row', (SELECT count(*) > 0 FROM ins));

-- ── closed ─────────────────────────────────────────────────────────────────
SELECT chk('closed', 'row level security is on',
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'inline_image_batch_requests' AND relnamespace = 'public'::regnamespace));
SELECT chk('closed', 'and there is no policy, so only the service role reads it',
  (SELECT count(*) FROM pg_policies WHERE tablename = 'inline_image_batch_requests') = 0);

SET ROLE authenticated;
CREATE FUNCTION pg_temp.merchant_sees() RETURNS integer LANGUAGE sql AS
  $$ SELECT count(*)::integer FROM public.inline_image_batch_requests $$;
SELECT chk('closed', 'a merchant session sees no request', pg_temp.merchant_sees() = 0);
RESET ROLE;
SELECT chk('closed', 'while the service role sees them all',
  (SELECT count(*) > 3 FROM public.inline_image_batch_requests));

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;

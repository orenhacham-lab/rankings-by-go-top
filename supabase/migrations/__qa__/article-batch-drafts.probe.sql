-- ============================================================================
-- EXECUTED PROBE — 20261113180000_article_batch_drafts.sql
--
-- Applies the migration in a DISPOSABLE PostgreSQL cluster, twice (a re-run
-- must not error), and then asks the database the questions the batch lane's
-- correctness rests on.
--
--   'shape'   the table, its defaults and its indexes exist, and a row can be
--             written with only the fields the submit pass sets.
--   'states'  the status list is CLOSED. The lane reads 'ready' rows and
--             nothing else, so a typo'd or invented status must be refused by
--             the database rather than quietly never matching.
--   'once'    (job_name, request_key) is unique, so a collect pass that ran
--             twice cannot store the same response as two claimable drafts.
--   'free'    no foreign key to article_topics or projects: a topic deleted
--             while its draft is in flight must not fail the collect pass, and
--             such a draft is already unusable because its fingerprint can
--             never match again.
--   'closed'  RLS is enabled with NO policy, so the table is service-role only
--             and neither anon nor authenticated can read a draft.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/article-batch-drafts.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

\i supabase/migrations/20261113180000_article_batch_drafts.sql
-- Idempotent: the deploy may apply it again.
\i supabase/migrations/20261113180000_article_batch_drafts.sql

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- Does a status value survive the CHECK?
CREATE FUNCTION status_accepts(s text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    INSERT INTO public.article_batch_drafts (job_name, request_key, model, prompt_fingerprint, status)
    VALUES ('batches/probe-' || s, '0', 'm', 'fp-' || s, s);
    RETURN true;
  EXCEPTION
    WHEN check_violation THEN RETURN false;
  END;
END; $$;

-- ── shape ──────────────────────────────────────────────────────────────────
SELECT chk('shape', 'the table exists',
  EXISTS (SELECT 1 FROM pg_class WHERE relname = 'article_batch_drafts' AND relnamespace = 'public'::regnamespace));

INSERT INTO public.article_batch_drafts (job_name, request_key, model, prompt_fingerprint, project_id, topic_id)
VALUES ('batches/j1', '0', 'gemini-3.8-flash', repeat('a', 64), gen_random_uuid(), gen_random_uuid());

SELECT chk('shape', 'the submit pass''s fields are enough to write a row',
  (SELECT count(*) FROM public.article_batch_drafts WHERE job_name = 'batches/j1') = 1);
SELECT chk('shape', 'a fresh row defaults to submitted, unread and unconsumed',
  (SELECT status = 'submitted' AND response_text IS NULL AND ready_at IS NULL AND consumed_at IS NULL
     AND submitted_at IS NOT NULL AND id IS NOT NULL
   FROM public.article_batch_drafts WHERE job_name = 'batches/j1'));
SELECT chk('shape', 'the consume read has its index',
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'article_batch_drafts' AND indexname = 'article_batch_drafts_ready_idx'));
SELECT chk('shape', 'the collect read has its index',
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'article_batch_drafts' AND indexname = 'article_batch_drafts_open_jobs_idx'));
SELECT chk('shape', 'the "already ordered?" read has its index',
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'article_batch_drafts' AND indexname = 'article_batch_drafts_topic_idx'));

-- ── states ─────────────────────────────────────────────────────────────────
SELECT chk('states', 'every state the lane writes is accepted',
  status_accepts('submitted') AND status_accepts('ready') AND status_accepts('consumed')
  AND status_accepts('failed') AND status_accepts('expired'));
SELECT chk('states', 'an invented state is refused', NOT status_accepts('pending'));
SELECT chk('states', 'the wrong case is refused', NOT status_accepts('READY'));
SELECT chk('states', 'the empty string is refused', NOT status_accepts(''));

-- ── once ───────────────────────────────────────────────────────────────────
CREATE FUNCTION duplicate_rejected() RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    INSERT INTO public.article_batch_drafts (job_name, request_key, model, prompt_fingerprint)
    VALUES ('batches/j1', '0', 'gemini-3.8-flash', repeat('a', 64));
    RETURN false;
  EXCEPTION
    WHEN unique_violation THEN RETURN true;
  END;
END; $$;
SELECT chk('once', 'the same request of the same job cannot be stored twice', duplicate_rejected());
WITH ins AS (
  INSERT INTO public.article_batch_drafts (job_name, request_key, model, prompt_fingerprint)
  VALUES ('batches/j1', '1', 'gemini-3.8-flash', repeat('b', 64)) RETURNING 1)
SELECT chk('once', 'but another request of the same job can', (SELECT count(*) > 0 FROM ins));

-- ── free ───────────────────────────────────────────────────────────────────
SELECT chk('free', 'no foreign key constrains a draft to a topic or a project',
  NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
              WHERE rel.relname = 'article_batch_drafts' AND con.contype = 'f'));
WITH ins AS (
  INSERT INTO public.article_batch_drafts (job_name, request_key, model, prompt_fingerprint, topic_id, project_id)
  VALUES ('batches/j2', '0', 'm', repeat('c', 64), NULL, NULL) RETURNING 1)
SELECT chk('free', 'a draft with no topic at all is still a row', (SELECT count(*) > 0 FROM ins));

-- ── closed ─────────────────────────────────────────────────────────────────
SELECT chk('closed', 'row level security is on',
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'article_batch_drafts' AND relnamespace = 'public'::regnamespace));
SELECT chk('closed', 'and there is no policy, so only the service role reads it',
  (SELECT count(*) FROM pg_policies WHERE tablename = 'article_batch_drafts') = 0);

SET ROLE authenticated;
CREATE FUNCTION pg_temp.merchant_sees() RETURNS integer LANGUAGE sql AS
  $$ SELECT count(*)::integer FROM public.article_batch_drafts $$;
SELECT chk('closed', 'a merchant session sees no draft', pg_temp.merchant_sees() = 0);
RESET ROLE;
SELECT chk('closed', 'while the service role sees them all',
  (SELECT count(*) > 3 FROM public.article_batch_drafts));

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;

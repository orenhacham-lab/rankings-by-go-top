-- ============================================================================
-- EXECUTED PROBE — 20261010120000_blog_auto_plan.sql
--
-- Applies, in a DISPOSABLE PostgreSQL cluster, a stand-in for the `articles`
-- table as production holds it, then the migration under test TWICE: a
-- migration that cannot be applied twice cannot be applied safely.
--
--   'shape'       the table exists with the columns the runner reads and writes.
--   'closed'      the lists are lists: an undeclared language or status is
--                 refused, so a typo cannot park a row in a state nothing reads.
--   'no-duplicate' the same keyword cannot be planned twice in one language —
--                 the whole point of the queue, and the only thing standing
--                 between a daily cadence and two of our pages on one query.
--                 The SAME keyword in a DIFFERENT language is fine.
--   'rls'         row-level security on and no policy: operator data, reached
--                 only by the service role.
--   'link'        deleting an article leaves its plan row, pointing at nothing,
--                 rather than taking the keyword's history with it.
--   'touch'       updated_at moves on its own.
--   'idempotent'  the whole file applied a second time changes nothing.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/blog-auto-plan.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- The shape the public blog reads, as production holds it. Only the columns
-- this probe touches are reproduced.
CREATE TABLE public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL,
  locale text NOT NULL DEFAULT 'he',
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- Did this insert succeed? Used for every "is the list closed" assertion.
CREATE FUNCTION plan_accepts(p_locale text, p_status text, p_keyword text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.blog_plan (locale, status, topic, primary_keyword)
  VALUES (p_locale, p_status, p_keyword, p_keyword);
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END; $$;

\i supabase/migrations/20261010120000_blog_auto_plan.sql

-- ── shape ──────────────────────────────────────────────────────────────────
SELECT chk('shape', 'the queue table exists',
  to_regclass('public.blog_plan') IS NOT NULL);

SELECT chk('shape', 'it carries every column the runner reads and writes',
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'blog_plan'
      AND column_name IN ('id','locale','topic','primary_keyword','secondary_keywords',
                          'monthly_searches','competition','status','scheduled_for',
                          'article_id','article_slug','attempts','last_error','locked_at',
                          'source','note','created_at','updated_at')) = 18);

SELECT chk('shape', 'a researched row needs nothing but its language, topic and keyword',
  plan_accepts('he', 'planned', 'בדיקת מיקום בגוגל'));

SELECT chk('shape', 'a fresh row starts planned, unlocked, with no attempts',
  (SELECT status = 'planned' AND locked_at IS NULL AND attempts = 0 AND source = 'keyword_planner'
     FROM public.blog_plan WHERE primary_keyword = 'בדיקת מיקום בגוגל' AND locale = 'he'));

-- ── closed ─────────────────────────────────────────────────────────────────
SELECT chk('closed', 'an undeclared language is refused', NOT plan_accepts('de', 'planned', 'kw-de'));
SELECT chk('closed', 'the wrong case is refused', NOT plan_accepts('PT-BR', 'planned', 'kw-case'));
SELECT chk('closed', 'an empty language is refused', NOT plan_accepts('', 'planned', 'kw-empty'));
SELECT chk('closed', 'a made-up status is refused', NOT plan_accepts('he', 'kinda-done', 'kw-status'));
SELECT chk('closed', 'every status the code writes is accepted', (
  SELECT bool_and(plan_accepts('he', s, 'kw-status-' || s))
    FROM unnest(ARRAY['planned','generating','ready','published','failed','rejected']) AS s));
SELECT chk('closed', 'Portuguese is allowed in the table, for an article planned by hand',
  plan_accepts('pt-BR', 'planned', 'kw-pt'));

-- ── no-duplicate ───────────────────────────────────────────────────────────
SELECT chk('no-duplicate', 'the same keyword cannot be planned twice in one language',
  NOT plan_accepts('he', 'planned', 'בדיקת מיקום בגוגל'));
SELECT chk('no-duplicate', 'the same keyword in another language is a different article',
  plan_accepts('en', 'planned', 'בדיקת מיקום בגוגל'));
SELECT chk('no-duplicate', 'a rejected keyword still holds its place, so research cannot re-add it',
  NOT plan_accepts('he', 'planned', 'kw-status-rejected'));

-- ── rls ────────────────────────────────────────────────────────────────────
SELECT chk('rls', 'row-level security is on',
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.blog_plan'::regclass));
SELECT chk('rls', 'no policy: nothing but the service role reads the queue',
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'blog_plan') = 0);

-- ── link ───────────────────────────────────────────────────────────────────
INSERT INTO public.articles (slug, title, content, locale, is_published)
VALUES ('published-one', 'מאמר', '<p>תוכן</p>', 'he', true);
UPDATE public.blog_plan
   SET status = 'published', article_slug = 'published-one',
       article_id = (SELECT id FROM public.articles WHERE slug = 'published-one')
 WHERE primary_keyword = 'בדיקת מיקום בגוגל' AND locale = 'he';
DELETE FROM public.articles WHERE slug = 'published-one';

SELECT chk('link', 'deleting the article keeps the plan row',
  (SELECT count(*) FROM public.blog_plan WHERE primary_keyword = 'בדיקת מיקום בגוגל' AND locale = 'he') = 1);
SELECT chk('link', 'and clears the pointer instead of deleting the history',
  (SELECT article_id IS NULL AND article_slug = 'published-one'
     FROM public.blog_plan WHERE primary_keyword = 'בדיקת מיקום בגוגל' AND locale = 'he'));

-- ── touch ──────────────────────────────────────────────────────────────────
UPDATE public.blog_plan SET updated_at = '2020-01-01' WHERE primary_keyword = 'kw-pt';
UPDATE public.blog_plan SET attempts = 1 WHERE primary_keyword = 'kw-pt';
SELECT chk('touch', 'updated_at moves on its own when a row changes',
  (SELECT updated_at > '2021-01-01'::timestamptz FROM public.blog_plan WHERE primary_keyword = 'kw-pt'));

-- ── idempotent ─────────────────────────────────────────────────────────────
\i supabase/migrations/20261010120000_blog_auto_plan.sql

SELECT chk('idempotent', 'a second run keeps the rows',
  (SELECT count(*) FROM public.blog_plan) > 0);
SELECT chk('idempotent', 'a second run still refuses a duplicate keyword',
  NOT plan_accepts('he', 'planned', 'בדיקת מיקום בגוגל'));
SELECT chk('idempotent', 'a second run still refuses an undeclared language',
  NOT plan_accepts('de', 'planned', 'kw-de-2'));
SELECT chk('idempotent', 'a second run leaves one unique constraint, not two',
  (SELECT count(*) FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'u' AND rel.relname = 'blog_plan') = 1);
SELECT chk('idempotent', 'a second run leaves one updated_at trigger, not two',
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.blog_plan'::regclass AND NOT tgisinternal) = 1);

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;

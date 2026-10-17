-- ============================================================================
-- EXECUTED PROBE — 20261009180750_articles_locale.sql
--
-- Applies, in a DISPOSABLE PostgreSQL cluster, a stand-in for the `articles`
-- table as production holds it today (the real one predates this repo's
-- migrations), then the migration under test TWICE: a re-run must not error,
-- because a migration that cannot be applied twice cannot be applied safely.
--
--   'before'   the premise. Without the column there is no language on a row,
--              so every blog would have to show every article.
--   'after'    the column exists, every pre-existing row reads 'he' (which is
--              what those articles are), and an insert that does not mention
--              the column still works and still lands in Hebrew.
--   'closed'   the list is a list: 'de', '', 'PT-BR' and 'pt' are refused. A
--              widening that degraded into free text would pass everything
--              above and let a typo'd locale hide an article from every page.
--   'idempotent' the whole file applied a second time changes nothing.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/articles-locale.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- The shape the public blog reads, as it exists in production before this
-- migration. Only the columns this probe touches are reproduced.
CREATE TABLE public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.articles (slug, title, content, is_published)
VALUES ('existing-hebrew-article', 'מאמר קיים', '<p>תוכן</p>', true);

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- ── before ─────────────────────────────────────────────────────────────────
SELECT chk('before', 'there is no language on an article', NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'articles' AND column_name = 'locale'));

\i supabase/migrations/20261009180750_articles_locale.sql

-- Can an article in this language be written? Always rolled back, so one
-- answer never affects the next.
CREATE FUNCTION article_accepts(loc text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    INSERT INTO public.articles (slug, title, content, locale)
      VALUES ('probe-' || md5(loc) , 'probe', '<p>x</p>', loc);
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION
    WHEN check_violation THEN RETURN false;
    WHEN others THEN
      IF SQLERRM = 'rollback-probe' THEN RETURN true; END IF;
      RETURN false;
  END;
END; $$;

-- ── after ──────────────────────────────────────────────────────────────────
SELECT chk('after', 'the column exists', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'articles' AND column_name = 'locale'));
SELECT chk('after', 'the article that was already there reads Hebrew',
  (SELECT locale FROM public.articles WHERE slug = 'existing-hebrew-article') = 'he');
INSERT INTO public.articles (slug, title, content) VALUES ('probe-no-locale', 'p', '<p>x</p>');
SELECT chk('after', 'an insert that never mentions the column still works, and lands in Hebrew',
  (SELECT locale FROM public.articles WHERE slug = 'probe-no-locale') = 'he');
SELECT chk('after', 'Hebrew is accepted', article_accepts('he'));
SELECT chk('after', 'English is accepted', article_accepts('en'));
SELECT chk('after', 'Spanish is accepted', article_accepts('es'));
SELECT chk('after', 'Brazilian Portuguese is accepted', article_accepts('pt-BR'));
SELECT chk('after', 'the listing index exists', EXISTS (
  SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'articles_locale_published_idx'));

-- ── closed: still a list, not free text ────────────────────────────────────
SELECT chk('closed', 'an undeclared language is refused', NOT article_accepts('de'));
SELECT chk('closed', 'the empty string is refused', NOT article_accepts(''));
SELECT chk('closed', 'the wrong case is refused', NOT article_accepts('PT-BR'));
SELECT chk('closed', 'the bare language without the region is refused', NOT article_accepts('pt'));
SELECT chk('closed', 'exactly one CHECK governs locale',
  (SELECT count(*) FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'c' AND rel.relname = 'articles'
      AND pg_get_constraintdef(con.oid) LIKE '%locale%') = 1);

-- ── idempotent ─────────────────────────────────────────────────────────────
\i supabase/migrations/20261009180750_articles_locale.sql

SELECT chk('idempotent', 'a second run leaves the Hebrew backfill alone',
  (SELECT locale FROM public.articles WHERE slug = 'existing-hebrew-article') = 'he');
SELECT chk('idempotent', 'a second run still refuses an undeclared language', NOT article_accepts('de'));
SELECT chk('idempotent', 'a second run leaves one CHECK, not two',
  (SELECT count(*) FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'c' AND rel.relname = 'articles'
      AND pg_get_constraintdef(con.oid) LIKE '%locale%') = 1);

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;

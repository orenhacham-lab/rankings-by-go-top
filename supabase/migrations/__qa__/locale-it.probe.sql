-- ============================================================================
-- EXECUTED PROBE — 20261023130000_locale_it.sql
--
-- Applies, in a DISPOSABLE PostgreSQL cluster, stand-ins for the six columns
-- the migration widens, each carrying the EXACT constraint production holds
-- before the change, then the migration under test TWICE: a re-run must not
-- error, because a migration that cannot be applied twice cannot be applied
-- safely.
--
-- The stand-ins are stubs rather than the real creating migrations because
-- three of those six tables hang off auth.users and public.projects, and
-- chaining that graph would test the graph rather than the constraint. What
-- makes the stubs faithful is that their CHECK definitions were read out of the
-- live catalogue on 2026-10-21 and are reproduced verbatim:
--
--   consent_events.locale             CHECK (locale IN ('he','en','es','pt-BR','fr'))
--   free_check_research_runs.locale   same
--   free_check_report_requests.locale same
--   articles.locale                   same
--   blog_plan.locale                  same
--   gbp_posts.language_code           CHECK (language_code IN ('he','en','es','pt-BR','fr'))
--
--   'before'   the premise. On every one of the six, a Italian row is REFUSED.
--              A probe that cannot show the refusal is not evidence that the
--              widening fixed anything. consent_events is the one that matters
--              most: its route answers 204 regardless, so in production that
--              refusal is silent.
--   'after'    'it' is accepted on all six, and 'he', 'en', 'es', 'pt-BR' and 'fr'
--              still are. A widening that broke an existing language would be
--              a regression on four live locales.
--   'closed'   the list is still a list: 'de', '', 'FR', 'fr-FR' and 'italian'
--              are refused. A widening that degraded into dropping the
--              constraint would pass every check above while letting a typo'd
--              locale lose a consent record or hide an article from every page.
--   'named'    each constraint carries the name the migration's own rollback
--              block addresses, and there is exactly ONE CHECK over each
--              column — the thing the drop-by-definition loop exists to keep
--              true.
--   'idempotent'  the whole file applied a second time changes nothing.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/locale-it.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── the pre-state: six columns, each with production's narrow list ──────────
CREATE TABLE public.consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id text NOT NULL,
  locale text NOT NULL,
  CONSTRAINT consent_events_locale CHECK (locale IN ('he', 'en', 'es', 'pt-BR', 'fr'))
);
CREATE TABLE public.free_check_research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale text NOT NULL,
  CONSTRAINT free_check_research_runs_locale CHECK (locale IN ('he', 'en', 'es', 'pt-BR', 'fr'))
);
CREATE TABLE public.free_check_report_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale text NOT NULL,
  CONSTRAINT free_check_report_requests_locale CHECK (locale IN ('he', 'en', 'es', 'pt-BR', 'fr'))
);
CREATE TABLE public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  locale text NOT NULL DEFAULT 'he',
  CONSTRAINT articles_locale_check CHECK (locale IN ('he', 'en', 'es', 'pt-BR', 'fr'))
);
CREATE TABLE public.blog_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale text NOT NULL,
  CONSTRAINT blog_plan_locale_check CHECK (locale IN ('he', 'en', 'es', 'pt-BR', 'fr'))
);
CREATE TABLE public.gbp_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code text NOT NULL,
  CONSTRAINT gbp_posts_language CHECK (language_code IN ('he', 'en', 'es', 'pt-BR', 'fr'))
);

-- A row that already exists, so 'after' can prove nothing was lost.
INSERT INTO public.articles (slug, locale) VALUES ('existing-hebrew-article', 'he');

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- Can this column hold this language? Always rolled back, so one answer never
-- affects the next. Dynamic, so the six columns are asked the same question in
-- the same words rather than by six near-copies that could drift apart.
CREATE FUNCTION accepts(tbl text, col text, val text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE extra text := '';
BEGIN
  IF tbl = 'consent_events' THEN extra := ', consent_id'; END IF;
  IF tbl = 'articles' THEN extra := ', slug'; END IF;
  BEGIN
    EXECUTE format('INSERT INTO public.%I (%I%s) VALUES (%L%s)', tbl, col, extra, val,
      CASE WHEN tbl = 'consent_events' THEN ', ''probe-consent-1'''
           WHEN tbl = 'articles' THEN ', ' || quote_literal('probe-' || md5(val))
           ELSE '' END);
    RAISE EXCEPTION 'probe_rollback';
  EXCEPTION
    WHEN check_violation THEN RETURN false;
    WHEN raise_exception THEN
      IF SQLERRM = 'probe_rollback' THEN RETURN true; END IF;
      RAISE;
  END;
END; $$;

-- How many CHECKs mention this column, and under what name?
CREATE FUNCTION check_names(tbl text, col text) RETURNS text[] LANGUAGE sql AS $$
  SELECT COALESCE(array_agg(con.conname ORDER BY con.conname), ARRAY[]::text[])
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public' AND con.contype = 'c' AND rel.relname = tbl
    AND pg_get_constraintdef(con.oid) LIKE '%' || col || '%';
$$;

-- The six columns, and the constraint name the migration's rollback addresses.
CREATE TABLE targets (tbl text, col text, cname text);
INSERT INTO targets VALUES
  ('consent_events',             'locale',        'consent_events_locale'),
  ('free_check_research_runs',   'locale',        'free_check_research_runs_locale'),
  ('free_check_report_requests', 'locale',        'free_check_report_requests_locale'),
  ('articles',                   'locale',        'articles_locale_check'),
  ('blog_plan',                  'locale',        'blog_plan_locale_check'),
  ('gbp_posts',                  'language_code', 'gbp_posts_language');

-- ── before ─────────────────────────────────────────────────────────────────
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM targets LOOP
    PERFORM chk('before', t.tbl || '.' || t.col || ' REFUSES a Italian row today',
                accepts(t.tbl, t.col, 'it') = false);
  END LOOP;
END $$;

-- ── the migration under test, twice ─────────────────────────────────────────
\i supabase/migrations/20261023130000_locale_it.sql
\i supabase/migrations/20261023130000_locale_it.sql

-- ── after ──────────────────────────────────────────────────────────────────
DO $$
DECLARE t record; loc text;
BEGIN
  FOR t IN SELECT * FROM targets LOOP
    PERFORM chk('after', t.tbl || '.' || t.col || ' accepts ''it''', accepts(t.tbl, t.col, 'it'));
    FOREACH loc IN ARRAY ARRAY['he', 'en', 'es', 'pt-BR', 'fr'] LOOP
      PERFORM chk('after', t.tbl || '.' || t.col || ' still accepts ''' || loc || '''',
                  accepts(t.tbl, t.col, loc));
    END LOOP;
  END LOOP;
END $$;

DO $$ BEGIN
  PERFORM chk('after', 'the pre-existing Hebrew article is untouched',
    (SELECT count(*) FROM public.articles WHERE slug = 'existing-hebrew-article' AND locale = 'he') = 1);
END $$;

-- ── closed ─────────────────────────────────────────────────────────────────
DO $$
DECLARE t record; bad text;
BEGIN
  FOR t IN SELECT * FROM targets LOOP
    FOREACH bad IN ARRAY ARRAY['de', '', 'FR', 'fr-FR', 'italian'] LOOP
      PERFORM chk('closed', t.tbl || '.' || t.col || ' refuses ''' || bad || '''',
                  accepts(t.tbl, t.col, bad) = false);
    END LOOP;
  END LOOP;
END $$;

-- ── named ──────────────────────────────────────────────────────────────────
DO $$
DECLARE t record; names text[];
BEGIN
  FOR t IN SELECT * FROM targets LOOP
    names := check_names(t.tbl, t.col);
    PERFORM chk('named', t.tbl || '.' || t.col || ' has exactly one CHECK', array_length(names, 1) = 1);
    PERFORM chk('named', t.tbl || '.' || t.col || ' keeps the name the rollback addresses',
                names = ARRAY[t.cname]);
  END LOOP;
END $$;

-- ── summary ────────────────────────────────────────────────────────────────
\set QUIET off
SELECT phase, name FROM results WHERE NOT ok ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;

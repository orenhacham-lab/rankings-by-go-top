-- ============================================================================
-- EXECUTED PROBE — 20261004000000_free_check_locale_widen.sql
--
-- Applies, in a DISPOSABLE PostgreSQL cluster, the free check's ledger, the
-- migration that created the two free-check tables with a bilingual `locale`
-- CHECK, and then the widening under test TWICE (a re-run must not error).
--
--   'before'   the premise. With only the original migration applied, a
--              Spanish research run and a Spanish consent record are REFUSED
--              by the database. A probe that cannot show the refusal is not
--              evidence that the widening fixed anything.
--   'after'    'es' and 'pt-BR' are accepted on both tables, and 'he' and 'en'
--              still are — a widened CHECK must accept everything the old one
--              did.
--   'closed'   the list is still a list: 'de', '' and 'EN' are refused. The
--              widening must not have degraded into dropping the constraint,
--              which is how a column of free text would pass every check above.
--   'named'    both constraints now carry the names the migration's own
--              rollback block addresses.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/free-check-locale-widen.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

\i supabase/migrations/20260926000000_free_site_check.sql
\i supabase/migrations/20260928000200_free_check_research.sql

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

INSERT INTO public.free_site_checks (id, domain, locale, url, result, seed, ai_used, client_hash) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'a.es', 'es', 'https://a.es/', '{}', '{}', true, 'client-1');

-- Can a row with this locale be written? Always rolled back, so one answer
-- never affects the next.
CREATE FUNCTION run_accepts(loc text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    INSERT INTO public.free_check_research_runs (client_hash, domain, locale, status)
      VALUES ('client-1', 'a.es', loc, 'running');
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION
    WHEN raise_exception THEN RETURN true;
    WHEN check_violation THEN RETURN false;
  END;
END; $$;

CREATE FUNCTION report_accepts(loc text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    INSERT INTO public.free_check_report_requests
      (check_id, email, consent, consented_at, consent_text, locale, client_hash)
      VALUES ('c0000000-0000-4000-8000-000000000001', 'visitante@example.com', true, now(),
              'Acepto recibir el informe por correo electronico y comunicaciones de Go Top.',
              loc, 'client-1');
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION
    WHEN raise_exception THEN RETURN true;
    WHEN check_violation THEN RETURN false;
  END;
END; $$;

-- ── before: the premise ────────────────────────────────────────────────────
SELECT chk('before', 'a Spanish research run is refused', NOT run_accepts('es'));
SELECT chk('before', 'a Spanish consent record is refused', NOT report_accepts('es'));
SELECT chk('before', 'Hebrew and English are accepted', run_accepts('he') AND run_accepts('en'));

\i supabase/migrations/20261004000000_free_check_locale_widen.sql
\i supabase/migrations/20261004000000_free_check_locale_widen.sql

-- ── after ──────────────────────────────────────────────────────────────────
SELECT chk('after', 'a Spanish research run is accepted', run_accepts('es'));
SELECT chk('after', 'a Spanish consent record is accepted', report_accepts('es'));
SELECT chk('after', 'a Brazilian Portuguese research run is accepted', run_accepts('pt-BR'));
SELECT chk('after', 'a Brazilian Portuguese consent record is accepted', report_accepts('pt-BR'));
SELECT chk('after', 'Hebrew still writes on both tables', run_accepts('he') AND report_accepts('he'));
SELECT chk('after', 'English still writes on both tables', run_accepts('en') AND report_accepts('en'));

-- ── closed: still a list, not free text ────────────────────────────────────
SELECT chk('closed', 'an undeclared language is refused', NOT run_accepts('de') AND NOT report_accepts('de'));
SELECT chk('closed', 'the empty string is refused', NOT run_accepts('') AND NOT report_accepts(''));
SELECT chk('closed', 'the wrong case is refused', NOT run_accepts('EN') AND NOT run_accepts('PT-BR'));

-- ── named ──────────────────────────────────────────────────────────────────
SELECT chk('named', 'free_check_research_runs_locale exists',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'free_check_research_runs_locale'));
SELECT chk('named', 'free_check_report_requests_locale exists',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'free_check_report_requests_locale'));
SELECT chk('named', 'neither table kept a second CHECK over locale',
  (SELECT count(*) FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'c' AND rel.relname IN ('free_check_research_runs', 'free_check_report_requests')
      AND pg_get_constraintdef(con.oid) LIKE '%locale%') = 2);

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;

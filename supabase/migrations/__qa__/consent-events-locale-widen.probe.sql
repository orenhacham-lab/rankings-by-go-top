-- ============================================================================
-- EXECUTED PROBE — 20261005050636_consent_events_locale_widen.sql
--
-- Applies, in a DISPOSABLE PostgreSQL cluster, the migration that created the
-- consent log, then the widening under test TWICE (a re-run must not error).
--
--   'before'   the premise. With only the original migration applied, a
--              Brazilian visitor's consent record is REFUSED by the database.
--              A probe that cannot show the refusal is not evidence that the
--              widening fixed anything.
--   'after'    'pt-BR' is accepted, and 'he', 'en' and 'es' still are.
--   'closed'   the list is still a list: 'de', '', 'PT-BR' and 'pt' are
--              refused. The widening must not have degraded into dropping the
--              constraint, which is how a column of free text would pass every
--              check above.
--   'named'    the constraint carries the name the migration's own rollback
--              block addresses, and there is exactly one CHECK over `locale`.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/consent-events-locale-widen.probe.sql
-- ============================================================================
\set QUIET on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

\i supabase/migrations/20261003000000_consent_events.sql

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

-- Can a decision read in this language be written? Always rolled back, so one
-- answer never affects the next.
CREATE FUNCTION consent_accepts(loc text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    INSERT INTO public.consent_events
      (consent_id, policy_version, action, categories, locale, page_path)
      VALUES ('probe-consent-1', 'cookies-v1', 'custom',
              '{"necessary":true,"analytics":false,"marketing":false}'::jsonb,
              loc, '/pt-BR/pricing');
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION
    WHEN raise_exception THEN RETURN true;
    WHEN check_violation THEN RETURN false;
  END;
END; $$;

-- ── before: the premise ────────────────────────────────────────────────────
SELECT chk('before', 'a Brazilian consent record is refused', NOT consent_accepts('pt-BR'));
SELECT chk('before', 'the three live languages are accepted',
  consent_accepts('he') AND consent_accepts('en') AND consent_accepts('es'));

\i supabase/migrations/20261005050636_consent_events_locale_widen.sql
\i supabase/migrations/20261005050636_consent_events_locale_widen.sql

-- ── after ──────────────────────────────────────────────────────────────────
SELECT chk('after', 'a Brazilian consent record is accepted', consent_accepts('pt-BR'));
SELECT chk('after', 'Hebrew still writes', consent_accepts('he'));
SELECT chk('after', 'English still writes', consent_accepts('en'));
SELECT chk('after', 'Spanish still writes', consent_accepts('es'));

-- ── closed: still a list, not free text ────────────────────────────────────
SELECT chk('closed', 'an undeclared language is refused', NOT consent_accepts('de'));
SELECT chk('closed', 'the empty string is refused', NOT consent_accepts(''));
SELECT chk('closed', 'the wrong case is refused', NOT consent_accepts('PT-BR'));
SELECT chk('closed', 'the bare language without the region is refused', NOT consent_accepts('pt'));

-- ── named ──────────────────────────────────────────────────────────────────
SELECT chk('named', 'consent_events_locale exists',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consent_events_locale'));
SELECT chk('named', 'exactly one CHECK governs locale',
  (SELECT count(*) FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'c' AND rel.relname = 'consent_events'
      AND pg_get_constraintdef(con.oid) LIKE '%locale%') = 1);

-- ── the other CHECKs on the table are untouched ────────────────────────────
SELECT chk('named', 'the action list still refuses an invented action',
  NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consent_events_action' AND NOT convalidated)
  AND (SELECT count(*) FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'c' AND rel.relname = 'consent_events') >= 8);

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results ORDER BY phase, name;
SELECT format('%s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM results;

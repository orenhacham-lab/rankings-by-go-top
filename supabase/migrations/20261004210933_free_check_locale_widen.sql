-- ============================================================================
-- Widen the `locale` CHECK on the two free-check tables.
--
-- WHY. Both tables were created when the public site had two languages, so each
-- pins `locale` to ('he','en'). The site now serves Spanish, and the research
-- and the "email me the report" consent are written with the visitor's real
-- language (`lib/presignup/http.ts` keeps the PublicLocale rather than folding
-- it to Hebrew). Without this, a Spanish visitor's request is refused by the
-- database — and the consent record, whose only purpose is proof that those
-- exact words were agreed to, is the row that fails to be written.
--
-- `consent_events` (20261003000000) already allows 'es'; these two did not.
--
-- 'pt-BR' is allowed here as well, ahead of the code. The language's legal
-- pages exist (content/legal/pt-BR/) and the constraint is the one piece that
-- cannot be added from a feature branch without a second production change.
-- A value the code cannot yet produce costs nothing; the guard in
-- lib/i18n/__qa__/free-check-locale-contract.qa.ts holds the opposite
-- direction — every PublicLocale must be in this list — so a language that
-- spells itself 'pt' instead of 'pt-BR' fails in CI rather than 503-ing live.
--
-- ADDITIVE ONLY. No row is read, written or deleted; a widened CHECK accepts
-- everything the old one accepted.
--
-- Rollback (only safe while no row carries a widened value):
--   ALTER TABLE public.free_check_research_runs DROP CONSTRAINT free_check_research_runs_locale;
--   ALTER TABLE public.free_check_research_runs ADD CONSTRAINT free_check_research_runs_locale CHECK (locale IN ('he','en'));
--   ALTER TABLE public.free_check_report_requests DROP CONSTRAINT free_check_report_requests_locale;
--   ALTER TABLE public.free_check_report_requests ADD CONSTRAINT free_check_report_requests_locale CHECK (locale IN ('he','en'));
-- ============================================================================

BEGIN;

-- The original constraints are inline and therefore auto-named, and the name
-- Postgres chose is not something to guess at from here. Drop whatever CHECK
-- governs `locale` on these two tables, by definition, then add a named one so
-- every later migration can address it directly.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT rel.relname AS table_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND con.contype = 'c'
      AND rel.relname IN ('free_check_research_runs', 'free_check_report_requests')
      AND pg_get_constraintdef(con.oid) LIKE '%locale%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', c.table_name, c.constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.free_check_research_runs
  ADD CONSTRAINT free_check_research_runs_locale
  CHECK (locale IN ('he', 'en', 'es', 'pt-BR'));

ALTER TABLE public.free_check_report_requests
  ADD CONSTRAINT free_check_report_requests_locale
  CHECK (locale IN ('he', 'en', 'es', 'pt-BR'));

COMMIT;

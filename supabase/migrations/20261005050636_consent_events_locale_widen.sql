-- ============================================================================
-- Widen the `locale` CHECK on `consent_events` to accept 'pt-BR'.
--
-- WHY. consent_events (20261003000000) is the proof, per decision, that a
-- visitor was asked about cookies and chose (GDPR Art. 7(1)). Its `locale`
-- column records which language the disclosure was read in, and the table's own
-- comment states the rule: a new public language goes into CONSENT_LOCALES and
-- into this constraint, or the decision is refused and the proof is lost.
--
-- The site is adding Brazilian Portuguese. Its legal pages are live
-- (content/legal/pt-BR/) and the /pt-BR tree is built. Without this line a
-- Brazilian visitor's choice is either rejected by the database or recorded
-- under the fallback language, 'he' — and a consent record that names the wrong
-- disclosure is not proof of anything. That is why this is the one change the
-- Portuguese launch waits on.
--
-- The free-check tables were widened to the same four values on 2026-10-04
-- (20261004210933_free_check_locale_widen.sql). This brings the consent log in
-- line with them, and lib/consent/categories.ts gains 'pt-BR' in the same
-- change, in the order the table's comment requires: constraint first.
--
-- ADDITIVE ONLY. No row is read, written or deleted. A widened CHECK accepts
-- everything the old one accepted, so nothing in flight can fail on it.
-- Idempotent: re-running it drops and re-adds the same named constraint.
--
-- Rollback (only safe while no row carries 'pt-BR'):
--   ALTER TABLE public.consent_events DROP CONSTRAINT consent_events_locale;
--   ALTER TABLE public.consent_events ADD CONSTRAINT consent_events_locale CHECK (locale IN ('he','en','es'));
--
-- Probe: supabase/migrations/__qa__/consent-events-locale-widen.probe.sql
-- ============================================================================

BEGIN;

-- The constraint was declared with a name in the creating migration, so it can
-- be addressed directly. Dropped by definition as well, in case a future
-- migration adds a second CHECK over the same column: the probe asserts that
-- exactly one remains.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND con.contype = 'c'
      AND rel.relname = 'consent_events'
      AND pg_get_constraintdef(con.oid) LIKE '%locale%'
  LOOP
    EXECUTE format('ALTER TABLE public.consent_events DROP CONSTRAINT %I', c.constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.consent_events
  ADD CONSTRAINT consent_events_locale
  CHECK (locale IN ('he', 'en', 'es', 'pt-BR'));

COMMIT;

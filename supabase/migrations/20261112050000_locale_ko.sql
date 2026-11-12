-- ============================================================================
-- Widen every `locale` CHECK that enumerates the public languages to accept 'ko'.
--
-- WHY. Five tables and one column record WHICH LANGUAGE a visitor or a project
-- was served in, and each one's CHECK lists the languages by hand. The site is
-- adding Korean as a full eleventh locale, so without this line every Korean row
-- is refused by the database:
--
--   consent_events.locale            the proof, per decision, that a visitor was
--                                    asked about cookies and chose. For a
--                                    visitor in Korea the ground is not only the
--                                    GDPR: PIPA requires itemised consent per
--                                    purpose, separating what is required from
--                                    what is optional, and a SEPARATE consent for
--                                    the transfer of personal data overseas
--                                    (art. 28-8) — which for us is every Korean
--                                    visitor on day one, because Supabase,
--                                    Vercel, Resend and the AI providers are all
--                                    outside Korea. The cookie route always
--                                    answers 204, so a Korean visitor's decision
--                                    would be dropped IN SILENCE. This is the
--                                    line the Korean launch actually waits on.
--   free_check_research_runs.locale  and
--   free_check_report_requests.locale
--                                    the stored record of the exact words a
--                                    visitor agreed to before we emailed them a
--                                    report. A refused insert is a refused
--                                    consent record. In Korea this matters twice
--                                    over: Network Act art. 50 requires prior
--                                    opt-in for advertising email, so the record
--                                    of that opt-in is what makes the mail lawful.
--   articles.locale                  a published article's language. Refused
--                                    here, the Korean blog cannot publish at
--                                    all, and the daily auto-publish is half of
--                                    what the owner asked for.
--   blog_plan.locale                 the daily auto-publish plan's language, for
--                                    the same reason.
--   gbp_posts.language_code          the language a Google Business Profile post
--                                    was drafted in.
--
-- NOT IN THIS FILE, deliberately: nothing about taking money. The legal thread's
-- ruling of 12.11.2026 lets the Korean tree market and offer the trial and not
-- complete a paid purchase until the VAT question is closed, and that gate is a
-- build-time flag (lib/i18n/korean-site.ts), not a column.
--
-- ADDITIVE ONLY. No row is read, written or deleted; no column, index, policy or
-- grant changes. A widened CHECK accepts everything the old one accepted, so
-- nothing in flight can fail on it and no existing row can become invalid.
-- Idempotent: each constraint is dropped if present and re-added under its
-- existing name, so a re-run leaves exactly one CHECK per column.
--
-- WRITTEN OUT LITERALLY, one statement per column, and not as a loop over a
-- VALUES list with format(), for the reason 20261023130000_locale_it.sql records
-- at length: lib/consent/__qa__/consent-locale-launch.qa.ts reads the consent
-- log's allowed languages OUT OF THESE FILES by matching the CHECK's own text,
-- so a constraint assembled at run time is invisible to it. A migration whose
-- effect cannot be read off the file is a migration nobody can audit.
--
-- The order the consent table's own comment requires is kept: the constraint
-- comes FIRST, then lib/consent/categories.ts gains 'ko'.
--
-- ONLY 'ko'. Korean is the language of one market, South Korea; North Korea is
-- not a market and is reached by nothing here. There is no second written form
-- to rule out the way Dutch had to rule out Flemish.
--
-- Rollback (only safe while no row carries 'ko'): re-add each constraint with
-- the ten-value list, e.g.
--   ALTER TABLE public.consent_events DROP CONSTRAINT consent_events_locale;
--   ALTER TABLE public.consent_events ADD CONSTRAINT consent_events_locale
--     CHECK (locale IN ('he','en','es','pt-BR','fr','it','ja','de','nl','pl'));
--
-- Probe: supabase/migrations/__qa__/locale-ko.probe.sql
-- ============================================================================

BEGIN;

-- A second CHECK over the same column, added by some future migration under a
-- different name, would keep the narrow list in force beside the wide one. The
-- probe asserts exactly one CHECK per column; this drops any stray by name as
-- well as the named one, so the ADDs below are the only constraint left.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT rel.relname AS table_name, con.conname AS name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND con.contype = 'c'
      AND rel.relname IN ('consent_events', 'free_check_research_runs', 'free_check_report_requests',
                          'articles', 'blog_plan', 'gbp_posts')
      AND pg_get_constraintdef(con.oid) ~ '(locale|language_code)'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', c.table_name, c.name);
  END LOOP;
END $$;

ALTER TABLE public.consent_events
  ADD CONSTRAINT consent_events_locale
  CHECK (locale IN ('he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl', 'ko'));

ALTER TABLE public.free_check_research_runs
  ADD CONSTRAINT free_check_research_runs_locale
  CHECK (locale IN ('he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl', 'ko'));

ALTER TABLE public.free_check_report_requests
  ADD CONSTRAINT free_check_report_requests_locale
  CHECK (locale IN ('he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl', 'ko'));

ALTER TABLE public.articles
  ADD CONSTRAINT articles_locale_check
  CHECK (locale IN ('he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl', 'ko'));

ALTER TABLE public.blog_plan
  ADD CONSTRAINT blog_plan_locale_check
  CHECK (locale IN ('he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl', 'ko'));

ALTER TABLE public.gbp_posts
  ADD CONSTRAINT gbp_posts_language
  CHECK (language_code IN ('he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl', 'ko'));

COMMIT;

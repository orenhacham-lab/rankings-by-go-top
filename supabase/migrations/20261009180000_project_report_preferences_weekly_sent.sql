-- ============================================================================
--  The weekly summary email (lib/reports/weekly): the sent-log behind the switch
--  the settings screen has stored since 20260928000000.
--
--  ADDITIVE ONLY, and NOT APPLIED ANYWHERE: it needs the owner's approval before
--  it goes to Production. Two nullable columns on the row that already holds the
--  switch, so one row per project still holds everything: the owner's choice,
--  which week was already summarised, and when that email went out.
--
--  Nothing reads or writes these columns unless WEEKLY_SUMMARY_EMAIL_ENABLED is
--  exactly "true". A database that has not got them yet is reported as "not
--  installed" and nothing is sent (the code treats 42703 as a missing table).
-- ============================================================================

BEGIN;

ALTER TABLE public.project_report_preferences
  ADD COLUMN IF NOT EXISTS weekly_last_week    text,
  ADD COLUMN IF NOT EXISTS weekly_last_sent_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_report_preferences'::regclass
      AND conname = 'project_report_preferences_weekly_last_week'
  ) THEN
    ALTER TABLE public.project_report_preferences
      ADD CONSTRAINT project_report_preferences_weekly_last_week
      CHECK (weekly_last_week IS NULL OR weekly_last_week ~ '^[0-9]{4}-W[0-9]{2}$');
  END IF;
END $$;

COMMENT ON COLUMN public.project_report_preferences.weekly_last_week IS
  'The ISO week the last weekly summary covered, as YYYY-Www. One email per project per week: a week already here is never summarised twice.';
COMMENT ON COLUMN public.project_report_preferences.weekly_last_sent_at IS
  'When the last weekly summary was accepted by the provider.';

COMMENT ON TABLE public.project_report_preferences IS
  'Per-project report preferences and the weekly summary''s sent-log. weekly_email_summary defaults to false. Written only by service-role server code after an owner check; the owner reads it under RLS.';

COMMIT;

-- ============================================================================
--  Setup emails: "your site is not connected yet" and "nothing has been
--  published yet" (lib/onboarding-emails).
--
--  ADDITIVE ONLY, and NOT APPLIED ANYWHERE: it needs the owner's approval before
--  it goes to Production. Three nullable/defaulted columns on the table the
--  approval reminder already uses, so one row per project still holds
--  everything that project's emails need, and the owner's single switch
--  (reminders_enabled) and single unsubscribe link govern both kinds.
--
--  Nothing reads or writes these columns unless ONBOARDING_EMAILS_ENABLED is
--  exactly "true", with one exception: onboarding_opt_out is written by the public
--  unsubscribe route, because the link in a setup email offers to stop the setup
--  emails ALONE and leave the approval reminder, which is about work the owner is
--  paying for, in place. Turning the project's switch back on in settings clears it,
--  so the one switch the settings screen shows is still the whole truth.
--  A database that has not got these columns yet is reported as "not installed" and
--  nothing is sent (the code treats 42703 as a missing table).
-- ============================================================================

BEGIN;

ALTER TABLE public.project_reminder_state
  ADD COLUMN IF NOT EXISTS onboarding_stage        text,
  ADD COLUMN IF NOT EXISTS onboarding_sent_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_opt_out      boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_reminder_state'::regclass
      AND conname = 'project_reminder_state_onboarding_stage'
  ) THEN
    ALTER TABLE public.project_reminder_state
      ADD CONSTRAINT project_reminder_state_onboarding_stage
      CHECK (onboarding_stage IS NULL OR onboarding_stage IN ('connect', 'publish'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_reminder_state'::regclass
      AND conname = 'project_reminder_state_onboarding_count'
  ) THEN
    ALTER TABLE public.project_reminder_state
      ADD CONSTRAINT project_reminder_state_onboarding_count
      CHECK (onboarding_sent_count BETWEEN 0 AND 2);
  END IF;
END $$;

COMMENT ON COLUMN public.project_reminder_state.onboarding_stage IS
  'Which setup email the last one was: connect (no site connection yet) or publish (connected, nothing published yet). NULL before any went out.';
COMMENT ON COLUMN public.project_reminder_state.onboarding_sent_count IS
  'How many setup emails went out for the CURRENT stage (at most 2). Reset to 1 when the stage changes.';
COMMENT ON COLUMN public.project_reminder_state.onboarding_last_sent_at IS
  'When the last setup email was accepted by the provider. With last_sent_at it caps this project at one email per 72 hours, whatever its kind.';

COMMENT ON COLUMN public.project_reminder_state.onboarding_opt_out IS
  'The owner asked to stop the SETUP emails only, from the link in one of them. The approval reminder keeps going; turning reminders back on in settings clears this.';

COMMIT;

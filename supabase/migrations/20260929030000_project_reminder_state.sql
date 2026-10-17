-- ============================================================================
--  Reminder emails: "articles are waiting for your OK" (lib/reminders).
--  ADDITIVE ONLY. NOT APPLIED ANYWHERE: it needs the owner's approval before it
--  goes to Production. Nothing reads or writes this table unless
--  REMINDER_EMAILS_ENABLED is "true"; the settings switch and the unsubscribe
--  route degrade to "not available" while the table is missing.
--
--  Why a new table and not an existing one: nothing stores a sent-log
--  (project_report_preferences holds one boolean for another feature, whose
--  sender is deliberately unwired), and the reminder needs, per project, the
--  owner's switch, which run of articles the last email was about, how many
--  went out for it and when.
--
--  One row per project, written only by service-role server code after an owner
--  check. The owner may read their own row under RLS.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_reminder_state (
  project_id         uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL,
  -- The owner's switch. A reminder is a service message, so it starts ON; an absent row means ON.
  reminders_enabled  boolean NOT NULL DEFAULT true,
  unsubscribed_at    timestamptz,
  -- The oldest waiting article the last email was about (the "batch"), how many emails
  -- went out for it (at most 3), and when the last one was accepted by the provider.
  batch_key          text,
  sent_count         integer NOT NULL DEFAULT 0,
  last_sent_at       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT project_reminder_state_sent_count CHECK (sent_count BETWEEN 0 AND 3)
);

COMMENT ON TABLE public.project_reminder_state IS
  'Per-project reminder switch and sent-log for the "articles waiting for approval" email. Written only by service-role server code after an owner check; the owner reads it under RLS. updated_at is the row version a send claims against.';

ALTER TABLE public.project_reminder_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.project_reminder_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_reminder_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_reminder_state TO service_role;

DROP POLICY IF EXISTS project_reminder_state_owner_select ON public.project_reminder_state;
CREATE POLICY project_reminder_state_owner_select ON public.project_reminder_state
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

COMMIT;

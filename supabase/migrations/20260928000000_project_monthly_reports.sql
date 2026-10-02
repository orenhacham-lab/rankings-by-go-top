-- ============================================================================
-- AUTOMATIC MONTHLY PROGRESS REPORT, and the weekly-email preference.
--
-- WHAT. Two new tables, nothing else:
--
--   project_monthly_reports       one stored snapshot per project per month. It is
--                                 written once, by the monthly cron on the 1st (or
--                                 by the owner's "create last month's report now"),
--                                 from data the app already stores: our rank
--                                 checks, the articles published, the AI
--                                 visibility checks, the stored Search Console
--                                 sync and the content plan. Opening a report reads
--                                 one row; it never recomputes.
--   project_report_preferences    per project, the "weekly summary by email"
--                                 switch. OFF by default. Nothing reads it to send
--                                 anything yet (see lib/reports/monthly/weekly-email.ts).
--
-- A FINISHED REPORT IS NEVER OVERWRITTEN. One row per (project, month) is
-- enforced by a unique index, and no role, not even service_role, holds UPDATE on
-- project_monthly_reports: a report can be created or deleted, never rewritten.
-- Re-running a month finds the row and stops.
--
-- ACCESS. Rows are written ONLY by service-role server code (the cron, and the
-- owner routes after they verified the signed-in user owns the project). The
-- project owner reads their own rows under RLS; an admin who is not the owner
-- reads nothing (owner-only, as keyword_competitor_positions); anon has no
-- access at all. Grants follow 20260927000100_keyword_competitor_positions.sql:
-- Supabase's default table grants are revoked and only what is needed is
-- granted back.
--
-- Additive: two new tables, no change to an existing one. Idempotent: every
-- statement can be re-run.
-- Rollback: DROP TABLE public.project_monthly_reports; DROP TABLE public.project_report_preferences;
-- Executed probe: supabase/migrations/__qa__/project-monthly-reports.probe.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_monthly_reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The project owner. Written by the server from the project row, never from a request.
  user_id        uuid NOT NULL,
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- The first day of the month the report covers (UTC calendar month).
  period_month   date NOT NULL,
  -- 'cron' on the 1st, 'owner' when the owner asked for last month's report.
  generated_by   text NOT NULL,
  -- The shape of `data` (lib/reports/monthly/types.ts MONTHLY_REPORT_VERSION).
  schema_version integer NOT NULL DEFAULT 1,
  data           jsonb NOT NULL,
  generated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT project_monthly_reports_first_of_month
    CHECK (extract(day FROM period_month) = 1),
  CONSTRAINT project_monthly_reports_generated_by
    CHECK (generated_by IN ('cron', 'owner')),
  CONSTRAINT project_monthly_reports_data_is_object
    CHECK (jsonb_typeof(data) = 'object'),
  -- A snapshot is a summary, not a dump: 256 KB is far above what one month holds.
  CONSTRAINT project_monthly_reports_data_size
    CHECK (pg_column_size(data) <= 262144)
);

COMMENT ON TABLE public.project_monthly_reports IS
  'One stored monthly progress report per project per month (aggregates of stored data). Written once by service-role server code, never updated; the project owner reads it under RLS.';

-- One report per project per month; also serves "this project's months, newest first".
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_monthly_reports_project_month
  ON public.project_monthly_reports (project_id, period_month DESC);

-- The cron's "which projects already have this month" read.
CREATE INDEX IF NOT EXISTS idx_project_monthly_reports_month
  ON public.project_monthly_reports (period_month);

ALTER TABLE public.project_monthly_reports ENABLE ROW LEVEL SECURITY;

-- Browser roles: read only, through the owner policy. anon: nothing.
-- service_role: create, read, delete. NOT update: a finished report is never rewritten.
REVOKE ALL ON TABLE public.project_monthly_reports FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_monthly_reports TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.project_monthly_reports TO service_role;

DROP POLICY IF EXISTS project_monthly_reports_owner_select ON public.project_monthly_reports;
CREATE POLICY project_monthly_reports_owner_select ON public.project_monthly_reports
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));


CREATE TABLE IF NOT EXISTS public.project_report_preferences (
  project_id            uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  -- The project owner. Written by the server from the project row, never from a request.
  user_id               uuid NOT NULL,
  -- "Send me a weekly summary by email". OFF until the owner turns it on.
  weekly_email_summary  boolean NOT NULL DEFAULT false,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_report_preferences IS
  'Per-project report preferences. weekly_email_summary defaults to false; no sender reads it yet. Written only by service-role server code after an owner check; the owner reads it under RLS.';

ALTER TABLE public.project_report_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.project_report_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_report_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_report_preferences TO service_role;

DROP POLICY IF EXISTS project_report_preferences_owner_select ON public.project_report_preferences;
CREATE POLICY project_report_preferences_owner_select ON public.project_report_preferences
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

COMMIT;

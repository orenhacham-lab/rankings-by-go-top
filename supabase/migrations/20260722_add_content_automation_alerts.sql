-- ============================================================================
-- Phase 4B.1 — Content Automation failure ALERTS (persisted, project-owner
-- scoped). Additive, one small table. Reuses the existing retry/attempt/
-- reconciliation logic in the automation runner; this only records a persisted
-- in-app notification AFTER the FINAL failed publish attempt so a silently-
-- failed scheduled publish becomes visible to the project owner.
--
-- Dedupe: a UNIQUE dedupe_key (pool_item_id + ':publish_final_failure') means a
-- given item's final failure creates exactly ONE alert even if the cron re-runs;
-- a later re-failure REOPENS the same row (never a duplicate).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.content_automation_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,                       -- project owner (scoping)
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  pool_item_id  uuid REFERENCES public.article_pool_items(id) ON DELETE CASCADE,
  article_id    uuid,
  topic_id      uuid,
  kind          text NOT NULL DEFAULT 'publish_failed_final',
  dedupe_key    text NOT NULL,
  title         text,
  error         text,
  attempts      int  NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

-- One alert per (item, failure kind): the cron cannot spam duplicates; a
-- re-failure after a manual retry UPSERTs (reopens) the same row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_automation_alerts_dedupe
  ON public.content_automation_alerts (dedupe_key);

CREATE INDEX IF NOT EXISTS idx_content_automation_alerts_owner_status
  ON public.content_automation_alerts (user_id, status);

CREATE INDEX IF NOT EXISTS idx_content_automation_alerts_project_status
  ON public.content_automation_alerts (project_id, status);

-- RLS backstop (the app also scopes every access via authContentProject on the
-- service-role client). Owner may read + update (dismiss) their own alerts.
ALTER TABLE public.content_automation_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caa_owner_select" ON public.content_automation_alerts;
CREATE POLICY "caa_owner_select" ON public.content_automation_alerts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "caa_owner_update" ON public.content_automation_alerts;
CREATE POLICY "caa_owner_update" ON public.content_automation_alerts
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "caa_service_all" ON public.content_automation_alerts;
CREATE POLICY "caa_service_all" ON public.content_automation_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

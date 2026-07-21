-- ============================================================================
-- Stage E2B — Google Search Console opportunity DECISIONS (additive, reversible).
--
-- Records explicit, human-reviewed decisions on Stage E2A opportunities:
--   'already_covered' | 'irrelevant' | 'created_topic'.
-- Decisions are OBSERVABILITY + human workflow only. They never influence the
-- recommendation engine, and never change Stage E2A scoring/classification/IDs.
-- The only content write this stage performs is through the EXISTING manual
-- topic-creation path (article_topics); this table just records the decision.
--
-- Ownership: per-user via projects.user_id = auth.uid() AND user_id = auth.uid()
-- (defense-in-depth; server routes also verify ownership before using the
-- service role). Never authorize by UUID secrecy.
--
-- Rollback:
--   DROP TABLE public.gsc_opportunity_decisions;
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.gsc_opportunity_decisions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id           uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- The Stage E2A server-generated STABLE opportunity id (opp_<hex>). Text, not a FK.
  opportunity_id       text NOT NULL,
  window_days          integer NOT NULL CHECK (window_days IN (28, 90)),
  decision             text NOT NULL CHECK (decision IN ('already_covered', 'irrelevant', 'created_topic')),
  -- Set ONLY for a created_topic decision; cleared if the referenced topic is deleted.
  created_topic_id     uuid REFERENCES public.article_topics(id) ON DELETE SET NULL,
  sync_run_id          uuid,
  primary_query        text NOT NULL,
  page_url             text NOT NULL,
  opportunity_type     text NOT NULL,
  -- Server-recomputed snapshot ONLY (never client-supplied).
  opportunity_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- One decision per opportunity per project → idempotent upsert target.
  CONSTRAINT uq_gsc_opportunity_decisions_project_opp UNIQUE (project_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_gsc_opp_decisions_project_decision
  ON public.gsc_opportunity_decisions (project_id, decision, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_opp_decisions_created_topic
  ON public.gsc_opportunity_decisions (created_topic_id) WHERE created_topic_id IS NOT NULL;

ALTER TABLE public.gsc_opportunity_decisions ENABLE ROW LEVEL SECURITY;

-- Ownership on BOTH the project (owned by auth.uid()) AND user_id = auth.uid().
CREATE POLICY gsc_opp_decisions_select ON public.gsc_opportunity_decisions
  FOR SELECT USING (
    user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY gsc_opp_decisions_insert ON public.gsc_opportunity_decisions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY gsc_opp_decisions_update ON public.gsc_opportunity_decisions
  FOR UPDATE USING (
    user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  ) WITH CHECK (
    user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
CREATE POLICY gsc_opp_decisions_delete ON public.gsc_opportunity_decisions
  FOR DELETE USING (
    user_id = auth.uid()
    AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );
-- Service role (server routes act only AFTER an explicit ownership check).
CREATE POLICY gsc_opp_decisions_service ON public.gsc_opportunity_decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
